from contextlib import contextmanager
from datetime import datetime
import hashlib
import json
from uuid import UUID
from urllib.parse import urlparse, parse_qs

import psycopg.types.json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from app import main
from gm_auth import AuthService, AuthSettings


class Result:
    def __init__(self, result): self.result = result
    def fetchone(self):
        row = self.result.fetchone()
        if row is None: return None
        data = dict(row._mapping)
        if isinstance(data.get("expires_at"), str): data["expires_at"] = datetime.fromisoformat(data["expires_at"])
        if isinstance(data.get("used_at"), str): data["used_at"] = datetime.fromisoformat(data["used_at"])
        for key in ("roles", "permissions"):
            if key in data and isinstance(data[key], str): data[key] = json.loads(data[key])
        return data
    def fetchall(self):
        return [dict(row._mapping) for row in self.result.fetchall()]


class Connection:
    def __init__(self, connection): self.connection = connection
    def execute(self, statement, params=(), prepare=None):
        statement = statement.replace(" FOR UPDATE", "").replace("%s", "?")
        values = tuple(json.dumps(value.obj) if isinstance(value, psycopg.types.json.Jsonb) else value for value in params)
        values = tuple(str(value) if isinstance(value, UUID) else value for value in values)
        return Result(self.connection.exec_driver_sql(statement, values))
    def commit(self): pass


@pytest.fixture

