"""Simplify schema: Google ecosystem only, anonymous user

Revision ID: 002
Revises: 001
Create Date: 2026-03-03 00:00:00.000000

Changes:
- Drop billing tables (credit_ledger, user_subscriptions, subscription_plans)
- Simplify users table (drop google_id, display_name, avatar_url)
- Replace R2 storage columns in video_jobs with local path columns
- Drop credits_used from video_jobs
- Insert anonymous user
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ANONYMOUS_USER_ID = "00000000-0000-0000-0000-000000000001"
ANONYMOUS_USER_EMAIL = "anonymous@vivora.local"


def upgrade() -> None:
    # 1. Drop billing tables (cascade handles FKs)
    op.drop_table("credit_ledger")
    op.drop_table("user_subscriptions")
    op.drop_table("subscription_plans")

    # 2. Simplify users table — drop auth/profile columns
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "google_id")
    op.drop_column("users", "display_name")
    op.drop_column("users", "avatar_url")
    # Recreate email index (still needed for anonymous user lookup)
    op.create_index("ix_users_email", "users", ["email"])

    # 3. Update video_jobs — replace R2 columns with local path columns, drop credits
    op.drop_column("video_jobs", "credits_used")
    op.drop_column("video_jobs", "raw_video_r2_key")
    op.drop_column("video_jobs", "final_video_r2_key")
    op.drop_column("video_jobs", "thumbnail_r2_key")
    op.add_column(
        "video_jobs",
        sa.Column("raw_video_path", sa.String(1024), nullable=True),
    )
    op.add_column(
        "video_jobs",
        sa.Column("final_video_path", sa.String(1024), nullable=True),
    )

    # 4. Update default model_provider to veo
    op.execute(
        "UPDATE video_jobs SET model_provider = 'veo' WHERE model_provider != 'veo'"
    )
    op.alter_column(
        "video_jobs",
        "model_provider",
        server_default="veo",
    )

    # 5. Insert anonymous user
    op.execute(
        f"""
        INSERT INTO users (id, email, created_at)
        VALUES (
            '{ANONYMOUS_USER_ID}'::uuid,
            '{ANONYMOUS_USER_EMAIL}',
            NOW()
        )
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Remove anonymous user
    op.execute(f"DELETE FROM users WHERE id = '{ANONYMOUS_USER_ID}'::uuid")

    # Restore video_jobs columns
    op.drop_column("video_jobs", "final_video_path")
    op.drop_column("video_jobs", "raw_video_path")
    op.add_column(
        "video_jobs",
        sa.Column("thumbnail_r2_key", sa.String(1024), nullable=True),
    )
    op.add_column(
        "video_jobs",
        sa.Column("final_video_r2_key", sa.String(1024), nullable=True),
    )
    op.add_column(
        "video_jobs",
        sa.Column("raw_video_r2_key", sa.String(1024), nullable=True),
    )
    op.add_column(
        "video_jobs",
        sa.Column("credits_used", sa.Integer, nullable=False, server_default="0"),
    )

    # Restore users columns
    op.drop_index("ix_users_email", table_name="users")
    op.add_column("users", sa.Column("avatar_url", sa.String(1024), nullable=True))
    op.add_column("users", sa.Column("display_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("google_id", sa.String(255), nullable=True))
    op.create_index("ix_users_email", "users", ["email"])

    # Recreate billing tables
    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("monthly_credits", sa.Integer, nullable=False, default=0),
        sa.Column("price_cents", sa.Integer, nullable=False, default=0),
    )
    op.create_table(
        "user_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", sa.Integer, sa.ForeignKey("subscription_plans.id"), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, default="active"),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "credit_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("balance_after", sa.Integer, nullable=False),
        sa.Column("reason", sa.String(100), nullable=False),
        sa.Column("ref_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_credit_ledger_user_id", "credit_ledger", ["user_id"])
