"""Pydantic schemas for StageMaster and mapping cascade operations."""
import json
from typing import Any, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator


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


# ─── Binding Rules ───────────────────────────────────────────────

class BindingRuleEntryBase(BaseModel):
    class_type: str
    param_name: str
    priority: int = 1


class BindingRuleEntryCreate(BindingRuleEntryBase):
    pass


class BindingRuleEntryRead(BindingRuleEntryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_set_id: int


class BindingRuleSetBase(BaseModel):
    name: str


class BindingRuleSetCreate(BindingRuleSetBase):
    entries: List[BindingRuleEntryCreate] = Field(default_factory=list)


class BindingRuleSetUpdate(BaseModel):
    name: Optional[str] = None
    entries: Optional[List[BindingRuleEntryCreate]] = None


class BindingRuleSetRead(BindingRuleSetBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entries: List[BindingRuleEntryRead] = Field(default_factory=list)
    referenced_roles: List[str] = Field(default_factory=list)


# ─── Node Selectors ──────────────────────────────────────────────

class NodeSelectorPatternBase(BaseModel):
    pattern: str
    match_type: str = "contains"
    priority: int = 1


class NodeSelectorPatternCreate(NodeSelectorPatternBase):
    pass


class NodeSelectorPatternRead(NodeSelectorPatternBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    selector_id: int


class NodeSelectorBase(BaseModel):
    name: str


class NodeSelectorCreate(NodeSelectorBase):
    patterns: List[NodeSelectorPatternCreate] = Field(default_factory=list)


class NodeSelectorUpdate(BaseModel):
    name: Optional[str] = None
    patterns: Optional[List[NodeSelectorPatternCreate]] = None


class NodeSelectorRead(NodeSelectorBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patterns: List[NodeSelectorPatternRead] = Field(default_factory=list)
    referenced_roles: List[str] = Field(default_factory=list)


# ─── Atomic master save (REQ-419) ────────────────────────────────

class AtomicEntryInput(BaseModel):
    class_type: str
    param_name: str
    priority: int = 1


class AtomicPatternInput(BaseModel):
    pattern: str
    match_type: Literal["exact", "contains"]
    priority: int = 1


class DefinitionOp(BaseModel):
    ref: str
    op: Literal["create", "update"]
    id: Optional[int] = None
    name: str
    entries: Optional[List[AtomicEntryInput]] = None
    patterns: Optional[List[AtomicPatternInput]] = None


class DefinitionRef(BaseModel):
    id: Optional[int] = None
    ref: Optional[str] = None

    @model_validator(mode="after")
    def exactly_one_of_id_and_ref(self) -> "DefinitionRef":
        if (self.id is None) == (self.ref is None):
            raise ValueError("exactly one of id and ref must be provided")
        return self


class AtomicVariantItem(BaseModel):
    row_key: str
    id: Optional[int] = None
    stage_id: int
    is_enabled: bool = True
    rule_set: DefinitionRef
    selector: Optional[DefinitionRef] = None


class AtomicMasterFields(BaseModel):
    name: str
    input_type: str
    group_id: Optional[int] = None
    default_enabled: StrictBool


class MasterAtomicSaveRequest(BaseModel):
    master: AtomicMasterFields
    rule_sets: List[DefinitionOp] = Field(default_factory=list)
    selectors: List[DefinitionOp] = Field(default_factory=list)
    variants: List[AtomicVariantItem] = Field(default_factory=list)


# ─── Scan preview (REQ-419) ──────────────────────────────────────

class ScanPreviewVariantInput(BaseModel):
    client_key: str
    variant_id: Optional[int] = None
    stage_id: int
    role: str
    is_enabled: bool = True
    entries: List[AtomicEntryInput] = Field(default_factory=list)
    patterns: Optional[List[AtomicPatternInput]] = None


class ScanPreviewRequest(BaseModel):
    workflow_id: int
    variants: List[ScanPreviewVariantInput] = Field(min_length=1)


class ScanPreviewCandidate(BaseModel):
    node_id: str
    node_title: str
    class_type: str
    input_name: str
    stage_rank: int
    stage_label: Literal["exact", "contains", "no_selector"]
    entry_priority: int
    pattern_priority: int


class ScanPreviewVariantResult(BaseModel):
    client_key: str
    variant_id: Optional[int] = None
    stage_id: int
    stage_key: str
    role: str
    is_enabled: bool
    status: Literal["ok", "duplicated", "not_found", "disabled"]
    confirmed: Optional[ScanPreviewCandidate] = None
    candidates: List[ScanPreviewCandidate] = Field(default_factory=list)


class ScanPreviewResponse(BaseModel):
    workflow_id: int
    results: List[ScanPreviewVariantResult]
