import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app import main
from app.account_email import unavailable
from app.database import get_db
from app.self_service import digest

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires PostgreSQL")
ORIGIN = "https://dev.marketing.goodmorning.mx"
ORIGIN_HEADERS = {"Origin": ORIGIN}
PASSWORD = "candidate-only-password-one"
NEW_PASSWORD = "candidate-only-password-two"
REGISTER = "/auth/registration/request"
VERIFY = "/auth/registration/verify"
RESET = "/auth/session/password-reset/request"
CONFIRM = "/auth/session/password-reset/confirm"


class CapturedMailbox:
    def __init__(self):
        self.messages = []
        self.offline = False
        self.reject_recipient = False

    @contextmanager
    def connect(self):
        if self.offline:
            raise unavailable()
        yield None

    def send(self, smtp, **message):
        if self.reject_recipient:
            return False
        self.messages.append(message)
        return True

    def latest_token(self, email):
        return next(message["token"] for message in reversed(self.messages) if message["recipient"] == email)


@pytest.fixture
def account_stack(monkeypatch):
    base = make_url(os.environ["TEST_DATABASE_URL"])
    schema = f"account_{uuid4().hex}"
    root = create_engine(base)
    with root.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA {schema}"))
    schema_url = base.update_query_dict({"options": f"-csearch_path={schema}"})
    monkeypatch.setenv("DATABASE_URL", schema_url.render_as_string(hide_password=False))
    monkeypatch.setenv("AUTH_JWT_SECRET", "ci-only-signing-secret-that-is-long-enough")
    monkeypatch.setattr(main.settings, "cors_origins", ORIGIN)
    monkeypatch.setattr(main, "auth_service", None)
    monkeypatch.setattr(main, "_runtime_engine", None)
    monkeypatch.setattr(main, "_runtime_engine_url", None)
    mailbox = CapturedMailbox()
    monkeypatch.setattr(main, "AccountEmail", lambda *_: mailbox)
    main.startup_database()
    engine = main.runtime_database_engine()

    def session_override():
        with Session(engine) as session:
            yield session

    monkeypatch.setitem(main.app.dependency_overrides, get_db, session_override)
    try:
        yield engine, mailbox
    finally:
        engine.dispose()
        with root.begin() as conn:
            conn.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        root.dispose()


def client():
    return TestClient(main.app, base_url=ORIGIN)


def post(path, payload, *, headers=ORIGIN_HEADERS):
    with client() as browser:
        return browser.post(path, headers=headers, json=payload)


def verify_payload(token, name="Example Workspace"):
    return {"name": "Synthetic User", "workspace_name": name, "password": PASSWORD, "token": token}


def register(mailbox, email, name="Example Workspace"):
    assert post(REGISTER, {"email": email}).status_code == 202
    assert post(VERIFY, verify_payload(mailbox.latest_token(email), name)).status_code == 204


