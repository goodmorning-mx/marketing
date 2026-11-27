import base64
import os
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires PostgreSQL 16")
def test_brand_assets_persist_replace_remove_and_isolate_workspaces(monkeypatch):
    origin = "https://dev.marketing.goodmorning.mx"
    monkeypatch.setattr(main.settings, "cors_origins", origin)
    monkeypatch.setenv("DATABASE_URL", os.environ["TEST_DATABASE_URL"])
    monkeypatch.setenv("AUTH_JWT_SECRET", "candidate-only-signing-secret-with-32-bytes")
    monkeypatch.setenv("AUTH_COOKIE_DOMAIN", "dev.marketing.goodmorning.mx")
    monkeypatch.setenv("ADMIN_USERNAME", "candidate-staff")
    monkeypatch.setenv("ADMIN_PASSWORD", "candidate-only-staff-password")
    monkeypatch.setattr(main, "auth_service", None)
    main.startup_database()

    def activate(email):
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as staff:
            invitation = staff.post("/admin/invitations", auth=("candidate-staff", "candidate-only-staff-password"), json={"email": email, "workspace_name": "Synthetic Brand", "role": "owner"})
        token = parse_qs(urlparse(invitation.json()["invitation_url"]).fragment)["token"][0]
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as owner:
            activated = owner.post("/auth/activate", headers={"Origin": origin}, json={"email": email, "name": "Synthetic", "password": "Candidate-only-account-password", "token": token})
            assert activated.status_code == 200
            return owner.cookies.get("gm_access")

    owner_a = activate(f"brand-a-{uuid4()}@example.test")
    owner_b = activate(f"brand-b-{uuid4()}@example.test")
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#2468ac"/></svg>'
    encoded = base64.b64encode(svg).decode()
    try:
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as client:
            a = {"gm_access": owner_a}
            b = {"gm_access": owner_b}
            initial = client.get("/workspace/brand-assets", cookies=a)
            assert initial.status_code == 200 and initial.json()["assets"] is None
            saved = client.put("/workspace/brand-assets", cookies=a, headers={"Origin": origin, "If-Match": initial.headers["ETag"]}, json={"template_key": "night-pulse", "logo_action": "replace", "logo_media_type": "image/svg+xml", "logo_base64": encoded})
            assert saved.status_code == 200
            assert saved.json()["assets"]["colors"] == ["#46E582", "#147D49", "#AFD2BB", "#08120F", "#FEFEFE"]
            assert saved.json()["assets"]["logo"]["media_type"] == "image/png"
            assert client.get("/workspace/brand-assets/logo", cookies=a).headers["content-type"] == "image/png"
            gpl = b"GIMP Palette\nName: Synthetic\nColumns: 0\n10 20 30 ignored label\n255 0 128\n"
            preview = client.post("/workspace/brand-assets/palette-preview", cookies=a, headers={"Origin": origin}, json={"filename": "synthetic.gpl", "base64": base64.b64encode(gpl).decode()})
            assert preview.status_code == 200 and preview.json()["colors"] == ["#0A141E", "#FF0080"]
            assert preview.headers["Cache-Control"] == "private, no-store"
            palette = client.put("/workspace/brand-assets", cookies=a, headers={"Origin": origin, "If-Match": saved.headers["ETag"]}, json={"palette_action": "replace", "palette_source": "custom", "palette_filename": "synthetic.gpl", "palette_base64": base64.b64encode(gpl).decode(), "font_changes": []})
            assert palette.status_code == 200
            assert palette.json()["assets"]["template_key"] == "night-pulse"
            assert palette.json()["assets"]["template_colors"] == ["#46E582", "#147D49", "#AFD2BB", "#08120F", "#FEFEFE"]
            assert palette.json()["assets"]["colors"] == ["#0A141E", "#FF0080"]
            invalid = client.put("/workspace/brand-assets", cookies=a, headers={"Origin": origin, "If-Match": palette.headers["ETag"]}, json={"template_key": "forward", "logo_action": "replace", "logo_media_type": "image/png", "logo_base64": encoded})
            assert invalid.status_code == 422
            after_invalid = client.get("/workspace/brand-assets", cookies=a)
            assert after_invalid.json()["assets"] == palette.json()["assets"]
            workspace_b = client.get("/workspace/brand-assets", cookies=b)
            assert workspace_b.status_code == 200 and workspace_b.json()["assets"] is None
            missing_logo = client.get("/workspace/brand-assets/logo", cookies=b)
            assert missing_logo.status_code == 404
            assert missing_logo.headers["Cache-Control"] == "private, no-store"
            removed = client.put("/workspace/brand-assets", cookies=a, headers={"Origin": origin, "If-Match": after_invalid.headers["ETag"]}, json={"template_key": "night-pulse", "logo_action": "remove"})
            assert removed.status_code == 200 and removed.json()["assets"]["logo"] is None
            stale = client.put("/workspace/brand-assets", cookies=a, headers={"Origin": origin, "If-Match": after_invalid.headers["ETag"]}, json={"template_key": "forward", "logo_action": "keep"})
            assert stale.status_code == 412
            assert client.put("/workspace/brand-assets", cookies=a, headers={"Origin": origin, "If-Match": removed.headers["ETag"]}, content=b" " * 6_000_001).status_code == 413
    finally:
        if main.auth_service is not None:
            main.auth_service.engine.dispose()
