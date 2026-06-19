"""SQLAlchemy ORM models for Prompt Surgeon."""

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Integer, String, Text, Float, Boolean,
    ForeignKey, DateTime, UniqueConstraint, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class MappingMaster(Base):
    __tablename__ = "mapping_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    expected_class_types: Mapped[Optional[str]] = mapped_column(Text)  # JSON array
    param_name: Mapped[str] = mapped_column(String, nullable=False)
    input_type: Mapped[str] = mapped_column(String, nullable=False)  # textarea/int/float/select
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    title_patterns: Mapped[Optional[str]] = mapped_column(Text)  # JSON array

    # relationships
    workflow_mappings: Mapped[list["WorkflowMapping"]] = relationship(
        back_populates="master", cascade="all, delete-orphan"
    )


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    json_body: Mapped[str] = mapped_column(Text, nullable=False)
    default_applied_assets: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    mappings: Mapped[list["WorkflowMapping"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["Snapshot"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )


class WorkflowMapping(Base):
    __tablename__ = "workflow_mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    master_id: Mapped[int] = mapped_column(ForeignKey("mapping_master.id", ondelete="CASCADE"), nullable=False)
    node_id: Mapped[str] = mapped_column(String, nullable=False)

    workflow: Mapped["Workflow"] = relationship(back_populates="mappings")
    master: Mapped["MappingMaster"] = relationship(back_populates="workflow_mappings")


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    params: Mapped[str] = mapped_column(Text, nullable=False)  # JSON: {role: value}
    image_path: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    category_rel: Mapped[Optional["LoraCategory"]] = relationship(back_populates="loras")
    trigger_word_sets: Mapped[list["LoraTriggerWordSet"]] = relationship(
        back_populates="lora", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["SnapshotLora"]] = relationship(back_populates="lora")


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

    tag_sets: Mapped[list["TagSet"]] = relationship(back_populates="category_rel")


class TagSet(Base):
    __tablename__ = "tag_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tagset_categories.id", ondelete="SET NULL"))
    tags: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array of strings
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    category_rel: Mapped[Optional["TagsetCategory"]] = relationship(back_populates="tag_sets")
    snapshots: Mapped[list["SnapshotTagSet"]] = relationship(back_populates="tag_set")


class LlmPrompt(Base):
    __tablename__ = "llm_prompts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SnapshotLora(Base):
    __tablename__ = "snapshot_loras"
    __table_args__ = (UniqueConstraint("snapshot_id", "lora_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False)
    lora_id: Mapped[int] = mapped_column(ForeignKey("loras.id", ondelete="CASCADE"), nullable=False)
    strength: Mapped[float] = mapped_column(Float, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="positive")

    snapshot: Mapped["Snapshot"] = relationship(back_populates="loras")
    lora: Mapped["Lora"] = relationship(back_populates="snapshots")


class SnapshotTagSet(Base):
    __tablename__ = "snapshot_tag_sets"
    __table_args__ = (UniqueConstraint("snapshot_id", "tag_set_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False)
    tag_set_id: Mapped[int] = mapped_column(ForeignKey("tag_sets.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="positive")

    snapshot: Mapped["Snapshot"] = relationship(back_populates="tag_sets")
    tag_set: Mapped["TagSet"] = relationship(back_populates="snapshots")
