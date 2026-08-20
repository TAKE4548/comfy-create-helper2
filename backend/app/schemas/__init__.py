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
)

from app.schemas.album import (
    AlbumCreate,
    AlbumUpdate,
    AlbumReorder,
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

from app.schemas.tag_set import (
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
    SceneItem,
    SceneGenerateRequest,
    SceneDiffParams,
)

from app.schemas.preset import (
    WorkflowPresetBase,
    WorkflowPresetCreate,
    WorkflowPresetRead,
    WorkflowPresetUpdate,
    WorkflowPresetReorder,
    WorkflowPresetBulkDelete,
)

from app.schemas.bypass_profile import (
    BypassProfileCreate,
    BypassProfileUpdate,
    BypassProfileRead,
)

from app.schemas.base_model import (
    BaseModelCreate,
    BaseModelRead,
    CheckpointMappingCreate,
    CheckpointMappingRead,
)

from app.schemas.param_type import (
    ParamTypeMasterBase,
    ParamTypeMasterCreate,
    ParamTypeMasterRead,
)

from app.schemas.param_sync_groups import (
    ParamSyncGroupBase,
    ParamSyncGroupCreate,
    ParamSyncGroupUpdate,
    ParamSyncGroupRead,
)

from app.schemas.speech_bubble_preset import (
    SpeechBubblePresetBase,
    SpeechBubblePresetCreate,
    SpeechBubblePresetUpdate,
    SpeechBubblePresetRead,
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
    "AlbumCreate", "AlbumUpdate", "AlbumReorder", "AlbumOrderUpdate", "AlbumItemRead", "AlbumRead", "AlbumSummary",
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
    "SceneItem", "SceneGenerateRequest", "SceneDiffParams",
    # Preset
    "WorkflowPresetBase", "WorkflowPresetCreate", "WorkflowPresetRead", "WorkflowPresetUpdate",
    "WorkflowPresetReorder", "WorkflowPresetBulkDelete",
    # BypassProfile
    "BypassProfileCreate", "BypassProfileUpdate", "BypassProfileRead",
    # BaseModel / CheckpointMapping
    "BaseModelCreate", "BaseModelRead", "CheckpointMappingCreate", "CheckpointMappingRead",
    # ParamTypeMaster
    "ParamTypeMasterBase", "ParamTypeMasterCreate", "ParamTypeMasterRead",
    # ParamSyncGroup
    "ParamSyncGroupBase", "ParamSyncGroupCreate", "ParamSyncGroupUpdate", "ParamSyncGroupRead",
    # SpeechBubblePreset
    "SpeechBubblePresetBase", "SpeechBubblePresetCreate", "SpeechBubblePresetUpdate", "SpeechBubblePresetRead",
]


