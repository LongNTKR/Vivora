"""
Sync DB helpers for Celery workers (synchronous SQLAlchemy).
"""
import uuid
from typing import Any

from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.video_job import VideoJob

settings = get_settings()

# Use sync engine for Celery workers
_sync_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
_engine = create_engine(_sync_url, pool_pre_ping=True)


def _get_session() -> Session:
    return Session(_engine)


def get_job(job_id: str) -> VideoJob | None:
    with _get_session() as session:
        result = session.execute(select(VideoJob).where(VideoJob.id == uuid.UUID(job_id)))
        return result.scalar_one_or_none()


def update_job_status(job_id: str, status: str, **kwargs) -> None:
    values: dict[str, Any] = {"status": status}
    if "provider_job_id" in kwargs:
        values["provider_job_id"] = kwargs["provider_job_id"]
    if "raw_video_path" in kwargs:
        values["raw_video_path"] = kwargs["raw_video_path"]
    if "final_video_path" in kwargs:
        values["final_video_path"] = kwargs["final_video_path"]
    if "error" in kwargs:
        values["error_message"] = kwargs["error"]
    if "generation_metadata" in kwargs:
        values["generation_metadata"] = kwargs["generation_metadata"]
    if status == "completed":
        from datetime import datetime, timezone
        values["completed_at"] = datetime.now(timezone.utc)

    with _get_session() as session:
        session.execute(
            update(VideoJob).where(VideoJob.id == uuid.UUID(job_id)).values(**values)
        )
        session.commit()
