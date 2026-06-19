import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models
import json

# Setup in-memory test DB
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

class TestReq048T2(unittest.TestCase):
    def setUp(self):
        # Save old override and set the new one dynamically
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db

        models.Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()
        
        # Seed initial data
        self.workflow = models.Workflow(name="test_wf", json_body="{}")
        self.db.add(self.workflow)
        self.lora = models.Lora(model_name="test_lora.safetensors")
        self.db.add(self.lora)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)
        
        # Restore old override
        if self.old_override:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_create_and_update_tag_set_with_thumbnail_path(self):
        # POST with thumbnail_path
        payload = {
            "name": "new_tagset",
            "description": "desc",
            "category_id": None,
            "tags": ["tag1", "tag2"],
            "thumbnail_path": "path/to/cover.png"
        }
        response = self.client.post("/api/tag-sets", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["thumbnail_path"], "path/to/cover.png")
        tag_set_id = data["id"]

        # PUT to update thumbnail_path
        payload_update = {
            "name": "new_tagset",
            "description": "desc",
            "category_id": None,
            "tags": ["tag1", "tag2"],
            "thumbnail_path": "path/to/new_cover.png"
        }
        response_update = self.client.put(f"/api/tag-sets/{tag_set_id}", json=payload_update)
        self.assertEqual(response_update.status_code, 200)
        data_update = response_update.json()
        self.assertEqual(data_update["thumbnail_path"], "path/to/new_cover.png")

    def test_unlimited_snapshots_for_tag_set_and_lora(self):
        # Create a tag_set
        tag_set = models.TagSet(name="test_tags", tags='["1girl"]')
        self.db.add(tag_set)
        self.db.commit()

        # Create 6 snapshots and associate them with tag_set and lora
        for i in range(7):
            snapshot = models.Snapshot(workflow_id=self.workflow.id, image_path=f"img_{i}.png", params="{}")
            self.db.add(snapshot)
            self.db.commit()

            ssl = models.SnapshotLora(snapshot_id=snapshot.id, lora_id=self.lora.id, strength=1.0)
            ssts = models.SnapshotTagSet(snapshot_id=snapshot.id, tag_set_id=tag_set.id)
            self.db.add(ssl)
            self.db.add(ssts)
            self.db.commit()

        # GET /api/tag-sets and check snapshot_paths has all 7 images
        response_tag_sets = self.client.get("/api/tag-sets")
        self.assertEqual(response_tag_sets.status_code, 200)
        data_tag_sets = response_tag_sets.json()
        self.assertEqual(len(data_tag_sets[0]["snapshot_paths"]), 7)

        # GET /api/loras and check snapshot_paths has all 7 images
        response_loras = self.client.get("/api/loras")
        self.assertEqual(response_loras.status_code, 200)
        data_loras = response_loras.json()
        self.assertEqual(len(data_loras[0]["snapshot_paths"]), 7)
