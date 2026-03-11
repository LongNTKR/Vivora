"""
Veo provider — Google AI Studio (google-genai SDK).

Requires: GOOGLE_AI_API_KEY from aistudio.google.com
Model: veo-2.0-flash-exp (text-to-video and image-to-video)

Flow:
  generate()    → submit job → return operation.name as provider_job_id
  poll_status() → get operation by name → check done → extract video URI
"""
import asyncio

import httpx
from google import genai
from google.genai import types

from app.config import get_settings
from app.services.video_providers.base import VideoProvider, ProviderResult, ProviderStatus

_settings = get_settings()

DEFAULT_VEO_MODEL = "veo-2.0-flash-exp"


class VeoProvider(VideoProvider):
    def __init__(self):
        self.client = genai.Client(api_key=_settings.google_ai_api_key)

    async def generate(
        self,
        prompt: str,
        settings_dict: dict,
        input_image_url: str | None = None,
    ) -> str:
        """Submit a Veo generation job. Returns operation.name as provider_job_id."""
        duration = int(settings_dict.get("duration", 5))
        aspect_ratio = settings_dict.get("aspect_ratio", "16:9")
        effective_model = settings_dict.get("video_model") or DEFAULT_VEO_MODEL

        config = types.GenerateVideosConfig(
            aspect_ratio=aspect_ratio,
            duration_seconds=duration,
            person_generation="dont_allow",
        )

        if input_image_url:
            image_bytes = await _download_bytes(input_image_url)
            image = types.Image(image_bytes=image_bytes, mime_type="image/jpeg")
            operation = await asyncio.to_thread(
                self.client.models.generate_videos,
                model=effective_model,
                prompt=prompt,
                image=image,
                config=config,
            )
        else:
            operation = await asyncio.to_thread(
                self.client.models.generate_videos,
                model=effective_model,
                prompt=prompt,
                config=config,
            )

        return operation.name

    async def poll_status(self, provider_job_id: str) -> ProviderResult:
        """Poll Veo operation by name. Returns ProviderResult."""
        operation = await asyncio.to_thread(
            self.client.operations.get,
            provider_job_id,
        )

        if not operation.done:
            return ProviderResult(status=ProviderStatus.PROCESSING)

        if operation.error and operation.error.code != 0:
            return ProviderResult(
                status=ProviderStatus.FAILED,
                error=operation.error.message,
            )

        video_uri = operation.response.generated_videos[0].video.uri
        # Veo URIs require the API key as a query parameter to download
        download_url = f"{video_uri}?key={_settings.google_ai_api_key}"
        return ProviderResult(status=ProviderStatus.COMPLETED, video_url=download_url)


async def _download_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content
