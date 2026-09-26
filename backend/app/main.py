from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Brand, Campaign, ContentItem, PlatformConnection, PublishJob

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "status": "ok",
        "environment": settings.app_env,
    }


class BrandIn(BaseModel):
    tenant_id: str = "demo"
    name: str = Field(min_length=1, max_length=160)
    website: str = ""
    industry: str = ""
    summary: str = ""
    goal: str = ""
    audience: str = ""
    tone: str = ""
    message: str = ""
    metrics: str = ""
    target_date: str = ""
    platforms: list[str] = []


class CampaignIn(BaseModel):
    brand_id: int
    name: str = Field(min_length=1, max_length=180)
    objective: str = ""
    platforms: list[str] = []


class ContentIn(BaseModel):
    campaign_id: int
    title: str = Field(min_length=1, max_length=240)
    source_copy: str = ""
    asset_name: str = ""
    platforms: list[str] = []
    variants: dict[str, str] = {}

    @model_validator(mode="before")
    @classmethod
    def accept_copy_alias(cls, value: object) -> object:
        if isinstance(value, dict) and "copy" in value and "source_copy" not in value:
            return {**value, "source_copy": value["copy"]}
        return value


class StatusIn(BaseModel):
    status: str = Field(pattern="^(draft|review|approved|scheduled)$")


@app.post("/api/brands")
def create_brand(payload: BrandIn, db: Session = Depends(get_db)) -> dict:
    brand = Brand(**payload.model_dump())
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return {"id": brand.id, **payload.model_dump()}


@app.get("/api/brands")
def list_brands(tenant_id: str = "demo", db: Session = Depends(get_db)) -> list[dict]:
    brands = db.scalars(select(Brand).where(Brand.tenant_id == tenant_id).order_by(Brand.id.desc())).all()
    return [{"id": brand.id, "name": brand.name, "website": brand.website, "industry": brand.industry, "goal": brand.goal, "audience": brand.audience, "platforms": brand.platforms} for brand in brands]


@app.post("/api/campaigns")
def create_campaign(payload: CampaignIn, db: Session = Depends(get_db)) -> dict:
    if db.get(Brand, payload.brand_id) is None:
        raise HTTPException(status_code=404, detail="Brand not found")
    campaign = Campaign(**payload.model_dump())
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return {"id": campaign.id, **payload.model_dump(), "status": campaign.status}


@app.get("/api/campaigns")
def list_campaigns(brand_id: int, db: Session = Depends(get_db)) -> list[dict]:
    campaigns = db.scalars(select(Campaign).where(Campaign.brand_id == brand_id).order_by(Campaign.id.desc())).all()
    return [{"id": item.id, "brand_id": item.brand_id, "name": item.name, "objective": item.objective, "platforms": item.platforms, "status": item.status} for item in campaigns]


@app.post("/api/content")
def create_content(payload: ContentIn, db: Session = Depends(get_db)) -> dict:
    if db.get(Campaign, payload.campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    values = payload.model_dump()
    values["copy"] = values.pop("source_copy")
    item = ContentItem(**values)
    db.add(item)
    db.commit()
    db.refresh(item)
    response = payload.model_dump()
    response["copy"] = response.pop("source_copy")
    return {"id": item.id, **response, "status": item.status}


@app.patch("/api/content/{content_id}/status")
def update_content_status(content_id: int, payload: StatusIn, db: Session = Depends(get_db)) -> dict:
    item = db.get(ContentItem, content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content not found")
    item.status = payload.status
    db.commit()
    return {"id": item.id, "status": item.status}


@app.get("/api/connections/meta/status")
def meta_status(brand_id: int, db: Session = Depends(get_db)) -> dict:
    connection = db.scalar(select(PlatformConnection).where(PlatformConnection.brand_id == brand_id, PlatformConnection.platform == "meta"))
    return {"platform": "meta", "status": connection.status if connection else "not_connected", "supports": ["facebook", "instagram"], "requires_app_review": True}


@app.get("/api/publish/readiness")
def publish_readiness() -> dict:
    configured = bool(getattr(settings, "meta_client_id", "")) and bool(getattr(settings, "meta_client_secret", ""))
    return {"platform": "meta", "ready": False, "oauth_configured": configured, "reason": "Meta app credentials and App Review are required before publishing."}


@app.post("/api/publish/jobs", status_code=status.HTTP_202_ACCEPTED)
def create_publish_job(content_id: int, platform: str, db: Session = Depends(get_db)) -> dict:
    item = db.get(ContentItem, content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content not found")
    if item.status != "approved":
        raise HTTPException(status_code=409, detail="Content must be approved before publishing")
    job = PublishJob(content_id=content_id, platform=platform, status="blocked", error_code="PROVIDER_NOT_CONFIGURED", error_message="Meta OAuth and App Review are not configured yet.")
    db.add(job)
    db.commit()
    db.refresh(job)
    return {"id": job.id, "status": job.status, "platform": platform, "error_code": job.error_code, "error_message": job.error_message}