def client(monkeypatch, tmp_path):
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'accounts.db'}")
    service = AuthService(engine, AuthSettings("test-secret-that-is-long-enough-for-jwt", issuer="goodmarketing"))
    service.create_schema()
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE goodmarketing_workspace_profiles (organization_id VARCHAR(128) PRIMARY KEY, display_name VARCHAR(120) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"))
        connection.execute(text("CREATE TABLE goodmarketing_invitations (id VARCHAR(36) PRIMARY KEY, email VARCHAR(320) NOT NULL, organization_id VARCHAR(128) NOT NULL, roles JSON NOT NULL, permissions JSON NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMP NOT NULL, used_at TIMESTAMP, created_at TIMESTAMP NOT NULL)"))
    @contextmanager
    def database_connection():
        with engine.begin() as connection:
            yield Connection(connection)
    monkeypatch.setattr(main, "database_connection", database_connection)
    monkeypatch.setattr(main, "auth_service", service)
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-secret-that-is-long-enough-for-jwt")
    monkeypatch.setenv("AUTH_COOKIE_DOMAIN", "dev.marketing.goodmorning.mx")
    monkeypatch.setenv("ADMIN_USERNAME", "staff")
    monkeypatch.setenv("ADMIN_PASSWORD", "staff-test-password")
    monkeypatch.setattr(main.settings, "cors_origins", "https://dev.marketing.goodmorning.mx")
    with TestClient(main.app, base_url="https://dev.marketing.goodmorning.mx", raise_server_exceptions=False) as test_client:
        yield test_client, service, engine
    engine.dispose()


def invite(client, email, workspace, role, workspace_id=None, hours=72):
    response = client.post("/admin/invitations", auth=("staff", "staff-test-password"), json={
        "email": email, "workspace_name": workspace, "workspace_id": workspace_id,
        "role": role, "expires_hours": hours,
    })
    assert response.status_code == 200
    result = response.json()
    token = parse_qs(urlparse(result["invitation_url"]).fragment)["token"][0]
    return result, token


def activate(client, email, token):
    return client.post("/auth/activate", headers={"Origin": "https://dev.marketing.goodmorning.mx"}, json={"email": email, "name": email.split("@")[0], "password": "a sufficiently long password", "token": token})


def test_activation_is_email_bound_single_use_and_token_is_hashed(client):
    test_client, service, engine = client
    issued, token = invite(test_client, "owner@example.test", "North", "owner")
    with engine.connect() as connection:
        stored = connection.execute(text("SELECT token_hash FROM goodmarketing_invitations")).scalar_one()
    assert stored == hashlib.sha256(token.encode()).hexdigest()
    assert activate(test_client, "other@example.test", token).status_code == 400
    activation = activate(test_client, "owner@example.test", token)
    assert activation.status_code == 200
    cookies = activation.headers.get_list("set-cookie")
    assert all("Domain=dev.marketing.goodmorning.mx" in cookie for cookie in cookies)
    assert all("Domain=.marketing.goodmorning.mx" not in cookie for cookie in cookies)
    assert activate(test_client, "owner@example.test", token).status_code == 400
    assert test_client.get("/workspace").json()["display_name"] == "North"


def test_activation_retry_recovers_account_created_before_invitation_commit(client, monkeypatch):
    test_client, service, engine = client
    _, token = invite(test_client, "retry@example.test", "Retry Workspace", "owner")
    original_execute = Connection.execute
    failed_once = False
    def fail_invitation_update(self, statement, params=(), prepare=None):
        nonlocal failed_once
        if not failed_once and statement.startswith("UPDATE goodmarketing_invitations SET used_at"):
            failed_once = True
            raise RuntimeError("simulated transient invitation write failure")
        return original_execute(self, statement, params, prepare)
    monkeypatch.setattr(Connection, "execute", fail_invitation_update)

    first_attempt = activate(test_client, "retry@example.test", token)
    assert first_attempt.status_code == 500
    with service.engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM gm_auth_users WHERE email = 'retry@example.test'")).scalar_one() == 1
        assert connection.execute(text("SELECT used_at FROM goodmarketing_invitations")).scalar_one() is None

    assert activate(test_client, "retry@example.test", token).status_code == 200
    assert activate(test_client, "retry@example.test", token).status_code == 400


def test_expired_invitation_cannot_be_redeemed(client):
    test_client, service, engine = client
    _, token = invite(test_client, "expired@example.test", "Old", "viewer", hours=1)
    with engine.begin() as connection:
        connection.execute(text("UPDATE goodmarketing_invitations SET expires_at = '2000-01-01'"))
    assert activate(test_client, "expired@example.test", token).status_code == 400


def test_login_logout_and_workspace_role_isolation(client):
    test_client, service, engine = client
    owner_invite, owner_token = invite(test_client, "owner@example.test", "North", "owner")
    owner_activation = activate(test_client, "owner@example.test", owner_token)
    assert owner_activation.status_code == 200
    owner_id = owner_activation.json()["identity"]["organization_id"]
    assert test_client.put("/workspace", headers={"Origin": "https://dev.marketing.goodmorning.mx"}, json={"display_name": "North Studio"}).json()["display_name"] == "North Studio"
    test_client.post("/auth/session/logout", headers={"Origin": "https://dev.marketing.goodmorning.mx"})
    assert test_client.get("/auth/session/me").status_code == 401
    credentials = {"email": "owner@example.test", "password": "a sufficiently long password"}
    login = test_client.post("/auth/session/login", headers={"Origin": "https://dev.marketing.goodmorning.mx"}, json=credentials)
    assert login.status_code == 200
    assert set(login.json()) == {"identity"}
    assert login.json()["identity"]["organization_id"] == owner_id
    test_client.post("/auth/session/logout", headers={"Origin": "https://dev.marketing.goodmorning.mx"})

    viewer_invite, viewer_token = invite(test_client, "viewer@example.test", "North Studio", "viewer", workspace_id=owner_id)
    assert activate(test_client, "viewer@example.test", viewer_token).status_code == 200
    assert test_client.get("/workspace").json()["display_name"] == "North Studio"
    assert test_client.put("/workspace", headers={"Origin": "https://dev.marketing.goodmorning.mx"}, json={"display_name": "Forbidden"}).status_code == 403
    test_client.post("/auth/session/logout", headers={"Origin": "https://dev.marketing.goodmorning.mx"})

    _, other_token = invite(test_client, "other@example.test", "South", "owner")
    other_activation = activate(test_client, "other@example.test", other_token)
    assert other_activation.status_code == 200
    other_id = other_activation.json()["identity"]["organization_id"]
    assert other_id != owner_id
    assert test_client.get("/workspace").json()["display_name"] == "South"
    assert test_client.put("/workspace", headers={"Origin": "https://dev.marketing.goodmorning.mx"}, json={"display_name": "South Edit"}).status_code == 200
    owner = service.login(email="owner@example.test", password="a sufficiently long password")
    assert owner is not None and owner.identity.organization_id == owner_id
    assert test_client.get("/workspace", headers={"Authorization": f"Bearer {owner.access_token}"}).json()["display_name"] == "North Studio"


def test_public_demo_request_flow_and_staff_follow_up(client):
    test_client, _, _ = client
    payload = {
        "name": "Demo prospect",
        "email": "prospect@example.test",
        "company": "Example Studio",
        "role": "Marketing lead",
        "website": "https://example.test",
        "goals": "We want to plan a bilingual campaign and review weekly performance.",
        "market": "Mexico",
        "consent": True,
        "honeypot": "",
    }
    submitted = test_client.post("/demo-requests", json=payload)
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["message"] == "Your request has been received."

    rows = test_client.get("/admin/demo-requests", auth=("staff", "staff-test-password"))
    assert rows.status_code == 200
    assert len(rows.json()) == 1
    request_id = rows.json()[0]["id"]
    updated = test_client.put(f"/admin/demo-requests/{request_id}", auth=("staff", "staff-test-password"), json={
        "qualification_status": "contacted", "admin_notes": "Follow up through the existing process.",
    })
    assert updated.status_code == 200
    assert updated.json()["qualification_status"] == "contacted"


def test_brand_brief_empty_conditional_save_and_stale_rejection(client):
    test_client, service, engine = client
    main.Base.metadata.create_all(engine)
    _, token = invite(test_client, "brief@example.test", "Brief", "owner")
    assert activate(test_client, "brief@example.test", token).status_code == 200
    empty = test_client.get("/workspace/brand-brief")
    assert empty.status_code == 200 and empty.json() == {"brief": None}
    assert empty.headers["Cache-Control"] == "private, no-store"
    tag = empty.headers["ETag"]
    payload = {"brand_name": "  North Studio  ", "description": "A useful description", "audience": "Local customers", "voice_tone": "Warm", "primary_goal": "Support a launch"}
    assert test_client.put("/workspace/brand-brief", headers={"Origin": "https://dev.marketing.goodmorning.mx"}, json=payload).status_code == 428
    saved = test_client.put("/workspace/brand-brief", headers={"Origin": "https://dev.marketing.goodmorning.mx", "If-Match": tag}, json=payload)
    assert saved.status_code == 200
    assert saved.json()["brief"]["brand_name"] == payload["brand_name"]
    assert saved.headers["ETag"] != tag
    assert test_client.put("/workspace/brand-brief", headers={"Origin": "https://dev.marketing.goodmorning.mx", "If-Match": tag}, json=payload).status_code == 412
    current = test_client.get("/workspace/brand-brief")
    assert current.json()["brief"]["description"] == payload["description"]
    assert current.json()["brief"]["revision"] == 1


def test_existing_identity_can_join_invited_workspace_without_changing_existing_role(client):
    test_client, service, engine = client
    _, original_token = invite(test_client, "member@example.test", "Original", "viewer")
    assert activate(test_client, "member@example.test", original_token).status_code == 200
    original_identity = service.login(email="member@example.test", password="a sufficiently long password").identity
    test_client.post("/auth/session/logout", headers={"Origin": "https://dev.marketing.goodmorning.mx"})
    _, next_token = invite(test_client, "member@example.test", "Next", "owner")
    joined = activate(test_client, "member@example.test", next_token)
    assert joined.status_code == 200
    assert joined.json()["identity"]["organization_id"] != original_identity.organization_id
    with service.engine.connect() as connection:
        existing = connection.execute(text("SELECT roles FROM gm_auth_memberships WHERE user_id = :uid AND organization_id = :org"), {"uid": original_identity.user_id, "org": original_identity.organization_id}).first()
        assert existing is not None and json.loads(existing.roles) == ["viewer"]
    test_client.post("/auth/session/logout", headers={"Origin": "https://dev.marketing.goodmorning.mx"})
    _, wrong_token = invite(test_client, "member@example.test", "Third", "viewer")
    wrong = test_client.post("/auth/activate", headers={"Origin": "https://dev.marketing.goodmorning.mx"}, json={"email": "member@example.test", "name": "Member", "password": "wrong password here", "token": wrong_token})
    assert wrong.status_code == 401
    with engine.connect() as connection:
        assert connection.execute(text("SELECT used_at FROM goodmarketing_invitations WHERE token_hash = :hash"), {"hash": hashlib.sha256(wrong_token.encode()).hexdigest()}).scalar_one() is None


def test_brief_viewer_second_org_and_validator_validation(client):
    test_client, service, engine = client
    main.Base.metadata.create_all(engine)
    _, owner_token = invite(test_client, "brief-owner@example.test", "North Brief", "owner")
    owner_activation = activate(test_client, "brief-owner@example.test", owner_token)
    organization_id = owner_activation.json()["identity"]["organization_id"]
    empty = test_client.get("/workspace/brand-brief", headers={"Origin": "https://dev.marketing.goodmorning.mx"})
    assert "ETag" in empty.headers and "etag" in empty.headers["access-control-expose-headers"].lower()
    assert test_client.put("/workspace/brand-brief", headers={"Origin": "https://dev.marketing.goodmorning.mx", "If-Match": "*"}, json={"brand_name": "Brand", "description": "", "audience": "", "voice_tone": "", "primary_goal": ""}).status_code == 400
    assert test_client.put("/workspace/brand-brief", headers={"Origin": "https://dev.marketing.goodmorning.mx", "If-Match": empty.headers["ETag"]}, json={"brand_name": "  ", "description": "", "audience": "", "voice_tone": "", "primary_goal": ""}).status_code == 422
    _, viewer_token = invite(test_client, "brief-viewer@example.test", "North Brief", "viewer", workspace_id=organization_id)
    test_client.post("/auth/session/logout", headers={"Origin": "https://dev.marketing.goodmorning.mx"})
    assert activate(test_client, "brief-viewer@example.test", viewer_token).status_code == 200
    assert test_client.get("/workspace/brand-brief").json() == {"brief": None}
    assert test_client.put("/workspace/brand-brief", headers={"Origin": "https://dev.marketing.goodmorning.mx", "If-Match": empty.headers["ETag"]}, json={"brand_name": "Brand", "description": "", "audience": "", "voice_tone": "", "primary_goal": ""}).status_code == 403
    test_client.post("/auth/session/logout", headers={"Origin": "https://dev.marketing.goodmorning.mx"})
    _, second_token = invite(test_client, "brief-other@example.test", "South Brief", "owner")
    assert activate(test_client, "brief-other@example.test", second_token).status_code == 200
    assert test_client.get("/workspace/brand-brief").json() == {"brief": None}


def test_invitation_rejects_unknown_supplied_workspace_id(client):
    test_client, _, _ = client
    response = test_client.post("/admin/invitations", auth=("staff", "staff-test-password"), json={"email": "collaborator@example.test", "workspace_name": "Unknown", "workspace_id": "not-a-workspace", "role": "viewer"})
    assert response.status_code == 404


def test_old_pending_owner_permission_snapshot_is_ignored(client):
    test_client, service, engine = client
    _, token = invite(test_client, "legacy-owner@example.test", "Old Invite", "owner")
    with engine.begin() as connection:
        connection.execute(text("UPDATE goodmarketing_invitations SET permissions = '[]'"))
    activation = activate(test_client, "legacy-owner@example.test", token)
    assert activation.status_code == 200
    assert set(activation.json()["identity"]["permissions"]) >= {"workspace:read", "workspace:name:update", "marketing:write"}


def test_retried_new_customer_invitation_reuses_stable_organization(client):
    test_client, service, engine = client
    first, _ = invite(test_client, "retry-company@example.test", "Stable Company", "owner")
    second, _ = invite(test_client, "retry-company@example.test", "Stable Company", "owner")
    assert first["workspace_id"] == second["workspace_id"]
    with service.engine.connect() as connection:
        rows = connection.execute(text("SELECT count(*) FROM gm_auth_organizations WHERE id = :id"), {"id": first["workspace_id"]}).scalar_one()
    assert rows == 1


def test_brief_updates_can_clear_fields_and_enforce_tone_limit(client):
    test_client, service, engine = client
    main.Base.metadata.create_all(engine)
    _, token = invite(test_client, "clear-brief@example.test", "Clear Brief", "owner")
    assert activate(test_client, "clear-brief@example.test", token).status_code == 200
    empty = test_client.get("/workspace/brand-brief")
    headers = {"Origin": "https://dev.marketing.goodmorning.mx", "If-Match": empty.headers["ETag"]}
    initial = {"brand_name": "Clearable", "description": "Text", "audience": "People", "voice_tone": "Warm", "primary_goal": "Grow"}
    created = test_client.put("/workspace/brand-brief", headers=headers, json=initial)
    assert created.status_code == 200
    cleared = test_client.put("/workspace/brand-brief", headers={"Origin": "https://dev.marketing.goodmorning.mx", "If-Match": created.headers["ETag"]}, json={**initial, "description": "", "audience": "", "voice_tone": "", "primary_goal": ""})
    assert cleared.status_code == 200
    assert {cleared.json()["brief"][key] for key in ("description", "audience", "voice_tone", "primary_goal")} == {""}
    assert test_client.put("/workspace/brand-brief", headers={"Origin": "https://dev.marketing.goodmorning.mx", "If-Match": cleared.headers["ETag"]}, json={**initial, "voice_tone": "t" * 241}).status_code == 422


def test_refresh_rotates_refresh_session_and_logout_revokes_access(client):
    test_client, service, _ = client
    _, token = invite(test_client, "refresh@example.test", "Refresh Workspace", "owner")
    activation = activate(test_client, "refresh@example.test", token)
    assert activation.status_code == 200
    headers = {"Origin": "https://dev.marketing.goodmorning.mx"}
    assert test_client.get("/auth/session/me").status_code == 200
    assert test_client.get("/auth/me").status_code == 401
    old_refresh = test_client.cookies.get("gm_refresh")
    assert test_client.post("/auth/session/refresh", headers={"Origin": "https://other.example.test"}).status_code == 403
    rotated = test_client.post("/auth/session/refresh", headers=headers)
    assert rotated.status_code == 200
    assert set(rotated.json()) == {"identity"}
    assert rotated.json()["identity"]["email"] == "refresh@example.test"
    current_refresh = test_client.cookies.get("gm_refresh")
    assert current_refresh != old_refresh

    stale_client = TestClient(main.app, base_url=str(test_client.base_url))
    stale_client.cookies.set("gm_refresh", old_refresh, domain="dev.marketing.goodmorning.mx", path="/auth")
    stale_client.cookies.set("gm_access", "expired", domain="dev.marketing.goodmorning.mx", path="/")
    stale_refresh = stale_client.post("/auth/session/refresh", headers=headers)
    assert stale_refresh.status_code == 401
    assert {cookie.split("=", 1)[0] for cookie in stale_refresh.headers.get_list("set-cookie")} == {"gm_access", "gm_refresh"}
    assert not stale_client.cookies

    assert test_client.post("/auth/session/logout", headers=headers).status_code == 204
    assert not test_client.cookies
    assert test_client.get("/auth/session/me").status_code == 401
    assert service.refresh(current_refresh) is None


def test_multi_workspace_login_lists_verified_memberships_and_rejects_arbitrary_selection(client):
    test_client, service, engine = client
    main.Base.metadata.create_all(engine)
    headers = {"Origin": "https://dev.marketing.goodmorning.mx"}
    credentials = {"email": "multi@example.test", "password": "a sufficiently long password"}
    _, first_token = invite(test_client, credentials["email"], "First Space", "viewer")
    first = activate(test_client, credentials["email"], first_token).json()["identity"]
    test_client.post("/auth/session/logout", headers=headers)
    _, second_token = invite(test_client, credentials["email"], "Second Space", "owner")
    second = activate(test_client, credentials["email"], second_token).json()["identity"]
    from app.models import Brand
    from sqlalchemy.orm import Session
    with Session(engine) as session:
        session.add(Brand(tenant_id=first["organization_id"], name="Brief Alpha", summary="Brief Alpha description", audience="First audience", tone="First voice", goal="First goal", is_primary=True, revision=1))
        session.commit()
    test_client.post("/auth/session/logout", headers=headers)
    listed = test_client.post("/auth/workspaces", headers=headers, json=credentials)
    assert listed.status_code == 200
    assert {row["organization_id"] for row in listed.json()["workspaces"]} == {first["organization_id"], second["organization_id"]}
    assert {row["name"] for row in listed.json()["workspaces"]} == {"First Space", "Second Space"}
    # Seed a distinctive primary brief in each authorized organization.
    for identity, brand_name in ((first, "Brief Alpha"), (second, "Brief Beta")):
        login = test_client.post("/auth/session/login", headers=headers, json={**credentials, "organization_id": identity["organization_id"]})
        assert login.status_code == 200
        if "owner" in login.json()["identity"]["roles"]:
            current = test_client.get("/workspace/brand-brief")
            saved = test_client.put("/workspace/brand-brief", headers={**headers, "If-Match": current.headers["ETag"]}, json={"brand_name": brand_name, "description": brand_name + " description", "audience": "Local readers", "voice_tone": "Clear", "primary_goal": "Grow carefully"})
            assert saved.status_code == 200
        test_client.post("/auth/session/logout", headers=headers)
    denied = test_client.post("/auth/session/login", headers=headers, json={**credentials, "organization_id": "not-a-membership"})
    assert denied.status_code == 401
    selected = test_client.post("/auth/session/login", headers=headers, json={**credentials, "organization_id": first["organization_id"]})
    assert selected.status_code == 200
    assert selected.json()["identity"]["organization_id"] == first["organization_id"]
    assert selected.json()["identity"]["roles"] == ["viewer"]
    assert test_client.get("/workspace").json()["display_name"] == "First Space"
    assert test_client.get("/workspace/brand-brief").json()["brief"]["brand_name"] == "Brief Alpha"
    test_client.post("/auth/session/logout", headers=headers)
    selected_second = test_client.post("/auth/session/login", headers=headers, json={**credentials, "organization_id": second["organization_id"]})
    assert selected_second.json()["identity"]["roles"] == ["owner"]
    assert test_client.get("/workspace").json()["display_name"] == "Second Space"
    assert test_client.get("/workspace/brand-brief").json()["brief"]["brand_name"] == "Brief Beta"