def test_registration_resend_expiry_concurrency_and_owner_isolation(account_stack):
    engine, mailbox = account_stack
    email_a = "account-a@example.net"
    email_b = "account-b@example.net"
    credentials = {"email": email_a, "password": PASSWORD}
    assert post(REGISTER, {"email": email_a}, headers={"Origin": "https://other.example.net"}).status_code == 403
    assert post(REGISTER, {"email": email_a, "locale": "es"}).status_code == 202
    expired = mailbox.latest_token(email_a)
    assert mailbox.messages[-1]["locale"] == "es"
    assert post("/auth/session/login", credentials).status_code == 401
    with engine.begin() as conn:
        conn.execute(text("UPDATE goodmarketing_email_verifications SET expires_at = now() - interval '1 minute'"))
    assert post(VERIFY, verify_payload(expired)).status_code == 400

    with ThreadPoolExecutor(max_workers=2) as pool:
        requests = list(pool.map(lambda _: post(REGISTER, {"email": email_a}).status_code, range(2)))
    assert requests == [202, 202]
    tokens = [message["token"] for message in mailbox.messages if message["token"] != expired]
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(pool.map(lambda token: post(VERIFY, verify_payload(token, "Workspace A")).status_code, tokens))
    assert statuses == [204, 400]
    assert post(VERIFY, verify_payload(tokens[0])).status_code == 400
    assert post(REGISTER, {"email": email_a}).status_code == 202
    assert len(mailbox.messages) == 3
    assert post(REGISTER, {"email": email_a}).status_code == 429

    register(mailbox, email_b, "Workspace B")
    with client() as a, client() as b:
        login = a.post("/auth/session/login", headers=ORIGIN_HEADERS, json=credentials)
        assert login.status_code == 200 and list(login.json()) == ["identity"]
        cookies = login.headers.get_list("set-cookie")
        assert len(cookies) == 2 and all("HttpOnly" in c and "Secure" in c and "SameSite=lax" in c for c in cookies)
        assert a.get("/auth/me", headers={"Authorization": f"Bearer {a.cookies.get('gm_access')}"}).status_code == 200
        assert b.post("/auth/session/login", headers=ORIGIN_HEADERS, json={"email": email_b, "password": PASSWORD}).status_code == 200
        org_a = login.json()["identity"]["organization_id"]
        assert b.post("/auth/session/login", headers=ORIGIN_HEADERS, json={
            "email": email_b, "password": PASSWORD, "organization_id": org_a
        }).status_code == 401
        assert a.get("/workspace").json()["display_name"] == "Workspace A"
        assert b.get("/workspace", params={"organization_id": org_a}).json()["display_name"] == "Workspace B"
        assert b.put("/workspace", headers={**ORIGIN_HEADERS, "X-GM-Organization-ID": org_a},
                     json={"display_name": "Workspace B renamed"}).status_code == 200
        assert a.get("/workspace").json()["display_name"] == "Workspace A"
        stale = a.cookies.get("gm_refresh")
        assert a.post("/auth/session/refresh", headers=ORIGIN_HEADERS).status_code == 200
        assert a.cookies.get("gm_refresh") != stale
        assert a.post("/auth/session/logout", headers=ORIGIN_HEADERS).status_code == 204
        assert a.get("/auth/session/me").status_code == 401
        assert a.post("/auth/session/login", headers=ORIGIN_HEADERS, json=credentials).status_code == 200
        with engine.begin() as conn:
            conn.execute(text("UPDATE gm_auth_refresh_sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = :hash"),
                         {"hash": digest(a.cookies.get("gm_refresh"))})
        assert a.post("/auth/session/refresh", headers=ORIGIN_HEADERS).status_code == 401
        assert a.cookies.get("gm_access") is None
    with engine.connect() as conn:
        for table in ("gm_auth_organizations", "gm_auth_users", "gm_auth_memberships", "goodmarketing_workspace_profiles"):
            assert conn.scalar(text(f"SELECT count(*) FROM {table}")) == 2


def test_reset_delivery_contract_reuse_expiry_and_revocation(account_stack):
    engine, mailbox = account_stack
    email = "reset-owner@example.net"
    register(mailbox, email)
    with client() as owner:
        assert owner.post("/auth/session/login", headers=ORIGIN_HEADERS, json={"email": email, "password": PASSWORD}).status_code == 200
        real = post(RESET, {"email": email})
        absent = post(RESET, {"email": "absent@example.net"})
        assert real.status_code == absent.status_code == 202 and real.json() == absent.json()
        expired = mailbox.latest_token(email)
        with engine.begin() as conn:
            conn.execute(text("UPDATE gm_auth_password_resets SET expires_at = now() - interval '1 minute'"))
        assert post(CONFIRM, {"token": expired, "password": NEW_PASSWORD}).status_code == 400
        assert post(RESET, {"email": email}).status_code == 202
        token = mailbox.latest_token(email)
        payload = {"token": token, "password": NEW_PASSWORD}
        assert post(CONFIRM, payload, headers={}).status_code == 403
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(lambda _: post(CONFIRM, payload).status_code, range(2))) == [204, 400]
        assert owner.post("/auth/session/refresh", headers=ORIGIN_HEADERS).status_code == 401
        assert post("/auth/login", {"email": email, "password": PASSWORD}).status_code == 401
        assert post("/auth/login", {"email": email, "password": NEW_PASSWORD}).status_code == 200


def test_delivery_failure_keeps_resend_usable_and_auth_errors_redacted(account_stack):
    engine, mailbox = account_stack
    email = "mailbox-test@example.net"
    mailbox.offline = True
    assert post(REGISTER, {"email": email}).status_code == 503
    mailbox.offline = False
    mailbox.reject_recipient = True
    assert post(REGISTER, {"email": email}).status_code == 202
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM goodmarketing_email_verifications")) == 0
    mailbox.reject_recipient = False
    register(mailbox, email)
    mailbox.offline = True
    assert post(RESET, {"email": email}).status_code == 503
    assert post(RESET, {"email": "nonexistent@example.net"}).status_code == 503
    mailbox.offline = False
    mailbox.reject_recipient = True
    assert post(RESET, {"email": email}).status_code == 202
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM gm_auth_password_resets")) == 0
    invalid = post(CONFIRM, {"token": "sensitive-input", "password": "short"})
    assert invalid.status_code == 422 and "sensitive-input" not in invalid.text
    assert "short" not in invalid.text
    token = mailbox.latest_token(email)
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT token_hash FROM goodmarketing_email_verifications WHERE token_hash = :hash"),
                           {"hash": digest(token)}) is None


