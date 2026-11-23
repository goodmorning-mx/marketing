import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app import main
from app.database import get_db
from gm_auth import AuthService, AuthSettings


pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires PostgreSQL 16")


def _url_for_schema(base_url, schema):
    return base_url.set(query={**base_url.query, "options": f"-csearch_path={schema}"})


def _create_schema(base_url, schema):
    connection_url = base_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(connection_url) as connection:
        version = int(connection.execute("SHOW server_version_num").fetchone()[0])
        assert 160000 <= version < 170000, "preservation acceptance requires PostgreSQL 16"
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
        assert versions == {"gm-auth:0.1.5", "marketing:adapters-models:189869c", "demo-requests:1", "marketing:strategy-fields:1"}
        assert {"gm_auth_users", "gm_auth_organizations", "brands", "campaigns", "content_items", "platform_connections", "publish_jobs", "demo_requests"} <= tables
    finally:
        _drop_schema(base_url, schema)


LEGACY_TABLES = ("brands", "campaigns", "content_items", "platform_connections", "publish_jobs")


def _legacy_rows(connection):
    # Fixed table names only; JSON retains every historical column, including timestamps.
    return {
        table: [row[0] for row in connection.execute(f"SELECT row_to_json(t) FROM {table} t ORDER BY id")]
        for table in LEGACY_TABLES
    }


