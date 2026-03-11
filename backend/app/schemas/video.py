import uuid
from datetime import datetime
from pydantic import BaseModel, computed_field


class VideoSettings(BaseModel):
    duration: int = 5  # seconds
    aspect_ratio: str = "16:9"
    motion_strength: float = 0.5


class AudioSettings(BaseModel):
    enable_voiceover: bool = False
    voice_volume: float = 0.9


class VideoJobCreate(BaseModel):
    prompt: str
    model_provider: str = "veo"
    input_image_url: str | None = None
    settings: VideoSettings = VideoSettings()
    audio_settings: AudioSettings = AudioSettings()
    session_id: uuid.UUID | None = None


class VideoJobOut(BaseModel):
    id: uuid.UUID
    status: str
    model_provider: str
    prompt: str
    settings: dict | None
    audio_settings: dict | None
    raw_video_path: str | None
    final_video_path: str | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None

    @computed_field  # type: ignore[misc]
    @property
    def final_url(self) -> str | None:
        path = self.final_video_path or self.raw_video_path
        return f"/media/{path}" if path else None

    model_config = {"from_attributes": True}
