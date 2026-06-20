import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
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


class TestPresetsAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        # Create all tables
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        # Create a test workflow
        self.workflow = models.Workflow(name="test_wf", json_body="{}")
        self.db.add(self.workflow)
        self.db.commit()
        self.db.refresh(self.workflow)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_create_preset(self):
        payload = {
            "workflow_id": self.workflow.id,
            "name": "Preset A",
            "param_values": {"positive_prompt": "cute cat"},
            "applied_assets": {"loras": [1, 2]},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": -1
        }
        response = self.client.post("/api/workflow-presets", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["id"] is not None
        assert data["name"] == "Preset A"
        assert data["workflow_id"] == self.workflow.id
        assert data["param_values"] == {"positive_prompt": "cute cat"}
        assert data["applied_assets"] == {"loras": [1, 2]}
        assert data["batch_size"] == 1
        assert data["seed_mode"] == "random"
        assert data["seed"] == -1
        assert "created_at" in data

        # Test error when workflow not found
        payload_bad = payload.copy()
        payload_bad["workflow_id"] = 9999
        response_bad = self.client.post("/api/workflow-presets", json=payload_bad)
        assert response_bad.status_code == 404

    def test_list_presets(self):
        # Add presets directly
        p1 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="Preset 1",
            param_values="{}",
            applied_assets="{}",
            batch_size=1,
            seed_mode="fixed",
            seed=123
        )
        p2 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="Preset 2",
            param_values="{}",
            applied_assets="{}",
            batch_size=2,
            seed_mode="random",
            seed=-1
        )
        self.db.add_all([p1, p2])
        self.db.commit()

        # List all
        response = self.client.get("/api/workflow-presets")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Preset 2"  # ordered by desc id
        assert data[1]["name"] == "Preset 1"

        # List with filter
        response = self.client.get(f"/api/workflow-presets?workflow_id={self.workflow.id}")
        assert response.status_code == 200
        assert len(response.json()) == 2

        response = self.client.get("/api/workflow-presets?workflow_id=9999")
        assert response.status_code == 200
        assert len(response.json()) == 0

    def test_update_preset(self):
        p1 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="Preset 1",
            param_values="{}",
            applied_assets="{}",
            batch_size=1,
            seed_mode="fixed",
            seed=123
        )
        self.db.add(p1)
        self.db.commit()
        self.db.refresh(p1)

        payload = {
            "name": "Updated Preset",
            "param_values": {"positive_prompt": "new prompt"},
            "batch_size": 4
        }
        response = self.client.put(f"/api/workflow-presets/{p1.id}", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Preset"
        assert data["param_values"] == {"positive_prompt": "new prompt"}
        assert data["batch_size"] == 4
        assert data["seed"] == 123  # unchanged

        # Test updating non-existent preset
        response_bad = self.client.put("/api/workflow-presets/9999", json=payload)
        assert response_bad.status_code == 404

    def test_delete_preset(self):
        p1 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="Preset 1",
            param_values="{}",
            applied_assets="{}",
            batch_size=1,
            seed_mode="fixed",
            seed=123
        )
        self.db.add(p1)
        self.db.commit()
        self.db.refresh(p1)

        response = self.client.delete(f"/api/workflow-presets/{p1.id}")
        assert response.status_code == 204

        # Verify deletion
        response_check = self.client.get(f"/api/workflow-presets?workflow_id={self.workflow.id}")
        assert len(response_check.json()) == 0

        # Test deleting non-existent preset
        response_bad = self.client.delete("/api/workflow-presets/9999")
        assert response_bad.status_code == 404