def _foreign_keys(connection):
    rows = connection.execute("""
        SELECT conrelid::regclass::text, pg_get_constraintdef(oid)
        FROM pg_constraint WHERE contype = 'f' AND connamespace = current_schema()::regnamespace
        ORDER BY conrelid::regclass::text, conname
    """).fetchall()
    return [row for row in rows if row[0].split(".")[-1].strip('"') in LEGACY_TABLES]


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
                INSERT INTO brands (id, tenant_id, name, website, industry, summary, goal, tone, message, metrics, target_date, platforms, created_at)
                  VALUES (71, 'legacy-workspace', 'Existing brand', 'https://example.test', 'Design', 'Original summary',
                    'Awareness', 'Warm', 'Original message', 'Reach', '2026-12-01', '["instagram"]', '2026-01-01T12:00:00Z');
                INSERT INTO campaigns (id, brand_id, name, objective, platforms, status, created_at)
                  VALUES (72, 71, 'Existing campaign', 'Original objective', '["instagram"]', 'active', '2026-01-02T12:00:00Z');
                INSERT INTO content_items (id, campaign_id, title, copy, asset_name, platforms, variants, status, created_at)
                  VALUES (73, 72, 'Existing content', 'Original approved wording', 'original.png', '["instagram"]',
                    '{"instagram": "Original variant"}', 'approved', '2026-01-03T12:00:00Z');
                INSERT INTO platform_connections (id, brand_id, platform, status, remote_account_id, token_ciphertext, created_at)
                  VALUES (74, 71, 'instagram', 'connected', 'legacy-account-74', 'disposable-opaque-ciphertext', '2026-01-04T12:00:00Z');
                INSERT INTO publish_jobs (id, content_id, platform, status, remote_post_id, error_code, error_message, created_at)
                  VALUES (75, 73, 'instagram', 'blocked', 'legacy-post-75', 'PROVIDER_NOT_CONFIGURED',
                    'Original provider error', '2026-01-05T12:00:00Z');
            """)
            before = _legacy_rows(connection)
            foreign_keys = _foreign_keys(connection)
            assert len(foreign_keys) == 4
        assert {table: [row["id"] for row in rows] for table, rows in before.items()} == {
            "brands": [71], "campaigns": [72], "content_items": [73],
            "platform_connections": [74], "publish_jobs": [75],
        }

        monkeypatch.setenv("DATABASE_URL", schema_url.render_as_string(hide_password=False))
        monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
        # Assert after the first migration and again after replay, rather than only at the end.
        ledger = None
        for attempt in range(2):
            if attempt:
                # Also replay the additive SQL itself, bypassing the already-applied ledger.
                with psycopg.connect(connection_url) as connection:
                    for migration in sorted((Path(main.__file__).resolve().parents[1] / "migrations").glob("*.sql")):
                        connection.execute(migration.read_text(), prepare=False)
            main.startup_database()
            with psycopg.connect(connection_url) as connection:
                after = _legacy_rows(connection)
                assert _foreign_keys(connection) == foreign_keys
                for table in LEGACY_TABLES:
                    old_columns = before[table][0].keys()
                    assert [{key: row[key] for key in old_columns} for row in after[table]] == before[table], table
                relationship = connection.execute("""
                    SELECT b.id, c.id, i.id, pc.id, pj.id
                    FROM brands b JOIN campaigns c ON c.brand_id = b.id
                    JOIN content_items i ON i.campaign_id = c.id
                    JOIN platform_connections pc ON pc.brand_id = b.id
                    JOIN publish_jobs pj ON pj.content_id = i.id AND pj.platform = pc.platform
                """).fetchall()
                assert relationship == [(71, 72, 73, 74, 75)]
                assert connection.execute("SELECT audience, positioning FROM brands WHERE id = 71").fetchone() == ("", "")
                assert connection.execute("SELECT key_message, success_metrics FROM campaigns WHERE id = 72").fetchone() == ("", "")
                current_ledger = connection.execute("SELECT version, applied_at FROM goodmarketing_schema_migrations ORDER BY version").fetchall()
                assert len(current_ledger) == 3
                if ledger is not None:
                    assert current_ledger == ledger
                ledger = current_ledger
    finally:
        _drop_schema(base_url, schema)


def test_postgres_adapters_and_demo_request_staff_flow(monkeypatch):
    base_url = make_url(os.environ["TEST_DATABASE_URL"])
    schema = f"gm_adapter_flow_{uuid4().hex}"
    _create_schema(base_url, schema)
    schema_url = _url_for_schema(base_url, schema)
    engine = create_engine(schema_url)
    monkeypatch.setenv("AUTH_JWT_SECRET", "postgres-adapters-test-secret-is-long-enough")
    auth_service = AuthService(engine, AuthSettings(jwt_secret="postgres-adapters-test-secret-is-long-enough", issuer="goodmarketing"))
    auth_service.create_schema()
    auth_service.create_organization(organization_id="adapter-org", slug="adapter-org", name="Adapter test")
    auth_service.create_user(email="adapter-owner@example.test", name="Adapter Owner", password="disposable adapter password", organization_id="adapter-org", roles={"owner"}, permissions={"workspace:read", "marketing:write"})
    token = auth_service.login(email="adapter-owner@example.test", password="disposable adapter password").access_token
    adapter_headers = {"Authorization": f"Bearer {token}"}

    def database_session():
        with Session(engine) as session:
            yield session

    monkeypatch.setenv("DATABASE_URL", schema_url.render_as_string(hide_password=False))
    monkeypatch.setenv("ADMIN_USERNAME", "staff")
    monkeypatch.setenv("ADMIN_PASSWORD", "disposable-test-password")
    monkeypatch.setitem(main.app.dependency_overrides, get_db, database_session)
    monkeypatch.setattr(main.settings, "meta_client_id", "")
    monkeypatch.setattr(main.settings, "meta_client_secret", "")
    monkeypatch.setattr(main.settings, "app_name", "GoodMorning Marketing Adapters API")
    monkeypatch.setattr(main.settings, "app_env", "dev")
    monkeypatch.setattr(main, "auth_service", auth_service)
    try:
        with TestClient(main.app) as client:
            assert client.get("/health").json() == {
                "service": "GoodMorning Marketing Adapters API", "status": "ok", "environment": "dev",
            }
            assert client.get("/api/brands").status_code == 401
            brand = client.post("/api/brands", headers=adapter_headers, json={"name": "Disposable PG brand", "platforms": ["instagram"]})
            assert brand.status_code == 200
            campaign = client.post("/api/campaigns", headers=adapter_headers, json={"brand_id": brand.json()["id"], "name": "Disposable campaign"})
            assert campaign.status_code == 200
            content = client.post("/api/content", headers=adapter_headers, json={"campaign_id": campaign.json()["id"], "title": "Disposable content"})
            assert content.status_code == 200
            content_id = content.json()["id"]
            approved = client.patch(f"/api/content/{content_id}/status", headers=adapter_headers, json={"status": "approved"})
            assert approved.status_code == 200
            assert approved.json()["status"] == "approved"
            published = client.post(f"/api/publish/jobs?content_id={content_id}&platform=instagram", headers=adapter_headers)
            assert published.status_code == 202
            assert published.json()["status"] == "blocked"
            assert published.json()["error_code"] == "PROVIDER_NOT_CONFIGURED"

            submitted = client.post("/demo-requests", json={
                "name": "Disposable prospect", "email": "pg-prospect@example.test", "company": "Test Studio",
                "role": "Marketing lead", "goals": "Review a disposable bilingual campaign.", "market": "Mexico", "consent": True,
            })
            assert submitted.status_code == 201
            request_id = submitted.json()["id"]
            assert client.get("/admin/demo-requests").status_code == 401
            update = {"qualification_status": "contacted", "admin_notes": "Disposable follow-up."}
            assert client.put(f"/admin/demo-requests/{request_id}", json=update).status_code == 401
            auth = ("staff", "disposable-test-password")
            queue = client.get("/admin/demo-requests", auth=auth, params={"search": "pg-prospect@example.test"})
            assert queue.status_code == 200
            assert [row["id"] for row in queue.json()] == [request_id]
            updated = client.put(f"/admin/demo-requests/{request_id}", auth=auth, json=update)
            assert updated.status_code == 200
            assert updated.json()["qualification_status"] == "contacted"
            assert updated.json()["admin_notes"] == "Disposable follow-up."
            stored = client.get("/admin/demo-requests", auth=auth, params={"qualification_status": "contacted"})
            assert stored.status_code == 200
            assert stored.json()[0]["id"] == request_id
            assert stored.json()[0]["admin_notes"] == "Disposable follow-up."
    finally:
        auth_service.engine.dispose()
        engine.dispose()
        _drop_schema(base_url, schema)
