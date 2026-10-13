"""Mapping master router."""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, StrictBool, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/mapping-masters", tags=["mapping-masters"])


class MappingVariantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    master_id: int
    stage_id: int
    stage_key: str
    stage_name: str
    stage_suffix: str
    custom_role_override: Optional[str] = None
    computed_role: str
    extra_title_patterns: Optional[list[str]] = None
    is_enabled: bool = True


class MappingMasterV2Read(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: Optional[int] = None
    base_key: str
    name: str
    param_name: str
    input_type: str
    expected_class_types: Optional[list[str]] = None
    base_title_patterns: Optional[list[str]] = None
    fallback_param_names: Optional[list[str]] = None
    sort_order: int
    default_enabled: bool = True
    variants: list[MappingVariantRead] = []

    # Legacy compatibility fields
    role: Optional[str] = None
    display_name: Optional[str] = None
    title_patterns: Optional[list[str]] = None


class MappingVariantUpdateItem(BaseModel):
    id: Optional[int] = None
    stage_id: Optional[int] = None
    custom_role_override: Optional[str] = None
    extra_title_patterns: Optional[list[str]] = None
    is_enabled: Optional[bool] = None


class MappingMasterUpdate(BaseModel):
    # V2 fields
    group_id: Optional[int] = None
    base_key: Optional[str] = None
    name: Optional[str] = None
    param_name: Optional[str] = None
    input_type: Optional[str] = None
    expected_class_types: Optional[list[str]] = None
    base_title_patterns: Optional[list[str]] = None
    fallback_param_names: Optional[list[str]] = None
    sort_order: Optional[int] = None
    default_enabled: StrictBool | None = None
    variants: Optional[list[MappingVariantUpdateItem]] = None

    @field_validator("default_enabled", mode="before")
    @classmethod
    def reject_null_default_enabled(cls, value):
        if value is None:
            raise ValueError("default_enabled cannot be null")
        return value

    # Legacy fields
    role: Optional[str] = None
    display_name: Optional[str] = None
    title_patterns: Optional[list[str]] = None


class MappingMasterCreatePayload(BaseModel):
    role: Optional[str] = None
    base_key: Optional[str] = None
    display_name: Optional[str] = None
    name: Optional[str] = None
    param_name: str
    input_type: str
    group_id: Optional[int] = None
    expected_class_types: Optional[list[str]] = None
    title_patterns: Optional[list[str]] = None
    base_title_patterns: Optional[list[str]] = None
    fallback_param_names: Optional[list[str]] = None
    sort_order: Optional[int] = None
    default_enabled: StrictBool = True
    variants: Optional[list[MappingVariantUpdateItem]] = None


@router.get("", response_model=list[MappingMasterV2Read])
def list_masters(group_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.MappingMaster)
    if group_id is not None:
        query = query.filter(models.MappingMaster.group_id == group_id)
    rows = query.order_by(models.MappingMaster.sort_order).all()
    return [_to_schema_v2(r) for r in rows]


@router.post("", response_model=MappingMasterV2Read, status_code=status.HTTP_201_CREATED)
def create_master(payload: MappingMasterCreatePayload, db: Session = Depends(get_db)):
    base_key = payload.base_key or payload.role or ""
    name = payload.name or payload.display_name or ""
    role = payload.role or base_key
    display_name = payload.display_name or name
    base_title_patterns = payload.base_title_patterns or payload.title_patterns
    title_patterns = payload.title_patterns or base_title_patterns

    max_order = db.query(func.max(models.MappingMaster.sort_order)).scalar()
    sort_order = payload.sort_order if payload.sort_order is not None else ((max_order + 1) if max_order is not None else 0)

    mm = models.MappingMaster(
        group_id=payload.group_id,
        base_key=base_key,
        name=name,
        param_name=payload.param_name,
        input_type=payload.input_type,
        expected_class_types=json.dumps(payload.expected_class_types) if payload.expected_class_types else None,
        base_title_patterns=json.dumps(base_title_patterns) if base_title_patterns else None,
        fallback_param_names=json.dumps(payload.fallback_param_names) if payload.fallback_param_names else None,
        sort_order=sort_order,
        default_enabled=payload.default_enabled,
        # Legacy fields
        role=role,
        display_name=display_name,
        title_patterns=json.dumps(title_patterns) if title_patterns else None,
    )
    db.add(mm)
    db.commit()
    db.refresh(mm)

    # Automatically create default variants for active stages if none exist
    stages = db.query(models.StageMaster).filter(models.StageMaster.is_active == True).order_by(models.StageMaster.sort_order).all()
    variant_dict: dict[int, MappingVariantUpdateItem] = {}
    if payload.variants:
        for v_item in payload.variants:
            if v_item.stage_id:
                variant_dict[v_item.stage_id] = v_item

    for st in stages:
        v_opt: Optional[MappingVariantUpdateItem] = variant_dict.get(st.id)
        custom_override = v_opt.custom_role_override if v_opt else None
        extra_patterns = json.dumps(v_opt.extra_title_patterns) if (v_opt and v_opt.extra_title_patterns) else json.dumps([])
        is_enabled = v_opt.is_enabled if (v_opt and v_opt.is_enabled is not None) else True

        db.add(models.MappingVariant(
            master_id=mm.id,
            stage_id=st.id,
            custom_role_override=custom_override,
            extra_title_patterns=extra_patterns,
            is_enabled=is_enabled,
            sort_order=st.sort_order,
        ))
    db.commit()
    db.refresh(mm)
    return _to_schema_v2(mm)


@router.put("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_masters(payload: schemas.MappingMasterReorder, db: Session = Depends(get_db)):
    for idx, master_id in enumerate(payload.ordered_ids):
        db.query(models.MappingMaster).filter(
            models.MappingMaster.id == master_id
        ).update({"sort_order": idx})
    db.commit()


@router.get("/{master_id}", response_model=MappingMasterV2Read)
def get_master(master_id: int, db: Session = Depends(get_db)):
    mm = db.query(models.MappingMaster).filter(models.MappingMaster.id == master_id).first()
    if not mm:
        raise HTTPException(status_code=404, detail="MappingMaster not found")
    return _to_schema_v2(mm)


@router.put("/{master_id}", response_model=MappingMasterV2Read)
def update_master(master_id: int, payload: MappingMasterUpdate, db: Session = Depends(get_db)):
    mm = db.query(models.MappingMaster).filter(models.MappingMaster.id == master_id).first()
    if not mm:
        raise HTTPException(status_code=404, detail="MappingMaster not found")

    old_role = mm.role or mm.base_key
    new_base_key = payload.base_key if payload.base_key is not None else mm.base_key
    new_role = payload.role if payload.role is not None else (payload.base_key if payload.base_key is not None else mm.role)
    new_name = payload.name if payload.name is not None else mm.name
    new_display = payload.display_name if payload.display_name is not None else (payload.name if payload.name is not None else mm.display_name)

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

    if payload.group_id is not None:
        mm.group_id = payload.group_id
    if payload.base_key is not None:
        mm.base_key = payload.base_key
    if payload.name is not None:
        mm.name = payload.name
    if payload.param_name is not None:
        mm.param_name = payload.param_name
    if payload.input_type is not None:
        mm.input_type = payload.input_type
    if payload.expected_class_types is not None:
        mm.expected_class_types = json.dumps(payload.expected_class_types) if payload.expected_class_types else None
    if payload.base_title_patterns is not None:
        mm.base_title_patterns = json.dumps(payload.base_title_patterns) if payload.base_title_patterns else None
    if payload.fallback_param_names is not None:
        mm.fallback_param_names = json.dumps(payload.fallback_param_names) if payload.fallback_param_names else None
    if payload.sort_order is not None:
        mm.sort_order = payload.sort_order
    if payload.default_enabled is not None:
        mm.default_enabled = payload.default_enabled

    # Legacy fields sync
    mm.role = new_role or new_base_key
    mm.display_name = new_display or new_name
    if payload.title_patterns is not None:
        mm.title_patterns = json.dumps(payload.title_patterns) if payload.title_patterns else None
    elif payload.base_title_patterns is not None:
        mm.title_patterns = json.dumps(payload.base_title_patterns) if payload.base_title_patterns else None

    # Variants batch update
    if payload.variants is not None:
        for item in payload.variants:
            v = None
            if item.id:
                v = db.query(models.MappingVariant).filter(
                    models.MappingVariant.id == item.id,
                    models.MappingVariant.master_id == master_id,
                ).first()
            elif item.stage_id:
                v = db.query(models.MappingVariant).filter(
                    models.MappingVariant.stage_id == item.stage_id,
                    models.MappingVariant.master_id == master_id,
                ).first()

            if v:
                if item.is_enabled is not None:
                    v.is_enabled = item.is_enabled
                if item.custom_role_override is not None:
                    raw_override = item.custom_role_override.strip() if isinstance(item.custom_role_override, str) else item.custom_role_override
                    v.custom_role_override = raw_override if raw_override else None
                if item.extra_title_patterns is not None:
                    v.extra_title_patterns = json.dumps(item.extra_title_patterns)
            elif item.stage_id:
                # Create if not exists for this stage
                new_override = item.custom_role_override.strip() if isinstance(item.custom_role_override, str) else item.custom_role_override
                db.add(models.MappingVariant(
                    master_id=master_id,
                    stage_id=item.stage_id,
                    custom_role_override=new_override if new_override else None,
                    extra_title_patterns=json.dumps(item.extra_title_patterns) if item.extra_title_patterns else json.dumps([]),
                    is_enabled=item.is_enabled if item.is_enabled is not None else True,
                ))

    db.commit()
    db.refresh(mm)
    return _to_schema_v2(mm)


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


def _to_variant_schema(v: models.MappingVariant) -> MappingVariantRead:
    extra_patterns = json.loads(v.extra_title_patterns) if v.extra_title_patterns else None
    stage = v.stage
    return MappingVariantRead(
        id=v.id,
        master_id=v.master_id,
        stage_id=v.stage_id,
        stage_key=stage.key if stage else "",
        stage_name=stage.name if stage else "",
        stage_suffix=stage.suffix if stage else "",
        custom_role_override=v.custom_role_override,
        computed_role=v.computed_role,
        extra_title_patterns=extra_patterns,
        is_enabled=v.is_enabled,
    )


def _to_schema_v2(mm: models.MappingMaster) -> MappingMasterV2Read:
    variants = [_to_variant_schema(v) for v in (mm.variants or [])]
    variants.sort(key=lambda v: (v.stage_id, v.id))

    expected_class_types = json.loads(mm.expected_class_types) if mm.expected_class_types else None
    base_title_patterns = (
        json.loads(mm.base_title_patterns)
        if mm.base_title_patterns
        else (json.loads(mm.title_patterns) if mm.title_patterns else None)
    )
    title_patterns = json.loads(mm.title_patterns) if mm.title_patterns else base_title_patterns

    effective_base_key = mm.base_key or mm.role or ""
    effective_name = mm.name or mm.display_name or ""

    return MappingMasterV2Read(
        id=mm.id,
        group_id=mm.group_id,
        base_key=effective_base_key,
        name=effective_name,
        param_name=mm.param_name,
        input_type=mm.input_type,
        expected_class_types=expected_class_types,
        base_title_patterns=base_title_patterns,
        fallback_param_names=json.loads(mm.fallback_param_names) if mm.fallback_param_names else None,
        sort_order=mm.sort_order,
        default_enabled=mm.default_enabled,
        variants=variants,
        # backward compatibility
        role=mm.role or effective_base_key,
        display_name=mm.display_name or effective_name,
        title_patterns=title_patterns,
    )


def _to_schema(mm: models.MappingMaster) -> schemas.MappingMasterRead:
    return schemas.MappingMasterRead(
        id=mm.id,
        role=mm.role or mm.base_key or "",
        expected_class_types=json.loads(mm.expected_class_types) if mm.expected_class_types else None,
        param_name=mm.param_name,
        input_type=mm.input_type,
        display_name=mm.display_name or mm.name or "",
        title_patterns=json.loads(mm.title_patterns) if mm.title_patterns else None,
        fallback_param_names=json.loads(mm.fallback_param_names) if mm.fallback_param_names else None,
        sort_order=mm.sort_order,
        default_enabled=mm.default_enabled,
    )
