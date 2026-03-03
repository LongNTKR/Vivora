"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-03 00:00:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("google_id", sa.String(255), unique=True, nullable=True),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.String(1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # Subscription plans
    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("monthly_credits", sa.Integer, nullable=False, default=0),
        sa.Column("price_cents", sa.Integer, nullable=False, default=0),
    )

    # Seed default plans
    op.bulk_insert(
        sa.table(
            "subscription_plans",
            sa.column("slug", sa.String),
            sa.column("name", sa.String),
            sa.column("monthly_credits", sa.Integer),
            sa.column("price_cents", sa.Integer),
        ),
        [
            {"slug": "free", "name": "Free", "monthly_credits": 50, "price_cents": 0},
            {"slug": "creator", "name": "Creator", "monthly_credits": 500, "price_cents": 1900},
            {"slug": "pro", "name": "Pro", "monthly_credits": 1500, "price_cents": 4900},
            {"slug": "agency", "name": "Agency", "monthly_credits": 8000, "price_cents": 19900},
        ],
    )

    # User subscriptions
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

    # Credit ledger
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

    # Chat sessions
    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])

    # Chat messages
    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])

    # Video jobs
    op.create_table(
        "video_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, default="queued"),
        sa.Column("model_provider", sa.String(50), nullable=False, default="fal_kling"),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("input_image_url", sa.String(2048), nullable=True),
        sa.Column("settings", postgresql.JSONB, nullable=True),
        sa.Column("audio_settings", postgresql.JSONB, nullable=True),
        sa.Column("credits_used", sa.Integer, nullable=False, default=0),
        sa.Column("raw_video_r2_key", sa.String(1024), nullable=True),
        sa.Column("final_video_r2_key", sa.String(1024), nullable=True),
        sa.Column("thumbnail_r2_key", sa.String(1024), nullable=True),
        sa.Column("provider_job_id", sa.String(255), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_video_jobs_user_id", "video_jobs", ["user_id"])
    op.create_index("ix_video_jobs_status", "video_jobs", ["status"])


def downgrade() -> None:
    op.drop_table("video_jobs")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("credit_ledger")
    op.drop_table("user_subscriptions")
    op.drop_table("subscription_plans")
    op.drop_table("users")
