from app.services.video_providers.base import VideoProvider, ProviderResult, ProviderStatus
from app.services.video_providers.veo import VeoProvider

PROVIDERS: dict[str, type[VideoProvider]] = {
    "veo": VeoProvider,
}


def get_provider(name: str, api_key: str | None = None) -> VideoProvider:
    cls = PROVIDERS.get(name)
    if not cls:
        raise ValueError(f"Unknown provider: {name}. Available: {list(PROVIDERS.keys())}")
    return cls(api_key=api_key)
