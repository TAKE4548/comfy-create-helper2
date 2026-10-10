"""LLM system prompts management router."""

from datetime import datetime, timezone
import re
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
import httpx
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/llm-prompts", tags=["llm-prompts"])


from pydantic import BaseModel, Field


class PlaygroundRequest(BaseModel):
    system_prompt: str
    text: str
    variables: dict[str, str] = Field(default_factory=dict)
    model: str | None = None
    llm_params: dict[str, object] | None = None


class PlaygroundResponse(BaseModel):
    rendered_prompt: str
    result: str
    token_limit: int | None


_PLAYGROUND_VARIABLE = re.compile(r"\{\{([^{}]+)\}\}")


def _render_playground_text(template: str, variables: dict[str, str]) -> str:
    return _PLAYGROUND_VARIABLE.sub(lambda match: variables.get(match.group(1), match.group(0)), template)


@router.post("/playground", response_model=PlaygroundResponse)
async def playground(payload: PlaygroundRequest) -> PlaygroundResponse:
    from app.services.llm_request import call_llm, get_model_context_limit

    rendered_prompt = _render_playground_text(payload.system_prompt, payload.variables)
    rendered_text = _render_playground_text(payload.text, payload.variables)
    try:
        token_limit = await get_model_context_limit(payload.model) if payload.model else None
    except Exception:
        token_limit = None

    try:
        result = await call_llm(
            system_prompt=rendered_prompt,
            user_prompt=rendered_text,
            timeout=30.0,
            model=payload.model,
            llm_params=payload.llm_params,
        )
    except (httpx.TimeoutException, TimeoutError) as exc:
        raise HTTPException(status_code=504, detail="Playground LLM request timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Playground LLM request failed: {exc}") from exc

    return PlaygroundResponse(
        rendered_prompt=rendered_prompt,
        result=result,
        token_limit=token_limit,
    )

class CurrentModelUpdate(BaseModel):
    model: str | None = None
    content: str | None = None


@router.get("", response_model=list[schemas.LlmPromptRead])
def list_llm_prompts(db: Session = Depends(get_db)):
    return db.query(models.LlmPrompt).order_by(models.LlmPrompt.key).all()


@router.get("/models", response_model=list[str])
async def get_models():
    from app.services.llm_request import get_available_models
    return await get_available_models()


@router.get("/current-model", response_model=schemas.LlmPromptRead)
def get_current_model(db: Session = Depends(get_db)):
    from app.config import settings
    prompt = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "llm_model").first()
    if not prompt:
        return models.LlmPrompt(
            id=0,
            key="llm_model",
            content=settings.llm_model,
            description="Current LLM Model",
            updated_at=datetime.now(timezone.utc)
        )
    return prompt


@router.put("/current-model", response_model=schemas.LlmPromptRead)
def update_current_model(payload: CurrentModelUpdate, db: Session = Depends(get_db)):
    model_name = payload.model or payload.content
    if not model_name:
        raise HTTPException(status_code=400, detail="model or content is required")
        
    prompt = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "llm_model").first()
    if not prompt:
        prompt = models.LlmPrompt(
            key="llm_model",
            content=model_name,
            description="Current LLM Model",
            updated_at=datetime.now(timezone.utc)
        )
        db.add(prompt)
    else:
        prompt.content = model_name
        prompt.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(prompt)
    return prompt


@router.put("/{key}", response_model=schemas.LlmPromptRead)
def update_llm_prompt(key: str, payload: schemas.LlmPromptUpdate, db: Session = Depends(get_db)):
    prompt = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == key).first()
    if not prompt:
        prompt = models.LlmPrompt(
            key=key,
            content=payload.content,
            description=payload.description or f"Setting for {key}",
            updated_at=datetime.now(timezone.utc),
        )
        db.add(prompt)
    else:
        prompt.content = payload.content
        if payload.description is not None:
            prompt.description = payload.description
        prompt.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(prompt)
    return prompt


@router.post("/scene-generate", response_model=list[schemas.SceneDiffParams])
async def scene_generate(payload: schemas.SceneGenerateRequest, db: Session = Depends(get_db)):
    from app.services.llm_service import run_scene_generate
    prompt_key = "scene_generate_anima" if payload.anima_mode else "scene_generate"
    prompt_record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == prompt_key).first()
    system_prompt_override = prompt_record.content if prompt_record else None

    try:
        scenes_list = [{"id": s.id, "summary": s.summary} for s in payload.scenes]
        results = await run_scene_generate(
            target_fields=payload.target_fields,
            base_params=payload.base_params,
            scenes=scenes_list,
            system_prompt_override=system_prompt_override,
            anima_mode=payload.anima_mode,
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TranslateRequest(BaseModel):
    text: str
    direction: Literal["ja_to_en", "en_to_ja"]


@router.post("/translate", response_model=str)
async def translate(payload: TranslateRequest, db: Session = Depends(get_db)):
    from app.services.llm_request import call_llm
    
    key = f"translation_{payload.direction}"
    record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == key).first()
    
    if record and record.content and record.content.strip():
        system_prompt = record.content
    else:
        if payload.direction == "ja_to_en":
            system_prompt = (
                "You are a professional prompt translator for AI image generation. "
                "Translate the following Japanese text into natural, descriptive English prompt. "
                "Output ONLY the translated English prompt. Do not output any chat dialog or explanations."
            )
        else:
            system_prompt = (
                "あなたはAI画像生成プロンプトの専門翻訳者です。与えられた英語のプロンプトを、自然な日本語に翻訳してください。翻訳結果のみを出力し、挨拶や余計な解説は一切含めないでください。"
            )
            
    model_record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "translation_model").first()
    if model_record and model_record.content and model_record.content.strip():
        model = model_record.content
    else:
        model = None

    params_record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "llm_params_translation").first()
    llm_params = None
    if params_record and params_record.content:
        import json
        try:
            llm_params = json.loads(params_record.content)
        except Exception as e:
            pass
        
    try:
        translated_text = await call_llm(
            system_prompt=system_prompt,
            user_prompt=payload.text,
            model=model,
            timeout=30.0,
            llm_params=llm_params
        )
        return translated_text.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SpeechDraftRequest(BaseModel):
    snapshot_id: int


@router.post("/speech-draft", response_model=dict)
async def speech_draft(payload: SpeechDraftRequest, db: Session = Depends(get_db)):
    from app.services.snapshot_service import SnapshotService
    from app.services.speech_draft_service import generate_speech_draft
    s = SnapshotService.get_snapshot(db, payload.snapshot_id)
    if not s or not s.image_path:
        raise HTTPException(status_code=404, detail="Snapshot or image not found")
    try:
        draft = await generate_speech_draft(s, db)
        return {"draft": draft}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


