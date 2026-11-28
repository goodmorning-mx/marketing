import asyncio
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import main, tool_registry
from app.database import get_db
from app.main import app
from app.models import Base
from gm_auth import AuthService, AuthSettings


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base.metadata.create_all(engine)


def override_db() -> Iterator[Session]:
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_db] = override_db
client = TestClient(app)


@pytest.fixture
def accounts(monkeypatch):
    with engine.begin() as connection:
        for table in ("publish_jobs", "platform_connections", "content_items", "campaigns", "brands"):
            connection.exec_driver_sql(f"DELETE FROM {table}")
    auth_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    service = AuthService(auth_engine, AuthSettings("marketing-test-secret-at-least-32-bytes", issuer="goodmarketing"))
    service.create_schema()
    service.create_organization(organization_id="org-north", slug="north", name="North")
    service.create_organization(organization_id="org-south", slug="south", name="South")
    service.create_user(email="owner@north.test", name="North Owner", password="a sufficiently long password", organization_id="org-north", roles={"owner"}, permissions={"workspace:read", "marketing:write"})
    service.create_user(email="viewer@north.test", name="North Viewer", password="a sufficiently long password", organization_id="org-north", roles={"viewer"}, permissions={"workspace:read"})
    service.create_user(email="viewer-permission-drift@north.test", name="North Viewer", password="a sufficiently long password", organization_id="org-north", roles={"viewer"}, permissions={"workspace:read", "marketing:write"})
    service.create_user(email="owner@south.test", name="South Owner", password="a sufficiently long password", organization_id="org-south", roles={"owner"}, permissions={"workspace:read", "marketing:write"})
    monkeypatch.setattr(main, "auth_service", service)
    monkeypatch.setattr(tool_registry, "SessionLocal", TestingSession)
    yield {
        "owner": service.login(email="owner@north.test", password="a sufficiently long password").access_token,
        "viewer": service.login(email="viewer@north.test", password="a sufficiently long password").access_token,
        "viewer_drift": service.login(email="viewer-permission-drift@north.test", password="a sufficiently long password").access_token,
        "other": service.login(email="owner@south.test", password="a sufficiently long password").access_token,
    }
    auth_engine.dispose()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_brand_campaign_content_and_approval_flow_is_organization_scoped(accounts) -> None:
    assert client.get("/api/brands").status_code == 401
    brand = client.post("/api/brands", headers=auth(accounts["owner"]), json={"tenant_id": "org-south", "name": "Atlas Studio", "goal": "Build awareness", "platforms": ["facebook", "instagram"]})
    assert brand.status_code == 200
    brand_id = brand.json()["id"]
    assert brand.json()["tenant_id"] == "org-north"

    invalid = client.patch(f"/api/brands/{brand_id}", headers=auth(accounts["owner"]), json={"name": ""})
    assert invalid.status_code == 422
    assert client.get("/api/brands", headers=auth(accounts["owner"])).json()[0]["name"] == "Atlas Studio"

    campaign = client.post("/api/campaigns", headers=auth(accounts["owner"]), json={"brand_id": brand_id, "name": "Launch foundation", "objective": "Introduce the brand", "platforms": ["facebook", "instagram"]})
    assert campaign.status_code == 200
    campaign_id = campaign.json()["id"]

    content = client.post("/api/content", headers=auth(accounts["owner"]), json={"campaign_id": campaign_id, "title": "Meet the brand", "copy": "Hello world", "platforms": ["facebook", "instagram"], "variants": {"facebook": "Hello Facebook", "instagram": "Hello Instagram"}})
    assert content.status_code == 200
    content_id = content.json()["id"]
    assert client.patch(f"/api/content/{content_id}/status", headers=auth(accounts["owner"]), json={"status": "approved"}).json()["status"] == "approved"

    publish = client.post(f"/api/publish/jobs?content_id={content_id}&platform=instagram", headers=auth(accounts["owner"]))
    assert publish.status_code == 202
    assert publish.json()["status"] == "blocked"
    assert publish.json()["error_code"] == "PROVIDER_NOT_CONFIGURED"

    # Altering tenant/parent IDs never crosses the organization boundary.
    assert client.get("/api/brands?tenant_id=org-north", headers=auth(accounts["other"])).json() == []
    assert client.patch(f"/api/brands/{brand_id}", headers=auth(accounts["other"]), json={"name": "Cross tenant"}).status_code == 404
    assert client.get(f"/api/campaigns?brand_id={brand_id}", headers=auth(accounts["other"])).status_code == 404
    assert client.get(f"/api/content?campaign_id={campaign_id}", headers=auth(accounts["other"])).status_code == 404
    assert client.patch(f"/api/content/{content_id}/status", headers=auth(accounts["other"]), json={"status": "draft"}).status_code == 404
    assert client.post("/api/campaigns", headers=auth(accounts["other"]), json={"brand_id": brand_id, "name": "Cross tenant"}).status_code == 404
    assert client.post("/api/content", headers=auth(accounts["other"]), json={"campaign_id": campaign_id, "title": "Cross tenant"}).status_code == 404
    assert client.post(f"/api/publish/jobs?content_id={content_id}&platform=instagram", headers=auth(accounts["other"])).status_code == 404
    assert client.get(f"/api/connections/meta/status?brand_id={brand_id}", headers=auth(accounts["other"])).status_code == 404


