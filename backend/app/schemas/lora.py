"""LoRA and TriggerWordSet Pydantic schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ─── Category (shared) ───────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    sort_order: int = 0


# ─── TriggerWordSet ──────────────────────────────────────────────

class TriggerWordSetCreate(BaseModel):
    name: str
    words: list[str]


class TriggerWordSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    words: list[str]


# ─── LoRA ─────────────────────────────────────────────────────────

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
    snapshot_paths: list[str] = []
    sort_order: int = 0
    created_at: datetime


class ComfyLoraModel(BaseModel):
    model_name: str
    file_path: str
    is_registered: bool
    lora_id: Optional[int] = None


class LoraReorder(BaseModel):
    ordered_ids: list[int]

