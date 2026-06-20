"""Workflows router."""

import json
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.services.workflow_scanner import scan_workflow

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("", response_model=list[schemas.WorkflowSummary])
def list_workflows(db: Session = Depends(get_db)):
    return db.query(models.Workflow).order_by(models.Workflow.created_at.desc()).all()


@router.get("/{workflow_id}", response_model=schemas.WorkflowRead)
def get_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    # Build rich response with resolved mapping metadata
    result = schemas.WorkflowRead(
        id=wf.id,
        name=wf.name,
        json_body=json.loads(wf.json_body),
        created_at=wf.created_at,
        default_applied_assets=wf.default_applied_assets,
        mappings=[
            schemas.WorkflowMappingRead(
                id=m.id,
                master_id=m.master_id,
                node_id=m.node_id,
                role=m.master.role if m.master else None,
                param_name=m.master.param_name if m.master else None,
                input_type=m.master.input_type if m.master else None,
                display_name=m.master.display_name if m.master else None,
            )
            for m in wf.mappings
        ],
    )
    return result


@router.put("/{workflow_id}", response_model=schemas.WorkflowSummary)
def update_workflow(workflow_id: int, payload: schemas.WorkflowUpdate, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if payload.name is not None:
        existing = db.query(models.Workflow).filter(
            models.Workflow.name == payload.name,
            models.Workflow.id != workflow_id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Workflow name already exists")
        wf.name = payload.name

    if payload.json_body is not None:
        wf.json_body = json.dumps(payload.json_body)

    if payload.default_applied_assets is not None:
        wf.default_applied_assets = payload.default_applied_assets

    if payload.mappings is not None:
        db.query(models.WorkflowMapping).filter(
            models.WorkflowMapping.workflow_id == workflow_id
        ).delete()
        for m in payload.mappings:
            db.add(models.WorkflowMapping(
                workflow_id=workflow_id,
                master_id=m.master_id,
                node_id=m.node_id,
            ))

    db.commit()
    db.refresh(wf)
    return wf



@router.post("", response_model=schemas.WorkflowSummary, status_code=status.HTTP_201_CREATED)
def create_workflow(payload: schemas.WorkflowCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Workflow).filter(models.Workflow.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Workflow name already exists")
    wf = models.Workflow(
        name=payload.name,
        json_body=json.dumps(payload.json_body),
    )
    db.add(wf)
    db.flush()
    for m in payload.mappings:
        db.add(models.WorkflowMapping(
            workflow_id=wf.id,
            master_id=m.master_id,
            node_id=m.node_id,
        ))
    db.commit()
    db.refresh(wf)
    return wf


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    db.delete(wf)
    db.commit()


@router.post("/scan", response_model=schemas.ScanResult)
def scan_workflow_json(payload: schemas.WorkflowScanRequest, db: Session = Depends(get_db)):
    masters = db.query(models.MappingMaster).order_by(models.MappingMaster.sort_order).all()
    result = scan_workflow(payload.json_body, masters)
    return result
