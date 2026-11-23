"""Authenticated Adapters API.

Customer identity comes only from the verified gm-auth access token. Historical
tenant and X-GM headers remain accepted as input for wire compatibility, but
never establish authority.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from gm_auth import AuthIdentity
from gm_mcp import PermissionDenied, RequestContext

from app.config import get_settings
from app.database import get_db
from app.models import Brand, Campaign, ContentItem, PlatformConnection, PublishJob
from app.tool_registry import invoke_marketing_tool, marketing_tools

settings = get_settings()
router = APIRouter()


class BrandIn(BaseModel):
    # Kept for historical payload compatibility. The authenticated organization
    # always supplies the stored tenant_id.
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


class BrandPatchIn(BaseModel):
    # Partial updates preserve omitted values; the historical BrandIn contract
    # remains unchanged for create and non-primary clients.
    tenant_id: str | None = None
    name: str | None = Field(default=None, max_length=160)
    website: str | None = None
    industry: str | None = None
    summary: str | None = None
    goal: str | None = None
    audience: str | None = None
    positioning: str | None = None
    offers: str | None = None
    tone: str | None = None
    message: str | None = None
    metrics: str | None = None
    target_date: str | None = None
    growth_timeline: str | None = None
    platforms: list[str] | None = None


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


def customer_identity(request: Request) -> AuthIdentity:
    """Verify bearer/cookie credentials through the approved gm-auth service."""
    from app.main import account_service

    authorization = request.headers.get("Authorization", "")
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else request.cookies.get("gm_access")
    if not token:
        raise HTTPException(status_code=401, detail="Sign-in required.")
    if not authorization.lower().startswith("bearer ") and request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("Origin")
        if not origin or origin not in settings.allowed_origins:
            raise HTTPException(status_code=403, detail="Request origin is not permitted.")
    try:
        return account_service().identity_from_access_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Sign-in required.") from exc


def require_marketing_read(identity: AuthIdentity = Depends(customer_identity)) -> AuthIdentity:
    if "workspace:read" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Marketing access is not permitted.")
    return identity


def require_marketing_write(identity: AuthIdentity = Depends(require_marketing_read)) -> AuthIdentity:
    if "owner" not in identity.roles or "marketing:write" not in identity.permissions:
        raise HTTPException(status_code=403, detail="Marketing updates are not permitted.")
    return identity


def _brand_query(organization_id: str):
    return select(Brand).where(Brand.tenant_id == organization_id)


def _owned_brand(db: Session, organization_id: str, brand_id: int) -> Brand:
    brand = db.scalar(_brand_query(organization_id).where(Brand.id == brand_id))
    if brand is None:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


def _owned_campaign(db: Session, organization_id: str, campaign_id: int) -> Campaign:
    campaign = db.scalar(select(Campaign).join(Brand).where(Campaign.id == campaign_id, Brand.tenant_id == organization_id))
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


def _owned_content(db: Session, organization_id: str, content_id: int) -> ContentItem:
    item = db.scalar(select(ContentItem).join(Campaign).join(Brand).where(ContentItem.id == content_id, Brand.tenant_id == organization_id))
    if item is None:
        raise HTTPException(status_code=404, detail="Content not found")
    return item


def _brand_data(brand: Brand) -> dict:
    return {"id": brand.id, "tenant_id": brand.tenant_id, "name": brand.name, "website": brand.website, "industry": brand.industry, "summary": brand.summary, "goal": brand.goal, "audience": brand.audience, "positioning": brand.positioning, "offers": brand.offers, "tone": brand.tone, "message": brand.message, "metrics": brand.metrics, "target_date": brand.target_date, "growth_timeline": brand.growth_timeline, "platforms": brand.platforms}


def _tool_context(identity: AuthIdentity, request: Request) -> RequestContext:
    # gm-mcp consumes generic read/write capabilities. Map only verified module
    # permissions; caller-supplied X-GM-* headers are intentionally ignored.
    permissions = set()
    if "workspace:read" in identity.permissions:
        permissions.add("read")
    if "owner" in identity.roles and "marketing:write" in identity.permissions:
        permissions.add("write")
    return RequestContext(user_id=identity.user_id, organization_id=identity.organization_id, product_id="marketing", permissions=frozenset(permissions), request_id=request.headers.get("X-Request-ID"))


@router.get("/api/tools")
def list_tools(_identity: AuthIdentity = Depends(require_marketing_read)) -> list[dict]:
    return marketing_tools.list()


@router.post("/api/tools/invoke")
async def invoke_tool(payload: ToolInvokeIn, request: Request, identity: AuthIdentity = Depends(require_marketing_read)) -> dict:
    try:
        result = await invoke_marketing_tool(context=_tool_context(identity, request), name=payload.name, arguments=payload.arguments, confirmed=payload.confirmed)
    except PermissionDenied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404 if "not found" in str(exc).lower() else 400, detail=str(exc)) from exc
    return {"content": result.content, "is_error": result.is_error, "requires_confirmation": result.requires_confirmation}


@router.post("/api/brands")
def create_brand(payload: BrandIn, identity: AuthIdentity = Depends(require_marketing_write), db: Session = Depends(get_db)) -> dict:
    values = payload.model_dump()
    values["tenant_id"] = identity.organization_id
    brand = Brand(**values)
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return _brand_data(brand)


@router.patch("/api/brands/{brand_id}", openapi_extra={"requestBody": {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/BrandIn"}}}}})
def update_brand(brand_id: int, payload: BrandPatchIn, request: Request, response: Response, identity: AuthIdentity = Depends(require_marketing_write), db: Session = Depends(get_db)) -> dict:
    brand = _owned_brand(db, identity.organization_id, brand_id)
    changes = payload.model_dump(exclude={"tenant_id"}, exclude_unset=True)
    if any(value is None for value in changes.values()):
        raise HTTPException(status_code=422, detail="Brand fields cannot be null.")
    brief_fields = {"name", "summary", "audience", "tone", "goal"}
    if brand.is_primary and brief_fields.intersection(changes):
        from app.main import _brief_dict, _brief_etag, validate_primary_brand_fields
        validate_primary_brand_fields(name=changes.get("name", brand.name), tone=changes.get("tone", brand.tone))
        expected = request.headers.get("If-Match")
        if expected is None:
            raise HTTPException(status_code=428, detail="If-Match is required.")
        if expected.startswith("W/") or expected == "*" or not re.fullmatch(r'"bb-[0-9a-f]{64}"', expected):
            raise HTTPException(status_code=400, detail="Unsupported If-Match validator.")
        current = _brief_dict({"id": brand.id, "name": brand.name, "summary": brand.summary, "audience": brand.audience, "tone": brand.tone, "goal": brand.goal, "revision": brand.revision})
        if _brief_etag(identity.organization_id, current) != expected:
            raise HTTPException(status_code=412, detail="The brand brief changed. Reload before saving.")
        updated = db.execute(update(Brand).where(Brand.id == brand.id, Brand.tenant_id == identity.organization_id, Brand.is_primary.is_(True), Brand.revision == brand.revision).values(**changes, revision=Brand.revision + 1))
        if updated.rowcount != 1:
            raise HTTPException(status_code=412, detail="The brand brief changed. Reload before saving.")
        db.commit()
        db.refresh(brand)
        response.headers["ETag"] = _brief_etag(identity.organization_id, _brief_dict({"id": brand.id, "name": brand.name, "summary": brand.summary, "audience": brand.audience, "tone": brand.tone, "goal": brand.goal, "revision": brand.revision}))
    else:
        for key, value in changes.items():
            setattr(brand, key, value)
        db.commit()
        db.refresh(brand)
    return _brand_data(brand)


@router.get("/api/brands")
def list_brands(tenant_id: str = "demo", identity: AuthIdentity = Depends(require_marketing_read), db: Session = Depends(get_db)) -> list[dict]:
    # Ignore the legacy selector; it is never an authority boundary.
    brands = db.scalars(_brand_query(identity.organization_id).order_by(Brand.id.desc())).all()
    return [_brand_data(brand) for brand in brands]


@router.post("/api/campaigns")
def create_campaign(payload: CampaignIn, identity: AuthIdentity = Depends(require_marketing_write), db: Session = Depends(get_db)) -> dict:
    _owned_brand(db, identity.organization_id, payload.brand_id)
    campaign = Campaign(**payload.model_dump())
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return {"id": campaign.id, **payload.model_dump(), "status": campaign.status}


@router.get("/api/campaigns")
def list_campaigns(brand_id: int, identity: AuthIdentity = Depends(require_marketing_read), db: Session = Depends(get_db)) -> list[dict]:
    _owned_brand(db, identity.organization_id, brand_id)
    campaigns = db.scalars(select(Campaign).where(Campaign.brand_id == brand_id).order_by(Campaign.id.desc())).all()
    return [{"id": item.id, "brand_id": item.brand_id, "name": item.name, "objective": item.objective, "key_message": item.key_message, "start_date": item.start_date, "end_date": item.end_date, "success_metrics": item.success_metrics, "platforms": item.platforms, "status": item.status} for item in campaigns]


@router.post("/api/content")
def create_content(payload: ContentIn, identity: AuthIdentity = Depends(require_marketing_write), db: Session = Depends(get_db)) -> dict:
    _owned_campaign(db, identity.organization_id, payload.campaign_id)
    values = payload.model_dump()
    values["copy"] = values.pop("source_copy")
    item = ContentItem(**values)
    db.add(item)
    db.commit()
    db.refresh(item)
    response = payload.model_dump()
    response["copy"] = response.pop("source_copy")
    return {"id": item.id, **response, "status": item.status}


@router.get("/api/content")
def list_content(campaign_id: int, identity: AuthIdentity = Depends(require_marketing_read), db: Session = Depends(get_db)) -> list[dict]:
    _owned_campaign(db, identity.organization_id, campaign_id)
    items = db.scalars(select(ContentItem).where(ContentItem.campaign_id == campaign_id).order_by(ContentItem.id.desc())).all()
    return [{"id": item.id, "campaign_id": item.campaign_id, "title": item.title, "copy": item.copy, "asset_name": item.asset_name, "platforms": item.platforms, "variants": item.variants, "status": item.status} for item in items]


@router.patch("/api/content/{content_id}/status")
def update_content_status(content_id: int, payload: StatusIn, identity: AuthIdentity = Depends(require_marketing_write), db: Session = Depends(get_db)) -> dict:
    item = _owned_content(db, identity.organization_id, content_id)
    item.status = payload.status
    db.commit()
    return {"id": item.id, "status": item.status}


@router.get("/api/connections/meta/status")
def meta_status(brand_id: int, identity: AuthIdentity = Depends(require_marketing_read), db: Session = Depends(get_db)) -> dict:
    _owned_brand(db, identity.organization_id, brand_id)
    connection = db.scalar(select(PlatformConnection).where(PlatformConnection.brand_id == brand_id, PlatformConnection.platform == "meta"))
    return {"platform": "meta", "status": connection.status if connection else "not_connected", "supports": ["facebook", "instagram"], "requires_app_review": True}


@router.get("/api/publish/readiness")
def publish_readiness(_identity: AuthIdentity = Depends(require_marketing_read)) -> dict:
    configured = bool(getattr(settings, "meta_client_id", "")) and bool(getattr(settings, "meta_client_secret", ""))
    return {"platform": "meta", "ready": False, "oauth_configured": configured, "reason": "Meta app credentials and App Review are required before publishing."}


@router.post("/api/publish/jobs", status_code=status.HTTP_202_ACCEPTED)
def create_publish_job(content_id: int, platform: str, identity: AuthIdentity = Depends(require_marketing_write), db: Session = Depends(get_db)) -> dict:
    item = _owned_content(db, identity.organization_id, content_id)
    if item.status != "approved":
        raise HTTPException(status_code=409, detail="Content must be approved before publishing")
    job = PublishJob(content_id=content_id, platform=platform, status="blocked", error_code="PROVIDER_NOT_CONFIGURED", error_message="Meta OAuth and App Review are not configured yet.")
    db.add(job)
    db.commit()
    db.refresh(job)
    return {"id": job.id, "status": job.status, "platform": platform, "error_code": job.error_code, "error_message": job.error_message}
