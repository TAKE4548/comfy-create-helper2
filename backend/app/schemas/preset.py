"""Preset Pydantic schemas."""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.variant_ref import VariantRef


class WorkflowPresetBase(BaseModel):
    workflow_id: int
    name: str
    param_values: dict[str, str] = Field(default_factory=dict)
    applied_assets: dict[str, list[Any]] = Field(default_factory=dict)
    batch_size: int
    seed_mode: str
    seed: int
    sort_order: int = 0


class WorkflowPresetCreate(WorkflowPresetBase):
    pass


class WorkflowPresetUpdate(BaseModel):
    name: Optional[str] = None
    param_values: Optional[dict[str, str]] = None
    applied_assets: Optional[dict[str, list[Any]]] = None
    batch_size: Optional[int] = None
    seed_mode: Optional[str] = None
    seed: Optional[int] = None
    base_updated_at: Optional[datetime] = None


class WorkflowPresetRead(WorkflowPresetBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime
    variant_param_values: dict[str, str] = Field(default_factory=dict)
    variants: list[VariantRef] = Field(default_factory=list)


WorkflowPreset = WorkflowPresetRead


class WorkflowPresetReorder(BaseModel):
    ordered_ids: list[int]


class WorkflowPresetBulkDelete(BaseModel):
    ids: list[int]
