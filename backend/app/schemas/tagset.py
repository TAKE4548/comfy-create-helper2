"""TagSet Pydantic schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


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
    snapshot_paths: list[str] = []
    created_at: datetime
