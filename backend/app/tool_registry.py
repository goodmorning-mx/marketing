from __future__ import annotations

from gm_mcp import Permission, RequestContext, Tool, ToolCall, ToolRegistry
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Brand, Campaign, ContentItem, PublishJob


marketing_tools = ToolRegistry()


def _brands(*, context: RequestContext, limit: int = 20) -> list[dict]:
    with SessionLocal() as db:
        rows = db.scalars(select(Brand).where(Brand.tenant_id == context.organization_id).order_by(Brand.id.desc()).limit(limit)).all()
        return [{"id": row.id, "name": row.name, "goal": row.goal, "platforms": row.platforms} for row in rows]


def _campaigns(*, context: RequestContext, brand_id: int, limit: int = 50) -> list[dict]:
    with SessionLocal() as db:
        rows = db.scalars(select(Campaign).join(Brand).where(Brand.tenant_id == context.organization_id, Campaign.brand_id == brand_id).order_by(Campaign.id.desc()).limit(limit)).all()
        return [{"id": row.id, "brand_id": row.brand_id, "name": row.name, "objective": row.objective, "status": row.status} for row in rows]


def _request_review(*, context: RequestContext, content_id: int) -> dict:
    with SessionLocal() as db:
        item = db.scalar(select(ContentItem).join(Campaign).join(Brand).where(ContentItem.id == content_id, Brand.tenant_id == context.organization_id))
        if item is None:
            raise ValueError("Content not found")
        item.status = "review"
        db.commit()
        return {"id": item.id, "status": item.status}


def _approve_content(*, context: RequestContext, content_id: int) -> dict:
    with SessionLocal() as db:
        item = db.scalar(select(ContentItem).join(Campaign).join(Brand).where(ContentItem.id == content_id, Brand.tenant_id == context.organization_id))
        if item is None:
            raise ValueError("Content not found")
        item.status = "approved"
        db.commit()
        return {"id": item.id, "status": item.status}


def _queue_publish(*, context: RequestContext, content_id: int, platform: str) -> dict:
    with SessionLocal() as db:
        item = db.scalar(select(ContentItem).join(Campaign).join(Brand).where(ContentItem.id == content_id, Brand.tenant_id == context.organization_id))
        if item is None:
            raise ValueError("Content not found")
        if item.status != "approved":
            raise ValueError("Content must be approved before publishing")
        job = PublishJob(content_id=item.id, platform=platform, status="blocked", error_code="PROVIDER_NOT_CONFIGURED", error_message="OAuth and provider review are required before live publishing.")
        db.add(job)
        db.commit()
        db.refresh(job)
        return {"id": job.id, "status": job.status, "platform": platform, "error_code": job.error_code}


marketing_tools.register(Tool(name="marketing.list_brands", description="List brands in the current organization.", input_schema={"type": "object", "properties": {"limit": {"type": "integer", "maximum": 100}}}, handler=_brands, permission=Permission.READ))
marketing_tools.register(Tool(name="marketing.list_campaigns", description="List campaigns for a brand in the current organization.", input_schema={"type": "object", "required": ["brand_id"], "properties": {"brand_id": {"type": "integer"}, "limit": {"type": "integer", "maximum": 100}}}, handler=_campaigns, permission=Permission.READ))
marketing_tools.register(Tool(name="marketing.request_content_review", description="Move owned content into internal review.", input_schema={"type": "object", "required": ["content_id"], "properties": {"content_id": {"type": "integer"}}}, handler=_request_review, permission=Permission.WRITE, write=True))
marketing_tools.register(Tool(name="marketing.approve_content", description="Approve content for distribution after stakeholder review.", input_schema={"type": "object", "required": ["content_id"], "properties": {"content_id": {"type": "integer"}}}, handler=_approve_content, permission=Permission.WRITE, write=True, requires_confirmation=True))
marketing_tools.register(Tool(name="marketing.queue_publish", description="Queue approved content for a provider adapter; live publishing remains blocked until OAuth is configured.", input_schema={"type": "object", "required": ["content_id", "platform"], "properties": {"content_id": {"type": "integer"}, "platform": {"type": "string"}}}, handler=_queue_publish, permission=Permission.WRITE, write=True, requires_confirmation=True))


async def invoke_marketing_tool(*, context: RequestContext, name: str, arguments: dict, confirmed: bool = False):
    return await marketing_tools.invoke(ToolCall(name=name, arguments=arguments, confirmed=confirmed), context)
