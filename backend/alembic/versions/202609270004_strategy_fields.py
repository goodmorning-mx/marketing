"""Add strategy and campaign brief fields."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "202609270004"
down_revision: str | None = "202609270003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("brands", sa.Column("positioning", sa.Text(), nullable=False, server_default=""))
    op.add_column("brands", sa.Column("offers", sa.Text(), nullable=False, server_default=""))
    op.add_column("brands", sa.Column("growth_timeline", sa.String(240), nullable=False, server_default=""))
    op.add_column("campaigns", sa.Column("key_message", sa.Text(), nullable=False, server_default=""))
    op.add_column("campaigns", sa.Column("start_date", sa.String(30), nullable=False, server_default=""))
    op.add_column("campaigns", sa.Column("end_date", sa.String(30), nullable=False, server_default=""))
    op.add_column("campaigns", sa.Column("success_metrics", sa.String(500), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("campaigns", "success_metrics")
    op.drop_column("campaigns", "end_date")
    op.drop_column("campaigns", "start_date")
    op.drop_column("campaigns", "key_message")
    op.drop_column("brands", "growth_timeline")
    op.drop_column("brands", "offers")
    op.drop_column("brands", "positioning")
