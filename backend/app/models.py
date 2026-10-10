"""SQLAlchemy ORM models for Prompt Surgeon."""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Integer, String, Text, Float, Boolean,
    ForeignKey, DateTime, UniqueConstraint, Index,
    Table, Column, CheckConstraint, text, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def utc_now() -> datetime:
    """Return timezone-aware UTC datetime for SQLAlchemy column defaults."""
    return datetime.now(timezone.utc)


class ParamTypeMaster(Base):
    __tablename__ = "param_type_masters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    widget_type: Mapped[str] = mapped_column(String, nullable=False, default="select")
    # widget_type の値: select / int / float / textarea / boolean
    combo_options: Mapped[Optional[str]] = mapped_column(Text)  # JSON array
    min_value: Mapped[Optional[float]] = mapped_column(Float)
    max_value: Mapped[Optional[float]] = mapped_column(Float)
    step: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class MappingMaster(Base):
    __tablename__ = "mapping_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    expected_class_types: Mapped[Optional[str]] = mapped_column(Text)  # JSON array
    param_name: Mapped[str] = mapped_column(String, nullable=False)
    input_type: Mapped[str] = mapped_column(String, nullable=False)  # textarea/int/float/select
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    title_patterns: Mapped[Optional[str]] = mapped_column(Text)  # JSON array
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # relationships
    workflow_mappings: Mapped[list["WorkflowMapping"]] = relationship(
        back_populates="master", cascade="all, delete-orphan"
    )


lora_base_models = Table(
    "lora_base_models",
    Base.metadata,
    Column("lora_id", ForeignKey("loras.id", ondelete="CASCADE"), primary_key=True),
    Column("base_model_id", ForeignKey("base_models.id", ondelete="CASCADE"), primary_key=True)
)

tagset_base_models = Table(
    "tagset_base_models",
    Base.metadata,
    Column("tag_set_id", ForeignKey("tag_sets.id", ondelete="CASCADE"), primary_key=True),
    Column("base_model_id", ForeignKey("base_models.id", ondelete="CASCADE"), primary_key=True)
)

class BaseModel(Base):
    __tablename__ = "base_models"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    loras: Mapped[list["Lora"]] = relationship(
        secondary=lora_base_models,
        back_populates="base_models"
    )
    tag_sets: Mapped[list["TagSet"]] = relationship(
        secondary=tagset_base_models,
        back_populates="base_models"
    )

class CheckpointMapping(Base):
    __tablename__ = "checkpoint_mappings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    checkpoint_name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    base_model_id: Mapped[int] = mapped_column(ForeignKey("base_models.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    
    base_model: Mapped["BaseModel"] = relationship()



