"""Workflow presets router."""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/workflow-presets", tags=["workflow-presets"])


def _preset_to_schema(preset: models.WorkflowPreset) -> schemas.WorkflowPresetRead:
    return schemas.WorkflowPresetRead(
        id=preset.id,
        workflow_id=preset.workflow_id,
        name=preset.name,
        param_values=json.loads(preset.param_values) if preset.param_values else {},
        applied_assets=json.loads(preset.applied_assets) if preset.applied_assets else {},
        batch_size=preset.batch_size,
        seed_mode=preset.seed_mode,
        seed=preset.seed,
        created_at=preset.created_at,
    )


@router.get("", response_model=list[schemas.WorkflowPresetRead])
def list_presets(workflow_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.WorkflowPreset)
    if workflow_id is not None:
        q = q.filter(models.WorkflowPreset.workflow_id == workflow_id)
    return [_preset_to_schema(p) for p in q.order_by(models.WorkflowPreset.id.desc()).all()]


@router.post("", response_model=schemas.WorkflowPresetRead, status_code=status.HTTP_201_CREATED)
def create_preset(payload: schemas.WorkflowPresetCreate, db: Session = Depends(get_db)):
    # Verify that workflow exists
    wf = db.query(models.Workflow).filter(models.Workflow.id == payload.workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    preset = models.WorkflowPreset(
        workflow_id=payload.workflow_id,
        name=payload.name,
        param_values=json.dumps(payload.param_values),
        applied_assets=json.dumps(payload.applied_assets),
        batch_size=payload.batch_size,
        seed_mode=payload.seed_mode,
        seed=payload.seed,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return _preset_to_schema(preset)


@router.put("/{preset_id}", response_model=schemas.WorkflowPresetRead)
def update_preset(preset_id: int, payload: schemas.WorkflowPresetUpdate, db: Session = Depends(get_db)):
    preset = db.query(models.WorkflowPreset).filter(models.WorkflowPreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    if payload.name is not None:
        preset.name = payload.name
    if payload.param_values is not None:
        preset.param_values = json.dumps(payload.param_values)
    if payload.applied_assets is not None:
        preset.applied_assets = json.dumps(payload.applied_assets)
    if payload.batch_size is not None:
        preset.batch_size = payload.batch_size
    if payload.seed_mode is not None:
        preset.seed_mode = payload.seed_mode
    if payload.seed is not None:
        preset.seed = payload.seed

    db.commit()
    db.refresh(preset)
    return _preset_to_schema(preset)


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preset(preset_id: int, db: Session = Depends(get_db)):
    preset = db.query(models.WorkflowPreset).filter(models.WorkflowPreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    db.delete(preset)
    db.commit()
