from datetime import datetime
import pytest
from pydantic import ValidationError
from types import SimpleNamespace

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

# 1. バリデーション成功テスト (Valid Data Verification)
def test_snapshot_create_validation_success():
    data = {
        "workflow_id": 1,
        "image_path": "path/to/img.png",
        "params": {"steps": 20, "cfg": 7.0},
        "album_id": 10,
        "loras": [{"lora_id": 1, "strength": 0.8, "role": "positive"}],
        "tag_sets": [{"tag_set_id": 2, "role": "negative"}]
    }
    obj = SnapshotCreate(**data)
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

def test_album_create_validation_success():
    data = {
        "name": "My Album",
        "snapshot_ids": [1, 2, 3]
    }
    obj = AlbumCreate(**data)
    assert obj.name == "My Album"
    assert obj.snapshot_ids == [1, 2, 3]

def test_lora_create_validation_success():
    data = {
        "model_name": "LoraModel.safetensors",
        "description": "Test Lora",
        "recommended_strength_min": 0.0,
        "recommended_strength_max": 1.0,
        "category_id": 5,
        "thumbnail_path": "thumb.png",
        "file_path": "path/to/file.safetensors",
        "trigger_word_sets": [{"name": "trigger", "words": ["word1", "word2"]}]
    }
    obj = LoraCreate(**data)
    assert obj.model_name == "LoraModel.safetensors"
    assert len(obj.trigger_word_sets) == 1
    assert obj.trigger_word_sets[0].name == "trigger"
    assert obj.trigger_word_sets[0].words == ["word1", "word2"]

def test_tag_set_create_validation_success():
    data = {
        "name": "My TagSet",
        "description": "Test TagSet",
        "category_id": 3,
        "tags": ["tag1", "tag2"],
        "thumbnail_path": "tags_thumb.png"
    }
    obj = TagSetCreate(**data)
    assert obj.name == "My TagSet"
    assert obj.tags == ["tag1", "tag2"]

# 2. 必須フィールド欠落時の ValidationError 送出テスト
def test_snapshot_create_missing_workflow_id():
    data = {
        "params": {}
    }
    with pytest.raises(ValidationError):
        SnapshotCreate(**data)

def test_snapshot_create_missing_params():
    data = {
        "workflow_id": 1
    }
    with pytest.raises(ValidationError):
        SnapshotCreate(**data)

def test_album_create_missing_name():
    data = {
        "snapshot_ids": [1]
    }
    with pytest.raises(ValidationError):
        AlbumCreate(**data)

def test_lora_create_missing_model_name():
    data = {
        "description": "No model name"
    }
    with pytest.raises(ValidationError):
        LoraCreate(**data)

def test_tag_set_create_missing_tags():
    data = {
        "name": "No tags"
    }
    with pytest.raises(ValidationError):
        TagSetCreate(**data)

# 3. model_validate (from_attributes) による読み込みテスト
def test_snapshot_read_from_attributes():
    now = datetime.now()
    
    mock_lora = SimpleNamespace(
        id=101,
        snapshot_id=42,
        lora_id=1,
        strength=0.75,
        role="positive"
    )
    
    mock_tag_set = SimpleNamespace(
        id=202,
        snapshot_id=42,
        tag_set_id=2,
        role="negative"
    )
    
    mock_snapshot = SimpleNamespace(
        id=42,
        workflow_id=3,
        params={"cfg": 8.0},
        image_path="/path/to/image.jpg",
        created_at=now,
        loras=[mock_lora],
        tag_sets=[mock_tag_set]
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

def test_album_read_from_attributes():
    now = datetime.now()
    
    mock_item = SimpleNamespace(
        snapshot_id=12,
        sequence_order=1,
        image_path="/img1.png",
        created_at=now
    )
    
    mock_album = SimpleNamespace(
        id=5,
        name="Test Album",
        created_at=now,
        items=[mock_item]
    )
    
    obj = AlbumRead.model_validate(mock_album)
    assert obj.id == 5
    assert obj.name == "Test Album"
    assert obj.created_at == now
    assert len(obj.items) == 1
    assert obj.items[0].snapshot_id == 12
    assert obj.items[0].sequence_order == 1
    assert obj.items[0].image_path == "/img1.png"

def test_lora_read_from_attributes():
    now = datetime.now()
    
    mock_trigger_word_set = SimpleNamespace(
        id=11,
        name="test_trigger",
        words=["test1", "test2"]
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
        created_at=now
    )
    
    obj = LoraRead.model_validate(mock_lora)
    assert obj.id == 8
    assert obj.model_name == "test_model.safetensors"
    assert len(obj.trigger_word_sets) == 1
    assert obj.trigger_word_sets[0].name == "test_trigger"
    assert obj.snapshot_paths == ["/path1.png"]
    assert obj.created_at == now

def test_tag_set_read_from_attributes():
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
        created_at=now
    )
    
    obj = TagSetRead.model_validate(mock_tag_set)
    assert obj.id == 9
    assert obj.name == "Test TagSet"
    assert obj.tags == ["tag_a", "tag_b"]
    assert obj.snapshot_paths == ["/snap1.png"]
    assert obj.created_at == now