class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    json_body: Mapped[str] = mapped_column(Text, nullable=False)
    default_applied_assets: Mapped[Optional[str]] = mapped_column(Text)
    target_base_model_id: Mapped[Optional[int]] = mapped_column(ForeignKey("base_models.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    target_base_model: Mapped[Optional["BaseModel"]] = relationship()
    mappings: Mapped[list["WorkflowMapping"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["Snapshot"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )
    presets: Mapped[list["WorkflowPreset"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )
    bypass_profiles: Mapped[list["BypassProfile"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )
    param_sync_groups: Mapped[list["ParamSyncGroup"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )
    history_entries: Mapped[list["WorkflowHistory"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan", order_by="desc(WorkflowHistory.created_at)"
    )


class BypassProfile(Base):
    __tablename__ = "bypass_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    bypassed_node_ids: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    workflow: Mapped["Workflow"] = relationship(back_populates="bypass_profiles")


class WorkflowPreset(Base):
    __tablename__ = "workflow_presets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    param_values: Mapped[str] = mapped_column(Text, nullable=False)  # JSON: {role: value}
    applied_assets: Mapped[str] = mapped_column(Text, nullable=False)  # JSON: {role: asset_ids}
    batch_size: Mapped[int] = mapped_column(Integer, nullable=False)
    seed_mode: Mapped[str] = mapped_column(String, nullable=False)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    workflow: Mapped["Workflow"] = relationship(back_populates="presets")


class WorkflowMapping(Base):
    __tablename__ = "workflow_mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    master_id: Mapped[int] = mapped_column(ForeignKey("mapping_master.id", ondelete="CASCADE"), nullable=False)
    node_id: Mapped[str] = mapped_column(String, nullable=False)

    workflow: Mapped["Workflow"] = relationship(back_populates="mappings")
    master: Mapped["MappingMaster"] = relationship(back_populates="workflow_mappings")


class WorkflowHistory(Base):
    __tablename__ = "workflow_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    json_body: Mapped[str] = mapped_column(Text, nullable=False)
    mappings: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array: [{"master_id": 1, "node_id": "6"}]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    workflow: Mapped["Workflow"] = relationship(back_populates="history_entries")


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    params: Mapped[str] = mapped_column(Text, nullable=False)  # JSON: {role: value}
    image_path: Mapped[Optional[str]] = mapped_column(String)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    source_snapshot_id: Mapped[Optional[int]] = mapped_column(ForeignKey("snapshots.id", ondelete="SET NULL"), nullable=True)

    workflow: Mapped["Workflow"] = relationship(back_populates="snapshots")
    album_items: Mapped[list["AlbumItem"]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan"
    )
    loras: Mapped[list["SnapshotLora"]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan"
    )
    tag_sets: Mapped[list["SnapshotTagSet"]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan"
    )


class Album(Base):
    __tablename__ = "albums"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    items: Mapped[list["AlbumItem"]] = relationship(
        back_populates="album", cascade="all, delete-orphan",
        order_by="AlbumItem.sequence_order"
    )


class AlbumItem(Base):
    __tablename__ = "album_items"
    __table_args__ = (UniqueConstraint("album_id", "snapshot_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    album_id: Mapped[int] = mapped_column(ForeignKey("albums.id", ondelete="CASCADE"), nullable=False)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)

    album: Mapped["Album"] = relationship(back_populates="items")
    snapshot: Mapped["Snapshot"] = relationship(back_populates="album_items")


class LoraCategory(Base):
    __tablename__ = "lora_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    loras: Mapped[list["Lora"]] = relationship(back_populates="category_rel")


class Lora(Base):
    __tablename__ = "loras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    recommended_strength_min: Mapped[Optional[float]] = mapped_column(Float)
    recommended_strength_max: Mapped[Optional[float]] = mapped_column(Float)
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("lora_categories.id", ondelete="SET NULL"))
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String)
    file_path: Mapped[Optional[str]] = mapped_column(String)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    category_rel: Mapped[Optional["LoraCategory"]] = relationship(back_populates="loras")
    base_models: Mapped[list["BaseModel"]] = relationship(
        secondary=lora_base_models,
        back_populates="loras"
    )
    trigger_word_sets: Mapped[list["LoraTriggerWordSet"]] = relationship(
        back_populates="lora", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["SnapshotLora"]] = relationship(back_populates="lora")
    example_images: Mapped[list["LoraExampleImage"]] = relationship(
        back_populates="lora",
        cascade="all, delete-orphan",
        order_by=lambda: (LoraExampleImage.sort_order, LoraExampleImage.id),
    )


class LoraExampleImage(Base):
    __tablename__ = "lora_example_images"
    __table_args__ = (CheckConstraint("length(image_path) > 0", name="ck_lora_example_images_path_nonempty"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lora_id: Mapped[int] = mapped_column(ForeignKey("loras.id", ondelete="CASCADE"), nullable=False)
    image_path: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    lora: Mapped["Lora"] = relationship(back_populates="example_images")


class LoraTriggerWordSet(Base):
    __tablename__ = "lora_trigger_word_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lora_id: Mapped[int] = mapped_column(ForeignKey("loras.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    words: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array of strings

    lora: Mapped["Lora"] = relationship(back_populates="trigger_word_sets")


class TagsetCategory(Base):
    __tablename__ = "tagset_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    tag_sets: Mapped[list["TagSet"]] = relationship(back_populates="category_rel")


class TagSet(Base):
    __tablename__ = "tag_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tagset_categories.id", ondelete="SET NULL"))
    tags: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array of strings
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    category_rel: Mapped[Optional["TagsetCategory"]] = relationship(back_populates="tag_sets")
    base_models: Mapped[list["BaseModel"]] = relationship(
        secondary=tagset_base_models,
        back_populates="tag_sets"
    )
    snapshots: Mapped[list["SnapshotTagSet"]] = relationship(back_populates="tag_set")
    subsets: Mapped[list["TagSubset"]] = relationship(back_populates="tag_set", cascade="all, delete-orphan")
    presets: Mapped[list["SpeechBubblePreset"]] = relationship(back_populates="tag_set")


class TagSubset(Base):
    __tablename__ = "tag_subsets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tag_set_id: Mapped[int] = mapped_column(ForeignKey("tag_sets.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    tags: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array of strings
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    tag_set: Mapped["TagSet"] = relationship(back_populates="subsets")


class LlmPrompt(Base):
    __tablename__ = "llm_prompts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class SnapshotLora(Base):
    __tablename__ = "snapshot_loras"
    __table_args__ = (UniqueConstraint("snapshot_id", "lora_id", "role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False)
    lora_id: Mapped[int] = mapped_column(ForeignKey("loras.id", ondelete="CASCADE"), nullable=False)
    strength: Mapped[float] = mapped_column(Float, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="positive")

    snapshot: Mapped["Snapshot"] = relationship(back_populates="loras")
    lora: Mapped["Lora"] = relationship(back_populates="snapshots")


class SnapshotTagSet(Base):
    __tablename__ = "snapshot_tag_sets"
    __table_args__ = (UniqueConstraint("snapshot_id", "tag_set_id", "role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False)
    tag_set_id: Mapped[int] = mapped_column(ForeignKey("tag_sets.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="positive")

    snapshot: Mapped["Snapshot"] = relationship(back_populates="tag_sets")
    tag_set: Mapped["TagSet"] = relationship(back_populates="snapshots")


class ParamSyncGroup(Base):
    __tablename__ = "param_sync_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    master_role: Mapped[str] = mapped_column(String, nullable=False)
    slave_roles: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON string
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    workflow: Mapped["Workflow"] = relationship(back_populates="param_sync_groups")


class SpeechBubblePreset(Base):
    __tablename__ = "speech_bubble_presets"
    __table_args__ = (
        UniqueConstraint("name", "orientation", name="uq_speech_bubble_presets_name_orientation"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    shape: Mapped[str] = mapped_column(String, nullable=False, default="oval")
    orientation: Mapped[str] = mapped_column(String, nullable=False, default="vertical")
    font_family: Mapped[str] = mapped_column(String, nullable=False, default="sans-serif")
    font_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    text_color: Mapped[str] = mapped_column(String, nullable=False, default="rgba(0, 0, 0, 1)")
    background_color: Mapped[str] = mapped_column(String, nullable=False, default="rgba(255, 255, 255, 0.95)")
    border_color: Mapped[str] = mapped_column(String, nullable=False, default="rgba(0, 0, 0, 1)")
    border_width: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    effects_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="{}")
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    tag_set_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tag_sets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    tone_preset_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("speech_tone_presets.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    tag_set: Mapped[Optional["TagSet"]] = relationship(back_populates="presets")
    tone_preset: Mapped[Optional["SpeechTonePreset"]] = relationship()


class SpeechTonePreset(Base):
    __tablename__ = "speech_tone_presets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class PromptMetadata(Base):
    __tablename__ = "prompt_metadata"

    prompt_id: Mapped[str] = mapped_column(String, primary_key=True)
    workflow_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    param_values: Mapped[str] = mapped_column(Text, nullable=False)  # JSON serialized dict
    applied_assets: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON serialized dict
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class GenerationJob(Base):
    __tablename__ = "generation_jobs"
    __table_args__ = (
        UniqueConstraint("request_id", "item_index", name="uq_generation_jobs_request_item"),
        CheckConstraint("scope IN ('normal', 'studio')", name="ck_generation_jobs_scope"),
        Index("ix_generation_jobs_batch_id", "batch_id"),
        Index("ix_generation_jobs_normal_group_id", "normal_group_id"),
        Index("ix_generation_jobs_status", "status"),
    )

    job_id: Mapped[str] = mapped_column(String, primary_key=True)
    request_id: Mapped[str] = mapped_column(String, nullable=False)
    item_index: Mapped[int] = mapped_column(Integer, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String, nullable=False)
    prompt_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, unique=True)
    session_id: Mapped[str] = mapped_column(String, nullable=False)
    scope: Mapped[str] = mapped_column(String, nullable=False)
    batch_id: Mapped[str] = mapped_column(String, nullable=False)
    normal_group_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    set_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="queued", server_default=text("'queued'"))
    graph_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}", server_default=text("'{}'"))
    outputs_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default=text("'[]'"))
    node_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utc_now, server_default=func.current_timestamp()
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    failure_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cancel_requested: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class DatasetProject(Base):
    __tablename__ = "dataset_projects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    character_trigger: Mapped[str] = mapped_column(String(100), nullable=False)
    outfit_trigger: Mapped[str] = mapped_column(String(100), nullable=False)
    workflow_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflows.id"), nullable=False)
    prompt_meta: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_physical: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_exclusive_outfit: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_negative: Mapped[str] = mapped_column(Text, nullable=False, default="")
    selected_alt_outfits: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class DatasetItem(Base):
    __tablename__ = "dataset_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("dataset_projects.id", ondelete="CASCADE"), nullable=False)
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)
    factors_json: Mapped[str] = mapped_column(Text, nullable=False)
    raw_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    caption_text: Mapped[str] = mapped_column(Text, nullable=False)
    image_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="APPROVED")


class OutfitMasterPreset(Base):
    __tablename__ = "outfit_master_presets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    prompt_tags: Mapped[str] = mapped_column(Text, nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=True)


class LoraTrainingJob(Base):
    __tablename__ = "lora_training_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("dataset_projects.id"), nullable=False)
    lora_name: Mapped[str] = mapped_column(String(150), nullable=False)
    model_type: Mapped[str] = mapped_column(String(50), default="anima_2b")
    config_toml_content: Mapped[str] = mapped_column(Text, nullable=False)
    epochs: Mapped[int] = mapped_column(Integer, nullable=False)
    repeats: Mapped[int] = mapped_column(Integer, nullable=False)
    batch_size: Mapped[int] = mapped_column(Integer, nullable=False)
    total_steps: Mapped[int] = mapped_column(Integer, nullable=False)
    network_dim: Mapped[int] = mapped_column(Integer, nullable=False)
    network_alpha: Mapped[int] = mapped_column(Integer, nullable=False)
    learning_rate: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="IDLE")
    final_loss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pid: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
