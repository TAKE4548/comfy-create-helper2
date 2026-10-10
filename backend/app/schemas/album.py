"""Album Pydantic schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class AlbumCreate(BaseModel):
    name: str
    snapshot_ids: list[int] = []
    description: Optional[str] = None


class AlbumUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    description: Optional[str] = None


class AlbumReorder(BaseModel):
    ordered_ids: list[int]


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
    sort_order: int = 0
    created_at: datetime
    description: Optional[str] = None
    items: list[AlbumItemRead] = []


class AlbumSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    sort_order: int = 0
    created_at: datetime
    description: Optional[str] = None
