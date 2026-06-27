"""TagSet Pydantic schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class TagSubsetCreate(BaseModel):
    name: str
    tags: list[str]


class TagSubsetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tag_set_id: int
    name: str
    tags: list[str]


class TagSetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    tags: list[str]
    thumbnail_path: Optional[str] = None
    subsets: list[TagSubsetCreate] = []


class TagSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    tags: list[str]
    thumbnail_path: Optional[str] = None
    snapshot_paths: list[str] = []
    sort_order: int = 0
    created_at: datetime
    subsets: list[TagSubsetRead] = []


class TagSetReorder(BaseModel):
    ordered_ids: list[int]