def test_gm_auth_login_and_identity_endpoints(accounts) -> None:
    response = client.post("/auth/login", json={
        "email": "owner@north.test",
        "password": "a sufficiently long password",
        "organization_id": "org-north",
    })
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    tokens = response.json()
    assert set(tokens) == {"access_token", "refresh_token", "token_type", "expires_in", "identity"}
    assert tokens["token_type"] == "bearer"

    identity = client.get("/auth/me", headers=auth(tokens["access_token"]))
    assert identity.status_code == 200
    assert identity.json()["organization_id"] == "org-north"
    assert client.post("/auth/refresh").status_code == 422
    refreshed = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    assert "set-cookie" not in refreshed.headers
    assert refreshed.json()["identity"] == identity.json()
    new_refresh = {"refresh_token": refreshed.json()["refresh_token"]}
    assert client.post("/auth/logout", json=new_refresh).status_code == 204
    assert client.post("/auth/refresh", json=new_refresh).status_code == 401


def test_same_workspace_viewer_can_read_but_cannot_mutate(accounts) -> None:
    brand = client.post("/api/brands", headers=auth(accounts["owner"]), json={"name": "North Brand"}).json()
    read = client.get(f"/api/brands?tenant_id=org-south", headers=auth(accounts["viewer"]))
    assert read.status_code == 200 and [item["id"] for item in read.json()] == [brand["id"]]
    campaign = client.post("/api/campaigns", headers=auth(accounts["owner"]), json={"brand_id": brand["id"], "name": "North campaign"}).json()
    content = client.post("/api/content", headers=auth(accounts["owner"]), json={"campaign_id": campaign["id"], "title": "North content"}).json()
    assert client.get(f"/api/campaigns?brand_id={brand['id']}", headers=auth(accounts["viewer"])).json()[0]["id"] == campaign["id"]
    assert client.get(f"/api/content?campaign_id={campaign['id']}", headers=auth(accounts["viewer"])).json()[0]["id"] == content["id"]
    assert client.post("/api/brands", headers=auth(accounts["viewer"]), json={"name": "No Write"}).status_code == 403
    assert client.patch(f"/api/brands/{brand['id']}", headers=auth(accounts["viewer"]), json={"name": "No Write"}).status_code == 403
    assert client.post("/api/campaigns", headers=auth(accounts["viewer"]), json={"brand_id": brand["id"], "name": "No Write"}).status_code == 403
    assert client.post("/api/content", headers=auth(accounts["viewer"]), json={"campaign_id": 1, "title": "No Write"}).status_code == 403
    assert client.patch("/api/content/1/status", headers=auth(accounts["viewer"]), json={"status": "approved"}).status_code == 403
    assert client.post("/api/publish/jobs?content_id=1&platform=instagram", headers=auth(accounts["viewer"])).status_code == 403
    assert client.patch(f"/api/brands/{brand['id']}", headers=auth(accounts["viewer_drift"]), json={"name": "Still read only"}).status_code == 403
    assert client.post("/api/tools/invoke", headers=auth(accounts["viewer_drift"]), json={"name": "marketing.approve_content", "arguments": {"content_id": 1}, "confirmed": True}).status_code == 403


