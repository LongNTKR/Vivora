"""
Celery task: generate_video
Calls Veo, polls until done, saves raw video to Docker volume.
"""
import asyncio
import logging
import time

import httpx

from app.workers.celery_app import celery_app
from app.config import get_settings
from app.services.video_providers import get_provider
from app.services.video_providers.base import ProviderStatus
from app.services import storage_local
from app.workers._db import update_job_status, get_job

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_POLL_SECONDS = 600  # 10 minutes
POLL_INTERVAL = 10  # seconds


@celery_app.task(name="app.workers.video_gen.generate_video", bind=True, max_retries=3)
def generate_video(self, job_id: str):
    return asyncio.run(_generate_video_async(self, job_id))


async def _generate_video_async(task, job_id: str):
    job = get_job(job_id)
    if not job:
        logger.error(f"Job {job_id} not found")
        return

    update_job_status(job_id, "processing")
    _publish_status(str(job.user_id), job_id, "processing")

    try:
        provider = get_provider(job.model_provider)
        settings_dict = job.settings or {}
        provider_job_id = await provider.generate(
            prompt=job.prompt,
            settings_dict=settings_dict,
            input_image_url=job.input_image_url,
        )
        update_job_status(job_id, "processing", provider_job_id=provider_job_id)

        # Poll for result
        start = time.time()
        while time.time() - start < MAX_POLL_SECONDS:
            result = await provider.poll_status(provider_job_id)

            if result.status == ProviderStatus.COMPLETED:
                # Download video and save to Docker volume
                raw_path = storage_local.make_video_path(job_id, "raw")
                video_bytes = await _download_bytes(result.video_url)
                storage_local.save_bytes(video_bytes, raw_path)

                audio_settings = job.audio_settings or {}
                if audio_settings.get("enable_voiceover", False):
                    # Trigger audio merge pipeline
                    update_job_status(job_id, "audio_processing", raw_video_path=raw_path)
                    _publish_status(str(job.user_id), job_id, "audio_processing")

                    from app.workers.audio_merge import merge_audio
                    merge_audio.delay(job_id)
                else:
                    # No audio — raw is the final video
                    update_job_status(
                        job_id, "completed",
                        raw_video_path=raw_path,
                        final_video_path=raw_path,
                    )
                    _publish_status(
                        str(job.user_id), job_id, "completed",
                        final_url=storage_local.get_url(raw_path),
                    )
                return

            elif result.status == ProviderStatus.FAILED:
                update_job_status(job_id, "failed", error=result.error or "Provider failed")
                _publish_status(str(job.user_id), job_id, "failed", error=result.error)
                return

            await asyncio.sleep(POLL_INTERVAL)

        # Timeout
        update_job_status(job_id, "failed", error="Generation timed out")
        _publish_status(str(job.user_id), job_id, "failed", error="Generation timed out")

    except Exception as e:
        logger.exception(f"Video generation error for job {job_id}: {e}")
        update_job_status(job_id, "failed", error=str(e))
        _publish_status(str(job.user_id), job_id, "failed", error=str(e))


async def _download_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


def _publish_status(user_id: str, job_id: str, status: str, **extra):
    import redis
    import json
    r = redis.from_url(settings.redis_url)
    payload = {"type": "job_update", "job_id": job_id, "status": status, **extra}
    r.publish(f"user:{user_id}:jobs", json.dumps(payload))
