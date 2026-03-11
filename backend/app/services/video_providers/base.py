from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum


class ProviderStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ProviderResult:
    status: ProviderStatus
    video_url: str | None = None
    error: str | None = None


class VideoProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        prompt: str,
        settings: dict,
        input_image_url: str | None = None,
    ) -> tuple[str, dict]:
        """Submit generation job. Returns (provider_job_id, generation_metadata)."""

    @abstractmethod
    async def poll_status(self, provider_job_id: str) -> ProviderResult:
        """Poll job status. Returns ProviderResult."""
