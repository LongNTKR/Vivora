import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.video_job import VideoJob
from app.schemas.video import VideoJobOut
from app.dependencies import get_anonymous_user
from app.services.storage_local import get_url

router = APIRouter()


@router.get("/", response_model=list[VideoJobOut])
async def list_videos(
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
    offset: int = 0,
):
    result = await db.execute(
        select(VideoJob)
        .where(VideoJob.user_id == current_user.id)
        .order_by(VideoJob.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/{job_id}", response_model=VideoJobOut)
async def get_video(
    job_id: uuid.UUID,
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VideoJob).where(
            VideoJob.id == job_id,
            VideoJob.user_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Video not found")
    return job


@router.get("/{job_id}/url")
async def get_video_url(
    job_id: uuid.UUID,
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VideoJob).where(
            VideoJob.id == job_id,
            VideoJob.user_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Video not found")

    path = job.final_video_path or job.raw_video_path
    if not path:
        raise HTTPException(status_code=404, detail="Video file not available yet")

    return {"url": get_url(path)}


@router.delete("/{job_id}")
async def delete_video(
    job_id: uuid.UUID,
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VideoJob).where(
            VideoJob.id == job_id,
            VideoJob.user_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Video not found")

    await db.delete(job)
    await db.commit()
    return {"status": "deleted"}
