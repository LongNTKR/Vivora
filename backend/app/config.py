from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_env: str = "development"

    # Database
    database_url: str = "postgresql+asyncpg://vivora:vivora_dev_password@postgres:5432/vivora"

    # Redis / Celery
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    # Google AI (Gemini chat + Veo video + Google TTS)
    google_ai_api_key: str = ""

    # Gemini model for chat
    gemini_model: str = "gemini-2.0-flash"

    # Google TTS
    google_tts_voice_name: str = "en-US-Wavenet-D"
    google_tts_language_code: str = "en-US"

    # Local media storage (Docker volume mount point)
    media_path: str = "/media"


@lru_cache
def get_settings() -> Settings:
    return Settings()
