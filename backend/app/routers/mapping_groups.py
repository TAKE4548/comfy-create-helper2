"""Mapping groups router for REQ-336."""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

router = APIRouter(prefix="/api/mapping-groups", tags=["mapping-groups"])


class MappingGroupMasterCreate(BaseModel):
    key: str
    name: str
    sort_order: int = 0
    is_active: bool = True


class MappingGroupMasterUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class MappingGroupMasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    key: str
    name: str
    sort_order: int
    is_builtin: bool
    is_active: bool
    master_count: int = 0


class MappingGroupReorder(BaseModel):
    ordered_ids: list[int]


@router.get("", response_model=list[MappingGroupMasterRead])
def list_mapping_groups(include_inactive: bool = True, db: Session = Depends(get_db)):
    query = db.query(models.MappingGroupMaster)
    if not include_inactive:
        query = query.filter(models.MappingGroupMaster.is_active == True)
    groups = query.order_by(models.MappingGroupMaster.sort_order).all()

    result = []
    for g in groups:
        count = db.query(models.MappingMaster).filter(models.MappingMaster.group_id == g.id).count()
        item = MappingGroupMasterRead(
            id=g.id,
            key=g.key,
            name=g.name,
            sort_order=g.sort_order,
            is_builtin=g.is_builtin,
            is_active=g.is_active,
            master_count=count,
        )
        result.append(item)
    return result


@router.post("", response_model=MappingGroupMasterRead, status_code=status.HTTP_201_CREATED)
def create_mapping_group(payload: MappingGroupMasterCreate, db: Session = Depends(get_db)):
    existing = db.query(models.MappingGroupMaster).filter(models.MappingGroupMaster.key == payload.key).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"グループキー '{payload.key}' は既に存在します",
        )

    sort_order = payload.sort_order
    if sort_order == 0:
        max_order = db.query(models.MappingGroupMaster).order_by(models.MappingGroupMaster.sort_order.desc()).first()
        sort_order = (max_order.sort_order + 1) if max_order else 0

    group = models.MappingGroupMaster(
        key=payload.key,
        name=payload.name,
        sort_order=sort_order,
        is_builtin=False,
        is_active=payload.is_active,
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    return MappingGroupMasterRead(
        id=group.id,
        key=group.key,
        name=group.name,
        sort_order=group.sort_order,
        is_builtin=group.is_builtin,
        is_active=group.is_active,
        master_count=0,
    )


@router.put("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_mapping_groups(payload: MappingGroupReorder, db: Session = Depends(get_db)):
    for idx, group_id in enumerate(payload.ordered_ids):
        db.query(models.MappingGroupMaster).filter(
            models.MappingGroupMaster.id == group_id
        ).update({"sort_order": idx})
    db.commit()


@router.get("/{group_id}", response_model=MappingGroupMasterRead)
def get_mapping_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(models.MappingGroupMaster).filter(models.MappingGroupMaster.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MappingGroup not found")

    count = db.query(models.MappingMaster).filter(models.MappingMaster.group_id == group.id).count()
    return MappingGroupMasterRead(
        id=group.id,
        key=group.key,
        name=group.name,
        sort_order=group.sort_order,
        is_builtin=group.is_builtin,
        is_active=group.is_active,
        master_count=count,
    )


@router.put("/{group_id}", response_model=MappingGroupMasterRead)
def update_mapping_group(group_id: int, payload: MappingGroupMasterUpdate, db: Session = Depends(get_db)):
    group = db.query(models.MappingGroupMaster).filter(models.MappingGroupMaster.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MappingGroup not found")

    if payload.name is not None:
        group.name = payload.name
    if payload.sort_order is not None:
        group.sort_order = payload.sort_order
    if payload.is_active is not None:
        group.is_active = payload.is_active

    db.commit()
    db.refresh(group)

    count = db.query(models.MappingMaster).filter(models.MappingMaster.group_id == group.id).count()
    return MappingGroupMasterRead(
        id=group.id,
        key=group.key,
        name=group.name,
        sort_order=group.sort_order,
        is_builtin=group.is_builtin,
        is_active=group.is_active,
        master_count=count,
    )


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mapping_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(models.MappingGroupMaster).filter(models.MappingGroupMaster.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MappingGroup not found")

    # 1. システム既定保護 (is_builtin == True)
    if group.is_builtin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="システム既定のグループは削除できません",
        )

    # 2. 参照中保護 (usage_count > 0)
    usage_count = db.query(models.MappingMaster).filter(models.MappingMaster.group_id == group.id).count()
    if usage_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"現在{usage_count}件のマスターで使用中のため削除できません",
        )

    db.delete(group)
    db.commit()