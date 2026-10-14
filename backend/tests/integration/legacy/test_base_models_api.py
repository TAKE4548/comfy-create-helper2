import unittest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import httpx

from app.main import app
from app.database import Base, get_db
from app import models

# Set up in-memory DB for testing
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

class TestBaseModelsAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_create_and_list_base_model(self):
        payload = {"name": "SDXL", "description": "Stable Diffusion XL"}
        response = self.client.post("/api/base-models", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIsNotNone(data["id"])
        self.assertEqual(data["name"], "SDXL")
        self.assertEqual(data["description"], "Stable Diffusion XL")

        response = self.client.get("/api/base-models")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "SDXL")

    def test_update_base_model(self):
        bm = models.BaseModel(name="SD1.5", description="Old model")
        self.db.add(bm)
        self.db.commit()

        payload = {"name": "SD1.5-New", "description": "Updated description"}
        response = self.client.put(f"/api/base-models/{bm.id}", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "SD1.5-New")
        self.assertEqual(data["description"], "Updated description")

    def test_delete_base_model(self):
        bm = models.BaseModel(name="Anima")
        self.db.add(bm)
        self.db.commit()

        response = self.client.delete(f"/api/base-models/{bm.id}")
        self.assertEqual(response.status_code, 204)

        response = self.client.get("/api/base-models")
        self.assertEqual(len(response.json()), 0)

    def test_create_or_update_checkpoint_mapping(self):
        bm = models.BaseModel(name="Noob")
        bm2 = models.BaseModel(name="Illus")
        self.db.add_all([bm, bm2])
        self.db.commit()

        payload = {"checkpoint_name": "noob_v1.safetensors", "base_model_id": bm.id}
        response = self.client.post("/api/checkpoint-mappings", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["checkpoint_name"], "noob_v1.safetensors")
        self.assertEqual(data["base_model_id"], bm.id)

        payload2 = {"checkpoint_name": "noob_v1.safetensors", "base_model_id": bm2.id}
        response = self.client.post("/api/checkpoint-mappings", json=payload2)
        self.assertEqual(response.status_code, 200)
        
        response = self.client.get("/api/checkpoint-mappings")
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["base_model_id"], bm2.id)

    @patch("httpx.AsyncClient.get", new_callable=AsyncMock)
    def test_get_comfy_checkpoints(self, mock_get):
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = ["model1.safetensors", "model2.ckpt"]
        mock_get.return_value = mock_response

        response = self.client.get("/api/comfy/checkpoints")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), ["model1.safetensors", "model2.ckpt"])

        mock_get.reset_mock()
        mock_response_404 = MagicMock(spec=httpx.Response)
        mock_response_404.status_code = 404
        mock_response_fallback = MagicMock(spec=httpx.Response)
        mock_response_fallback.status_code = 200
        mock_response_fallback.json.return_value = ["fallback_model.safetensors"]
        mock_get.side_effect = [mock_response_404, mock_response_fallback]

        response = self.client.get("/api/comfy/checkpoints")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), ["fallback_model.safetensors"])

        mock_get.reset_mock()
        mock_get.side_effect = httpx.ConnectError("Connection refused")
        response = self.client.get("/api/comfy/checkpoints")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_scan_workflow_estimation(self):
        bm = models.BaseModel(name="Anima")
        self.db.add(bm)
        self.db.commit()
        mapping = models.CheckpointMapping(checkpoint_name="anime_style_v3.safetensors", base_model_id=bm.id)
        self.db.add(mapping)
        self.db.commit()

        # Known checkpoint
        payload = {
            "json_body": {
                "4": {
                    "class_type": "CheckpointLoaderSimple",
                    "inputs": {"ckpt_name": "anime_style_v3.safetensors"}
                }
            }
        }
        response = self.client.post("/api/workflows/scan", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["estimated_base_model_id"], bm.id)
        self.assertIsNone(data["unknown_checkpoint_name"])

        # Unknown checkpoint
        payload_unknown = {
            "json_body": {
                "4": {
                    "class_type": "CheckpointLoaderSimple",
                    "inputs": {"ckpt_name": "unknown_model_xyz.safetensors"}
                }
            }
        }
        response = self.client.post("/api/workflows/scan", json=payload_unknown)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsNone(data["estimated_base_model_id"])
        self.assertEqual(data["unknown_checkpoint_name"], "unknown_model_xyz.safetensors")

    def test_create_workflow_auto_estimation(self):
        bm = models.BaseModel(name="Noob")
        self.db.add(bm)
        self.db.commit()
        mapping = models.CheckpointMapping(checkpoint_name="noob_v1.safetensors", base_model_id=bm.id)
        self.db.add(mapping)
        self.db.commit()

        payload = {
            "name": "auto_estimate_workflow",
            "json_body": {
                "4": {
                    "class_type": "CheckpointLoaderSimple",
                    "inputs": {"ckpt_name": "noob_v1.safetensors"}
                }
            },
            "mappings": []
        }
        response = self.client.post("/api/workflows", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["target_base_model_id"], bm.id)

        # Get workflow details
        wf_id = data["id"]
        response = self.client.get(f"/api/workflows/{wf_id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["target_base_model_id"], bm.id)