from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func, Boolean, Integer, Index, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(120), index=True, default="demo")
    name: Mapped[str] = mapped_column(String(160))
    website: Mapped[str] = mapped_column(String(500), default="")
    industry: Mapped[str] = mapped_column(String(160), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    goal: Mapped[str] = mapped_column(Text, default="")
    audience: Mapped[str] = mapped_column(Text, default="")
    positioning: Mapped[str] = mapped_column(Text, default="")
    offers: Mapped[str] = mapped_column(Text, default="")
    tone: Mapped[str] = mapped_column(String(240), default="")
    message: Mapped[str] = mapped_column(Text, default="")
    metrics: Mapped[str] = mapped_column(String(500), default="")
    target_date: Mapped[str] = mapped_column(String(30), default="")
    growth_timeline: Mapped[str] = mapped_column(String(240), default="")
    platforms: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="brand", cascade="all, delete-orphan")

    __table_args__ = (Index("uq_brands_primary_tenant", "tenant_id", unique=True, postgresql_where=(is_primary.is_(True)), sqlite_where=(is_primary.is_(True))),)


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int | None] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True, nullable=True)
    # The FK is installed by migration 010 because gm-auth has separate MetaData.
    workspace_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    posting_frequency: Mapped[str | None] = mapped_column(String(16), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    create_request_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    create_request_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(180))
    objective: Mapped[str] = mapped_column(Text, default="")
    key_message: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[str] = mapped_column(String(30), default="")
    end_date: Mapped[str] = mapped_column(String(30), default="")
    success_metrics: Mapped[str] = mapped_column(String(500), default="")
    platforms: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    brand: Mapped[Brand | None] = relationship(back_populates="campaigns")
    content: Mapped[list["ContentItem"]] = relationship(back_populates="campaign", cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_campaign_workspace_create_request", "workspace_id", "create_request_id", unique=True,
              postgresql_where=(workspace_id.is_not(None) & create_request_id.is_not(None)),
              sqlite_where=(workspace_id.is_not(None) & create_request_id.is_not(None))),
    )


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(240))
    copy: Mapped[str] = mapped_column(Text, default="")
    asset_name: Mapped[str] = mapped_column(String(500), default="")
    platforms: Mapped[list[str]] = mapped_column(JSON, default=list)
    variants: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    campaign: Mapped[Campaign] = relationship(back_populates="content")


class PlatformConnection(Base):
    __tablename__ = "platform_connections"

    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(40), default="not_connected")
    remote_account_id: Mapped[str] = mapped_column(String(240), default="")
    token_ciphertext: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PublishJob(Base):
    __tablename__ = "publish_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("content_items.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(40), default="blocked")
    remote_post_id: Mapped[str] = mapped_column(String(240), default="")
    error_code: Mapped[str] = mapped_column(String(80), default="")
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
