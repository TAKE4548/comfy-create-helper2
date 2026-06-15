"""Workflow and MappingMaster Pydantic schemas."""

from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict


# ─── MappingMaster ────────────────────────────────────────────────

class MappingMasterBase(BaseModel):
    role: str
    expected_class_types: Optional[list[str]] = None
    param_name: str
    input_type: str
    display_name: str
    title_patterns: Optional[list[str]] = None


class MappingMasterCreate(MappingMasterBase):
    pass


class MappingMasterRead(MappingMasterBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ─── WorkflowMapping ─────────────────────────────────────────────

class WorkflowMappingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    master_id: int
    node_id: str
    role: Optional[str] = None
    param_name: Optional[str] = None
    input_type: Optional[str] = None
    display_name: Optional[str] = None


class WorkflowMappingCreate(BaseModel):
    master_id: int
    node_id: str


# ─── Workflow ────────────────────────────────────────────────────

class WorkflowCreate(BaseModel):
    name: str
    json_body: dict[str, Any]
    mappings: list[WorkflowMappingCreate] = []


class WorkflowSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: datetime


class WorkflowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    json_body: dict[str, Any]
    mappings: list[WorkflowMappingRead] = []
    default_applied_assets: Optional[str] = None
    created_at: datetime


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    json_body: Optional[dict[str, Any]] = None
    mappings: Optional[list[WorkflowMappingCreate]] = None
    default_applied_assets: Optional[str] = None


# ─── Workflow Scan ────────────────────────────────────────────────

class WorkflowScanRequest(BaseModel):
    json_body: dict[str, Any]


class ScanMatchedItem(BaseModel):
    master_id: int
    role: str
    node_id: str
    node_title: str
    status: str = "ok"


class ScanWarningItem(BaseModel):
    master_id: int
    role: str
    status: str  # not_found / duplicated / class_type_mismatch
    node_ids: Optional[list[str]] = None
    node_id: Optional[str] = None
    actual_class_type: Optional[str] = None


class ScanResult(BaseModel):
    matched: list[ScanMatchedItem]
    warnings: list[ScanWarningItem]
