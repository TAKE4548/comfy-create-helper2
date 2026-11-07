"""Param sync groups router."""
from __future__ import annotations

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app import models, schemas
from app.schemas.variant_ref import VariantRef
from app.services.variant_keys import VariantIndex, KeyKind

router = APIRouter(tags=["param-sync-groups"])


def _group_to_schema(
    group: models.ParamSyncGroup,
    db: Optional[Session] = None,
    index: Optional[VariantIndex] = None,
    variant_map: Optional[dict[int, models.MappingVariant]] = None,
) -> schemas.ParamSyncGroupRead:
    if db is not None:
        if index is None:
            index = VariantIndex.from_session(db)
        if variant_map is None:
            vids: set[int] = set()
            if group.master_variant_id is not None:
                vids.add(group.master_variant_id)
            for m in group.members:
                vids.add(m.variant_id)
            if vids:
                rows = (
                    db.query(models.MappingVariant)
                    .options(joinedload(models.MappingVariant.master))
                    .filter(models.MappingVariant.id.in_(vids))
                    .all()
                )
                variant_map = {v.id: v for v in rows}
            else:
                variant_map = {}

    master_vid = group.master_variant_id
    master_role = ""
    if index is not None and master_vid is not None:
        master_role = index.role_of(master_vid) or group.master_role or ""
    else:
        master_role = group.master_role or ""

    slave_vids: list[int] = []
    slave_roles: list[str] = []
    if group.members:
        for m in group.members:
            if index is not None:
                r = index.role_of(m.variant_id)
                if r is not None:
                    slave_vids.append(m.variant_id)
                    slave_roles.append(r)
            else:
                slave_vids.append(m.variant_id)
    elif group.slave_roles and group.slave_roles != "[]":
        try:
            parsed = json.loads(group.slave_roles)
            if isinstance(parsed, list):
                slave_roles = [str(item) for item in parsed]
        except Exception:
            slave_roles = []

    # Ordered variant references
    ordered_vids: list[int] = []
    if master_vid is not None:
        ordered_vids.append(master_vid)
    for svid in slave_vids:
        if svid not in ordered_vids:
            ordered_vids.append(svid)

    variants: list[VariantRef] = []
    if variant_map:
        for vid in ordered_vids:
            if vid in variant_map:
                mv = variant_map[vid]
                disp = mv.master.display_name if mv.master and mv.master.display_name else None
                variants.append(VariantRef(id=mv.id, role=mv.role, display_name=disp))

    return schemas.ParamSyncGroupRead(
        id=group.id,
        workflow_id=group.workflow_id,
        name=group.name,
        master_variant_id=master_vid,
        slave_variant_ids=slave_vids,
        master_role=master_role,
        slave_roles=slave_roles,
        is_enabled=group.is_enabled,
        created_at=group.created_at,
        variants=variants,
    )


@router.get("/api/workflows/{workflow_id}/param-sync-groups", response_model=list[schemas.ParamSyncGroupRead])
def list_param_sync_groups(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    groups = db.query(models.ParamSyncGroup).filter(models.ParamSyncGroup.workflow_id == workflow_id).all()
    if not groups:
        return []

    index = VariantIndex.from_session(db)
    vids: set[int] = set()
    for g in groups:
        if g.master_variant_id is not None:
            vids.add(g.master_variant_id)
        for m in g.members:
            vids.add(m.variant_id)

    variant_map: dict[int, models.MappingVariant] = {}
    if vids:
        rows = (
            db.query(models.MappingVariant)
            .options(joinedload(models.MappingVariant.master))
            .filter(models.MappingVariant.id.in_(vids))
            .all()
        )
        variant_map = {v.id: v for v in rows}

    return [_group_to_schema(g, db=db, index=index, variant_map=variant_map) for g in groups]


@router.post("/api/workflows/{workflow_id}/param-sync-groups", response_model=schemas.ParamSyncGroupRead, status_code=status.HTTP_201_CREATED)
def create_param_sync_group(workflow_id: int, payload: schemas.ParamSyncGroupCreate, db: Session = Depends(get_db)):
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=422, detail="Group name must not be empty")

    index = VariantIndex.from_session(db)

    # Master resolution
    if payload.master_variant_id is not None:
        role = index.role_of(payload.master_variant_id)
        if role is None:
            raise HTTPException(status_code=422, detail=f"Unknown master_variant_id: {payload.master_variant_id}")
        resolved_master_id = payload.master_variant_id
    elif payload.master_role and payload.master_role.strip():
        ck = index.classify(payload.master_role.strip())
        if ck.kind != KeyKind.ROLE or ck.variant_id is None:
            raise HTTPException(status_code=422, detail=f"Unknown master_role: {payload.master_role}")
        resolved_master_id = ck.variant_id
    else:
        raise HTTPException(status_code=422, detail="master_variant_id or master_role is required")

    master_role_name = index.role_of(resolved_master_id) or ""

    # Slave resolution
    resolved_slave_ids: list[int] = []
    seen: set[int] = {resolved_master_id}
    if payload.slave_variant_ids is not None:
        for vid in payload.slave_variant_ids:
            if index.role_of(vid) is None:
                raise HTTPException(status_code=422, detail=f"Unknown slave_variant_id: {vid}")
            if vid not in seen:
                seen.add(vid)
                resolved_slave_ids.append(vid)
    elif payload.slave_roles is not None:
        for r in payload.slave_roles:
            ck = index.classify(r)
            if ck.kind != KeyKind.ROLE or ck.variant_id is None:
                raise HTTPException(status_code=422, detail=f"Unknown slave role: {r}")
            vid = ck.variant_id
            if vid not in seen:
                seen.add(vid)
                resolved_slave_ids.append(vid)

    group = models.ParamSyncGroup(
        workflow_id=workflow_id,
        name=payload.name.strip(),
        master_role=master_role_name,
        slave_roles="[]",
        master_variant_id=resolved_master_id,
        is_enabled=payload.is_enabled,
    )
    group.members = [models.ParamSyncGroupMember(variant_id=vid) for vid in resolved_slave_ids]
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_to_schema(group, db=db, index=index)


