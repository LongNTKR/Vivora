from celery import Celery
from kombu import Queue
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "vivora",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.video_gen",
        "app.workers.audio_merge",
    ],
)

celery_app.conf.update(
    task_default_queue="celery",
    task_queues=(
        Queue("celery"),
        Queue("video"),
        Queue("audio"),
    ),
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.workers.video_gen.*": {"queue": "video"},
        "app.workers.audio_merge.*": {"queue": "audio"},
    },
)
