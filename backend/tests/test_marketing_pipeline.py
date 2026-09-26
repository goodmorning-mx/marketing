from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models import Base


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


def test_brand_campaign_content_and_approval_flow() -> None:
    brand = client.post("/api/brands", json={"name": "Atlas Studio", "goal": "Build awareness", "platforms": ["facebook", "instagram"]})
    assert brand.status_code == 200
    brand_id = brand.json()["id"]

    campaign = client.post("/api/campaigns", json={"brand_id": brand_id, "name": "Launch foundation", "objective": "Introduce the brand", "platforms": ["facebook", "instagram"]})
    assert campaign.status_code == 200
    campaign_id = campaign.json()["id"]

    content = client.post("/api/content", json={"campaign_id": campaign_id, "title": "Meet the brand", "copy": "Hello world", "platforms": ["facebook", "instagram"], "variants": {"facebook": "Hello Facebook", "instagram": "Hello Instagram"}})
    assert content.status_code == 200
    content_id = content.json()["id"]
    assert client.patch(f"/api/content/{content_id}/status", json={"status": "approved"}).json()["status"] == "approved"

    publish = client.post(f"/api/publish/jobs?content_id={content_id}&platform=instagram")
    assert publish.status_code == 202
    assert publish.json()["status"] == "blocked"
    assert publish.json()["error_code"] == "PROVIDER_NOT_CONFIGURED"


def test_meta_readiness_is_explicitly_blocked_without_provider_credentials() -> None:
    readiness = client.get("/api/publish/readiness")
    assert readiness.status_code == 200
    assert readiness.json()["ready"] is False
    assert readiness.json()["oauth_configured"] is False
