"""ParamTypeMaster CRUD router."""
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/param-type-masters", tags=["param-type-masters"])


@router.get("", response_model=list[schemas.ParamTypeMasterRead])
def list_param_type_masters(db: Session = Depends(get_db)):
    rows = db.query(models.ParamTypeMaster).order_by(models.ParamTypeMaster.name).all()
    return [_to_schema(r) for r in rows]


@router.post("", response_model=schemas.ParamTypeMasterRead, status_code=status.HTTP_201_CREATED)
def create_param_type_master(payload: schemas.ParamTypeMasterCreate, db: Session = Depends(get_db)):
    existing = db.query(models.ParamTypeMaster).filter(models.ParamTypeMaster.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"ParamTypeMaster '{payload.name}' already exists.")
    ptm = models.ParamTypeMaster(
        name=payload.name,
        widget_type=payload.widget_type,
        combo_options=json.dumps(payload.combo_options) if payload.combo_options is not None else None,
        min_value=payload.min_value,
        max_value=payload.max_value,
        step=payload.step,
    )
    db.add(ptm)
    db.commit()
    db.refresh(ptm)
    return _to_schema(ptm)


@router.put("/{ptm_id}", response_model=schemas.ParamTypeMasterRead)
def update_param_type_master(ptm_id: int, payload: schemas.ParamTypeMasterCreate, db: Session = Depends(get_db)):
    ptm = db.query(models.ParamTypeMaster).filter(models.ParamTypeMaster.id == ptm_id).first()
    if not ptm:
        raise HTTPException(status_code=404, detail="ParamTypeMaster not found.")
    ptm.name = payload.name
    ptm.widget_type = payload.widget_type
    ptm.combo_options = json.dumps(payload.combo_options) if payload.combo_options is not None else None
    ptm.min_value = payload.min_value
    ptm.max_value = payload.max_value
    ptm.step = payload.step
    db.commit()
    db.refresh(ptm)
    return _to_schema(ptm)


@router.delete("/{ptm_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_param_type_master(ptm_id: int, db: Session = Depends(get_db)):
    ptm = db.query(models.ParamTypeMaster).filter(models.ParamTypeMaster.id == ptm_id).first()
    if not ptm:
        raise HTTPException(status_code=404, detail="ParamTypeMaster not found.")
    db.delete(ptm)
    db.commit()


def _to_schema(ptm: models.ParamTypeMaster) -> schemas.ParamTypeMasterRead:
    return schemas.ParamTypeMasterRead(
        id=ptm.id,
        name=ptm.name,
        widget_type=ptm.widget_type,
        combo_options=json.loads(ptm.combo_options) if ptm.combo_options else None,
        min_value=ptm.min_value,
        max_value=ptm.max_value,
        step=ptm.step,
        created_at=ptm.created_at,
    )
