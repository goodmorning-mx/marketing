"""Add persistent brand, campaign, content, connection, and publish-job tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202609260002"
down_revision: str | None = "202607150001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table("brands", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.String(120), nullable=False, index=True), sa.Column("name", sa.String(160), nullable=False), sa.Column("website", sa.String(500), nullable=False, server_default=""), sa.Column("industry", sa.String(160), nullable=False, server_default=""), sa.Column("summary", sa.Text(), nullable=False, server_default=""), sa.Column("goal", sa.Text(), nullable=False, server_default=""), sa.Column("audience", sa.Text(), nullable=False, server_default=""), sa.Column("tone", sa.String(240), nullable=False, server_default=""), sa.Column("message", sa.Text(), nullable=False, server_default=""), sa.Column("metrics", sa.String(500), nullable=False, server_default=""), sa.Column("target_date", sa.String(30), nullable=False, server_default=""), sa.Column("platforms", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_table("campaigns", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True), sa.Column("name", sa.String(180), nullable=False), sa.Column("objective", sa.Text(), nullable=False, server_default=""), sa.Column("platforms", sa.JSON(), nullable=False), sa.Column("status", sa.String(40), nullable=False, server_default="draft"), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_table("content_items", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True), sa.Column("title", sa.String(240), nullable=False), sa.Column("copy", sa.Text(), nullable=False, server_default=""), sa.Column("asset_name", sa.String(500), nullable=False, server_default=""), sa.Column("platforms", sa.JSON(), nullable=False), sa.Column("variants", sa.JSON(), nullable=False), sa.Column("status", sa.String(40), nullable=False, server_default="draft"), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_table("platform_connections", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True), sa.Column("platform", sa.String(40), nullable=False, index=True), sa.Column("status", sa.String(40), nullable=False, server_default="not_connected"), sa.Column("remote_account_id", sa.String(240), nullable=False, server_default=""), sa.Column("token_ciphertext", sa.Text(), nullable=False, server_default=""), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_table("publish_jobs", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("content_id", sa.Integer(), sa.ForeignKey("content_items.id", ondelete="CASCADE"), nullable=False, index=True), sa.Column("platform", sa.String(40), nullable=False, index=True), sa.Column("status", sa.String(40), nullable=False, server_default="blocked"), sa.Column("remote_post_id", sa.String(240), nullable=False, server_default=""), sa.Column("error_code", sa.String(80), nullable=False, server_default=""), sa.Column("error_message", sa.Text(), nullable=False, server_default=""), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))


def downgrade() -> None:
    op.drop_table("publish_jobs")
    op.drop_table("platform_connections")
    op.drop_table("content_items")
    op.drop_table("campaigns")
    op.drop_table("brands")
