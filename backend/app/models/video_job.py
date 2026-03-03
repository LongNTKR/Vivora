import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VideoJob(Base):
    __tablename__ = "video_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True
    )

    # Status: queued|processing|audio_processing|merging|completed|failed
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="queued", index=True)

    # Model info — only veo supported now
    model_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="veo")

    # Generation inputs
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    input_image_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    audio_settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Local storage paths (relative to media_path volume)
    raw_video_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    final_video_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Provider tracking
    provider_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="video_jobs")
    session = relationship("ChatSession", back_populates="video_jobs")
