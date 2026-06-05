"""LoRA router."""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/loras", tags=["loras"])


def _lora_to_schema(lora: models.Lora) -> schemas.LoraRead:
    return schemas.LoraRead(
        id=lora.id,
        model_name=lora.model_name,
        description=lora.description,
        recommended_strength_min=lora.recommended_strength_min,
        recommended_strength_max=lora.recommended_strength_max,
        category_id=lora.category_id,
        thumbnail_path=lora.thumbnail_path,
        file_path=lora.file_path,
        created_at=lora.created_at,
        trigger_word_sets=[
            schemas.TriggerWordSetRead(
                id=tws.id,
                name=tws.name,
                words=json.loads(tws.words) if tws.words else [],
            )
            for tws in lora.trigger_word_sets
        ],
    )


@router.get("", response_model=list[schemas.LoraRead])
def list_loras(category_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.Lora)
    if category_id is not None:
        q = q.filter(models.Lora.category_id == category_id)
    return [_lora_to_schema(l) for l in q.order_by(models.Lora.model_name).all()]


@router.post("", response_model=schemas.LoraRead, status_code=status.HTTP_201_CREATED)
def create_lora(payload: schemas.LoraCreate, db: Session = Depends(get_db)):
    lora = models.Lora(
        model_name=payload.model_name,
        description=payload.description,
        recommended_strength_min=payload.recommended_strength_min,
        recommended_strength_max=payload.recommended_strength_max,
        category_id=payload.category_id,
        thumbnail_path=payload.thumbnail_path,
        file_path=payload.file_path,
    )
    db.add(lora)
    db.flush()
    for tws in payload.trigger_word_sets:
        db.add(models.LoraTriggerWordSet(
            lora_id=lora.id,
            name=tws.name,
            words=json.dumps(tws.words),
        ))
    db.commit()
    db.refresh(lora)
    return _lora_to_schema(lora)


@router.put("/{lora_id}", response_model=schemas.LoraRead)
def update_lora(lora_id: int, payload: schemas.LoraCreate, db: Session = Depends(get_db)):
    lora = db.query(models.Lora).filter(models.Lora.id == lora_id).first()
    if not lora:
        raise HTTPException(status_code=404, detail="LoRA not found")
    lora.model_name = payload.model_name
    lora.description = payload.description
    lora.recommended_strength_min = payload.recommended_strength_min
    lora.recommended_strength_max = payload.recommended_strength_max
    lora.category_id = payload.category_id
    lora.thumbnail_path = payload.thumbnail_path
    lora.file_path = payload.file_path
    # Replace trigger word sets
    for tws in lora.trigger_word_sets:
        db.delete(tws)
    db.flush()
    for tws in payload.trigger_word_sets:
        db.add(models.LoraTriggerWordSet(
            lora_id=lora.id,
            name=tws.name,
            words=json.dumps(tws.words),
        ))
    db.commit()
    db.refresh(lora)
    return _lora_to_schema(lora)


@router.delete("/{lora_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lora(lora_id: int, db: Session = Depends(get_db)):
    lora = db.query(models.Lora).filter(models.Lora.id == lora_id).first()
    if not lora:
        raise HTTPException(status_code=404, detail="LoRA not found")
    db.delete(lora)
    db.commit()
