import os
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app import main
from app.database import get_db
from app.models import ContentMedia
from gm_auth import AuthService, AuthSettings


pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="requires isolated PostgreSQL")


def _schema_url(base_url, name):
    return base_url.set(query={**base_url.query, "options": "-csearch_path=" + name})


def test_private_media_storage_quota_ranges_and_tenant_scope(monkeypatch):
    base_url = make_url(os.environ["TEST_DATABASE_URL"])
    schema = "gm_content_media_" + uuid4().hex
    conn_url = base_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(conn_url) as connection:
        assert 160000 <= int(connection.execute("SHOW server_version_num").fetchone()[0]) < 170000
        connection.execute('CREATE SCHEMA "' + schema + '"')
    scoped_url = _schema_url(base_url, schema)
    engine = create_engine(scoped_url)
    monkeypatch.setenv("DATABASE_URL", scoped_url.render_as_string(hide_password=False))
    monkeypatch.setenv("AUTH_JWT_SECRET", "step6-content-media-test-secret-long-enough")
    service = AuthService(engine, AuthSettings(jwt_secret="step6-content-media-test-secret-long-enough", issuer="goodmarketing"))
    service.create_schema()
    service.create_organization(organization_id="media-a", slug="media-a", name="Media A")
    service.create_organization(organization_id="media-b", slug="media-b", name="Media B")
    service.create_user(email="media-owner@fixture.test", name="Media Owner", password="media test password", organization_id="media-a", roles={"owner"}, permissions={"workspace:read", "marketing:write"})
    service.create_user(email="media-owner-b@fixture.test", name="Media Owner B", password="media test password", organization_id="media-b", roles={"owner"}, permissions={"workspace:read", "marketing:write"})
    token_a = service.login(email="media-owner@fixture.test", password="media test password").access_token
    token_b = service.login(email="media-owner-b@fixture.test", password="media test password").access_token
    headers_a = {"Authorization": "Bearer " + token_a}

    def db_session():
        with Session(engine) as session:
            yield session

    monkeypatch.setitem(main.app.dependency_overrides, get_db, db_session)
    monkeypatch.setattr(main, "auth_service", service)
    try:
        with TestClient(main.app) as client:
            campaign_response = client.post("/workspace/campaigns", headers={**headers_a, "Idempotency-Key": str(uuid4())},
                                            json={"name": "Private media", "objective": "", "platforms": ["facebook"], "duration_days": 30, "posting_frequency": "medium"})
            assert campaign_response.status_code == 201
            campaign_id = campaign_response.json()["campaign"]["id"]

            def create_photo(label):
                response = client.post("/workspace/campaigns/" + str(campaign_id) + "/content",
                                       headers={**headers_a, "Idempotency-Key": str(uuid4())},
                                       json={"kind": "photo", "title": label, "copy": "A private caption", "platforms": ["facebook"]})
                assert response.status_code == 201
                return response.json()["content"]["id"], response.headers["ETag"]

            image_bytes = BytesIO()
            Image.new("RGB", (400, 500), (30, 100, 150)).save(image_bytes, "JPEG", quality=80)
            jpeg = image_bytes.getvalue()
            item_a, etag_a = create_photo("Primary photo")
            item_b, etag_b = create_photo("Concurrent photo")
            monkeypatch.setattr(main, "MAX_WORKSPACE_BYTES", len(jpeg) * 2 - 1)

            def upload(item_id, etag):
                return client.post("/workspace/content/" + str(item_id) + "/media",
                                   headers={**headers_a, "If-Match": etag},
                                   files={"file": ("private.jpg", jpeg, "image/jpeg")})

            with ThreadPoolExecutor(max_workers=2) as workers:
                futures = [workers.submit(upload, item_a, etag_a), workers.submit(upload, item_b, etag_b)]
                concurrent = [future.result(timeout=20) for future in futures]
            assert sorted(response.status_code for response in concurrent) == [200, 413]
            successes = [response for response in concurrent if response.status_code == 200]
            failed = [response for response in concurrent if response.status_code == 413]
            assert len(successes) == len(failed) == 1
            stored_id = item_a if successes[0].json()["content"]["id"] == item_a else item_b
            failed_id = item_b if stored_id == item_a else item_a

            listing = client.get("/workspace/campaigns/" + str(campaign_id) + "/content", headers=headers_a)
            assert listing.status_code == 200 and "media_bytes" not in listing.text
            stored = next(item for item in listing.json()["content"] if item["id"] == stored_id)
            media_id = stored["media"]["id"]
            read = client.get("/workspace/content/" + str(stored_id) + "/media", headers=headers_a)
            assert read.status_code == 200 and read.content == jpeg
            assert read.headers["Cache-Control"] == "private, no-store"
            assert read.headers["X-Content-Type-Options"] == "nosniff"
            head = client.head("/workspace/content/" + str(stored_id) + "/media", headers=headers_a)
            assert head.status_code == 200 and head.content == b"" and int(head.headers["Content-Length"]) == len(jpeg)

            # At the exact workspace cap, replacing an item's bytes subtracts its existing row size.
            refreshed = client.get("/workspace/content/" + str(stored_id), headers=headers_a)
            monkeypatch.setattr(main, "MAX_WORKSPACE_BYTES", len(jpeg))
            replaced = client.post("/workspace/content/" + str(stored_id) + "/media",
                                   headers={**headers_a, "If-Match": refreshed.headers["ETag"]},
                                   files={"file": ("replacement.jpg", jpeg, "image/jpeg")})
            assert replaced.status_code == 200
            range_response = client.get("/workspace/content/" + str(stored_id) + "/media",
                                        headers={**headers_a, "Range": "bytes=0-15"})
            assert range_response.status_code == 200  # JPEG requests intentionally return the full entity.
            reel_campaign = client.get("/workspace/campaigns/" + str(campaign_id), headers={"Authorization": "Bearer " + token_b})
            assert reel_campaign.status_code == 404
            foreign_media = client.get("/workspace/content/" + str(stored_id) + "/media", headers={"Authorization": "Bearer " + token_b})
            assert foreign_media.status_code == 404

            removed = client.delete("/workspace/content/" + str(stored_id), headers={**headers_a, "If-Match": replaced.headers["ETag"]})
            assert removed.status_code == 200
            assert client.get("/workspace/content/" + str(stored_id) + "/media", headers=headers_a).status_code == 404
            pending = client.get("/workspace/content/" + str(failed_id), headers=headers_a)
            after_removal = upload(failed_id, pending.headers["ETag"])
            assert after_removal.status_code == 200
            with Session(engine) as session:
                rows = session.scalars(select(ContentMedia)).all()
                assert len(rows) == 1 and rows[0].media_bytes == jpeg and rows[0].content_id == failed_id
                assert all(row.id != media_id for row in rows)
    finally:
        service.engine.dispose()
        engine.dispose()
        with psycopg.connect(conn_url) as connection:
            connection.execute('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE')
