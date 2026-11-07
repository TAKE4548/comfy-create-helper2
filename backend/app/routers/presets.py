"""Workflow presets router."""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app import models, schemas
from app.schemas.variant_ref import VariantRef
from app.services.variant_keys import (
    VariantIndex,
    encode_variant_key,
    expand_stored_params,
    normalize_params,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflow-presets", tags=["workflow-presets"])


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _load_variants_by_id(db: Session, presets: list[models.WorkflowPreset]) -> dict[int, models.MappingVariant]:
    all_vids: set[int] = {val.variant_id for p in presets for val in p.values}
    if not all_vids:
        return {}
    variants = (
        db.query(models.MappingVariant)
        .options(joinedload(models.MappingVariant.master))
        .filter(models.MappingVariant.id.in_(all_vids))
        .all()
    )
    return {v.id: v for v in variants}


def _preset_to_schema(
    preset: models.WorkflowPreset,
    index: VariantIndex,
    variants_by_id: dict[int, models.MappingVariant],
) -> schemas.WorkflowPresetRead:
    raw_updated = preset.updated_at or preset.created_at
    stored: dict[str, Any] = {}
    if preset.param_values:
        try:
            parsed = json.loads(preset.param_values)
            if isinstance(parsed, dict):
                stored.update(parsed)
        except Exception:
            pass

    for r in preset.values:
        stored[encode_variant_key(r.variant_id, r.sub_key)] = r.value

    expanded = expand_stored_params(
        index,
        stored,
        owner_label=f"workflow_preset {preset.id}",
    )
    role_keyed: dict[str, str] = {
        k: str(v) if not isinstance(v, str) else v
        for k, v in expanded.role_keyed.items()
    }
    variant_keyed: dict[str, str] = {
        k: str(v) if not isinstance(v, str) else v
        for k, v in expanded.variant_keyed.items()
        if k.startswith("v:")
    }

    seen_vids: set[int] = set()
    preset_variants: list[VariantRef] = []
    for r in preset.values:
        if r.variant_id in variants_by_id and r.variant_id not in seen_vids:
            seen_vids.add(r.variant_id)
            v = variants_by_id[r.variant_id]
            preset_variants.append(
                VariantRef(
                    id=v.id,
                    role=v.role,
                    display_name=v.master.display_name if v.master else None,
                )
            )

    return schemas.WorkflowPresetRead(
        id=preset.id,
        workflow_id=preset.workflow_id,
        name=preset.name,
        param_values=role_keyed,
        variant_param_values=variant_keyed,
        variants=preset_variants,
        applied_assets=json.loads(preset.applied_assets) if preset.applied_assets else {},
        batch_size=preset.batch_size,
        seed_mode=preset.seed_mode,
        seed=preset.seed,
        created_at=_ensure_utc(preset.created_at),
        updated_at=_ensure_utc(raw_updated),
        sort_order=preset.sort_order,
    )


@router.get("", response_model=list[schemas.WorkflowPresetRead])
def list_presets(workflow_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.WorkflowPreset)
    if workflow_id is not None:
        q = q.filter(models.WorkflowPreset.workflow_id == workflow_id)
    presets = q.order_by(models.WorkflowPreset.sort_order.asc(), models.WorkflowPreset.id.asc()).all()
    index = VariantIndex.from_session(db)
    variants_by_id = _load_variants_by_id(db, presets)
    return [_preset_to_schema(p, index, variants_by_id) for p in presets]


@router.post("", response_model=schemas.WorkflowPresetRead, status_code=status.HTTP_201_CREATED)
def create_preset(payload: schemas.WorkflowPresetCreate, db: Session = Depends(get_db)):
    # Verify that workflow exists
    wf = db.query(models.Workflow).filter(models.Workflow.id == payload.workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    sort_order = payload.sort_order
    if sort_order == 0:
        max_sort = db.query(func.max(models.WorkflowPreset.sort_order)).filter(
            models.WorkflowPreset.workflow_id == payload.workflow_id
        ).scalar()
        sort_order = (max_sort + 1) if max_sort is not None else 0

    index = VariantIndex.from_session(db)
    norm = normalize_params(index, payload.param_values)
    for k in norm.unresolved:
        logger.warning("Preset new: unresolved parameter key '%s' dropped", k)

    preset = models.WorkflowPreset(
        workflow_id=payload.workflow_id,
        name=payload.name,
        param_values=json.dumps(norm.reserved, ensure_ascii=False),
        applied_assets=json.dumps(payload.applied_assets),
        batch_size=payload.batch_size,
        seed_mode=payload.seed_mode,
        seed=payload.seed,
        sort_order=sort_order,
    )
    db.add(preset)
    db.flush()

    for (variant_id, sub_key), val in norm.entries.items():
        preset.values.append(
            models.WorkflowPresetValue(
                preset_id=preset.id,
                variant_id=variant_id,
                sub_key=sub_key,
                value=val,
            )
        )
    db.commit()
    db.refresh(preset)

    variants_by_id = _load_variants_by_id(db, [preset])
    return _preset_to_schema(preset, index, variants_by_id)


@router.put("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_presets(payload: schemas.WorkflowPresetReorder, db: Session = Depends(get_db)):
    for i, pid in enumerate(payload.ordered_ids):
        db.query(models.WorkflowPreset).filter(models.WorkflowPreset.id == pid).update({"sort_order": i})
    db.commit()


@router.put("/{preset_id}", response_model=schemas.WorkflowPresetRead)
def update_preset(preset_id: int, payload: schemas.WorkflowPresetUpdate, db: Session = Depends(get_db)):
    preset = db.query(models.WorkflowPreset).filter(models.WorkflowPreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    if payload.base_updated_at is not None and preset.updated_at is not None:
        db_updated_at = preset.updated_at.replace(tzinfo=None) if preset.updated_at.tzinfo else preset.updated_at
        base_updated_at = payload.base_updated_at.astimezone(timezone.utc).replace(tzinfo=None) if payload.base_updated_at.tzinfo else payload.base_updated_at
        # 10ms (0.01秒) 以上の有意な差がある場合のみ 409 Conflict を送出
        if (db_updated_at - base_updated_at).total_seconds() > 0.01:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Preset was updated by another session. Please reload to get the latest changes."
            )

    if payload.name is not None:
        preset.name = payload.name

    index = VariantIndex.from_session(db)

    if payload.param_values is not None:
        norm = normalize_params(index, payload.param_values)
        for k in norm.unresolved:
            logger.warning("Preset %s: unresolved parameter key '%s' dropped", preset.id, k)
        preset.param_values = json.dumps(norm.reserved, ensure_ascii=False)
        preset.values.clear()
        db.flush()
        for (variant_id, sub_key), val in norm.entries.items():
            preset.values.append(
                models.WorkflowPresetValue(
                    preset_id=preset.id,
                    variant_id=variant_id,
                    sub_key=sub_key,
                    value=val,
                )
            )

    if payload.applied_assets is not None:
        preset.applied_assets = json.dumps(payload.applied_assets)
    if payload.batch_size is not None:
        preset.batch_size = payload.batch_size
    if payload.seed_mode is not None:
        preset.seed_mode = payload.seed_mode
    if payload.seed is not None:
        preset.seed = payload.seed

    preset.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(preset)

    variants_by_id = _load_variants_by_id(db, [preset])
    return _preset_to_schema(preset, index, variants_by_id)


@router.delete("/bulk", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete_presets(payload: schemas.WorkflowPresetBulkDelete, db: Session = Depends(get_db)):
    """Delete multiple presets by ID. Non-existent IDs are silently skipped."""
    if payload.ids:
        db.query(models.WorkflowPreset).filter(
            models.WorkflowPreset.id.in_(payload.ids)
        ).delete(synchronize_session=False)
        db.commit()


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preset(preset_id: int, db: Session = Depends(get_db)):
    preset = db.query(models.WorkflowPreset).filter(models.WorkflowPreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    db.delete(preset)
    db.commit()
