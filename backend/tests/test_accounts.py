from contextlib import contextmanager
from datetime import datetime
import hashlib
import json
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


class Connection:
    def __init__(self, connection): self.connection = connection
    def execute(self, statement, params=(), prepare=None):
        statement = statement.replace(" FOR UPDATE", "").replace("%s", "?")
        values = tuple(json.dumps(value.obj) if isinstance(value, psycopg.types.json.Jsonb) else value for value in params)
        return Result(self.connection.exec_driver_sql(statement, values))
    def commit(self): self.connection.commit()


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
    monkeypatch.setenv("ADMIN_USERNAME", "staff")
    monkeypatch.setenv("ADMIN_PASSWORD", "staff-test-password")
    with TestClient(main.app, base_url="https://dev.marketing.goodmorning.mx") as test_client:
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
    return client.post("/auth/activate", json={"email": email, "name": email.split("@")[0], "password": "a sufficiently long password", "token": token})


def test_activation_is_email_bound_single_use_and_token_is_hashed(client):
    test_client, service, engine = client
    issued, token = invite(test_client, "owner@example.test", "North", "owner")
    with engine.connect() as connection:
        stored = connection.execute(text("SELECT token_hash FROM goodmarketing_invitations")).scalar_one()
    assert stored == hashlib.sha256(token.encode()).hexdigest()
    assert activate(test_client, "other@example.test", token).status_code == 400
    assert activate(test_client, "owner@example.test", token).status_code == 200
    assert activate(test_client, "owner@example.test", token).status_code == 400
    assert test_client.get("/workspace").json()["display_name"] == "North"


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
    assert test_client.put("/workspace", json={"display_name": "North Studio"}).json()["display_name"] == "North Studio"
    test_client.post("/auth/logout")
    assert test_client.get("/auth/me").status_code == 401
    assert test_client.post("/auth/login", json={"email": "owner@example.test", "password": "a sufficiently long password"}).status_code == 200
    test_client.post("/auth/logout")

    viewer_invite, viewer_token = invite(test_client, "viewer@example.test", "North Studio", "viewer", workspace_id=owner_id)
    assert activate(test_client, "viewer@example.test", viewer_token).status_code == 200
    assert test_client.get("/workspace").json()["display_name"] == "North Studio"
    assert test_client.put("/workspace", json={"display_name": "Forbidden"}).status_code == 403
    test_client.post("/auth/logout")

    _, other_token = invite(test_client, "other@example.test", "South", "owner")
    other_activation = activate(test_client, "other@example.test", other_token)
    assert other_activation.status_code == 200
    other_id = other_activation.json()["identity"]["organization_id"]
    assert other_id != owner_id
    assert test_client.get("/workspace").json()["display_name"] == "South"
    assert test_client.put("/workspace", json={"display_name": "South Edit"}).status_code == 200
    owner = service.login(email="owner@example.test", password="a sufficiently long password")
    assert owner is not None and owner.identity.organization_id == owner_id
    assert test_client.get("/workspace", headers={"Authorization": f"Bearer {owner.access_token}"}).json()["display_name"] == "North Studio"
