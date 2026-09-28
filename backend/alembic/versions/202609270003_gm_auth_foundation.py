"""Add the reusable GoodMorning identity and organization tables."""

from collections.abc import Sequence

from alembic import op
from gm_auth.models import metadata


revision: str = "202609270003"
down_revision: str | None = "202609260002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    metadata.create_all(op.get_bind())


def downgrade() -> None:
    metadata.drop_all(op.get_bind())
