import os
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires the PostgreSQL 16 CI service")
def test_concurrent_invitation_redemption_creates_one_account(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", os.environ["TEST_DATABASE_URL"])
    monkeypatch.setenv("AUTH_JWT_SECRET", "ci-only-signing-secret-that-is-long-enough")
    monkeypatch.setenv("AUTH_COOKIE_DOMAIN", "dev.marketing.goodmorning.mx")
    monkeypatch.setenv("ADMIN_USERNAME", "ci-staff")
    monkeypatch.setenv("ADMIN_PASSWORD", "ci-only-admin-password")
    monkeypatch.setattr(main, "auth_service", None)
    email = f"race-{uuid4()}@example.test"
    password = "CI-only-password-for-disposable-identity"

    with TestClient(main.app, base_url="https://dev.marketing.goodmorning.mx", raise_server_exceptions=False) as staff:
        invitation = staff.post("/admin/invitations", auth=("ci-staff", "ci-only-admin-password"), json={
            "email": email, "workspace_name": "Disposable race workspace", "role": "owner", "expires_hours": 1,
        })
    assert invitation.status_code == 200
    token = parse_qs(urlparse(invitation.json()["invitation_url"]).fragment)["token"][0]

    def redeem():
        with TestClient(main.app, base_url="https://dev.marketing.goodmorning.mx", raise_server_exceptions=False) as client:
            return client.post("/auth/activate", json={
                "token": token, "email": email, "name": "Disposable tester", "password": password,
            }, headers={"Origin": "https://dev.marketing.goodmorning.mx"}).status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = sorted(pool.map(lambda _: redeem(), range(2)))
        assert statuses == [200, 400]
        assert main.auth_service is not None
        with main.auth_service.engine.connect() as connection:
            from gm_auth.models import users
            assert len(connection.execute(users.select().where(users.c.email == email)).fetchall()) == 1
    finally:
        if main.auth_service is not None:
            main.auth_service.engine.dispose()
