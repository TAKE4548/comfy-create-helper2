"""LLM HTTP client — calls OpenAI-compatible /chat/completions endpoint."""

import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


async def call_llm(system_prompt: str, user_prompt: str, timeout: float = 180.0, model: str = None, llm_params: dict = None) -> str:
    """Call the LLM server (OpenAI-compatible API) asynchronously."""
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

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
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
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


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

