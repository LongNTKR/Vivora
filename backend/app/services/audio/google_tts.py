"""
Google Cloud Text-to-Speech — REST API, no service account needed.

Uses GOOGLE_AI_API_KEY (same key as Veo / Gemini from aistudio.google.com).
Returns raw MP3 bytes.

Supported voices: https://cloud.google.com/text-to-speech/docs/voices
  - English:    en-US-Wavenet-D (male), en-US-Wavenet-C (female)
  - Vietnamese: vi-VN-Wavenet-A, vi-VN-Wavenet-B, vi-VN-Wavenet-C, vi-VN-Wavenet-D
"""
import base64

import httpx

from app.config import get_settings

_settings = get_settings()

_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"


async def generate_voiceover_google(
    script: str,
    language_code: str | None = None,
    voice_name: str | None = None,
) -> bytes:
    """Call Google Cloud TTS and return raw MP3 bytes."""
    lang = language_code or _settings.google_tts_language_code
    voice = voice_name or _settings.google_tts_voice_name

    payload = {
        "input": {"text": script},
        "voice": {
            "languageCode": lang,
            "name": voice,
            "ssmlGender": "NEUTRAL",
        },
        "audioConfig": {"audioEncoding": "MP3"},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            _TTS_URL,
            params={"key": _settings.google_ai_api_key},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return base64.b64decode(data["audioContent"])