@router.put("/api/param-sync-groups/{group_id}", response_model=schemas.ParamSyncGroupRead)
def update_param_sync_group(group_id: int, payload: schemas.ParamSyncGroupUpdate, db: Session = Depends(get_db)):
    group = db.query(models.ParamSyncGroup).filter(models.ParamSyncGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Param sync group not found")

    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=422, detail="Group name must not be empty")
        group.name = payload.name.strip()

    if payload.is_enabled is not None:
        group.is_enabled = payload.is_enabled

    index = VariantIndex.from_session(db)

    resolved_master_id: Optional[int] = None
    # Master resolution if requested
    if payload.master_variant_id is not None or payload.master_role is not None:
        if payload.master_variant_id is not None:
            role = index.role_of(payload.master_variant_id)
            if role is None:
                raise HTTPException(status_code=422, detail=f"Unknown master_variant_id: {payload.master_variant_id}")
            master_id = payload.master_variant_id
        elif payload.master_role and payload.master_role.strip():
            ck = index.classify(payload.master_role.strip())
            if ck.kind != KeyKind.ROLE or ck.variant_id is None:
                raise HTTPException(status_code=422, detail=f"Unknown master_role: {payload.master_role}")
            master_id = ck.variant_id
        else:
            raise HTTPException(status_code=422, detail="Invalid master variant or role")

        resolved_master_id = master_id
        group.master_variant_id = master_id
        group.master_role = index.role_of(master_id) or ""
    else:
        resolved_master_id = group.master_variant_id

    # Slave resolution if requested
    if payload.slave_variant_ids is not None or payload.slave_roles is not None:
        resolved_slave_ids: list[int] = []
        seen: set[int] = {resolved_master_id} if resolved_master_id is not None else set()
        if payload.slave_variant_ids is not None:
            for vid in payload.slave_variant_ids:
                if index.role_of(vid) is None:
                    raise HTTPException(status_code=422, detail=f"Unknown slave_variant_id: {vid}")
                if vid not in seen:
                    seen.add(vid)
                    resolved_slave_ids.append(vid)
        else:
            for r in (payload.slave_roles or []):
                ck = index.classify(r)
                if ck.kind != KeyKind.ROLE or ck.variant_id is None:
                    raise HTTPException(status_code=422, detail=f"Unknown slave role: {r}")
                vid = ck.variant_id
                if vid not in seen:
                    seen.add(vid)
                    resolved_slave_ids.append(vid)

        # Flush before re-adding on PUT
        group.members.clear()
        db.flush()
        for vid in resolved_slave_ids:
            group.members.append(models.ParamSyncGroupMember(variant_id=vid))
        group.slave_roles = "[]"

    db.commit()
    db.refresh(group)
    return _group_to_schema(group, db=db, index=index)


@router.delete("/api/param-sync-groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_param_sync_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(models.ParamSyncGroup).filter(models.ParamSyncGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Param sync group not found")
    db.delete(group)
    db.commit()

