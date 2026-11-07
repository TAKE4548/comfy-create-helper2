from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.variant_ref import VariantRef


class ParamSyncGroupBase(BaseModel):
    name: str
    master_role: Optional[str] = None
    slave_roles: Optional[List[str]] = None
    is_enabled: bool = False


class ParamSyncGroupCreate(BaseModel):
    name: str
    master_variant_id: Optional[int] = None
    slave_variant_ids: Optional[List[int]] = None
    master_role: Optional[str] = None
    slave_roles: Optional[List[str]] = None
    is_enabled: bool = False


class ParamSyncGroupUpdate(BaseModel):
    name: Optional[str] = None
    master_variant_id: Optional[int] = None
    slave_variant_ids: Optional[List[int]] = None
    master_role: Optional[str] = None
    slave_roles: Optional[List[str]] = None
    is_enabled: Optional[bool] = None


class ParamSyncGroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workflow_id: int
    name: str
    master_variant_id: Optional[int] = None
    slave_variant_ids: List[int] = Field(default_factory=list)
    master_role: str = ""
    slave_roles: List[str] = Field(default_factory=list)
    is_enabled: bool = False
    created_at: datetime
    variants: List[VariantRef] = Field(default_factory=list)


ParamSyncGroup = ParamSyncGroupRead

__all__ = [
    "ParamSyncGroupBase",
    "ParamSyncGroupCreate",
    "ParamSyncGroupUpdate",
    "ParamSyncGroupRead",
    "ParamSyncGroup",
]

