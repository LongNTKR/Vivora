"""
Veo provider — Google AI Studio (google-genai SDK).

Requires: GOOGLE_AI_API_KEY from aistudio.google.com
Supported models (Gemini API):
  - veo-3.1-generate-preview
  - veo-3.1-fast-generate-preview
  - veo-3.0-generate-001
  - veo-3.0-fast-generate-001

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

VEO_31_MODELS = {
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
}
VEO_30_MODELS = {
    "veo-3.0-generate-001",
    "veo-3.0-fast-generate-001",
}
SUPPORTED_VEO_MODELS = VEO_31_MODELS | VEO_30_MODELS

# Keep a small set of aliases so old persisted UI values keep working.
MODEL_ALIASES: dict[str, str] = {
    # Preview names (shut down) → stable ids
    "veo-3.0-generate-preview": "veo-3.0-generate-001",
    "veo-3.0-fast-generate-preview": "veo-3.0-fast-generate-001",
    # Older preview names (historical) → stable ids
    "veo-3-generate-preview": "veo-3.0-generate-001",
    "veo-3-fast-generate-preview": "veo-3.0-fast-generate-001",
}

DEFAULT_VEO_MODEL = "veo-3.1-generate-preview"

VALID_ASPECT_RATIOS = {"16:9", "9:16"}
VALID_DURATIONS = {4, 6, 8}

VEO_31_RESOLUTIONS = {"720p", "1080p", "4k"}
VEO_30_RESOLUTIONS = {"720p", "1080p"}
HIGH_RES_ONLY_8S = {"1080p", "4k"}


def _normalize_model(model: str) -> str:
    m = (model or "").strip()
    if m.startswith("models/"):
        m = m.split("/", 1)[1]
    return m


def _is_veo_31(model: str) -> bool:
    return model.startswith("veo-3.1-") or model in VEO_31_MODELS


def _is_veo_30(model: str) -> bool:
    return model.startswith("veo-3.0-") or model in VEO_30_MODELS


def _resolve_person_generation(has_input_image: bool, requested: str | None) -> tuple[str, list[str]]:
    """
    Veo person_generation constraints (per docs):
      - Text-to-video: allow_all only
      - Image-to-video / interpolation / reference images: allow_adult only
    """
    warnings: list[str] = []
    normalized = None
    if requested is not None:
        normalized = str(requested).strip().lower().replace("-", "_")

    allowed = {"allow_adult"} if has_input_image else {"allow_all"}
    if normalized in allowed:
        return normalized, warnings

    if normalized and normalized not in allowed:
        warnings.append(f"person_generation '{normalized}' not allowed for this mode; using '{next(iter(allowed))}'.")
    return next(iter(allowed)), warnings


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
        warnings: list[str] = []

        raw_model = settings_dict.get("video_model") or DEFAULT_VEO_MODEL
        effective_model = _normalize_model(str(raw_model))
        effective_model = MODEL_ALIASES.get(effective_model, effective_model)

        if not (_is_veo_31(effective_model) or _is_veo_30(effective_model)):
            raise ValueError(
                f"Unsupported Veo model '{effective_model}'. Supported: {sorted(SUPPORTED_VEO_MODELS)}"
            )

        aspect_ratio_raw = str(settings_dict.get("aspect_ratio") or "16:9").strip()
        aspect_ratio = aspect_ratio_raw if aspect_ratio_raw in VALID_ASPECT_RATIOS else "16:9"
        if aspect_ratio != aspect_ratio_raw:
            warnings.append(f"aspect_ratio '{aspect_ratio_raw}' invalid; using '{aspect_ratio}'.")

        # Validate and clamp duration
        duration_default = 8
        try:
            duration_raw = int(settings_dict.get("duration", duration_default))
        except (TypeError, ValueError):
            duration_raw = duration_default
        duration = duration_raw if duration_raw in VALID_DURATIONS else duration_default
        if duration != duration_raw:
            warnings.append(f"duration '{duration_raw}' invalid; using '{duration}'.")

        # Validate resolution (model-specific); enforce 1080p/4k → 8s
        resolution_raw = settings_dict.get("resolution")
        resolution: str | None = None
        if resolution_raw is not None:
            resolution_candidate = str(resolution_raw).strip().lower()
            if resolution_candidate in (VEO_31_RESOLUTIONS | VEO_30_RESOLUTIONS):
                resolution = resolution_candidate

        if _is_veo_31(effective_model):
            allowed_resolutions = VEO_31_RESOLUTIONS
        else:
            allowed_resolutions = VEO_30_RESOLUTIONS

        if resolution and resolution not in allowed_resolutions:
            # Prefer a graceful downgrade so switching models doesn't hard-fail.
            if resolution == "4k" and "1080p" in allowed_resolutions and aspect_ratio == "16:9":
                warnings.append("resolution '4k' not supported for this model; downgrading to '1080p'.")
                resolution = "1080p"
            else:
                warnings.append(f"resolution '{resolution}' not supported for this model; falling back to default.")
                resolution = None

        # Veo 3.0: 1080p is landscape-only.
        if _is_veo_30(effective_model) and resolution == "1080p" and aspect_ratio == "9:16":
            warnings.append("resolution '1080p' is not supported for aspect_ratio '9:16' on Veo 3.0; using '720p'.")
            resolution = "720p"

        if resolution in HIGH_RES_ONLY_8S and duration != 8:
            warnings.append(f"duration '{duration}' not valid with resolution '{resolution}'; using 8 seconds.")
            duration = 8

        person_generation, pg_warnings = _resolve_person_generation(
            has_input_image=input_image_url is not None,
            requested=settings_dict.get("person_generation"),
        )
        warnings.extend(pg_warnings)

        config_kwargs: dict[str, Any] = {
            "aspect_ratio": aspect_ratio,
            "duration_seconds": duration,
            "person_generation": person_generation,
        }
        if resolution:
            config_kwargs["resolution"] = resolution

        # Seed is available for Veo 3 models (veo-3.0-*). It doesn't guarantee determinism.
        seed = settings_dict.get("seed")
        if _is_veo_30(effective_model) and seed is not None:
            try:
                config_kwargs["seed"] = int(seed)
            except (TypeError, ValueError):
                warnings.append(f"seed '{seed}' invalid; ignoring.")

        config = types.GenerateVideosConfig(**config_kwargs)

        if input_image_url:
            image_bytes, mime_type = await _download_bytes_with_mime(input_image_url)
            image = types.Image(image_bytes=image_bytes, mime_type=mime_type)
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
            "warnings": warnings or None,
            "model": effective_model,
            "duration_seconds": duration,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "person_generation": person_generation,
            "seed": config_kwargs.get("seed"),
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


async def _download_bytes_with_mime(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        content_type = (resp.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
        if content_type.startswith("image/"):
            mime_type = content_type
        else:
            # Default to jpeg; the API rejects invalid mime types but accepts common image/* values.
            mime_type = "image/jpeg"
        return resp.content, mime_type