def test_dev_enrollment_is_disabled_outside_dev_and_email_flows_remain(account_stack, monkeypatch):
    _, mailbox = account_stack
    email = "synthetic-guard@example.net"
    credential = secrets.token_urlsafe(32)
    monkeypatch.setattr(main, "DEV_ENROLLMENT_PAIR_SHA256",
                        __import__("hashlib").sha256(f"{email}\0{credential}".encode()).hexdigest())
    valid = {"email": email, "credential": credential, "name": "Synthetic", "workspace_name": "Synthetic",
             "password": secrets.token_urlsafe(24)}
    for environment in ("production", "local"):
        monkeypatch.setattr(main.settings, "app_env", environment)
        status = client().get("/auth/dev-enrollment")
        assert status.json() == {"available": False}
        assert status.headers["cache-control"] == "no-store"
        assert post("/auth/dev-enrollment", valid).status_code == 404
    monkeypatch.setattr(main.settings, "app_env", "dev")
    status = client().get("/auth/dev-enrollment")
    assert status.json() == {"available": True}
    assert status.headers["cache-control"] == "no-store"
    normal_email = f"normal-{uuid4()}@example.net"
    register(mailbox, normal_email)
    assert post(RESET, {"email": normal_email}).status_code == 202
    assert len(mailbox.messages) == 2


def test_dev_enrollment_one_time_atomic_owner_session_and_redaction(account_stack, monkeypatch):
    engine, mailbox = account_stack
    monkeypatch.setattr(main.settings, "app_env", "dev")
    email = "synthetic-enrollment@example.net"
    credential = secrets.token_urlsafe(32)
    password = secrets.token_urlsafe(24)
    pair = f"{email}\0{credential}"
    monkeypatch.setattr(main, "DEV_ENROLLMENT_PAIR_SHA256", __import__("hashlib").sha256(pair.encode()).hexdigest())
    payload = {"email": email, "credential": credential, "name": "Synthetic Owner",
               "workspace_name": "Synthetic Workspace", "password": password}
    status = client().get("/auth/dev-enrollment")
    assert status.json() == {"available": True}
    assert status.headers["cache-control"] == "no-store"
    assert post("/auth/dev-enrollment", payload, headers={}).status_code == 403

    wrong = {**payload, "credential": secrets.token_urlsafe(32)}
    response = post("/auth/dev-enrollment", wrong)
    assert response.status_code == 403 and credential not in response.text and password not in response.text
    wrong_email = {**payload, "email": "other@example.net"}
    assert post("/auth/dev-enrollment", wrong_email).status_code == 403
    invalid = {**payload, "password": "short"}
    response = post("/auth/dev-enrollment", invalid)
    assert response.status_code == 422 and "short" not in response.text

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: post("/auth/dev-enrollment", payload), range(2)))
    assert sorted(response.status_code for response in responses) == [201, 409]
    assert all(response.headers["cache-control"] == "no-store" for response in responses)
    assert client().get("/auth/dev-enrollment").json() == {"available": False}
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM gm_auth_users WHERE lower(email) = :email"), {"email": email}) == 1
        assert conn.scalar(text("SELECT count(*) FROM goodmarketing_workspace_profiles")) == 1
        assert conn.scalar(text("SELECT count(*) FROM goodmarketing_dev_enrollment WHERE id = 1")) == 1
        owner_id = conn.scalar(text("SELECT id FROM gm_auth_users WHERE lower(email) = :email"), {"email": email})
        org_id = conn.scalar(text("SELECT organization_id FROM gm_auth_memberships WHERE user_id = :id"), {"id": owner_id})
        permissions = conn.scalar(text("SELECT permissions::text FROM gm_auth_memberships WHERE user_id = :id"), {"id": owner_id})
        assert "owner" in conn.scalar(text("SELECT roles::text FROM gm_auth_memberships WHERE user_id = :id"), {"id": owner_id})
        assert "marketing:write" in permissions

    other_email = "isolation-owner@example.net"
    register(mailbox, other_email, "Other Workspace")
    with client() as owner, client() as other:
        login = owner.post("/auth/session/login", headers=ORIGIN_HEADERS,
                           json={"email": email, "password": password})
        assert login.status_code == 200
        assert owner.get("/auth/session/me").status_code == 200
        assert owner.get("/workspace").json()["display_name"] == "Synthetic Workspace"
        other_login = other.post("/auth/session/login", headers=ORIGIN_HEADERS,
                                 json={"email": other_email, "password": PASSWORD})
        assert other_login.status_code == 200
        assert other.get("/workspace").json()["display_name"] == "Other Workspace"
        assert other.get("/workspace", params={"organization_id": org_id}).json()["display_name"] == "Other Workspace"
        campaign = owner.post("/workspace/campaigns", headers={**ORIGIN_HEADERS, "Idempotency-Key": str(uuid4())},
                              json={"name": "Private owner campaign", "objective": "Isolation check",
                                    "platforms": ["facebook"], "duration_days": 30,
                                    "posting_frequency": "medium"})
        assert campaign.status_code == 201
        campaign_id = campaign.json()["campaign"]["id"]
        assert other.get(f"/workspace/campaigns/{campaign_id}").status_code == 404
        refresh = owner.post("/auth/session/refresh", headers=ORIGIN_HEADERS)
        assert refresh.status_code == 200
        assert owner.post("/auth/session/logout", headers=ORIGIN_HEADERS).status_code == 204
        assert owner.get("/auth/session/me").status_code == 401

    # The slot remains spent if its owner is later deleted or the API restarts.
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM gm_auth_users WHERE id = :id"), {"id": owner_id})
        conn.execute(text("DELETE FROM goodmarketing_workspace_profiles WHERE organization_id = :id"), {"id": org_id})
        conn.execute(text("DELETE FROM gm_auth_organizations WHERE id = :id"), {"id": org_id})
        assert conn.scalar(text("SELECT count(*) FROM gm_auth_users WHERE id = :id"), {"id": owner_id}) == 0
        assert conn.scalar(text("SELECT count(*) FROM gm_auth_organizations WHERE id = :id"), {"id": org_id}) == 0
    main.startup_database()
    retry = post("/auth/dev-enrollment", payload)
    assert retry.status_code == 409


