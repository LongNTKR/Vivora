"""
Gemini-powered chat agent for intent extraction and video spec building.
"""
import json
import re
from typing import AsyncGenerator

from google import genai
from google.genai import types

from app.config import get_settings

settings = get_settings()

def _build_system_prompt(video_model: str | None) -> str:
    vm = (video_model or "").strip()
    if vm.startswith("veo-3.0"):
        model_context = f"Model video hiện tại: {vm} (Veo 3.0)."
        resolution_rule = 'Resolution: 720p (mặc định) hoặc 1080p (chỉ hợp lệ với aspect_ratio="16:9"). Không hỗ trợ 4k.'
        extra_rule = 'Nếu aspect_ratio="9:16" thì chỉ nên dùng resolution="720p".'
    elif vm.startswith("veo-3.1"):
        model_context = f"Model video hiện tại: {vm} (Veo 3.1)."
        resolution_rule = 'Resolution: 720p (mặc định), 1080p, hoặc 4k (1080p/4k chỉ hợp lệ với duration=8).'
        extra_rule = ""
    else:
        model_context = f"Model video hiện tại: {vm}." if vm else "Model video hiện tại: (chưa rõ)."
        resolution_rule = (
            'Resolution: tuỳ model; Veo 3.1 có thể dùng "4k", Veo 3.0 tối đa "1080p" '
            '(và 1080p chỉ hợp lệ với aspect_ratio="16:9").'
        )
        extra_rule = ""

    return f"""Bạn là Vivora AI — một assistant giúp người dùng tạo video bằng AI.

{model_context}

Nhiệm vụ của bạn là thu thập đầy đủ thông tin để tạo video:
1. Mô tả video (cảnh quay, nội dung, subject, action, camera motion, style, mood, environment)
2. Style/mood (ví dụ: cinematic, cartoon, realistic, dark, bright, peaceful...)
3. Duration (4, 6, hoặc 8 giây — mặc định: 8)
4. Audio preferences (có muốn voiceover không? Với Veo 3/3.1, âm thanh tự nhiên — dialogue, sound effects, ambient — có thể được tạo trực tiếp từ prompt)
5. Aspect ratio: 16:9 (landscape) hoặc 9:16 (portrait)
6. {resolution_rule}
{extra_rule}

Giao tiếp tự nhiên, thân thiện bằng ngôn ngữ của user (tiếng Việt hoặc tiếng Anh).
Hỏi thêm khi cần làm rõ, nhưng đừng hỏi quá nhiều câu một lúc.

Khi đã thu thập ĐỦ thông tin (ít nhất có mô tả + duration), output một JSON block ở cuối message:

```json
{{
  "action": "generate",
  "spec": {{
    "prompt": "detailed video description in English, include audio cues if requested",
    "model_provider": "veo",
    "settings": {{
      "duration": 8,
      "aspect_ratio": "16:9",
      "resolution": "720p"
    }},
    "audio_settings": {{
      "enable_voiceover": false,
      "voice_volume": 0.9
    }}
  }}
}}
```

Chỉ output JSON block này khi user đã xác nhận muốn tạo video.
Aspect ratio: "16:9" (landscape) hoặc "9:16" (portrait/vertical).
Duration: 4, 6, hoặc 8 giây (mặc định: 8).
Resolution: xem rule theo model ở trên.
"""


def _extract_generation_spec(text: str) -> dict | None:
    """Parse JSON generation spec from assistant message."""
    pattern = r"```json\s*(\{.*?\})\s*```"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
        if data.get("action") == "generate":
            return data.get("spec")
    except (json.JSONDecodeError, KeyError):
        pass
    return None


async def stream_chat(
    messages: list[dict],
    api_key: str | None = None,
    model: str | None = None,
    video_model: str | None = None,
) -> AsyncGenerator[tuple[str, dict | None], None]:
    """
    Stream Gemini response tokens.
    Yields (token_text, generation_spec | None).
    generation_spec is non-None only on the final chunk when action=generate is detected.
    Uses the provided api_key and model if given, otherwise falls back to global settings.
    """
    effective_key = (api_key or "").strip() or settings.google_ai_api_key
    effective_model = (model or "").strip() or settings.gemini_model
    client = genai.Client(api_key=effective_key)

    # Convert messages to Gemini contents format
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))

    full_text = ""

    response_stream = await client.aio.models.generate_content_stream(
        model=effective_model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=_build_system_prompt(video_model),
            max_output_tokens=2048,
        ),
    )

    async for chunk in response_stream:
        if chunk.text:
            full_text += chunk.text
            yield chunk.text, None

    # After streaming, check for generation spec
    spec = _extract_generation_spec(full_text)
    if spec:
        yield "", spec


async def generate_title(
    user_message: str,
    api_key: str | None = None,
    model: str | None = None,
) -> str:
    """Generate a short 3-6 word title from the first user message."""
    effective_key = (api_key or "").strip() or settings.google_ai_api_key
    effective_model = (model or "").strip() or settings.gemini_model
    client = genai.Client(api_key=effective_key)
    response = await client.aio.models.generate_content(
        model=effective_model,
        contents=f"Generate a very short title (3-6 words, no punctuation, no quotes) for a conversation starting with: {user_message[:200]}",
        config=types.GenerateContentConfig(max_output_tokens=20),
    )
    return (response.text or "").strip()[:100]


def build_messages_from_history(history: list[dict]) -> list[dict]:
    """
    Keep last 20 messages (rolling window).
    """
    recent = history[-20:] if len(history) > 20 else history
    return [{"role": msg["role"], "content": msg["content"]} for msg in recent]
