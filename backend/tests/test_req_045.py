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

class TestReq045(unittest.TestCase):
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
        self.tag_set = models.TagSet(name="test_tags", tags='["1girl"]')
        self.db.add(self.tag_set)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)
        
        # Restore old override
        if self.old_override:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_workflow_default_applied_assets(self):
        # Update workflow with default_applied_assets
        test_assets = json.dumps({"positive": [{"type": "lora", "assetId": self.lora.id, "enabled": True}]})
        payload = {
            "name": "test_wf_updated",
            "default_applied_assets": test_assets
        }
        response = self.client.put(f"/api/workflows/{self.workflow.id}", json=payload)
        self.assertEqual(response.status_code, 200)

        # Retrieve workflow and verify default_applied_assets
        get_response = self.client.get(f"/api/workflows/{self.workflow.id}")
        self.assertEqual(get_response.status_code, 200)
        data = get_response.json()
        self.assertEqual(data["default_applied_assets"], test_assets)

    def test_snapshot_lora_and_tagset_roles(self):
        # Create a snapshot with specific roles
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "test_role.png",
            "params": {"prompt": "1girl"},
            "loras": [{"lora_id": self.lora.id, "strength": 0.9, "role": "negative"}],
            "tag_sets": [{"tag_set_id": self.tag_set.id, "role": "positive"}]
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 201)
        snapshot_id = response.json()["id"]

        # Retrieve and verify roles
        get_response = self.client.get(f"/api/snapshots/{snapshot_id}")
        self.assertEqual(get_response.status_code, 200)
        data = get_response.json()
        
        self.assertEqual(len(data["loras"]), 1)
        self.assertEqual(data["loras"][0]["lora_id"], self.lora.id)
        self.assertEqual(data["loras"][0]["strength"], 0.9)
        self.assertEqual(data["loras"][0]["role"], "negative")

        self.assertEqual(len(data["tag_sets"]), 1)
        self.assertEqual(data["tag_sets"][0]["tag_set_id"], self.tag_set.id)
        self.assertEqual(data["tag_sets"][0]["role"], "positive")
