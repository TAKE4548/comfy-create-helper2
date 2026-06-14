import unittest
from unittest.mock import patch, AsyncMock, MagicMock
import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models
from app.config import settings

# Test database
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

class TestLorasAPI(unittest.TestCase):
    def setUp(self):
        # Set dependency override dynamically and save the old one
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db

        models.Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        # Seed data: register one lora
        self.registered_lora = models.Lora(
            model_name="registered.safetensors",
            file_path="folder/registered.safetensors"
        )
        self.db.add(self.registered_lora)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)
        # Restore the old dependency override
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    @patch("httpx.AsyncClient.get", new_callable=AsyncMock)
    def test_get_comfy_lora_models_success(self, mock_get):
        # Mocking the HTTP response
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = [
            "folder\\registered.safetensors",
            "folder\\unregistered.safetensors",
            "another_unregistered.safetensors"
        ]
        mock_get.return_value = mock_response

        response = self.client.get("/api/loras/comfy-models")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Expected output order:
        # unregistered models first (alphabetically sorted by file_path):
        # 1. another_unregistered.safetensors (file_path: "another_unregistered.safetensors", is_registered: False)
        # 2. folder/unregistered.safetensors (file_path: "folder/unregistered.safetensors", is_registered: False)
        # registered models next:
        # 3. folder/registered.safetensors (file_path: "folder/registered.safetensors", is_registered: True, lora_id: self.registered_lora.id)

        self.assertEqual(len(data), 3)

        # 1st: another_unregistered.safetensors
        self.assertEqual(data[0]["model_name"], "another_unregistered.safetensors")
        self.assertEqual(data[0]["file_path"], "another_unregistered.safetensors")
        self.assertEqual(data[0]["is_registered"], False)
        self.assertIsNone(data[0]["lora_id"])

        # 2nd: folder/unregistered.safetensors
        self.assertEqual(data[1]["model_name"], "unregistered.safetensors")
        self.assertEqual(data[1]["file_path"], "folder/unregistered.safetensors")
        self.assertEqual(data[1]["is_registered"], False)
        self.assertIsNone(data[1]["lora_id"])

        # 3rd: folder/registered.safetensors
        self.assertEqual(data[2]["model_name"], "registered.safetensors")
        self.assertEqual(data[2]["file_path"], "folder/registered.safetensors")
        self.assertEqual(data[2]["is_registered"], True)
        self.assertEqual(data[2]["lora_id"], self.registered_lora.id)

    @patch("httpx.AsyncClient.get", new_callable=AsyncMock)
    def test_get_comfy_lora_models_primary_404_fallback_success(self, mock_get):
        # Primary gets 404, fallback gets 200
        mock_resp_404 = MagicMock(spec=httpx.Response)
        mock_resp_404.status_code = 404
        
        mock_resp_fallback = MagicMock(spec=httpx.Response)
        mock_resp_fallback.status_code = 200
        mock_resp_fallback.json.return_value = ["fallback_model.safetensors"]

        mock_get.side_effect = [mock_resp_404, mock_resp_fallback]

        response = self.client.get("/api/loras/comfy-models")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["model_name"], "fallback_model.safetensors")

    @patch("httpx.AsyncClient.get", new_callable=AsyncMock)
    def test_get_comfy_lora_models_failure_returns_empty(self, mock_get):
        # Both primary and fallback fail
        mock_get.side_effect = httpx.RequestError("Connection failed")

        response = self.client.get("/api/loras/comfy-models")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    @patch("httpx.AsyncClient.get", new_callable=AsyncMock)
    def test_get_comfy_lora_models_model_name_fallback(self, mock_get):
        # Insert a pre-existing model that has no file_path but has model_name representing relative path
        legacy_lora = models.Lora(
            model_name="GakuenIdleMaster/temari-tsukimura.safetensors",
            file_path=None
        )
        self.db.add(legacy_lora)
        self.db.commit()

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = [
            "GakuenIdleMaster\\temari-tsukimura.safetensors",
            "unregistered.safetensors"
        ]
        mock_get.return_value = mock_response

        response = self.client.get("/api/loras/comfy-models")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)

        # 1st: unregistered.safetensors (unregistered first)
        self.assertEqual(data[0]["model_name"], "unregistered.safetensors")
        self.assertEqual(data[0]["file_path"], "unregistered.safetensors")
        self.assertEqual(data[0]["is_registered"], False)

        # 2nd: GakuenIdleMaster/temari-tsukimura.safetensors (legacy, mapped by model_name)
        self.assertEqual(data[1]["model_name"], "temari-tsukimura.safetensors")
        self.assertEqual(data[1]["file_path"], "GakuenIdleMaster/temari-tsukimura.safetensors")
        self.assertEqual(data[1]["is_registered"], True)
        self.assertEqual(data[1]["lora_id"], legacy_lora.id)

    def test_lora_snapshot_paths(self):
        # Create a workflow
        wf = models.Workflow(name="test workflow", json_body="{}")
        self.db.add(wf)
        self.db.flush()

        # Create snapshots and link them to lora
        for i in range(7):
            snap = models.Snapshot(
                workflow_id=wf.id,
                params="{}",
                image_path=f"path/to/snap_{i}.png"
            )
            self.db.add(snap)
            self.db.flush()
            
            snap_lora = models.SnapshotLora(
                snapshot_id=snap.id,
                lora_id=self.registered_lora.id,
                strength=0.75
            )
            self.db.add(snap_lora)
        
        self.db.commit()

        # List loras via API
        response = self.client.get("/api/loras")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Find the registered lora
        lora_data = next(x for x in data if x["id"] == self.registered_lora.id)
        self.assertIn("snapshot_paths", lora_data)
        # Should return the latest 5 snapshot paths
        self.assertEqual(len(lora_data["snapshot_paths"]), 5)
        # Verify it is sorted by created_at desc (which corresponds to higher IDs in SQLite sequential insertion)
        # snap_6, snap_5, snap_4, snap_3, snap_2
        self.assertEqual(lora_data["snapshot_paths"], [
            "path/to/snap_6.png",
            "path/to/snap_5.png",
            "path/to/snap_4.png",
            "path/to/snap_3.png",
            "path/to/snap_2.png"
        ])


