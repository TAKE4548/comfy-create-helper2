"""Param sync groups router."""

import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(tags=["param-sync-groups"])


def _group_to_schema(group: models.ParamSyncGroup) -> schemas.ParamSyncGroupRead:
    return schemas.ParamSyncGroupRead(
        id=group.id,
        workflow_id=group.workflow_id,
        name=group.name,
        master_role=group.master_role,
        slave_roles=json.loads(group.slave_roles) if group.slave_roles else [],
        is_enabled=group.is_enabled,
        created_at=group.created_at,
    )


@router.get("/api/workflows/{workflow_id}/param-sync-groups", response_model=list[schemas.ParamSyncGroupRead])
def list_param_sync_groups(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    groups = db.query(models.ParamSyncGroup).filter(models.ParamSyncGroup.workflow_id == workflow_id).all()
    return [_group_to_schema(g) for g in groups]


@router.post("/api/workflows/{workflow_id}/param-sync-groups", response_model=schemas.ParamSyncGroupRead, status_code=status.HTTP_201_CREATED)
def create_param_sync_group(workflow_id: int, payload: schemas.ParamSyncGroupCreate, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    group = models.ParamSyncGroup(
        workflow_id=workflow_id,
        name=payload.name,
        master_role=payload.master_role,
        slave_roles=json.dumps(payload.slave_roles),
        is_enabled=payload.is_enabled,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_to_schema(group)


@router.put("/api/param-sync-groups/{group_id}", response_model=schemas.ParamSyncGroupRead)
def update_param_sync_group(group_id: int, payload: schemas.ParamSyncGroupUpdate, db: Session = Depends(get_db)):
    group = db.query(models.ParamSyncGroup).filter(models.ParamSyncGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Param sync group not found")

    if payload.name is not None:
        group.name = payload.name
    if payload.master_role is not None:
        group.master_role = payload.master_role
    if payload.slave_roles is not None:
        group.slave_roles = json.dumps(payload.slave_roles)
    if payload.is_enabled is not None:
        group.is_enabled = payload.is_enabled

    db.commit()
    db.refresh(group)
    return _group_to_schema(group)


@router.delete("/api/param-sync-groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_param_sync_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(models.ParamSyncGroup).filter(models.ParamSyncGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Param sync group not found")
    db.delete(group)
    db.commit()
