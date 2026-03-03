import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.video_job import VideoJob
from app.schemas.video import VideoJobOut
from app.dependencies import get_anonymous_user

router = APIRouter()


@router.get("/{job_id}", response_model=VideoJobOut)
async def get_job_status(
    job_id: uuid.UUID,
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll job status (fallback for WebSocket)."""
    result = await db.execute(
        select(VideoJob).where(
            VideoJob.id == job_id,
            VideoJob.user_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
