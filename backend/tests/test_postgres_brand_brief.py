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
    monkeypatch.setattr(main.settings, "cors_origins", "https://dev.marketing.goodmorning.mx")
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
            update_etag = current.headers["ETag"]
            update_payloads = [
                {"brand_name": "Existing update A", "description": "Desc A", "audience": "Audience A", "voice_tone": "Tone A", "primary_goal": "Goal A"},
                {"brand_name": "Existing update B", "description": "Desc B", "audience": "Audience B", "voice_tone": "Tone B", "primary_goal": "Goal B"},
            ]
        def update_existing(payload):
            with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as client:
                return client.put("/workspace/brand-brief", cookies={"gm_access": owner_token}, headers={"Origin": origin, "If-Match": update_etag}, json=payload).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            update_results = sorted(pool.map(update_existing, update_payloads))
        assert update_results == [200, 412]
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as client:
            current = client.get("/workspace/brand-brief", cookies={"gm_access": owner_token})
            assert current.status_code == 200
            assert current.json()["brief"]["brand_name"] in {"Existing update A", "Existing update B"}
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


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires the PostgreSQL 16 validation database")
def test_primary_brief_preserves_exact_fields_on_create_update_and_later_login(monkeypatch):
    monkeypatch.setattr(main.settings, "cors_origins", "https://dev.marketing.goodmorning.mx")
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
    email = f"brief-fields-{uuid4()}@example.test"
    password = "Candidate-only-account-password"
    origin = "https://dev.marketing.goodmorning.mx"
    first = {
        "brand_name": "First Brand",
        "description": "Distinct description",
        "audience": "Audience segment 17",
        "voice_tone": "Measured voice",
        "primary_goal": "Goal that is longer than tone: " + ("reach-" * 55),
    }
    second = {
        "brand_name": "Second Brand",
        "description": "Updated description",
        "audience": "Different audience",
        "voice_tone": "Playful tone",
        "primary_goal": "Updated goal: " + ("convert-" * 51),
    }

    def assert_fields(brief, expected):
        assert {key: brief[key] for key in expected} == expected

    try:
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as staff:
            invite = staff.post("/admin/invitations", auth=("candidate-staff", "candidate-only-staff-password"), json={"email": email, "workspace_name": "Synthetic Field Mapping", "role": "owner"})
        assert invite.status_code == 200, invite.text
        token = parse_qs(urlparse(invite.json()["invitation_url"]).fragment)["token"][0]
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as owner:
            activation = owner.post("/auth/activate", headers={"Origin": origin}, json={"email": email, "name": "Synthetic", "password": password, "token": token})
            assert activation.status_code == 200, activation.text
            empty = owner.get("/workspace/brand-brief")
            created = owner.put("/workspace/brand-brief", headers={"Origin": origin, "If-Match": empty.headers["ETag"]}, json=first)
            assert created.status_code == 200, created.text
            assert_fields(created.json()["brief"], first)
            first_read = owner.get("/workspace/brand-brief")
            assert first_read.status_code == 200
            assert_fields(first_read.json()["brief"], first)

            brief_id = first_read.json()["brief"]["id"]
            with pg_engine.begin() as connection:
                connection.execute(text("UPDATE brands SET website = 'https://kept.example', industry = 'kept industry', positioning = 'kept positioning', offers = 'kept offers', message = 'kept message', metrics = 'kept metrics', target_date = 'kept date', growth_timeline = 'kept timeline', platforms = '[\"kept-platform\"]' WHERE id = :id"), {"id": brief_id})

            updated = owner.put("/workspace/brand-brief", headers={"Origin": origin, "If-Match": first_read.headers["ETag"]}, json=second)
            assert updated.status_code == 200, updated.text
            assert_fields(updated.json()["brief"], second)
            second_read = owner.get("/workspace/brand-brief")
            assert_fields(second_read.json()["brief"], second)
            with pg_engine.connect() as connection:
                unrelated = connection.execute(text("SELECT website, industry, positioning, offers, message, metrics, target_date, growth_timeline, platforms FROM brands WHERE id = :id"), {"id": brief_id}).mappings().one()
            assert dict(unrelated) == {
                "website": "https://kept.example", "industry": "kept industry", "positioning": "kept positioning",
                "offers": "kept offers", "message": "kept message", "metrics": "kept metrics", "target_date": "kept date",
                "growth_timeline": "kept timeline", "platforms": ["kept-platform"],
            }

            assert owner.post("/auth/logout", headers={"Origin": origin}).status_code == 204
        with TestClient(main.app, base_url=origin, raise_server_exceptions=False) as later_login:
            login = later_login.post("/auth/login", headers={"Origin": origin}, json={"email": email, "password": password})
            assert login.status_code == 200, login.text
            later = later_login.get("/workspace/brand-brief")
            assert later.status_code == 200
            assert_fields(later.json()["brief"], second)
    finally:
        if main.auth_service is not None:
            main.auth_service.engine.dispose()
            main.auth_service = None
        if previous_override is None:
            main.app.dependency_overrides.pop(get_db, None)
        else:
            main.app.dependency_overrides[get_db] = previous_override
        pg_engine.dispose()
