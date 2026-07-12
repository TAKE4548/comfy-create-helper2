import base64
import json
import logging
from pathlib import Path
import httpx
from sqlalchemy.orm import Session
from app.config import settings
from app import models
from app.services.llm_request import call_llm

logger = logging.getLogger(__name__)


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
                        "image_url": {"url": f"data:image/png;base64,{image_base64}"},
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
        response.raise_for_status()
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
        model=llm_model or None,
        timeout=60.0,
    )
    return draft.strip()
