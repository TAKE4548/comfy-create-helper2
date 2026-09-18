"""Mapping master router."""

import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/mapping-masters", tags=["mapping-masters"])


@router.get("", response_model=list[schemas.MappingMasterRead])
def list_masters(db: Session = Depends(get_db)):
    rows = db.query(models.MappingMaster).order_by(models.MappingMaster.sort_order).all()
    return [_to_schema(r) for r in rows]


@router.post("", response_model=schemas.MappingMasterRead, status_code=status.HTTP_201_CREATED)
def create_master(payload: schemas.MappingMasterCreate, db: Session = Depends(get_db)):
    mm = models.MappingMaster(
        role=payload.role,
        expected_class_types=json.dumps(payload.expected_class_types) if payload.expected_class_types else None,
        param_name=payload.param_name,
        input_type=payload.input_type,
        display_name=payload.display_name,
        title_patterns=json.dumps(payload.title_patterns) if payload.title_patterns else None,
    )
    max_order = db.query(func.max(models.MappingMaster.sort_order)).scalar() or -1
    mm.sort_order = max_order + 1
    db.add(mm)
    db.commit()
    db.refresh(mm)
    return _to_schema(mm)


@router.put("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_masters(payload: schemas.MappingMasterReorder, db: Session = Depends(get_db)):
    for idx, master_id in enumerate(payload.ordered_ids):
        db.query(models.MappingMaster).filter(
            models.MappingMaster.id == master_id
        ).update({"sort_order": idx})
    db.commit()


@router.put("/{master_id}", response_model=schemas.MappingMasterRead)
def update_master(master_id: int, payload: schemas.MappingMasterCreate, db: Session = Depends(get_db)):
    mm = db.query(models.MappingMaster).filter(models.MappingMaster.id == master_id).first()
    if not mm:
        raise HTTPException(status_code=404, detail="MappingMaster not found")
    old_role = mm.role
    new_role = payload.role
    if old_role and new_role and old_role != new_role:
        old_pattern = f'"{old_role}":'
        new_pattern = f'"{new_role}":'
        db.query(models.WorkflowPreset).filter(
            models.WorkflowPreset.param_values.contains(old_pattern)
        ).update(
            {
                models.WorkflowPreset.param_values: func.replace(
                    models.WorkflowPreset.param_values, old_pattern, new_pattern
                )
            },
            synchronize_session=False,
        )

    mm.role = new_role
    mm.expected_class_types = json.dumps(payload.expected_class_types) if payload.expected_class_types else None
    mm.param_name = payload.param_name
    mm.input_type = payload.input_type
    mm.display_name = payload.display_name
    mm.title_patterns = json.dumps(payload.title_patterns) if payload.title_patterns else None
    db.commit()
    db.refresh(mm)
    return _to_schema(mm)


@router.delete("/{master_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_master(master_id: int, db: Session = Depends(get_db)):
    mm = db.query(models.MappingMaster).filter(models.MappingMaster.id == master_id).first()
    if not mm:
        raise HTTPException(status_code=404, detail="MappingMaster not found")
    db.delete(mm)
    db.commit()


@router.get("/{master_id}/usages", response_model=list[dict])
def get_master_usages(master_id: int, db: Session = Depends(get_db)):
    mm = db.query(models.MappingMaster).filter(models.MappingMaster.id == master_id).first()
    if not mm:
        raise HTTPException(status_code=404, detail="MappingMaster not found")
    mappings = db.query(models.WorkflowMapping).filter(models.WorkflowMapping.master_id == master_id).all()
    return [
        {
            "workflow_id": m.workflow_id,
            "workflow_name": m.workflow.name,
            "node_id": m.node_id
        }
        for m in mappings
    ]


def _to_schema(mm: models.MappingMaster) -> schemas.MappingMasterRead:
    return schemas.MappingMasterRead(
        id=mm.id,
        role=mm.role,
        expected_class_types=json.loads(mm.expected_class_types) if mm.expected_class_types else None,
        param_name=mm.param_name,
        input_type=mm.input_type,
        display_name=mm.display_name,
        title_patterns=json.loads(mm.title_patterns) if mm.title_patterns else None,
        sort_order=mm.sort_order,
    )