def test_forged_identity_headers_cannot_access_api_or_tool_adapter(accounts) -> None:
    forged = {"X-GM-User-ID": "attacker", "X-GM-Organization-ID": "org-north", "X-GM-Permissions": "read,write"}
    assert client.get("/api/brands", headers=forged).status_code == 401
    assert client.post("/api/tools/invoke", headers=forged, json={"name": "marketing.list_brands", "arguments": {}}).status_code == 401
    brand = client.post("/api/brands", headers=auth(accounts["owner"]), json={"name": "North Brand"}).json()
    tool = client.post("/api/tools/invoke", headers={**auth(accounts["other"]), **forged}, json={"name": "marketing.list_brands", "arguments": {}})
    assert tool.status_code == 200
    assert str(brand["id"]) not in tool.text
    campaign = client.post("/api/campaigns", headers=auth(accounts["owner"]), json={"brand_id": brand["id"], "name": "North campaign"}).json()
    foreign_campaigns = client.post("/api/tools/invoke", headers={**auth(accounts["other"]), **forged}, json={"name": "marketing.list_campaigns", "arguments": {"brand_id": brand["id"]}})
    assert foreign_campaigns.status_code == 200 and str(campaign["id"]) not in foreign_campaigns.text
    assert client.post("/api/tools/invoke", headers=auth(accounts["viewer"]), json={"name": "marketing.approve_content", "arguments": {"content_id": 1}, "confirmed": True}).status_code == 403


def test_cookie_mutations_require_an_allowed_origin(accounts) -> None:
    blocked = client.post("/api/brands", cookies={"gm_access": accounts["owner"]}, json={"name": "Origin blocked"})
    assert blocked.status_code == 403


def test_meta_readiness_requires_authenticated_workspace() -> None:
    assert client.get("/api/publish/readiness").status_code == 401


def test_tool_registry_confirmation_gates_remain_enabled(accounts) -> None:
    tools = client.get("/api/tools", headers=auth(accounts["owner"]))
    assert tools.status_code == 200
    names = {item["name"] for item in tools.json()}
    assert {"marketing.list_brands", "marketing.approve_content", "marketing.queue_publish"} <= names
    response = client.post("/api/tools/invoke", headers=auth(accounts["owner"]), json={"name": "marketing.queue_publish", "arguments": {"content_id": 1, "platform": "instagram"}})
    assert response.status_code == 200 and response.json()["requires_confirmation"] is True


def test_primary_brand_adapter_patch_is_partial_and_revision_conditional(accounts):
    from sqlalchemy import update
    from app.models import Brand
    created = client.post("/api/brands", headers=auth(accounts["owner"]), json={"name": "Primary", "website": "https://example.test", "summary": "Old"}).json()
    with TestingSession() as session:
        session.execute(update(Brand).where(Brand.id == created["id"]).values(is_primary=True, revision=1))
        session.commit()
    from app.main import _brief_etag
    etag = _brief_etag("org-north", {"id": created["id"], "brand_name": "Primary", "description": "Old", "audience": "", "voice_tone": "", "primary_goal": "", "revision": 1})
    missing = client.patch(f"/api/brands/{created['id']}", headers=auth(accounts["owner"]), json={"name": "Primary", "summary": "Updated"})
    assert missing.status_code == 428
    updated = client.patch(f"/api/brands/{created['id']}", headers={**auth(accounts["owner"]), "If-Match": etag}, json={"name": "Primary", "summary": "Updated"})
    assert updated.status_code == 200
    assert updated.json()["website"] == "https://example.test"
    assert client.patch(f"/api/brands/{created['id']}", headers={**auth(accounts["owner"]), "If-Match": etag}, json={"name": "Primary", "summary": "Stale"}).status_code == 412
    assert client.patch(f"/api/brands/{created['id']}", headers={**auth(accounts["viewer"]), "If-Match": etag}, json={"name": "Primary", "summary": "Forbidden"}).status_code == 403


