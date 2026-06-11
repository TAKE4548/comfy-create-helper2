"""Pydantic schemas for all API request/response models."""

from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict


# ─────────────────────────────────────
# MappingMaster
# ─────────────────────────────────────
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


# ─────────────────────────────────────
# WorkflowMapping
# ─────────────────────────────────────
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


# ─────────────────────────────────────
# Workflow
# ─────────────────────────────────────
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
    created_at: datetime


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    json_body: Optional[dict[str, Any]] = None
    mappings: Optional[list[WorkflowMappingCreate]] = None



# ─────────────────────────────────────
# Workflow Scan
# ─────────────────────────────────────
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


# ─────────────────────────────────────
# Snapshot
# ─────────────────────────────────────
class SnapshotLoraCreate(BaseModel):
    lora_id: int
    strength: float


class SnapshotLoraRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    snapshot_id: int
    lora_id: int
    strength: float


class SnapshotTagSetCreate(BaseModel):
    tag_set_id: int


class SnapshotTagSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    snapshot_id: int
    tag_set_id: int


class SnapshotCreate(BaseModel):
    workflow_id: int
    image_path: Optional[str] = None
    params: dict[str, Any]
    album_id: Optional[int] = None
    new_album_name: Optional[str] = None
    loras: list[SnapshotLoraCreate] = []
    tag_sets: list[SnapshotTagSetCreate] = []


class SnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workflow_id: int
    params: dict[str, Any]
    image_path: Optional[str] = None
    created_at: datetime
    loras: list[SnapshotLoraRead] = []
    tag_sets: list[SnapshotTagSetRead] = []


class SnapshotSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workflow_id: int
    image_path: Optional[str] = None
    created_at: datetime
    params: Optional[dict[str, Any]] = None


# ─────────────────────────────────────
# Album
# ─────────────────────────────────────
class AlbumCreate(BaseModel):
    name: str
    snapshot_ids: list[int] = []


class AlbumOrderUpdate(BaseModel):
    snapshot_ids: list[int]


class AlbumItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    snapshot_id: int
    sequence_order: int
    image_path: Optional[str] = None


class AlbumRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: datetime
    items: list[AlbumItemRead] = []


class AlbumSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: datetime


# ─────────────────────────────────────
# Category (LoRA & Tagset)
# ─────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


# ─────────────────────────────────────
# LoRA
# ─────────────────────────────────────
class TriggerWordSetCreate(BaseModel):
    name: str
    words: list[str]


class TriggerWordSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    words: list[str]


class LoraCreate(BaseModel):
    model_name: str
    description: Optional[str] = None
    recommended_strength_min: Optional[float] = None
    recommended_strength_max: Optional[float] = None
    category_id: Optional[int] = None
    thumbnail_path: Optional[str] = None
    file_path: Optional[str] = None
    trigger_word_sets: list[TriggerWordSetCreate] = []


class LoraRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    model_name: str
    description: Optional[str] = None
    recommended_strength_min: Optional[float] = None
    recommended_strength_max: Optional[float] = None
    category_id: Optional[int] = None
    thumbnail_path: Optional[str] = None
    file_path: Optional[str] = None
    trigger_word_sets: list[TriggerWordSetRead] = []
    created_at: datetime


# ─────────────────────────────────────
# TagSet
# ─────────────────────────────────────
class TagSetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    tags: list[str]


class TagSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    tags: list[str]
    created_at: datetime


# ─────────────────────────────────────
# LLM Audit
# ─────────────────────────────────────
class AuditRequest(BaseModel):
    audit_types: list[str]  # interference / vocabulary / physical
    positive: str
    negative: str = ""
    intent: str = ""
    model_hint: str = "SDXL"


class InterferenceItem(BaseModel):
    tag: str
    reason: str


class VocabularyItem(BaseModel):
    suggestion: str
    effect: str


class PhysicalResult(BaseModel):
    status: str  # ok / warning / conflict
    note: Optional[str] = None
    alternatives: list[str] = []


class AuditResult(BaseModel):
    interference: Optional[list[InterferenceItem]] = None
    vocabulary: Optional[list[VocabularyItem]] = None
    physical: Optional[PhysicalResult] = None


# ─────────────────────────────────────
# LLM System Prompt
# ─────────────────────────────────────
class LlmPromptUpdate(BaseModel):
    content: str
    description: Optional[str] = None


class LlmPromptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    key: str
    content: str
    description: Optional[str] = None
    updated_at: datetime
