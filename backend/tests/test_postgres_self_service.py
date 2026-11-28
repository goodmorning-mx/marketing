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


def test_dev_manual_access_gates_only_browser_initiation(account_stack, monkeypatch):
    engine, mailbox = account_stack
    monkeypatch.setattr(main.settings, "app_env", "dev")
    monkeypatch.setenv("ACCOUNT_DEV_MANUAL_ACCESS", "true")
    access = client().get("/auth/account-access")
    assert access.status_code == 200
    assert access.json() == {"manual_access": True}
    assert access.headers["cache-control"] == "no-store"

    registration = post(REGISTER, {"email": f"manual-{uuid4()}@example.net"})
    reset = post(RESET, {"email": f"manual-{uuid4()}@example.net"})
    assert registration.status_code == reset.status_code == 403
    assert registration.json() == reset.json() == {"code": "manual_dev_access"}
    assert registration.headers["cache-control"] == reset.headers["cache-control"] == "no-store"
    assert not mailbox.messages
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM goodmarketing_email_verifications")).scalar_one() == 0
        assert connection.execute(text("SELECT count(*) FROM gm_auth_password_resets")).scalar_one() == 0

    service = main.account_service()
    service.create_organization(organization_id="manual-bearer-org", slug="manual-bearer-org", name="Manual Bearer")
    manual_password = secrets.token_urlsafe(24)
    service.create_user(email="manual-bearer@example.net", name="Manual Bearer", password=manual_password,
                        organization_id="manual-bearer-org", roles={"owner"}, permissions={"workspace:read", "marketing:write"})
    legacy_reset = client().post("/auth/password-reset/request", json={"email": "manual-bearer@example.net"})
    login = post("/auth/session/login", {"email": "manual-bearer@example.net", "password": manual_password})
    assert legacy_reset.status_code == 200
    assert login.status_code == 200

    monkeypatch.setenv("ACCOUNT_DEV_MANUAL_ACCESS", "false")
    assert client().get("/auth/account-access").json() == {"manual_access": False}
    assert post(REGISTER, {"email": f"normal-{uuid4()}@example.net"}).status_code == 202
    assert post(RESET, {"email": "manual-bearer@example.net"}).status_code == 202
    assert len(mailbox.messages) == 2


def test_dev_manual_access_is_inert_outside_exact_dev_setting(account_stack, monkeypatch):
    monkeypatch.setenv("ACCOUNT_DEV_MANUAL_ACCESS", "true")
    monkeypatch.setattr(main.settings, "app_env", "production")
    access = client().get("/auth/account-access")
    assert access.status_code == 200
    assert access.json() == {"manual_access": False}
    assert post(REGISTER, {"email": f"normal-{uuid4()}@example.net"}).status_code == 202
