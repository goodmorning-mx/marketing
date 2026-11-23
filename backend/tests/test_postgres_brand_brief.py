import os
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import get_db

from app import main


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires the PostgreSQL 16 validation database")
def test_primary_brief_concurrent_first_save_and_tenant_isolation(monkeypatch):
    database_url = os.environ["TEST_DATABASE_URL"]
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("AUTH_JWT_SECRET", "candidate-only-signing-secret-with-32-bytes")
    monkeypatch.setenv("AUTH_COOKIE_DOMAIN", "dev.marketing.goodmorning.mx")
    monkeypatch.setenv("ADMIN_USERNAME", "candidate-staff")
    monkeypatch.setenv("ADMIN_PASSWORD", "candidate-only-staff-password")
    monkeypatch.setattr(main, "auth_service", None)
    pg_engine = create_engine(database_url)
    pg_sessions = sessionmaker(bind=pg_engine, autoflush=False, autocommit=False)
    previous_override = main.app.dependency_overrides.get(get_db)
    def override_db():
        session = pg_sessions()
        try:
            yield session
        finally:
            session.close()
    main.app.dependency_overrides[get_db] = override_db
    main.startup_database()
    email = f"brief-{uuid4()}@example.test"
    origin = "https://dev.marketing.goodmorning.mx"
    payloads = [
        {"brand_name": "One", "description": "First", "audience": "A", "voice_tone": "Warm", "primary_goal": "Launch"},
        {"brand_name": "Two", "description": "Second", "audience": "B", "voice_tone": "Clear", "primary_goal": "Grow"},
    ]
    try:
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as staff:
            invite = staff.post("/admin/invitations", auth=("candidate-staff", "candidate-only-staff-password"), json={"email": email, "workspace_name": "Synthetic Brief", "role": "owner"})
        token = parse_qs(urlparse(invite.json()["invitation_url"]).fragment)["token"][0]
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as owner:
            activation = owner.post("/auth/activate", headers={"Origin": origin}, json={"email": email, "name": "Synthetic", "password": "Candidate-only-account-password", "token": token})
            assert activation.status_code == 200
            empty = owner.get("/workspace/brand-brief")
            etag = empty.headers["ETag"]
            owner_token = owner.cookies.get("gm_access")
        def save(payload):
            with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as client:
                return client.put("/workspace/brand-brief", cookies={"gm_access": owner_token}, headers={"Origin": origin, "If-Match": etag}, json=payload).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = sorted(pool.map(save, payloads))
        assert results == [200, 412]
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as client:
            current = client.get("/workspace/brand-brief", cookies={"gm_access": owner_token})
            assert current.status_code == 200 and current.json()["brief"]["brand_name"] in {"One", "Two"}
            brief = current.json()["brief"]
            validator = current.headers["ETag"]
            adapter_edit = client.patch(f"/api/brands/{brief['id']}", headers={"Authorization": f"Bearer {owner_token}", "If-Match": validator}, json={"name": brief["brand_name"], "summary": "Changed through Adapters"})
            assert adapter_edit.status_code == 200, adapter_edit.text
            stale_browser = client.put("/workspace/brand-brief", cookies={"gm_access": owner_token}, headers={"Origin": origin, "If-Match": validator}, json=payloads[0])
            assert stale_browser.status_code == 412
            latest = client.get("/workspace/brand-brief", cookies={"gm_access": owner_token})
            assert latest.json()["brief"]["description"] == "Changed through Adapters"
            assert client.get("/workspace/brand-brief", headers={"X-GM-Organization-ID": "attacker"}).status_code == 401
        engine = create_engine(database_url)
        with engine.connect() as connection:
            rows = connection.execute(text("SELECT count(*) FROM brands WHERE is_primary = true AND tenant_id = :org"), {"org": activation.json()["identity"]["organization_id"]}).scalar_one()
        engine.dispose()
        assert rows == 1
    finally:
        if main.auth_service is not None:
            main.auth_service.engine.dispose()
            main.auth_service = None
        if previous_override is None:
            main.app.dependency_overrides.pop(get_db, None)
        else:
            main.app.dependency_overrides[get_db] = previous_override
        pg_engine.dispose()
