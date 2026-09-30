import base64
import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
import httpx
from sqlalchemy.orm import Session
from app.config import settings
from app import models
from app.services.llm_request import call_llm

logger = logging.getLogger(__name__)
_READY_RETRY_SECONDS = 90.0
_READY_POLL_SECONDS = 1.0
_READY_REQUEST_SECONDS = 60.0


def _instance_is_starting(response: httpx.Response) -> bool:
    """Recognize only LM Studio's exact transient instance-readiness error."""
    if response.status_code != 400:
        return False
    try:
        return response.json() == {"error": "Model is unloaded."}
    except (ValueError, TypeError):
        return False


class VlmResponseShapeError(RuntimeError):
    """LM Studio returned a response without the expected Chat Completions shape."""

    code = "vlm_response_shape_invalid"

    def __init__(self) -> None:
        super().__init__(self.code)


@dataclass(frozen=True)
class SceneVlmCompletion:
    content: str | None
    finish_reason: str | None


SCENE_VLM_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "scene_interpretation": {"type": "string"},
        "items": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {
                    "role": {"type": "string", "enum": ["main", "sub", "se"]},
                    "speaker": {"type": "string"},
                    "text": {"type": "string"},
                    "position": {
                        "type": "string",
                        "enum": ["top_right", "center_right", "center", "top_left", "bottom_left"],
                    },
                },
                "required": ["role", "speaker", "text", "position"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["scene_interpretation", "items"],
    "additionalProperties": False,
}


async def call_scene_vlm(
    image_base64: str, system_prompt: str, instance_id: str
) -> SceneVlmCompletion:
    """Request scene dialogue JSON using the loaded LM Studio instance ID."""
    scene_instruction = (
        "画像を読み取り、シーンに合うセリフ・SEを指定JSON形式で生成してください。"
    )
    url = f"{settings.llm_base_url}/chat/completions"
    payload = {
        "model": instance_id,
        "messages": [
            {"role": "system", "content": f"{system_prompt}\n{scene_instruction}"},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
                    },
                    {"type": "text", "text": scene_instruction},
                ],
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "scene_speech",
                "strict": True,
                "schema": SCENE_VLM_JSON_SCHEMA,
            },
        },
        "stream": False,
        "max_tokens": 512,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        deadline: float | None = None
        while True:
            if deadline is not None and asyncio.get_running_loop().time() >= deadline:
                raise RuntimeError("LM_STUDIO_INSTANCE_NOT_READY")
            request_timeout = (
                min(_READY_REQUEST_SECONDS, max(0.001, deadline - asyncio.get_running_loop().time()))
                if deadline is not None else 60.0
            )
            try:
                response = await client.post(url, json=payload, timeout=request_timeout)
            except httpx.ReadTimeout:
                if deadline is None:
                    raise
                logger.info("LM_STUDIO_INSTANCE_STARTING_READ_TIMEOUT")
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining > 0:
                    await asyncio.sleep(min(_READY_POLL_SECONDS, remaining))
                continue
            if not _instance_is_starting(response):
                response.raise_for_status()
                body = response.json()
                break
            logger.info("LM_STUDIO_INSTANCE_STARTING_RETRY")
            loop = asyncio.get_running_loop()
            if deadline is None:
                deadline = loop.time() + _READY_RETRY_SECONDS
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise RuntimeError("LM_STUDIO_INSTANCE_NOT_READY")
            await asyncio.sleep(min(_READY_POLL_SECONDS, remaining))

    choices = body.get("choices") if isinstance(body, dict) else None
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise VlmResponseShapeError()
    choice = choices[0]
    message = choice.get("message")
    if not isinstance(message, dict):
        raise VlmResponseShapeError()
    content = message.get("content")
    finish_reason = choice.get("finish_reason")
    if content is not None and not isinstance(content, str):
        raise VlmResponseShapeError()
    if finish_reason is not None and not isinstance(finish_reason, str):
        raise VlmResponseShapeError()
    return SceneVlmCompletion(content=content, finish_reason=finish_reason)


async def call_vlm(image_base64: str, system_prompt: str, model: str) -> str:
    """VLM (multimodal) 呼び出し — LM Studio /chat/completions"""
    url = f"{settings.llm_base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
                    },
                    {"type": "text", "text": "この画像の内容を日本語で簡潔に説明してください。"},
                ],
            },
        ],
        "stream": False,
        "max_tokens": 512,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=payload)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise httpx.HTTPStatusError(
                f"{response.status_code}: {response.text}",
                request=exc.request,
                response=response,
            ) from exc
        return response.json()["choices"][0]["message"]["content"]


def get_llm_prompt_content(db: Session, key: str, fallback: str = "") -> str:
    record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == key).first()
    return record.content if record and record.content.strip() else fallback


async def generate_speech_draft(snapshot, db: Session) -> str:
    if snapshot.image_path.startswith("/api/snapshots/images/"):
        filename = snapshot.image_path.replace("/api/snapshots/images/", "", 1)
        image_path = settings.snapshot_path / filename
    else:
        image_path = settings.snapshot_path / Path(snapshot.image_path).name

    with open(image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode()

    vlm_model = get_llm_prompt_content(db, "speech_draft_vlm_model", settings.llm_model)
    vlm_prompt = get_llm_prompt_content(
        db,
        "speech_draft_vlm_prompt",
        "この画像のキャラクターや状況を簡潔に日本語で説明してください。",
    )

    image_summary = await call_vlm(image_base64, vlm_prompt, vlm_model)

    params = json.loads(snapshot.params) if snapshot.params else {}
    generation_prompt = str(params.get("positive", params.get("prompt", "")))

    llm_model = get_llm_prompt_content(db, "speech_draft_llm_model")
    llm_prompt = get_llm_prompt_content(
        db,
        "speech_draft_llm_prompt",
        "あなたはマンガのセリフ作家です。以下の画像の説明と生成プロンプトを元に、キャラクターが話しそうな自然なセリフを1~2文で生成してください。セリフのみを出力してください。",
    )

    user_prompt = f"【画像の説明】\n{image_summary}\n\n【生成プロンプト】\n{generation_prompt}"

    draft = await call_llm(
        system_prompt=llm_prompt,
        user_prompt=user_prompt,
        model=llm_model or None,  # type: ignore[arg-type]  # call_llm resolves None from DB/settings
        timeout=60.0,
    )
    return draft.strip()
