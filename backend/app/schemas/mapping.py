"""Pydantic schemas for StageMaster and mapping cascade operations."""
import json
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class StageMasterBase(BaseModel):
    key: str
    name: str
    suffix: str = ""
    search_keywords: Optional[List[str]] = None
    is_active: bool = True
    sort_order: int = 0


class StageMasterCreate(StageMasterBase):
    is_builtin: bool = False


class StageMasterUpdate(BaseModel):
    name: Optional[str] = None
    suffix: Optional[str] = None
    search_keywords: Optional[List[str]] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class StageMasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    name: str
    suffix: str
    search_keywords: Optional[List[str]] = None
    previous_suffixes: Optional[List[str]] = None
    is_builtin: bool
    is_active: bool
    sort_order: int

    @field_validator("search_keywords", "previous_suffixes", mode="before")
    @classmethod
    def parse_json_fields(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
                return []
            except Exception:
                return []
        return v


class StageMasterReorder(BaseModel):
    ordered_ids: List[int]


class CascadePreviewResponse(BaseModel):
    stage_id: int
    old_suffix: str
    new_suffix: str
    affected_variants_count: int
    affected_presets_count: int
    affected_snapshots_count: int
    role_diffs: List[dict]  # [{"old_role": "...", "new_role": "..."}]


class CascadeRenameRequest(BaseModel):
    new_suffix: str
    update_presets: bool = True
    update_snapshots: bool = True
