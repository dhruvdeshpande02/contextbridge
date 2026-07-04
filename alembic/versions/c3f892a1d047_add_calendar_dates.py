"""add calendar dates

Revision ID: c3f892a1d047
Revises: adb157b2c243
Create Date: 2026-06-29 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "c3f892a1d047"
down_revision = "adb157b2c243"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("meeting_date", sa.Date(), nullable=True))
    op.add_column("action_items", sa.Column("due_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("meetings", "meeting_date")
    op.drop_column("action_items", "due_date")
