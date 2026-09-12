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


@router.post("/{workflow_id}/copy", response_model=schemas.WorkflowSummary, status_code=status.HTTP_201_CREATED)
def copy_workflow(workflow_id: int, payload: schemas.WorkflowCopyRequest, db: Session = Depends(get_db)):
    src = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Workflow not found")
    existing = db.query(models.Workflow).filter(models.Workflow.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Workflow name already exists")
    new_wf = models.Workflow(
        name=payload.name,
        json_body=src.json_body,
        default_applied_assets=src.default_applied_assets,
    )
    db.add(new_wf)
    db.flush()
    for m in src.mappings:
        db.add(models.WorkflowMapping(workflow_id=new_wf.id, master_id=m.master_id, node_id=m.node_id))
    for p in src.presets:
        db.add(models.WorkflowPreset(
            workflow_id=new_wf.id, name=p.name,
            param_values=p.param_values, applied_assets=p.applied_assets,
            batch_size=p.batch_size, seed_mode=p.seed_mode, seed=p.seed,
            sort_order=p.sort_order,
        ))
    for bp in src.bypass_profiles:
        db.add(models.BypassProfile(
            workflow_id=new_wf.id,
            name=bp.name,
            bypassed_node_ids=bp.bypassed_node_ids,
            is_enabled=bp.is_enabled,
        ))
    for sg in src.param_sync_groups:
        db.add(models.ParamSyncGroup(
            workflow_id=new_wf.id,
            name=sg.name,
            master_role=sg.master_role,
            slave_roles=sg.slave_roles,
            is_enabled=sg.is_enabled,
        ))
    db.commit()
    db.refresh(new_wf)
    return new_wf


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
        target_base_model_id=wf.target_base_model_id,
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
        # Backup current workflow state to workflow_history before replacing
        current_mappings = [
            {"master_id": m.master_id, "node_id": m.node_id}
            for m in wf.mappings
        ]
        history = models.WorkflowHistory(
            workflow_id=workflow_id,
            json_body=wf.json_body,
            mappings=json.dumps(current_mappings),
        )
        db.add(history)

        wf.json_body = json.dumps(payload.json_body)
        if "target_base_model_id" not in payload.model_fields_set:
            from app.services.workflow_scanner import detect_checkpoint_names, estimate_base_model_from_checkpoints
            ckpt_names = detect_checkpoint_names(payload.json_body)
            mappings = db.query(models.CheckpointMapping).all()
            wf.target_base_model_id = estimate_base_model_from_checkpoints(ckpt_names, mappings)

    if "target_base_model_id" in payload.model_fields_set:
        wf.target_base_model_id = payload.target_base_model_id

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


@router.post("/{workflow_id}/diff-analyze", response_model=schemas.DiffAnalyzeResponse)
def diff_analyze_workflow(workflow_id: int, payload: schemas.DiffAnalyzeRequest, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    masters = db.query(models.MappingMaster).order_by(models.MappingMaster.sort_order).all()
    from app.services.workflow_diff_engine import analyze_workflow_diff
    return analyze_workflow_diff(
        old_json=json.loads(wf.json_body),
        new_json=payload.new_json_body,
        mappings=wf.mappings,
        masters=masters,
        bypass_profiles=wf.bypass_profiles,
    )


@router.get("/{workflow_id}/history-status", response_model=schemas.WorkflowHistoryStatusResponse)
def get_workflow_history_status(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    entries = db.query(models.WorkflowHistory).filter(
        models.WorkflowHistory.workflow_id == workflow_id
    ).order_by(models.WorkflowHistory.created_at.desc()).all()
    count = len(entries)
    latest_at = entries[0].created_at if count > 0 else None
    return schemas.WorkflowHistoryStatusResponse(
        has_rollback=count > 0,
        history_count=count,
        latest_backup_at=latest_at,
    )


@router.post("/{workflow_id}/rollback", response_model=schemas.WorkflowRollbackResponse)
def rollback_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    history = db.query(models.WorkflowHistory).filter(
        models.WorkflowHistory.workflow_id == workflow_id
    ).order_by(models.WorkflowHistory.created_at.desc()).first()
    if not history:
        raise HTTPException(status_code=400, detail="No rollback history available")

    # Restore json_body & mappings
    wf.json_body = history.json_body
    db.query(models.WorkflowMapping).filter(
        models.WorkflowMapping.workflow_id == workflow_id
    ).delete()
    saved_mappings = json.loads(history.mappings)
    for m in saved_mappings:
        db.add(models.WorkflowMapping(
            workflow_id=workflow_id,
            master_id=m["master_id"],
            node_id=m["node_id"],
        ))
    db.delete(history)
    db.commit()
    return schemas.WorkflowRollbackResponse(
        message="Rollback successful",
        workflow_id=wf.id,
        restored_at=models.utc_now(),
    )



@router.post("", response_model=schemas.WorkflowSummary, status_code=status.HTTP_201_CREATED)
def create_workflow(payload: schemas.WorkflowCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Workflow).filter(models.Workflow.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Workflow name already exists")

    target_base_model_id = payload.target_base_model_id
    if "target_base_model_id" not in payload.model_fields_set:
        from app.services.workflow_scanner import detect_checkpoint_names, estimate_base_model_from_checkpoints
        ckpt_names = detect_checkpoint_names(payload.json_body)
        mappings = db.query(models.CheckpointMapping).all()
        target_base_model_id = estimate_base_model_from_checkpoints(ckpt_names, mappings)

    wf = models.Workflow(
        name=payload.name,
        json_body=json.dumps(payload.json_body),
        target_base_model_id=target_base_model_id,
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

    from app.services.workflow_scanner import detect_checkpoint_names, estimate_base_model_from_checkpoints
    ckpt_names = detect_checkpoint_names(payload.json_body)
    mappings = db.query(models.CheckpointMapping).all()
    est_id = estimate_base_model_from_checkpoints(ckpt_names, mappings)
    
    result["estimated_base_model_id"] = est_id
    if est_id is None and ckpt_names:
        result["unknown_checkpoint_name"] = ckpt_names[0]
    else:
        result["unknown_checkpoint_name"] = None

    return result
