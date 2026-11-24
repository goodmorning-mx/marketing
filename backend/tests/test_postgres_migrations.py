import os
from uuid import uuid4

import psycopg
import pytest
from sqlalchemy.engine import make_url

from app import main


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires the PostgreSQL 16 CI service")
def test_gm_auth_migrations_succeed_on_first_and_repeated_startup(monkeypatch):
    database_url = os.environ["TEST_DATABASE_URL"]
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("AUTH_JWT_SECRET", "ci-only-signing-secret-that-is-long-enough")
    monkeypatch.setattr(main, "auth_service", None)

    try:
        main.startup_database()
        main.startup_database()

        connection_url = database_url.replace("postgresql+psycopg://", "postgresql://", 1)
        with psycopg.connect(connection_url) as connection:
            versions = connection.execute(
                "SELECT version FROM goodmarketing_schema_migrations ORDER BY version"
            ).fetchall()
            tables = connection.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            ).fetchall()
        assert {row[0] for row in versions} == {
            "gm-auth:0.1.5",
            "marketing:adapters-models:189869c",
            "workspace-accounts:1",
            "demo-requests:1",
            "marketing:strategy-fields:1",
            "marketing:owner-write-permission:1",
            "marketing:primary-brand-brief:1",
        }
        assert {
            "gm_auth_users", "gm_auth_organizations", "gm_auth_memberships",
            "gm_auth_refresh_sessions", "goodmarketing_workspace_profiles",
            "goodmarketing_invitations", "brands", "campaigns", "content_items",
            "platform_connections", "publish_jobs", "demo_requests",
        } <= {row[0] for row in tables}
    finally:
        if main.auth_service is not None:
            main.auth_service.engine.dispose()


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires the PostgreSQL 16 CI service")
def test_owner_permission_upgrade_is_additive_and_replayable(monkeypatch):
    database_url = os.environ["TEST_DATABASE_URL"]
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("AUTH_JWT_SECRET", "ci-only-signing-secret-that-is-long-enough")
    monkeypatch.setattr(main, "auth_service", None)
    monkeypatch.setattr(main, "_runtime_engine", None)
    monkeypatch.setattr(main, "_runtime_engine_url", None)
    user_id, organization_id = str(uuid4()), str(uuid4())
    connection_url = database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    try:
        main.startup_database()
        with psycopg.connect(connection_url) as connection:
            connection.execute(
                "INSERT INTO gm_auth_memberships (user_id, organization_id, roles, permissions, created_at) VALUES (%s, %s, %s, %s, now())",
                (user_id, organization_id, '["owner"]', '[]'),
            )
            connection.execute("DELETE FROM goodmarketing_schema_migrations WHERE version = 'marketing:owner-write-permission:1'")
        main.startup_database()
        with psycopg.connect(connection_url) as connection:
            permissions = connection.execute(
                "SELECT permissions::text FROM gm_auth_memberships WHERE user_id = %s AND organization_id = %s",
                (user_id, organization_id),
            ).fetchone()[0]
            assert "marketing:write" in permissions
    finally:
        if main.auth_service is not None:
            main.auth_service.engine.dispose()
        with psycopg.connect(connection_url) as connection:
            connection.execute("DELETE FROM gm_auth_memberships WHERE user_id = %s AND organization_id = %s", (user_id, organization_id))


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires the PostgreSQL 16 CI service")
def test_migrations_replay_over_preexisting_adapters_schema_without_losing_data(monkeypatch):
    base_url = make_url(os.environ["TEST_DATABASE_URL"])
    schema = f"gm_legacy_{uuid4().hex}"
    with psycopg.connect(base_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://", 1)) as connection:
        connection.execute(f'CREATE SCHEMA "{schema}"')
        connection.execute(f'SET search_path TO "{schema}"')
        connection.execute("""
            CREATE TABLE brands (
              id SERIAL PRIMARY KEY, tenant_id VARCHAR(120) NOT NULL, name VARCHAR(160) NOT NULL,
              website VARCHAR(500) NOT NULL DEFAULT '', industry VARCHAR(160) NOT NULL DEFAULT '',
              summary TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '', tone VARCHAR(240) NOT NULL DEFAULT '',
              message TEXT NOT NULL DEFAULT '', metrics VARCHAR(500) NOT NULL DEFAULT '', target_date VARCHAR(30) NOT NULL DEFAULT '',
              platforms JSON NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE TABLE campaigns (
              id SERIAL PRIMARY KEY, brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
              name VARCHAR(180) NOT NULL, objective TEXT NOT NULL DEFAULT '', platforms JSON NOT NULL,
              status VARCHAR(40) NOT NULL DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE TABLE content_items (
              id SERIAL PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
              title VARCHAR(240) NOT NULL, copy TEXT NOT NULL DEFAULT '', asset_name VARCHAR(500) NOT NULL DEFAULT '',
              platforms JSON NOT NULL, variants JSON NOT NULL, status VARCHAR(40) NOT NULL DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE TABLE platform_connections (
              id SERIAL PRIMARY KEY, brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
              platform VARCHAR(40) NOT NULL, status VARCHAR(40) NOT NULL DEFAULT 'not_connected',
              remote_account_id VARCHAR(240) NOT NULL DEFAULT '', token_ciphertext TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE TABLE publish_jobs (
              id SERIAL PRIMARY KEY, content_id INTEGER NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
              platform VARCHAR(40) NOT NULL, status VARCHAR(40) NOT NULL DEFAULT 'blocked',
              remote_post_id VARCHAR(240) NOT NULL DEFAULT '', error_code VARCHAR(80) NOT NULL DEFAULT '',
              error_message TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT now()
            );
            INSERT INTO brands (id, tenant_id, name, platforms) VALUES (71, 'legacy-workspace', 'Existing brand', '[]');
            INSERT INTO campaigns (id, brand_id, name, platforms) VALUES (72, 71, 'Existing campaign', '[]');
            INSERT INTO content_items (id, campaign_id, title, platforms, variants) VALUES (73, 72, 'Existing content', '[]', '{}');
        """)
        connection.commit()

    scoped_url = base_url.set(query={**base_url.query, "options": f"-csearch_path={schema}"})
    monkeypatch.setenv("DATABASE_URL", scoped_url.render_as_string(hide_password=False))
    monkeypatch.setenv("AUTH_JWT_SECRET", "ci-only-signing-secret-that-is-long-enough")
    monkeypatch.setattr(main, "auth_service", None)
    monkeypatch.setattr(main, "_runtime_engine", None)
    monkeypatch.setattr(main, "_runtime_engine_url", None)

    try:
        main.startup_database()
        main.startup_database()
        with psycopg.connect(scoped_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://", 1)) as connection:
            brand = connection.execute("SELECT name, audience, positioning FROM brands WHERE id = 71").fetchone()
            campaign = connection.execute("SELECT name, key_message, success_metrics FROM campaigns WHERE id = 72").fetchone()
            content = connection.execute("SELECT title FROM content_items WHERE id = 73").fetchone()
            flags = connection.execute("SELECT is_primary, revision FROM brands WHERE id = 71").fetchone()
            connection.execute("INSERT INTO brands (tenant_id, name, platforms) VALUES ('legacy-workspace', 'Old writer insert', '[]')")
            old_writer_defaults = connection.execute("SELECT is_primary, revision FROM brands WHERE name = 'Old writer insert'").fetchone()
            partial_unique = connection.execute("SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'brands' AND indexname = 'uq_brands_primary_tenant'").fetchone()[0]
            fk_count = connection.execute("SELECT count(*) FROM pg_constraint WHERE conrelid = 'campaigns'::regclass AND contype = 'f'").fetchone()[0]
            version_count = connection.execute("SELECT count(*) FROM goodmarketing_schema_migrations").fetchone()[0]
        assert brand == ("Existing brand", "", "")
        assert campaign == ("Existing campaign", "", "")
        assert content == ("Existing content",)
        assert flags == (False, 1)
        assert old_writer_defaults == (False, 1)
        assert "WHERE is_primary" in partial_unique
        assert fk_count == 1
        assert version_count == 7
    finally:
        if main._runtime_engine is not None:
            main._runtime_engine.dispose()
        main._runtime_engine = None
        main._runtime_engine_url = None
        with psycopg.connect(base_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://", 1)) as connection:
            connection.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
