# File: test_integration_snapshots.py
import sys
import os
import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, '.')

from app.main import app
from app.database import Base, get_db
from app import models, schemas
from app.config import settings

# Test DB Setup
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

def run_integration_tests():
    print("--- Starting Snapshot Service Integration Tests ---")
    Base.metadata.create_all(bind=connection)
    db = TestingSessionLocal()

    # Seed data
    wf = models.Workflow(name="integration_wf", json_body="{}")
    db.add(wf)
    lora = models.Lora(model_name="test_lora.safetensors")
    db.add(lora)
    tag_set = models.TagSet(name="test_tag_set", tags='["1girl"]')
    db.add(tag_set)
    db.commit()

    client = TestClient(app)

    # 1. Verify Image Upload API
    print("1. Testing POST /api/snapshots/upload...")
    dummy_file_content = b"dummy png content"
    response = client.post(
        "/api/snapshots/upload",
        files={"file": ("dummy.png", dummy_file_content, "image/png")}
    )
    if response.status_code != 200:
        raise AssertionError(f"Upload failed: {response.status_code}")
    data = response.json()
    if "image_path" not in data or not data["image_path"].startswith("/api/snapshots/images/"):
        raise AssertionError(f"Unexpected upload response: {data}")
    uploaded_filename = Path(data["image_path"]).name
    uploaded_physical_path = settings.snapshot_path / uploaded_filename
    if not uploaded_physical_path.exists():
        raise AssertionError("Uploaded physical file does not exist on disk!")
    print("-> Pass")

    # 2. Verify Snapshot Creation with local uploaded file path
    print("2. Testing POST /api/snapshots...")
    payload = {
        "workflow_id": wf.id,
        "image_path": data["image_path"],
        "params": {"Sampler_Seed": 9999},
        "new_album_name": "Integration Album",
        "loras": [{"lora_id": lora.id, "strength": 0.5}],
        "tag_sets": [{"tag_set_id": tag_set.id}]
    }
    response = client.post("/api/snapshots", json=payload)
    if response.status_code != 201:
        raise AssertionError(f"Create failed: {response.status_code}")
    snap_data = response.json()
    snapshot_id = snap_data["id"]
    print("-> Pass")

    # 3. Verify Album & relations exist
    print("3. Verifying DB Relations and items...")
    album = db.query(models.Album).filter(models.Album.name == "Integration Album").first()
    if not album:
        raise AssertionError("Album not created in database")
    item = db.query(models.AlbumItem).filter(models.AlbumItem.album_id == album.id).first()
    if not item or item.snapshot_id != snapshot_id:
        raise AssertionError("AlbumItem mapping is invalid")
    print("-> Pass")

    # 4. Verify DB Rollback deletes image from disk
    print("4. Testing DB Rollback cleans up image file...")
    from unittest.mock import patch
    from sqlalchemy.exc import SQLAlchemyError

    # URL image payload to trigger download
    rollback_payload = {
        "workflow_id": wf.id,
        "image_path": "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png",
        "params": {},
        "loras": [],
        "tag_sets": []
    }

    mock_urlopen_response = MagicMock()
    mock_urlopen_response.read.return_value = b"mock image payload"
    mock_urlopen_response.__enter__.return_value = mock_urlopen_response

    saved_paths = []
    original_open = open
    def mock_open_fn(file, mode):
        p = Path(file)
        if p.parent == settings.snapshot_path:
            saved_paths.append(p)
        return original_open(file, mode)

    def custom_rollback_get_db():
        rdb = TestingSessionLocal()
        original_add = rdb.add
        def mock_add(instance):
            if isinstance(instance, models.Snapshot):
                raise SQLAlchemyError("Mock DB Error during Snapshot write")
            original_add(instance)
        rdb.add = mock_add
        try:
            yield rdb
        finally:
            rdb.close()

    app.dependency_overrides[get_db] = custom_rollback_get_db

    try:
        with patch('urllib.request.urlopen', return_value=mock_urlopen_response):
            with patch('builtins.open', mock_open_fn):
                try:
                    client.post("/api/snapshots", json=rollback_payload)
                except SQLAlchemyError:
                    pass
                
                # Assert downloaded files are cleaned up
                if not saved_paths:
                    raise AssertionError("No file download was captured")
                for path in saved_paths:
                    if path.exists():
                        raise AssertionError(f"Rollback cleanup failed: {path} still exists on disk!")
    finally:
        app.dependency_overrides[get_db] = override_get_db

    print("-> Pass")

    # Cleanup test files
    if uploaded_physical_path.exists():
        os.remove(uploaded_physical_path)

    print("ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    try:
        run_integration_tests()
        sys.exit(0)
    except Exception as e:
        print(f"INTEGRATION TEST FAILED: {e}")
        sys.exit(1)
