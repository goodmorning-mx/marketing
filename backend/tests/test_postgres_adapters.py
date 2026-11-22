import os
from uuid import uuid4

import psycopg
import pytest
from sqlalchemy.engine import make_url

from app import main


pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires PostgreSQL 16")


def _url_for_schema(base_url, schema):
    return base_url.set(query={**base_url.query, "options": f"-csearch_path={schema}"})


def _create_schema(base_url, schema):
    connection_url = base_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(connection_url) as connection:
        connection.execute(f'CREATE SCHEMA "{schema}"')


def _drop_schema(base_url, schema):
    connection_url = base_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(connection_url) as connection:
        connection.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


def _start_twice(monkeypatch, schema_url):
    monkeypatch.setenv("DATABASE_URL", schema_url.render_as_string(hide_password=False))
    monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
    main.startup_database()
    main.startup_database()


def test_new_database_migrations_apply_once_without_auth_secret(monkeypatch):
    base_url = make_url(os.environ["TEST_DATABASE_URL"])
    schema = f"gm_adapter_new_{uuid4().hex}"
    _create_schema(base_url, schema)
    schema_url = _url_for_schema(base_url, schema)
    try:
        _start_twice(monkeypatch, schema_url)
        connection_url = schema_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://", 1)
        with psycopg.connect(connection_url) as connection:
            versions = {row[0] for row in connection.execute("SELECT version FROM goodmarketing_schema_migrations")}
            tables = {row[0] for row in connection.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = %s", (schema,))}
        assert versions == {"marketing:adapters-models:189869c", "demo-requests:1", "marketing:strategy-fields:1"}
        assert {"brands", "campaigns", "content_items", "platform_connections", "publish_jobs", "demo_requests"} <= tables
    finally:
        _drop_schema(base_url, schema)


def test_existing_adapters_schema_keeps_rows_and_gains_missing_fields(monkeypatch):
    base_url = make_url(os.environ["TEST_DATABASE_URL"])
    schema = f"gm_adapter_legacy_{uuid4().hex}"
    _create_schema(base_url, schema)
    schema_url = _url_for_schema(base_url, schema)
    connection_url = schema_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://", 1)
    try:
        with psycopg.connect(connection_url) as connection:
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

        _start_twice(monkeypatch, schema_url)
        with psycopg.connect(connection_url) as connection:
            brand = connection.execute("SELECT name, audience, positioning FROM brands WHERE id = 71").fetchone()
            campaign = connection.execute("SELECT name, key_message, success_metrics FROM campaigns WHERE id = 72").fetchone()
            content = connection.execute("SELECT title FROM content_items WHERE id = 73").fetchone()
            version_count = connection.execute("SELECT count(*) FROM goodmarketing_schema_migrations").fetchone()[0]
        assert brand == ("Existing brand", "", "")
        assert campaign == ("Existing campaign", "", "")
        assert content == ("Existing content",)
        assert version_count == 3
    finally:
        _drop_schema(base_url, schema)
