import base64
import io
import logging
from pathlib import Path
import httpx
from PIL import Image
from app.config import settings

logger = logging.getLogger(__name__)


def load_image_as_base64(image_path: str | Path, max_size: int = 1024) -> str:
    """Load an image file, resize keeping aspect ratio if larger than max_size, and return base64 string."""
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found at {image_path}")
    with Image.open(path) as img:
        img = img.convert("RGB")
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode("utf-8")


async def call_llm(
    system_prompt: str,
    user_prompt: str,
    timeout: float = 180.0,
    model: str = None,
    llm_params: dict = None,
    image_data: str = None,
) -> str:
    """Call the LLM server (OpenAI-compatible API) asynchronously. Supports text-only and multimodal vision payloads with fallback."""
    prompt_tokens = (len(system_prompt or "") + len(user_prompt or "")) / 3
    num_ctx = int(prompt_tokens) + 8192
    num_ctx = max(2048, min(262144, num_ctx))  # noqa: F841 (reserved for Ollama ctx)

    if not model:
        from app.database import SessionLocal
        from app.models import LlmPrompt
        try:
            with SessionLocal() as db:
                record = db.query(LlmPrompt).filter(LlmPrompt.key == "llm_model").first()
                if record and record.content:
                    model = record.content
        except Exception as e:
            logger.error(f"Failed to fetch llm_model from DB: {e}")
        
        if not model:
            model = settings.llm_model

    if image_data:
        data_url = image_data if image_data.startswith("data:") else f"data:image/jpeg;base64,{image_data}"
        user_content = [
            {"type": "text", "text": user_prompt},
            {"type": "image_url", "image_url": {"url": data_url}},
        ]
    else:
        user_content = user_prompt

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "stream": False,
        "temperature": 0.2,
    }

    if llm_params:
        valid_keys = {"temperature", "top_p", "max_tokens", "presence_penalty", "frequency_penalty"}
        for k, v in llm_params.items():
            if k in valid_keys and v is not None:
                payload[k] = v

    url = f"{settings.llm_base_url}/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        if image_data:
            logger.warning(f"Multimodal LLM call failed ({e}), falling back to text-only...")
            return await call_llm(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                timeout=timeout,
                model=model,
                llm_params=llm_params,
                image_data=None,
            )
        raise


async def get_available_models() -> list[str]:
    """Get list of available models from LLM server (LM Studio)."""
    url = f"{settings.llm_base_url}/models"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict) and "data" in data:
                return [m["id"] for m in data["data"] if "id" in m]
            return []
    except Exception as e:
        logger.error(f"Failed to get available models from {url}: {e}")
        return []

