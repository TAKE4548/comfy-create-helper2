"""Unit tests for Pydantic schemas (isolated data validation)."""
from datetime import datetime
from types import SimpleNamespace
import pytest
from pydantic import ValidationError

from app.schemas.workflow import (
    MappingMasterBase,
    WorkflowCreate,
    WorkflowRead,
    WorkflowUpdate,
)
from app.schemas import (
    SnapshotCreate,
    SnapshotRead,
    AlbumCreate,
    AlbumRead,
    LoraCreate,
    LoraRead,
    TagSetCreate,
    TagSetRead,
)


def test_workflow_slot_state_contract_defaults_and_strict_values() -> None:
    """[REQ-358/AC-19] Workflow slot states default empty and require strict booleans."""
    create = WorkflowCreate(name="workflow", json_body={})
    assert create.mapping_slot_states == {}
    assert (
        WorkflowCreate(
            name="workflow",
            json_body={},
            mapping_slot_states={"v:1": False},
        ).mapping_slot_states
        == {"v:1": False}
    )
    with pytest.raises(ValidationError):
        WorkflowCreate(
            name="workflow",
            json_body={},
            mapping_slot_states={"v:1": 1},  # type: ignore[dict-item]
        )


@pytest.mark.parametrize("key", ["v:0", "m:01", "x:1", "v:-1", "m:abc"])
def test_workflow_slot_state_keys_must_be_valid(key: str) -> None:
    """[REQ-358/AC-19] Slot state keys use positive variant or legacy master IDs."""
    with pytest.raises(ValidationError):
        WorkflowCreate(name="workflow", json_body={}, mapping_slot_states={key: True})


def test_workflow_update_distinguishes_omitted_and_empty_slot_states() -> None:
    """[REQ-358/AC-19] Omitted slot states stay unset while an empty object replaces them."""
    assert "mapping_slot_states" not in WorkflowUpdate().model_fields_set
    update = WorkflowUpdate(mapping_slot_states={})
    assert update.mapping_slot_states == {}
    with pytest.raises(ValidationError):
        WorkflowUpdate(mapping_slot_states=None)  # type: ignore[arg-type]


def test_workflow_read_parses_slot_state_json() -> None:
    """[REQ-358/AC-19] Read schemas normalize persisted slot state JSON objects."""
    now = datetime.now()
    read = WorkflowRead.model_validate(
        {
            "id": 1,
            "name": "workflow",
            "json_body": {},
            "created_at": now,
            "mapping_slot_states": '{"v:2": false}',
        }
    )
    assert read.mapping_slot_states == {"v:2": False}
    with pytest.raises(ValidationError):
        WorkflowRead.model_validate(
            {
                "id": 1,
                "name": "workflow",
                "json_body": {},
                "created_at": now,
                "mapping_slot_states": "[]",
            }
        )


def test_mapping_master_default_enabled_defaults_true() -> None:
    """[REQ-358/AC-31] Legacy mapping masters default to enabled."""
    master = MappingMasterBase(
        role="main",
        param_name="seed",
        input_type="INT",
        display_name="Seed",
    )
    assert master.default_enabled is True


def test_snapshot_create_validation_success() -> None:
    """SnapshotCreate validates valid payload including loras and tag sets."""
    data = {
        "workflow_id": 1,
        "image_path": "path/to/img.png",
        "params": {"steps": 20, "cfg": 7.0},
        "album_id": 10,
        "loras": [{"lora_id": 1, "strength": 0.8, "role": "positive"}],
        "tag_sets": [{"tag_set_id": 2, "role": "negative"}],
    }
    obj = SnapshotCreate.model_validate(data)
    assert obj.workflow_id == 1
    assert obj.image_path == "path/to/img.png"
    assert obj.params == {"steps": 20, "cfg": 7.0}
    assert len(obj.loras) == 1
    assert obj.loras[0].lora_id == 1
    assert obj.loras[0].strength == 0.8
    assert obj.loras[0].role == "positive"
    assert len(obj.tag_sets) == 1
    assert obj.tag_sets[0].tag_set_id == 2
    assert obj.tag_sets[0].role == "negative"


def test_album_create_validation_success() -> None:
    """AlbumCreate validates valid name and snapshot IDs list."""
    data = {
        "name": "My Album",
        "snapshot_ids": [1, 2, 3],
    }
    obj = AlbumCreate.model_validate(data)
    assert obj.name == "My Album"
    assert obj.snapshot_ids == [1, 2, 3]


def test_lora_create_validation_success() -> None:
    """LoraCreate validates valid model name, strength range, and trigger words."""
    data = {
        "model_name": "LoraModel.safetensors",
        "description": "Test Lora",
        "recommended_strength_min": 0.0,
        "recommended_strength_max": 1.0,
        "category_id": 5,
        "thumbnail_path": "thumb.png",
        "file_path": "path/to/file.safetensors",
        "trigger_word_sets": [{"name": "trigger", "words": ["word1", "word2"]}],
    }
    obj = LoraCreate.model_validate(data)
    assert obj.model_name == "LoraModel.safetensors"
    assert len(obj.trigger_word_sets) == 1
    assert obj.trigger_word_sets[0].name == "trigger"
    assert obj.trigger_word_sets[0].words == ["word1", "word2"]


