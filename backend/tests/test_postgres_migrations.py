import os

import psycopg
import pytest

from app import main


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires the PostgreSQL 16 CI service")
def test_gm_auth_migrations_succeed_on_first_and_repeated_startup(monkeypatch):
    database_url = os.environ["TEST_DATABASE_URL"]
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("AUTH_JWT_SECRET", "ci-only-signing-secret-that-is-long-enough")
    monkeypatch.setattr(main, "auth_service", None)

    try:
        main.startup_auth()
        main.startup_auth()

        connection_url = database_url.replace("postgresql+psycopg://", "postgresql://", 1)
        with psycopg.connect(connection_url) as connection:
            versions = connection.execute(
                "SELECT version FROM goodmarketing_schema_migrations ORDER BY version"
            ).fetchall()
            tables = connection.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            ).fetchall()
        assert versions == [("001_gm_auth.sql",), ("002_workspace_accounts.sql",)]
        assert {
            "gm_auth_users", "gm_auth_organizations", "gm_auth_memberships",
            "gm_auth_refresh_sessions", "goodmarketing_workspace_profiles",
            "goodmarketing_invitations",
        } <= {row[0] for row in tables}
    finally:
        if main.auth_service is not None:
            main.auth_service.engine.dispose()
