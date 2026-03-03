"""
Local filesystem storage using Docker volume at /media/.

Directory structure:
  /media/videos/{job_id}/raw.mp4
  /media/videos/{job_id}/final.mp4
  /media/audio/{job_id}/voice.mp3
"""
from pathlib import Path

from app.config import get_settings

settings = get_settings()


def save_bytes(data: bytes, relative_path: str) -> str:
    """Save bytes to volume. Returns the relative path."""
    full_path = Path(settings.media_path) / relative_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(data)
    return relative_path


def read_bytes(relative_path: str) -> bytes:
    return (Path(settings.media_path) / relative_path).read_bytes()


def get_url(relative_path: str) -> str:
    """Return the URL path served by Nginx."""
    return f"/media/{relative_path}"


def make_video_path(job_id: str, suffix: str = "raw") -> str:
    return f"videos/{job_id}/{suffix}.mp4"


def make_audio_path(job_id: str, audio_type: str = "voice") -> str:
    return f"audio/{job_id}/{audio_type}.mp3"
