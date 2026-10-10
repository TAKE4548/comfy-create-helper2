"""LoRA and TriggerWordSet Pydantic schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator


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
    target_base_model_ids: list[int] = []
    example_paths: list[str] | None = None

    @field_validator("example_paths")
    @classmethod
    def validate_example_paths(cls, paths: list[str] | None) -> list[str] | None:
        if paths is None:
            return None
        if any(not path.strip() or path.strip().lower().startswith("data:") for path in paths):
            raise ValueError("example_paths must contain non-empty local file paths")
        return paths


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
    example_paths: list[str] = []
    target_base_model_ids: list[int] = []
    sort_order: int = 0
    created_at: datetime


class ComfyLoraModel(BaseModel):
    model_name: str
    file_path: str
    is_registered: bool
    lora_id: Optional[int] = None


class LoraReorder(BaseModel):
    category_id: Optional[int] = None
    ordered_ids: list[int]

