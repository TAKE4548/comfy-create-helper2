"""Snapshot and Album Pydantic schemas."""

from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict


# ─── Snapshot ────────────────────────────────────────────────────

class SnapshotLoraCreate(BaseModel):
    lora_id: int
    strength: float
    role: str = "positive"


class SnapshotLoraRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    snapshot_id: int
    lora_id: int
    strength: float
    role: str


class SnapshotTagSetCreate(BaseModel):
    tag_set_id: int
    role: str = "positive"


class SnapshotTagSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    snapshot_id: int
    tag_set_id: int
    role: str


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


class SnapshotUpdate(BaseModel):
    lora_ids: list[int] = []
    tag_set_ids: list[int] = []



class SnapshotSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workflow_id: int
    image_path: Optional[str] = None
    created_at: datetime
    params: Optional[dict[str, Any]] = None


# ─── Album ───────────────────────────────────────────────────────

class AlbumCreate(BaseModel):
    name: str
    snapshot_ids: list[int] = []


class AlbumOrderUpdate(BaseModel):
    snapshot_ids: list[int]


class AlbumItemsDelete(BaseModel):
    snapshot_ids: list[int]


class AlbumItemsAdd(BaseModel):
    snapshot_ids: list[int]


class AlbumItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    snapshot_id: int
    sequence_order: int
    image_path: Optional[str] = None
    created_at: Optional[datetime] = None


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
