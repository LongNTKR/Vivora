"""
Veo provider — Google AI Studio (google-genai SDK).

Requires: GOOGLE_AI_API_KEY from aistudio.google.com
Valid models: veo-3.1-generate-preview, veo-3-generate-preview, veo-2-generate-preview

Flow:
  generate()    → submit job → return (operation.name, metadata_dict)
  poll_status() → get operation by name → check done → extract video URI
"""
import asyncio
from typing import Any

import httpx
from google import genai
from google.genai import types

from app.config import get_settings
from app.services.video_providers.base import VideoProvider, ProviderResult, ProviderStatus

_settings = get_settings()

DEFAULT_VEO_MODEL = "veo-2-generate-preview"

VALID_DURATIONS = {4, 6, 8}
VALID_RESOLUTIONS = {"720p", "1080p", "4k"}
HIGH_RES_ONLY_8S = {"1080p", "4k"}
VEO_31_MODELS = {"veo-3.1-generate-preview"}


def _resolve_person_generation(model: str, has_input_image: bool) -> str:
    return "allow_all"


class VeoProvider(VideoProvider):
    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or _settings.google_ai_api_key
        self.client = genai.Client(api_key=self._api_key)

    async def generate(
        self,
        prompt: str,
        settings_dict: dict,
        input_image_url: str | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Submit a Veo generation job. Returns (operation.name, generation_metadata)."""
        effective_model = settings_dict.get("video_model") or DEFAULT_VEO_MODEL
        aspect_ratio = settings_dict.get("aspect_ratio", "16:9")

        # Validate and clamp duration
        duration_raw = int(settings_dict.get("duration", 8))
        duration = duration_raw if duration_raw in VALID_DURATIONS else 8

        # Validate resolution; enforce 1080p/4k → 8s
        resolution_raw = settings_dict.get("resolution")
        resolution = resolution_raw if resolution_raw in VALID_RESOLUTIONS else None
        if resolution in HIGH_RES_ONLY_8S:
            duration = 8  # auto-correct per API constraint

        person_generation = _resolve_person_generation(effective_model, input_image_url is not None)

        config_kwargs: dict[str, Any] = {
            "aspect_ratio": aspect_ratio,
            "duration_seconds": duration,
            "person_generation": person_generation,
        }
        if resolution:
            config_kwargs["resolution"] = resolution

        config = types.GenerateVideosConfig(**config_kwargs)

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

        generation_metadata = {
            "model": effective_model,
            "duration_seconds": duration,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "person_generation": person_generation,
            "mode": "image_to_video" if input_image_url else "text_to_video",
        }
        return operation.name, generation_metadata

    async def poll_status(self, provider_job_id: str) -> ProviderResult:
        """Poll Veo operation by name. Returns ProviderResult."""
        # Newer SDK versions require an operation object (not a bare name string)
        op_ref = types.GenerateVideosOperation(name=provider_job_id)
        operation = await asyncio.to_thread(
            self.client.operations.get,
            op_ref,
        )

        if not operation.done:
            return ProviderResult(status=ProviderStatus.PROCESSING)

        if operation.error and operation.error.code != 0:
            return ProviderResult(
                status=ProviderStatus.FAILED,
                error=operation.error.message,
            )

        video_uri = operation.response.generated_videos[0].video.uri
        sep = "&" if "?" in video_uri else "?"
        download_url = f"{video_uri}{sep}key={self._api_key}"
        return ProviderResult(status=ProviderStatus.COMPLETED, video_url=download_url)


async def _download_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content
