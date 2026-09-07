import pytest
from sqlalchemy import create_engine, ForeignKey, Integer, String, Text
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime, timezone

from app.models import Base, TagSet, TagSubset
from app.schemas.tag_set import TagSetCreate, TagSetRead, TagSubsetCreate, TagSubsetRead

# Set up in-memory DB for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def test_tag_subset_model_relationship():
    # Create all tables
    Base.metadata.create_all(bind=connection)
    db = TestingSessionLocal()
    try:
        # Create a parent TagSet
        parent = TagSet(
            name="Main Style Set",
            description="Main style description",
            tags="[\"tag1\", \"tag2\", \"tag3\"]",
            thumbnail_path=None,
            sort_order=0
        )
        db.add(parent)
        db.commit()
        db.refresh(parent)

        # Create a child TagSubset
        child = TagSubset(
            tag_set_id=parent.id,
            name="Subset A",
            tags="[\"tag1\", \"tag2\"]"
        )
        db.add(child)
        db.commit()
        db.refresh(child)

        # Verify child and relationship
        assert child.id is not None
        assert child.tag_set_id == parent.id
        assert child.name == "Subset A"
        assert child.tags == "[\"tag1\", \"tag2\"]"
        
        # Verify parent's relationship list
        db.refresh(parent)
        assert len(parent.subsets) == 1
        assert parent.subsets[0].id == child.id
        assert parent.subsets[0].name == "Subset A"

        # Verify back_populates
        assert parent.subsets[0].tag_set == parent

        # Test Cascade Delete
        db.delete(parent)
        db.commit()

        # Child should be deleted
        deleted_child = db.query(TagSubset).filter(TagSubset.id == child.id).first()
        assert deleted_child is None
    finally:
        db.close()
        Base.metadata.drop_all(bind=connection)


def test_tag_subset_schemas():
    # Test TagSubsetCreate
    subset_create = TagSubsetCreate(name="Subset A", tags=["tag1", "tag2"])
    assert subset_create.name == "Subset A"
    assert subset_create.tags == ["tag1", "tag2"]

    # Test TagSubsetRead
    subset_read = TagSubsetRead(id=1, tag_set_id=10, name="Subset A", tags=["tag1", "tag2"])
    assert subset_read.id == 1
    assert subset_read.tag_set_id == 10
    assert subset_read.name == "Subset A"
    assert subset_read.tags == ["tag1", "tag2"]


def test_tag_set_schemas_with_subsets():
    # Test TagSetCreate with subsets
    subsets_data = [TagSubsetCreate(name="Subset A", tags=["tag1", "tag2"])]
    tag_set_create = TagSetCreate(
        name="Main Set",
        description="A main set",
        tags=["tag1", "tag2", "tag3"],
        subsets=subsets_data
    )
    assert tag_set_create.name == "Main Set"
    assert len(tag_set_create.subsets) == 1
    assert tag_set_create.subsets[0].name == "Subset A"

    # Test TagSetRead with subsets
    subsets_read_data = [TagSubsetRead(id=1, tag_set_id=2, name="Subset A", tags=["tag1"])]
    tag_set_read = TagSetRead(
        id=2,
        name="Main Set",
        tags=["tag1"],
        created_at=datetime.now(timezone.utc),
        subsets=subsets_read_data
    )
    assert tag_set_read.id == 2
    assert len(tag_set_read.subsets) == 1
    assert tag_set_read.subsets[0].id == 1


from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db

# Override dependency
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

def test_tag_set_api_with_subsets():
    # Setup database
    Base.metadata.create_all(bind=connection)
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    
    try:
        # 1. Create TagSet with Subsets
        payload = {
            "name": "API Set",
            "description": "API set description",
            "tags": ["a", "b", "c"],
            "subsets": [
                {"name": "Subset 1", "tags": ["a", "b"]},
                {"name": "Subset 2", "tags": ["b", "c"]}
            ]
        }
        response = client.post("/api/tag-sets", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "API Set"
        assert len(data["subsets"]) == 2
        
        # Verify specific subset values
        subsets = sorted(data["subsets"], key=lambda x: x["name"])
        assert subsets[0]["name"] == "Subset 1"
        assert subsets[0]["tags"] == ["a", "b"]
        assert subsets[0]["tag_set_id"] == data["id"]
        assert subsets[1]["name"] == "Subset 2"
        assert subsets[1]["tags"] == ["b", "c"]
        assert subsets[1]["tag_set_id"] == data["id"]
        
        tag_set_id = data["id"]
        
        # 2. Get TagSets (Verify subsets are included in list)
        response_list = client.get("/api/tag-sets")
        assert response_list.status_code == 200
        list_data = response_list.json()
        target_set = next((x for x in list_data if x["id"] == tag_set_id), None)
        assert target_set is not None
        assert len(target_set["subsets"]) == 2

        # 3. Update TagSet (Replace subsets)
        update_payload = {
            "name": "API Set Updated",
            "description": "Updated description",
            "tags": ["a", "b", "c", "d"],
            "subsets": [
                {"name": "Subset 1 Updated", "tags": ["a", "d"]},
                {"name": "Subset 3", "tags": ["d"]}
            ]
        }
        response_update = client.put(f"/api/tag-sets/{tag_set_id}", json=update_payload)
        assert response_update.status_code == 200
        updated_data = response_update.json()
        assert updated_data["name"] == "API Set Updated"
        assert len(updated_data["subsets"]) == 2
        
        updated_subsets = sorted(updated_data["subsets"], key=lambda x: x["name"])
        assert updated_subsets[0]["name"] == "Subset 1 Updated"
        assert updated_subsets[0]["tags"] == ["a", "d"]
        assert updated_subsets[1]["name"] == "Subset 3"
        assert updated_subsets[1]["tags"] == ["d"]
        
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=connection)


import io

def test_snapshot_image_upload():
    client = TestClient(app)
    file_content = b"fake image content"
    file_name = "test_upload.png"
    
    response = client.post(
        "/api/snapshots/upload",
        files={"file": (file_name, io.BytesIO(file_content), "image/png")}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "image_path" in data
    assert data["image_path"].startswith("/api/snapshots/images/upload_")
    assert data["image_path"].endswith(".png")
    
    from app.config import settings
    filename = data["image_path"].split("/")[-1]
    saved_file = settings.snapshot_path / filename
    if saved_file.exists():
        saved_file.unlink()

