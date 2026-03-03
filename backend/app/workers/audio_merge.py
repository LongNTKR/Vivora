"""
Celery task: merge_audio
Generates Google TTS voiceover, merges with video using ffmpeg.
"""
import asyncio
import logging
import os
import tempfile

from app.workers.celery_app import celery_app
from app.config import get_settings
from app.services import storage_local
from app.workers._db import update_job_status, get_job

logger = logging.getLogger(__name__)
settings = get_settings()


@celery_app.task(name="app.workers.audio_merge.merge_audio", bind=True)
def merge_audio(self, job_id: str):
    return asyncio.run(_merge_audio_async(job_id))


async def _merge_audio_async(job_id: str):
    job = get_job(job_id)
    if not job or not job.raw_video_path:
        logger.error(f"Job {job_id} has no raw video path")
        return

    update_job_status(job_id, "merging")
    _publish_status(str(job.user_id), job_id, "merging")

    try:
        from app.services.audio.google_tts import generate_voiceover_google
        from app.services.audio.merger import merge_audio_video

        # Generate TTS voiceover
        script = f"Watch this: {job.prompt}"
        voice_bytes = await generate_voiceover_google(script)

        voice_path_rel = storage_local.make_audio_path(job_id, "voice")
        storage_local.save_bytes(voice_bytes, voice_path_rel)

        # Merge video + voice using ffmpeg
        with tempfile.TemporaryDirectory() as tmp:
            video_src = os.path.join(settings.media_path, job.raw_video_path)
            voice_src = os.path.join(settings.media_path, voice_path_rel)
            output_tmp = os.path.join(tmp, "final.mp4")

            audio_settings = job.audio_settings or {}
            voice_volume = float(audio_settings.get("voice_volume", 0.9))

            merge_audio_video(
                video_path=video_src,
                output_path=output_tmp,
                voice_path=voice_src,
                voice_volume=voice_volume,
            )

            # Save final video to volume
            final_path_rel = storage_local.make_video_path(job_id, "final")
            with open(output_tmp, "rb") as f:
                storage_local.save_bytes(f.read(), final_path_rel)

        update_job_status(
            job_id, "completed",
            final_video_path=final_path_rel,
        )
        _publish_status(
            str(job.user_id), job_id, "completed",
            final_url=storage_local.get_url(final_path_rel),
        )
        logger.info(f"Job {job_id} completed with audio")

    except Exception as e:
        logger.exception(f"Audio merge error for job {job_id}: {e}")
        update_job_status(job_id, "failed", error=str(e))
        _publish_status(str(job.user_id), job_id, "failed", error=str(e))


def _publish_status(user_id: str, job_id: str, status: str, **extra):
    import redis
    import json
    r = redis.from_url(settings.redis_url)
    payload = {"type": "job_update", "job_id": job_id, "status": status, **extra}
    r.publish(f"user:{user_id}:jobs", json.dumps(payload))
