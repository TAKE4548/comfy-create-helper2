"""LLM HTTP client — calls OpenAI-compatible /chat/completions endpoint."""

import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


async def call_llm(system_prompt: str, user_prompt: str, timeout: float = 180.0) -> str:
    """Call the LLM server (OpenAI-compatible API) asynchronously."""
    prompt_tokens = (len(system_prompt or "") + len(user_prompt or "")) / 3
    num_ctx = int(prompt_tokens) + 8192
    num_ctx = max(2048, min(262144, num_ctx))  # noqa: F841 (reserved for Ollama ctx)

    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "temperature": 0.2,
    }

    url = f"{settings.llm_base_url}/chat/completions"
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
