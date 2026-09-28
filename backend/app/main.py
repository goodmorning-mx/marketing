from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from gm_auth import AuthService, AuthSettings, create_auth_router
from gm_mcp import PermissionDenied, RequestContext
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import engine, get_db
from app.models import Brand, Campaign, ContentItem, PlatformConnection, PublishJob
from app.tool_registry import invoke_marketing_tool, marketing_tools

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

if len(settings.jwt_secret) >= 32:
    app.include_router(create_auth_router(AuthService(engine=engine, settings=AuthSettings(jwt_secret=settings.jwt_secret))))


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
    positioning: str = ""
    offers: str = ""
    tone: str = ""
    message: str = ""
    metrics: str = ""
    target_date: str = ""
    growth_timeline: str = ""
    platforms: list[str] = []


class CampaignIn(BaseModel):
    brand_id: int
    name: str = Field(min_length=1, max_length=180)
    objective: str = ""
    key_message: str = ""
    start_date: str = ""
    end_date: str = ""
    success_metrics: str = ""
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


class ToolInvokeIn(BaseModel):
    name: str = Field(min_length=3)
    arguments: dict = Field(default_factory=dict)
    confirmed: bool = False


def tool_context(request: Request) -> RequestContext:
    user_id = request.headers.get("X-GM-User-ID")
    organization_id = request.headers.get("X-GM-Organization-ID")
    if not user_id or not organization_id:
        raise HTTPException(status_code=401, detail="Authenticated GoodMorning user and organization headers are required")
    permissions = frozenset(item.strip() for item in request.headers.get("X-GM-Permissions", "read").split(",") if item.strip())
    return RequestContext(user_id=user_id, organization_id=organization_id, product_id="marketing", permissions=permissions, request_id=request.headers.get("X-Request-ID"))


@app.get("/api/tools")
def list_tools() -> list[dict]:
    return marketing_tools.list()


@app.post("/api/tools/invoke")
async def invoke_tool(payload: ToolInvokeIn, request: Request) -> dict:
    try:
        result = await invoke_marketing_tool(context=tool_context(request), name=payload.name, arguments=payload.arguments, confirmed=payload.confirmed)
    except PermissionDenied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"content": result.content, "is_error": result.is_error, "requires_confirmation": result.requires_confirmation}


@app.post("/api/brands")
def create_brand(payload: BrandIn, db: Session = Depends(get_db)) -> dict:
    brand = Brand(**payload.model_dump())
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return {"id": brand.id, **payload.model_dump()}


@app.patch("/api/brands/{brand_id}")
def update_brand(brand_id: int, payload: BrandIn, db: Session = Depends(get_db)) -> dict:
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(status_code=404, detail="Brand not found")
    for key, value in payload.model_dump().items():
        setattr(brand, key, value)
    db.commit()
    db.refresh(brand)
    return {"id": brand.id, **payload.model_dump()}


@app.get("/api/brands")
def list_brands(tenant_id: str = "demo", db: Session = Depends(get_db)) -> list[dict]:
    brands = db.scalars(select(Brand).where(Brand.tenant_id == tenant_id).order_by(Brand.id.desc())).all()
    return [{"id": brand.id, "tenant_id": brand.tenant_id, "name": brand.name, "website": brand.website, "industry": brand.industry, "summary": brand.summary, "goal": brand.goal, "audience": brand.audience, "positioning": brand.positioning, "offers": brand.offers, "tone": brand.tone, "message": brand.message, "metrics": brand.metrics, "growth_timeline": brand.growth_timeline, "target_date": brand.target_date, "platforms": brand.platforms} for brand in brands]


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
    return [{"id": item.id, "brand_id": item.brand_id, "name": item.name, "objective": item.objective, "key_message": item.key_message, "start_date": item.start_date, "end_date": item.end_date, "success_metrics": item.success_metrics, "platforms": item.platforms, "status": item.status} for item in campaigns]


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


@app.get("/api/content")
def list_content(campaign_id: int, db: Session = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(ContentItem).where(ContentItem.campaign_id == campaign_id).order_by(ContentItem.id.desc())).all()
    return [{"id": item.id, "campaign_id": item.campaign_id, "title": item.title, "copy": item.copy, "asset_name": item.asset_name, "platforms": item.platforms, "variants": item.variants, "status": item.status} for item in items]


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
