"""LLM system prompts management router."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/llm-prompts", tags=["llm-prompts"])


@router.get("", response_model=list[schemas.LlmPromptRead])
def list_llm_prompts(db: Session = Depends(get_db)):
    return db.query(models.LlmPrompt).order_by(models.LlmPrompt.key).all()


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
