from datetime import datetime
import json
from typing import Any, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class PromptTemplateBlockSchema(BaseModel):
    id: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    description: str = ""
    default_value: str = ""


class PromptTemplateSectionSchema(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    is_repeatable: bool = False
    blocks: List[PromptTemplateBlockSchema] = Field(default_factory=list)


class PromptTemplateStructureSchema(BaseModel):
    sections: List[PromptTemplateSectionSchema] = Field(default_factory=list)


class PromptRepeatFilterSchema(BaseModel):
    mode: Literal["all", "index"] = "all"
    index: Optional[int] = Field(default=None, ge=1)


class PromptOutputGroupSchema(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    target_role: str = Field(..., min_length=1)
    block_ids: List[str] = Field(default_factory=list)
    repeat_filter: PromptRepeatFilterSchema = Field(default_factory=PromptRepeatFilterSchema)


class WorkflowPromptTemplateConfigSchema(BaseModel):
    template_id: Optional[int] = None
    template_snapshot: Optional[PromptTemplateStructureSchema] = None
    output_groups: List[PromptOutputGroupSchema] = Field(default_factory=list)


class PromptTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    structure: PromptTemplateStructureSchema = Field(default_factory=PromptTemplateStructureSchema)
    sort_order: int = 0


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    structure: Optional[PromptTemplateStructureSchema] = None
    sort_order: Optional[int] = None


class PromptTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str = ""
    structure: PromptTemplateStructureSchema = Field(default_factory=PromptTemplateStructureSchema)
    is_builtin: bool = False
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def populate_structure(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "structure" not in data and "structure_json" in data:
                raw = data.get("structure_json")
                if isinstance(raw, str) and raw.strip():
                    try:
                        data["structure"] = json.loads(raw)
                    except Exception:
                        data["structure"] = {}
                else:
                    data["structure"] = raw or {}
            return data
        if hasattr(data, "structure_json"):
            raw_struct = getattr(data, "structure_json", None)
            struct_data = {}
            if isinstance(raw_struct, str) and raw_struct.strip():
                try:
                    struct_data = json.loads(raw_struct)
                except Exception:
                    struct_data = {}
            elif isinstance(raw_struct, dict):
                struct_data = raw_struct
            return {
                "id": getattr(data, "id"),
                "name": getattr(data, "name"),
                "description": getattr(data, "description", "") or "",
                "structure": struct_data,
                "is_builtin": bool(getattr(data, "is_builtin", False)),
                "sort_order": getattr(data, "sort_order", 0),
                "created_at": getattr(data, "created_at"),
                "updated_at": getattr(data, "updated_at"),
            }
        return data

