"""LoRA router."""

import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
import httpx
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/loras", tags=["loras"])


def _lora_to_schema(lora: models.Lora, db: Session) -> schemas.LoraRead:
    snapshot_paths = [
        r[0] for r in (
            db.query(models.Snapshot.image_path)
            .join(models.SnapshotLora, models.SnapshotLora.snapshot_id == models.Snapshot.id)
            .filter(models.SnapshotLora.lora_id == lora.id)
            .filter(models.Snapshot.image_path.isnot(None))
            .filter(models.Snapshot.image_path != "")
            .order_by(models.Snapshot.created_at.desc(), models.Snapshot.id.desc())
            .all()
        )
    ]
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
        snapshot_paths=snapshot_paths,
    )


@router.get("", response_model=list[schemas.LoraRead])
def list_loras(category_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.Lora)
    if category_id is not None:
        q = q.filter(models.Lora.category_id == category_id)
    return [_lora_to_schema(l, db) for l in q.order_by(models.Lora.model_name).all()]


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
    return _lora_to_schema(lora, db)


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
    return _lora_to_schema(lora, db)


@router.delete("/{lora_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lora(lora_id: int, db: Session = Depends(get_db)):
    lora = db.query(models.Lora).filter(models.Lora.id == lora_id).first()
    if not lora:
        raise HTTPException(status_code=404, detail="LoRA not found")
    db.delete(lora)
    db.commit()


@router.get("/comfy-models", response_model=list[schemas.ComfyLoraModel])
async def get_comfy_lora_models(db: Session = Depends(get_db)):
    models_list = []
    async with httpx.AsyncClient() as client:
        # Try primary endpoint
        try:
            response = await client.get(f"{settings.comfy_url}/api/models/loras", timeout=5.0)
            if response.status_code == 404:
                # If 404, fallback to experiment endpoint
                response = await client.get(f"{settings.comfy_url}/api/experiment/models/loras", timeout=5.0)
                response.raise_for_status()
            else:
                response.raise_for_status()
            models_list = response.json()
        except (httpx.HTTPError, httpx.RequestError) as e:
            logger.warning(f"Failed to fetch from primary loras endpoint: {e}. Trying fallback.")
            try:
                response = await client.get(f"{settings.comfy_url}/api/experiment/models/loras", timeout=5.0)
                response.raise_for_status()
                models_list = response.json()
            except (httpx.HTTPError, httpx.RequestError) as ex:
                logger.exception(f"Failed to fetch ComfyUI LoRA models from fallback: {ex}")
                models_list = []

    # Get registered loras
    db_loras = db.query(models.Lora).all()
    registered_paths = {}
    for l in db_loras:
        if l.file_path:
            registered_paths[l.file_path.replace("\\", "/")] = l.id
        elif l.model_name:
            registered_paths[l.model_name.replace("\\", "/")] = l.id

    results = []
    if isinstance(models_list, list):
        for path in models_list:
            if not isinstance(path, str):
                continue
            normalized_path = path.replace("\\", "/")
            base_name = normalized_path.split("/")[-1]
            lora_id = registered_paths.get(normalized_path)
            is_registered = lora_id is not None
            results.append(schemas.ComfyLoraModel(
                model_name=base_name,
                file_path=normalized_path,
                is_registered=is_registered,
                lora_id=lora_id
            ))

    # Sort: unregistered first, then alphabetical by file_path
    results.sort(key=lambda x: (x.is_registered, x.file_path))
    return results

