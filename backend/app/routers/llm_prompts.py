"""LLM system prompts management router."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/llm-prompts", tags=["llm-prompts"])


from pydantic import BaseModel

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
            updated_at=datetime.utcnow()
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
            updated_at=datetime.utcnow()
        )
        db.add(prompt)
    else:
        prompt.content = model_name
        prompt.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(prompt)
    return prompt


@router.put("/{key}", response_model=schemas.LlmPromptRead)
def update_llm_prompt(key: str, payload: schemas.LlmPromptUpdate, db: Session = Depends(get_db)):
    prompt = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == key).first()
    if not prompt:
        raise HTTPException(status_code=404, detail=f"LLM prompt key '{key}' not found")
    prompt.content = payload.content
    if payload.description is not None:
        prompt.description = payload.description
    prompt.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(prompt)
    return prompt


@router.post("/scene-generate", response_model=list[schemas.SceneDiffParams])
async def scene_generate(payload: schemas.SceneGenerateRequest, db: Session = Depends(get_db)):
    from app.services.llm_service import run_scene_generate
    prompt_record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "scene_generate").first()
    system_prompt_override = prompt_record.content if prompt_record else None
    
    try:
        scenes_list = [{"id": s.id, "summary": s.summary} for s in payload.scenes]
        results = await run_scene_generate(
            target_fields=payload.target_fields,
            base_params=payload.base_params,
            scenes=scenes_list,
            system_prompt_override=system_prompt_override,
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

