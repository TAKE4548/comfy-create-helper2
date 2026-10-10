"""StageMaster API router."""
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.schemas.mapping import (
    CascadePreviewResponse,
    CascadeRenameRequest,
    StageMasterCreate,
    StageMasterRead,
    StageMasterReorder,
    StageMasterUpdate,
)
from app.services.mapping_service import MappingService

router = APIRouter(prefix="/api/stage-masters", tags=["stage-masters"])


@router.get("", response_model=list[StageMasterRead])
def list_stage_masters(
    include_inactive: bool = Query(True, description="非アクティブなステージも含めるか"),
    db: Session = Depends(get_db),
):
    query = db.query(models.StageMaster)
    if not include_inactive:
        query = query.filter(models.StageMaster.is_active == True)
    stages = query.order_by(models.StageMaster.sort_order).all()
    return [StageMasterRead.model_validate(s) for s in stages]


@router.post("", response_model=StageMasterRead, status_code=status.HTTP_201_CREATED)
def create_stage_master(payload: StageMasterCreate, db: Session = Depends(get_db)):
    existing = db.query(models.StageMaster).filter(models.StageMaster.key == payload.key).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"キー '{payload.key}' は既に使用されています",
        )

    sort_order = payload.sort_order
    if sort_order is None or sort_order == 0:
        max_order = db.query(func.max(models.StageMaster.sort_order)).scalar()
        sort_order = 0 if max_order is None else max_order + 1

    stage = models.StageMaster(
        key=payload.key,
        name=payload.name,
        suffix=payload.suffix,
        search_keywords=json.dumps(payload.search_keywords, ensure_ascii=False) if payload.search_keywords else None,
        is_builtin=payload.is_builtin,
        is_active=payload.is_active,
        sort_order=sort_order,
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return StageMasterRead.model_validate(stage)


@router.put("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_stage_masters(payload: StageMasterReorder, db: Session = Depends(get_db)):
    for idx, stage_id in enumerate(payload.ordered_ids):
        db.query(models.StageMaster).filter(models.StageMaster.id == stage_id).update(
            {"sort_order": idx}
        )
    db.commit()


@router.get("/{stage_id}", response_model=StageMasterRead)
def get_stage_master(stage_id: int, db: Session = Depends(get_db)):
    stage = db.query(models.StageMaster).filter(models.StageMaster.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ステージが見つかりません")
    return StageMasterRead.model_validate(stage)


@router.put("/{stage_id}", response_model=StageMasterRead)
def update_stage_master(
    stage_id: int,
    payload: StageMasterUpdate,
    db: Session = Depends(get_db),
):
    stage = db.query(models.StageMaster).filter(models.StageMaster.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ステージが見つかりません")

    if payload.name is not None:
        stage.name = payload.name
    if payload.suffix is not None:
        stage.suffix = payload.suffix
    if payload.search_keywords is not None:
        stage.search_keywords = json.dumps(payload.search_keywords, ensure_ascii=False)
    if payload.sort_order is not None:
        stage.sort_order = payload.sort_order
    if payload.is_active is not None:
        stage.is_active = payload.is_active
        if not payload.is_active:
            # 配下のバリアントも連動して非活性化
            for variant in stage.variants:
                variant.is_enabled = False

    db.commit()
    db.refresh(stage)
    return StageMasterRead.model_validate(stage)


@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage_master(stage_id: int, db: Session = Depends(get_db)):
    stage = db.query(models.StageMaster).filter(models.StageMaster.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ステージが見つかりません")

    usage_count = MappingService.get_stage_usage_count(db, stage_id)
    MappingService.validate_stage_deletion(stage, usage_count)

    for variant in list(stage.variants):
        db.delete(variant)
    db.delete(stage)
    db.commit()


@router.get("/{stage_id}/usages", response_model=list[dict])
def get_stage_usages(stage_id: int, db: Session = Depends(get_db)):
    stage = db.query(models.StageMaster).filter(models.StageMaster.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ステージが見つかりません")

    mappings = (
        db.query(models.WorkflowMapping)
        .join(models.MappingVariant, models.WorkflowMapping.variant_id == models.MappingVariant.id)
        .filter(models.MappingVariant.stage_id == stage_id)
        .all()
    )
    return [
        {
            "mapping_id": m.id,
            "workflow_id": m.workflow_id,
            "workflow_name": m.workflow.name if m.workflow else "",
            "node_id": m.node_id,
            "variant_id": m.variant_id,
        }
        for m in mappings
    ]


@router.get("/{stage_id}/cascade-preview", response_model=CascadePreviewResponse)
def get_cascade_preview(
    stage_id: int,
    new_suffix: str = Query(..., description="新しい接尾辞"),
    db: Session = Depends(get_db),
):
    return MappingService.preview_cascade(db, stage_id, new_suffix)


@router.post("/{stage_id}/cascade-preview", response_model=CascadePreviewResponse)
def post_cascade_preview(
    stage_id: int,
    payload: CascadeRenameRequest,
    db: Session = Depends(get_db),
):
    return MappingService.preview_cascade(db, stage_id, payload.new_suffix)


@router.post("/{stage_id}/cascade-rename", response_model=StageMasterRead)
def execute_cascade_rename_endpoint(
    stage_id: int,
    payload: CascadeRenameRequest,
    db: Session = Depends(get_db),
):
    return MappingService.execute_cascade_rename(db, stage_id, payload)
