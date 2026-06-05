"""Mapping master router."""

import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/mapping-masters", tags=["mapping-masters"])


@router.get("", response_model=list[schemas.MappingMasterRead])
def list_masters(db: Session = Depends(get_db)):
    rows = db.query(models.MappingMaster).order_by(models.MappingMaster.id).all()
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
    db.add(mm)
    db.commit()
    db.refresh(mm)
    return _to_schema(mm)


@router.put("/{master_id}", response_model=schemas.MappingMasterRead)
def update_master(master_id: int, payload: schemas.MappingMasterCreate, db: Session = Depends(get_db)):
    mm = db.query(models.MappingMaster).filter(models.MappingMaster.id == master_id).first()
    if not mm:
        raise HTTPException(status_code=404, detail="MappingMaster not found")
    mm.role = payload.role
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


def _to_schema(mm: models.MappingMaster) -> schemas.MappingMasterRead:
    return schemas.MappingMasterRead(
        id=mm.id,
        role=mm.role,
        expected_class_types=json.loads(mm.expected_class_types) if mm.expected_class_types else None,
        param_name=mm.param_name,
        input_type=mm.input_type,
        display_name=mm.display_name,
        title_patterns=json.loads(mm.title_patterns) if mm.title_patterns else None,
    )
