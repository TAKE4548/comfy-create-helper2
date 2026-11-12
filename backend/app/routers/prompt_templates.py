"""Prompt structure template CRUD router."""
import json
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prompt-templates", tags=["prompt-templates"])


@router.get("", response_model=List[schemas.PromptTemplateRead])
def list_prompt_templates(db: Session = Depends(get_db)):
    """List all prompt structure templates sorted by sort_order asc, id asc."""
    return (
        db.query(models.PromptStructureTemplate)
        .order_by(
            models.PromptStructureTemplate.sort_order.asc(),
            models.PromptStructureTemplate.id.asc(),
        )
        .all()
    )


@router.post("", response_model=schemas.PromptTemplateRead, status_code=status.HTTP_201_CREATED)
def create_prompt_template(
    payload: schemas.PromptTemplateCreate,
    db: Session = Depends(get_db),
):
    """Create a new prompt structure template."""
    existing = (
        db.query(models.PromptStructureTemplate)
        .filter(models.PromptStructureTemplate.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Prompt template name already exists",
        )

    structure_json = json.dumps(payload.structure.model_dump(mode="json"), ensure_ascii=False)
    template = models.PromptStructureTemplate(
        name=payload.name,
        description=payload.description,
        structure_json=structure_json,
        is_builtin=False,
        sort_order=payload.sort_order,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/{template_id}", response_model=schemas.PromptTemplateRead)
def update_prompt_template(
    template_id: int,
    payload: schemas.PromptTemplateUpdate,
    db: Session = Depends(get_db),
):
    """Update an existing prompt structure template."""
    template = (
        db.query(models.PromptStructureTemplate)
        .filter(models.PromptStructureTemplate.id == template_id)
        .first()
    )
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt template not found",
        )

    if payload.name is not None and payload.name != template.name:
        existing = (
            db.query(models.PromptStructureTemplate)
            .filter(
                models.PromptStructureTemplate.name == payload.name,
                models.PromptStructureTemplate.id != template_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Prompt template name already exists",
            )
        template.name = payload.name

    if payload.description is not None:
        template.description = payload.description

    if payload.structure is not None:
        template.structure_json = json.dumps(
            payload.structure.model_dump(mode="json"), ensure_ascii=False
        )

    if payload.sort_order is not None:
        template.sort_order = payload.sort_order

    template.updated_at = models.utc_now()
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prompt_template(
    template_id: int,
    db: Session = Depends(get_db),
):
    """Delete a prompt structure template."""
    template = (
        db.query(models.PromptStructureTemplate)
        .filter(models.PromptStructureTemplate.id == template_id)
        .first()
    )
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt template not found",
        )

    db.delete(template)
    db.commit()

