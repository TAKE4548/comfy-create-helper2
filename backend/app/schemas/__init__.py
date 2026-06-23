"""Public re-export of all Pydantic schemas.

Import from this package to avoid breaking changes across routers:
    from app.schemas import WorkflowRead, SnapshotCreate, ...
"""

from app.schemas.workflow import (
    MappingMasterBase,
    MappingMasterCreate,
    MappingMasterRead,
    MappingMasterReorder,
    WorkflowMappingRead,
    WorkflowMappingCreate,
    WorkflowCreate,
    WorkflowSummary,
    WorkflowRead,
    WorkflowUpdate,
    WorkflowCopyRequest,
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
    SnapshotUpdate,
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
    LoraReorder,
)

from app.schemas.tagset import (
    TagSetCreate,
    TagSetRead,
    TagSetReorder,
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
    WorkflowPresetReorder,
)

__all__ = [
    # Workflow
    "MappingMasterBase", "MappingMasterCreate", "MappingMasterRead", "MappingMasterReorder",
    "WorkflowMappingRead", "WorkflowMappingCreate",
    "WorkflowCreate", "WorkflowSummary", "WorkflowRead", "WorkflowUpdate", "WorkflowCopyRequest",
    "WorkflowScanRequest", "ScanMatchedItem", "ScanWarningItem", "ScanResult",
    # Snapshot / Album
    "SnapshotLoraCreate", "SnapshotLoraRead",
    "SnapshotTagSetCreate", "SnapshotTagSetRead",
    "SnapshotCreate", "SnapshotRead", "SnapshotUpdate", "SnapshotSummary",
    "AlbumCreate", "AlbumOrderUpdate", "AlbumItemRead", "AlbumRead", "AlbumSummary",
    "AlbumItemsDelete", "AlbumItemsAdd",
    # LoRA
    "CategoryCreate", "CategoryRead",
    "TriggerWordSetCreate", "TriggerWordSetRead",
    "LoraCreate", "LoraRead", "ComfyLoraModel", "LoraReorder",
    # TagSet
    "TagSetCreate", "TagSetRead", "TagSetReorder",
    # Audit
    "AuditRequest", "InterferenceItem", "VocabularyItem", "PhysicalResult", "AuditResult",
    "LlmPromptUpdate", "LlmPromptRead",
    # Preset
    "WorkflowPresetBase", "WorkflowPresetCreate", "WorkflowPresetRead", "WorkflowPresetUpdate", "WorkflowPresetReorder",
]