def test_workspace_campaign_create_replay_edit_archive_and_tenant_scope(accounts):
    import uuid
    key = str(uuid.uuid4())
    payload = {"name": "  Spring launch  ", "objective": "Introduce the product", "platforms": ["facebook", "instagram"], "duration_days": 28, "posting_frequency": "medium"}
    created = client.post("/workspace/campaigns", headers={**auth(accounts["owner"]), "Idempotency-Key": key}, json=payload)
    assert created.status_code == 201
    campaign = created.json()["campaign"]
    assert campaign["name"] == "Spring launch" and campaign["revision"] == 1
    assert client.post("/workspace/campaigns", headers={**auth(accounts["owner"]), "Idempotency-Key": key}, json=payload).status_code == 200
    changed = {**payload, "objective": "Changed"}
    assert client.post("/workspace/campaigns", headers={**auth(accounts["owner"]), "Idempotency-Key": key}, json=changed).status_code == 409
    assert client.get("/workspace/campaigns", headers=auth(accounts["owner"])).json()["campaigns"][0]["id"] == campaign["id"]
    assert client.get(f"/workspace/campaigns/{campaign['id']}", headers=auth(accounts["other"])).status_code == 404
    for invalid_id in ("0", "2147483648", "not-a-number"):
        assert client.get(f"/workspace/campaigns/{invalid_id}", headers=auth(accounts["owner"])).status_code == 422
    assert client.post("/workspace/campaigns", headers=auth(accounts["viewer"]), json=payload).status_code == 403

    detail = client.get(f"/workspace/campaigns/{campaign['id']}", headers=auth(accounts["owner"]))
    etag = detail.headers["ETag"]
    updated = client.put(f"/workspace/campaigns/{campaign['id']}", headers={**auth(accounts["owner"]), "If-Match": etag}, json={"objective": "Revised objective"})
    assert updated.status_code == 200
    assert updated.json()["campaign"]["objective"] == "Revised objective"
    assert client.put(f"/workspace/campaigns/{campaign['id']}", headers={**auth(accounts["owner"]), "If-Match": etag}, json={"name": "Stale"}).status_code == 412
    etag = updated.headers["ETag"]
    archived = client.post(f"/workspace/campaigns/{campaign['id']}/archive", headers={**auth(accounts["owner"]), "If-Match": etag})
    assert archived.status_code == 200 and archived.json()["campaign"]["archived_at"]
    assert archived.json()["campaign"]["status"] == "draft"


def test_workspace_campaigns_include_only_tenant_legacy_brand_rows(accounts):
    north = client.post("/api/brands", headers=auth(accounts["owner"]), json={"name": "North legacy"}).json()
    south = client.post("/api/brands", headers=auth(accounts["other"]), json={"name": "South legacy"}).json()
    north_campaign = client.post("/api/campaigns", headers=auth(accounts["owner"]), json={"brand_id": north["id"], "name": "North old", "platforms": []}).json()
    client.post("/api/campaigns", headers=auth(accounts["other"]), json={"brand_id": south["id"], "name": "South old", "platforms": []})
    rows = client.get("/workspace/campaigns", headers=auth(accounts["owner"])).json()["campaigns"]
    assert [row["id"] for row in rows] == [north_campaign["id"]]
    assert client.get("/workspace/campaigns/not-a-number", headers=auth(accounts["owner"])).status_code == 422