def test_dev_enrollment_conflicts_with_mixed_case_existing_identity_without_changes(account_stack, monkeypatch):
    engine, _ = account_stack
    monkeypatch.setattr(main.settings, "app_env", "dev")
    normalized_email = "existing-dev@example.net"
    credential = secrets.token_urlsafe(32)
    monkeypatch.setattr(main, "DEV_ENROLLMENT_PAIR_SHA256",
                        __import__("hashlib").sha256(f"{normalized_email}\0{credential}".encode()).hexdigest())
    service = main.account_service()
    with engine.begin() as conn:
        organization_id = main.self_service.create_owner_workspace(
            conn, service, email=normalized_email, name="Existing Owner",
            workspace_name="Existing Workspace", password=PASSWORD
        )
        owner_id = conn.scalar(text("SELECT id FROM gm_auth_users WHERE email = :email"), {"email": normalized_email})

    with client() as browser:
        login = browser.post("/auth/session/login", headers=ORIGIN_HEADERS,
                             json={"email": normalized_email, "password": PASSWORD})
        assert login.status_code == 200
        with engine.begin() as conn:
            conn.execute(text("UPDATE gm_auth_users SET email = :email WHERE id = :id"),
                         {"email": "Existing-Dev@Example.Net", "id": owner_id})
        request = {"email": "EXISTING-DEV@example.net", "credential": credential,
                   "name": "Attacker Name", "workspace_name": "Replacement Workspace",
                   "password": secrets.token_urlsafe(24)}
        response = post("/auth/dev-enrollment", request)
        assert response.status_code == 409
        assert request["password"] not in response.text and credential not in response.text
        assert browser.get("/auth/session/me").status_code == 200
        assert browser.get("/workspace").json()["display_name"] == "Existing Workspace"

    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM gm_auth_users WHERE lower(email) = :email"),
                           {"email": normalized_email}) == 1
        assert conn.scalar(text("SELECT count(*) FROM goodmarketing_workspace_profiles")) == 1
        assert conn.scalar(text("SELECT count(*) FROM goodmarketing_dev_enrollment")) == 0