def test_tag_set_create_validation_success() -> None:
    """TagSetCreate validates name, description, tags, and category."""
    data = {
        "name": "My TagSet",
        "description": "Test TagSet",
        "category_id": 3,
        "tags": ["tag1", "tag2"],
        "thumbnail_path": "tags_thumb.png",
    }
    obj = TagSetCreate.model_validate(data)
    assert obj.name == "My TagSet"
    assert obj.tags == ["tag1", "tag2"]


def test_snapshot_create_missing_workflow_id() -> None:
    """SnapshotCreate raises ValidationError when workflow_id is missing."""
    with pytest.raises(ValidationError):
        SnapshotCreate.model_validate({"params": {}})


def test_snapshot_create_missing_params() -> None:
    """SnapshotCreate raises ValidationError when params is missing."""
    with pytest.raises(ValidationError):
        SnapshotCreate.model_validate({"workflow_id": 1})


def test_album_create_missing_name() -> None:
    """AlbumCreate raises ValidationError when name is missing."""
    with pytest.raises(ValidationError):
        AlbumCreate.model_validate({"snapshot_ids": [1]})


def test_lora_create_missing_model_name() -> None:
    """LoraCreate raises ValidationError when model_name is missing."""
    with pytest.raises(ValidationError):
        LoraCreate.model_validate({"description": "No model name"})


def test_tag_set_create_missing_tags() -> None:
    """TagSetCreate raises ValidationError when tags is missing."""
    with pytest.raises(ValidationError):
        TagSetCreate.model_validate({"name": "No tags"})


def test_snapshot_read_from_attributes() -> None:
    """SnapshotRead validates attribute mapping from domain object."""
    now = datetime.now()
    mock_lora = SimpleNamespace(
        id=101,
        snapshot_id=42,
        lora_id=1,
        strength=0.75,
        role="positive",
    )
    mock_tag_set = SimpleNamespace(
        id=202,
        snapshot_id=42,
        tag_set_id=2,
        role="negative",
    )
    mock_snapshot = SimpleNamespace(
        id=42,
        workflow_id=3,
        params={"cfg": 8.0},
        image_path="/path/to/image.jpg",
        created_at=now,
        loras=[mock_lora],
        tag_sets=[mock_tag_set],
    )

    obj = SnapshotRead.model_validate(mock_snapshot)
    assert obj.id == 42
    assert obj.workflow_id == 3
    assert obj.params == {"cfg": 8.0}
    assert obj.image_path == "/path/to/image.jpg"
    assert obj.created_at == now
    assert len(obj.loras) == 1
    assert obj.loras[0].id == 101
    assert obj.loras[0].lora_id == 1
    assert obj.loras[0].strength == 0.75
    assert len(obj.tag_sets) == 1
    assert obj.tag_sets[0].id == 202
    assert obj.tag_sets[0].tag_set_id == 2
    assert obj.tag_sets[0].role == "negative"


def test_album_read_from_attributes() -> None:
    """AlbumRead validates attribute mapping including nested items."""
    now = datetime.now()
    mock_item = SimpleNamespace(
        snapshot_id=12,
        sequence_order=1,
        image_path="/img1.png",
        created_at=now,
    )
    mock_album = SimpleNamespace(
        id=5,
        name="Test Album",
        created_at=now,
        items=[mock_item],
    )

    obj = AlbumRead.model_validate(mock_album)
    assert obj.id == 5
    assert obj.name == "Test Album"
    assert obj.created_at == now
    assert len(obj.items) == 1
    assert obj.items[0].snapshot_id == 12
    assert obj.items[0].sequence_order == 1
    assert obj.items[0].image_path == "/img1.png"


def test_lora_read_from_attributes() -> None:
    """LoraRead validates attribute mapping for Lora details and trigger words."""
    now = datetime.now()
    mock_trigger_word_set = SimpleNamespace(
        id=11,
        name="test_trigger",
        words=["test1", "test2"],
    )
    mock_lora = SimpleNamespace(
        id=8,
        model_name="test_model.safetensors",
        description="description text",
        recommended_strength_min=0.2,
        recommended_strength_max=0.9,
        category_id=None,
        thumbnail_path=None,
        file_path="C:/path.safetensors",
        trigger_word_sets=[mock_trigger_word_set],
        snapshot_paths=["/path1.png"],
        sort_order=1,
        created_at=now,
    )

    obj = LoraRead.model_validate(mock_lora)
    assert obj.id == 8
    assert obj.model_name == "test_model.safetensors"
    assert len(obj.trigger_word_sets) == 1
    assert obj.trigger_word_sets[0].name == "test_trigger"
    assert obj.snapshot_paths == ["/path1.png"]
    assert obj.created_at == now


def test_tag_set_read_from_attributes() -> None:
    """TagSetRead validates attribute mapping for tag set details."""
    now = datetime.now()
    mock_tag_set = SimpleNamespace(
        id=9,
        name="Test TagSet",
        description="desc",
        category_id=2,
        tags=["tag_a", "tag_b"],
        thumbnail_path="thumb.png",
        snapshot_paths=["/snap1.png"],
        sort_order=0,
        created_at=now,
    )

    obj = TagSetRead.model_validate(mock_tag_set)
    assert obj.id == 9
    assert obj.name == "Test TagSet"
    assert obj.tags == ["tag_a", "tag_b"]
    assert obj.snapshot_paths == ["/snap1.png"]
    assert obj.created_at == now
