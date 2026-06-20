"""Public re-export of all Pydantic schemas.

Import from this package to avoid breaking changes across routers:
    from app.schemas import WorkflowRead, SnapshotCreate, ...
"""

from app.schemas.workflow import (
    MappingMasterBase,
    MappingMasterCreate,
    MappingMasterRead,
    WorkflowMappingRead,
    WorkflowMappingCreate,
    WorkflowCreate,
    WorkflowSummary,
    WorkflowRead,
    WorkflowUpdate,
    WorkflowScanRequest,
    ScanMatchedItem,
    ScanWarningItem,
    ScanResult,
)

from app.schemas.snapshot import (
    SnapshotLoraCreate,
    SnapshotLoraRead,
    SnapshotTagSetCreate,
    SnapshotTagSetRead,
    SnapshotCreate,
    SnapshotRead,
    SnapshotSummary,
    AlbumCreate,
    AlbumOrderUpdate,
    AlbumItemRead,
    AlbumRead,
    AlbumSummary,
    AlbumItemsDelete,
    AlbumItemsAdd,
)

from app.schemas.lora import (
    CategoryCreate,
    CategoryRead,
    TriggerWordSetCreate,
    TriggerWordSetRead,
    LoraCreate,
    LoraRead,
    ComfyLoraModel,
)

from app.schemas.tagset import (
    TagSetCreate,
    TagSetRead,
)

from app.schemas.audit import (
    AuditRequest,
    InterferenceItem,
    VocabularyItem,
    PhysicalResult,
    AuditResult,
    LlmPromptUpdate,
    LlmPromptRead,
)

from app.schemas.preset import (
    WorkflowPresetBase,
    WorkflowPresetCreate,
    WorkflowPresetRead,
    WorkflowPresetUpdate,
)

__all__ = [
    # Workflow
    "MappingMasterBase", "MappingMasterCreate", "MappingMasterRead",
    "WorkflowMappingRead", "WorkflowMappingCreate",
    "WorkflowCreate", "WorkflowSummary", "WorkflowRead", "WorkflowUpdate",
    "WorkflowScanRequest", "ScanMatchedItem", "ScanWarningItem", "ScanResult",
    # Snapshot / Album
    "SnapshotLoraCreate", "SnapshotLoraRead",
    "SnapshotTagSetCreate", "SnapshotTagSetRead",
    "SnapshotCreate", "SnapshotRead", "SnapshotSummary",
    "AlbumCreate", "AlbumOrderUpdate", "AlbumItemRead", "AlbumRead", "AlbumSummary",
    "AlbumItemsDelete", "AlbumItemsAdd",
    # LoRA
    "CategoryCreate", "CategoryRead",
    "TriggerWordSetCreate", "TriggerWordSetRead",
    "LoraCreate", "LoraRead", "ComfyLoraModel",
    # TagSet
    "TagSetCreate", "TagSetRead",
    # Audit
    "AuditRequest", "InterferenceItem", "VocabularyItem", "PhysicalResult", "AuditResult",
    "LlmPromptUpdate", "LlmPromptRead",
    # Preset
    "WorkflowPresetBase", "WorkflowPresetCreate", "WorkflowPresetRead", "WorkflowPresetUpdate",
]
