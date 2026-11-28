import os
import secrets
import warnings
from contextlib import contextmanager
from uuid import uuid4

import pytest
from gm_auth import AuthService, AuthSettings
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app import dev_accounts, main


pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires PostgreSQL 16")
PASSWORD = secrets.token_urlsafe(24)
NEW_PASSWORD = secrets.token_urlsafe(24)


@pytest.fixture
def dev_db(monkeypatch):
    base = make_url(os.environ["TEST_DATABASE_URL"])
    schema = f"dev_account_{uuid4().hex}"
    root = create_engine(base)
    with root.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    schema_url = base.update_query_dict({"options": f"-csearch_path={schema}"})
    database_url = schema_url.render_as_string(hide_password=False)
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-only-migration-key-long-enough-32-bytes")
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("ACCOUNT_DEV_MANUAL_ACCESS", "true")
    monkeypatch.setattr(main, "auth_service", None)
    monkeypatch.setattr(main, "_runtime_engine", None)
    monkeypatch.setattr(main, "_runtime_engine_url", None)
    main.startup_database()
    engine = create_engine(schema_url)
    try:
        yield engine
    finally:
        engine.dispose()
        if main._runtime_engine is not None:
            main._runtime_engine.dispose()
        with root.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        root.dispose()


def test_cli_provision_is_atomic_idempotent_and_never_overwrites(dev_db, monkeypatch, capsys):
    monkeypatch.setattr(dev_accounts, "_password", lambda: PASSWORD)
    args = ["provision", "--email", "synthetic-owner@example.net", "--name", "Synthetic Owner",
            "--workspace-name", "Synthetic Workspace"]
    assert dev_accounts.main(args) == 0
    output = capsys.readouterr().out
    assert "provisioned" in output and PASSWORD not in output
    with dev_db.connect() as connection:
        counts = connection.execute(text("""
            SELECT (SELECT count(*) FROM gm_auth_users WHERE email = 'synthetic-owner@example.net'),
                   (SELECT count(*) FROM gm_auth_organizations),
                   (SELECT count(*) FROM gm_auth_memberships),
                   (SELECT count(*) FROM goodmarketing_workspace_profiles WHERE dev_managed_owner_user_id IS NOT NULL)
        """)).one()
        tracked = connection.execute(text("""
            SELECT u.id, u.is_active, p.organization_id, p.display_name, o.name, m.roles::text
            FROM gm_auth_users u
            JOIN goodmarketing_workspace_profiles p ON p.dev_managed_owner_user_id = u.id
            JOIN gm_auth_organizations o ON o.id = p.organization_id
            JOIN gm_auth_memberships m ON m.user_id = u.id AND m.organization_id = p.organization_id
            WHERE u.email = 'synthetic-owner@example.net'
        """)).one()
    assert tuple(counts) == (1, 1, 1, 1)
    user_id, active, organization_id, display_name, organization_name, roles = tracked
    assert active and display_name == organization_name == "Synthetic Workspace"
    assert "owner" in roles

    monkeypatch.setattr(dev_accounts, "_password", lambda: pytest.fail("retry must not prompt"))
    assert dev_accounts.main(args) == 0
    assert "already provisioned" in capsys.readouterr().out
    changed = [*args]
    changed[changed.index("Synthetic Workspace")] = "Different Workspace"
    assert dev_accounts.main(changed) == 2
    assert "no changes were made" in capsys.readouterr().err
    with dev_db.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM gm_auth_users")) == 1
        assert connection.scalar(text("SELECT organization_id FROM goodmarketing_workspace_profiles WHERE dev_managed_owner_user_id = :id"), {"id": user_id}) == organization_id


def test_cli_rejects_unmanaged_and_inactive_accounts(dev_db, monkeypatch, capsys):
    service = AuthService(dev_db, AuthSettings("test-only-auth-key-long-enough-for-unit-tests", issuer="goodmarketing"))
    service.create_organization(organization_id="unmanaged-org", slug="unmanaged-org", name="Unmanaged Workspace")
    service.create_user(email="unmanaged@example.net", name="Unmanaged", password=PASSWORD,
                        organization_id="unmanaged-org", roles={"owner"}, permissions={"workspace:read", "marketing:write"})
    monkeypatch.setattr(dev_accounts, "_password", lambda: pytest.fail("unmanaged identities must not prompt"))
    args = ["provision", "--email", "unmanaged@example.net", "--name", "Unmanaged", "--workspace-name", "Unmanaged Workspace"]
    assert dev_accounts.main(args) == 2
    assert "unmanaged" in capsys.readouterr().err.lower()

    monkeypatch.setattr(dev_accounts, "_password", lambda: PASSWORD)
    assert dev_accounts.main(["provision", "--email", "inactive@example.net", "--name", "Inactive",
                              "--workspace-name", "Inactive Workspace"]) == 0
    capsys.readouterr()
    with dev_db.begin() as connection:
        connection.execute(text("UPDATE gm_auth_users SET is_active = false WHERE email = 'inactive@example.net'"))
    monkeypatch.setattr(dev_accounts, "_password", lambda: pytest.fail("inactive identity must not prompt"))
    assert dev_accounts.main(["provision", "--email", "inactive@example.net", "--name", "Inactive",
                              "--workspace-name", "Inactive Workspace"]) == 2
    assert "inactive" in capsys.readouterr().err.lower()


def test_cli_password_rotation_uses_reset_revocation_for_tracked_owner(dev_db, monkeypatch, capsys):
    monkeypatch.setattr(dev_accounts, "_password", lambda: PASSWORD)
    args = ["provision", "--email", "rotate@example.net", "--name", "Rotate Owner", "--workspace-name", "Rotate Workspace"]
    assert dev_accounts.main(args) == 0
    capsys.readouterr()
    auth = AuthService(dev_db, AuthSettings("test-only-auth-key-long-enough-for-unit-tests", issuer="goodmarketing"))
    old_session = auth.login(email="rotate@example.net", password=PASSWORD)
    assert old_session is not None

    with dev_db.connect() as connection:
        target_user_id = connection.scalar(text("SELECT id FROM gm_auth_users WHERE email = 'rotate@example.net'"))
    def change_tracking_during_prompt():
        with dev_db.begin() as connection:
            connection.execute(text("UPDATE goodmarketing_workspace_profiles SET dev_managed_owner_user_id = NULL WHERE dev_managed_owner_user_id = :id"),
                               {"id": target_user_id})
        return NEW_PASSWORD
    monkeypatch.setattr(dev_accounts, "_password", change_tracking_during_prompt)
    assert dev_accounts.main(["password", "--email", "rotate@example.net"]) == 2
    assert "tracked" in capsys.readouterr().err.lower()
    assert auth.login(email="rotate@example.net", password=PASSWORD) is not None

    with dev_db.begin() as connection:
        connection.execute(text("UPDATE goodmarketing_workspace_profiles SET dev_managed_owner_user_id = :id WHERE organization_id = (SELECT organization_id FROM gm_auth_memberships WHERE user_id = :id)"),
                           {"id": target_user_id})
    monkeypatch.setattr(dev_accounts, "_password", lambda: NEW_PASSWORD)
    assert dev_accounts.main(["password", "--email", "rotate@example.net"]) == 0
    output = capsys.readouterr().out
    assert NEW_PASSWORD not in output
    assert "15 minutes" in output
    assert auth.login(email="rotate@example.net", password=PASSWORD) is None
    assert auth.login(email="rotate@example.net", password=NEW_PASSWORD) is not None
    assert auth.refresh(old_session.refresh_token) is None
    assert auth.identity_from_access_token(old_session.access_token).user_id == old_session.identity.user_id


def test_password_prompt_requires_hidden_tty_and_rejects_echo_fallback(monkeypatch):
    class Tty:
        def isatty(self):
            return True

    class Pipe:
        def isatty(self):
            return False

    monkeypatch.setattr(dev_accounts.sys, "stdin", Pipe())
    monkeypatch.setattr(dev_accounts.sys, "stderr", Tty())
    monkeypatch.setattr(dev_accounts.getpass, "getpass", lambda *_args: pytest.fail("must not prompt without TTY"))
    with pytest.raises(dev_accounts.DevAccountError, match="interactive terminal"):
        dev_accounts._password()

    monkeypatch.setattr(dev_accounts.sys, "stdin", Tty())
    monkeypatch.setattr(dev_accounts.getpass, "getpass", lambda *_args: warnings.warn(
        "echo fallback", dev_accounts.getpass.GetPassWarning))
    with pytest.raises(dev_accounts.DevAccountError, match="Secure hidden password input"):
        dev_accounts._password()


@pytest.mark.parametrize("environment,flag,database", [
    ("production", "true", "postgresql://not-used"),
    ("dev", "TRUE", "postgresql://not-used"),
    ("dev", "true", ""),
])
def test_cli_fails_closed_before_connect_or_password_prompt(monkeypatch, capsys, environment, flag, database):
    monkeypatch.setenv("APP_ENV", environment)
    monkeypatch.setenv("ACCOUNT_DEV_MANUAL_ACCESS", flag)
    if database:
        monkeypatch.setenv("DATABASE_URL", database)
    else:
        monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(dev_accounts, "create_engine", lambda *_args, **_kwargs: pytest.fail("must not connect"))
    monkeypatch.setattr(dev_accounts, "_password", lambda: pytest.fail("must not prompt"))
    assert dev_accounts.main(["provision", "--email", "synthetic@example.net", "--name", "Synthetic",
                              "--workspace-name", "Synthetic Workspace"]) == 2
    assert "password" not in capsys.readouterr().out.lower()
