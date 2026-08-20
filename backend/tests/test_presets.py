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
            seed=123,
            sort_order=2,
        )
        p2 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="Preset 2",
            param_values="{}",
            applied_assets="{}",
            batch_size=2,
            seed_mode="random",
            seed=-1,
            sort_order=1,
        )
        self.db.add_all([p1, p2])
        self.db.commit()

        # List all
        response = self.client.get("/api/workflow-presets")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Preset 2"  # ordered by sort_order asc (1 < 2)
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

    def test_reorder_presets(self):
        p1 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="Preset 1",
            param_values="{}",
            applied_assets="{}",
            batch_size=1,
            seed_mode="fixed",
            seed=123,
            sort_order=10
        )
        p2 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="Preset 2",
            param_values="{}",
            applied_assets="{}",
            batch_size=1,
            seed_mode="fixed",
            seed=123,
            sort_order=20
        )
        self.db.add_all([p1, p2])
        self.db.commit()
        self.db.refresh(p1)
        self.db.refresh(p2)

        # Reorder them (p2 first, then p1)
        payload = {"ordered_ids": [p2.id, p1.id]}
        response = self.client.put("/api/workflow-presets/reorder", json=payload)
        assert response.status_code == 204

        # List them and verify order
        response_list = self.client.get(f"/api/workflow-presets?workflow_id={self.workflow.id}")
        assert response_list.status_code == 200
        data = response_list.json()
        assert len(data) == 2
        assert data[0]["id"] == p2.id
        assert data[0]["sort_order"] == 0
        assert data[1]["id"] == p1.id
        assert data[1]["sort_order"] == 1

    def test_create_preset_auto_sort_order(self):
        # 1. Create first preset with default sort_order (0) -> gets sort_order 0
        payload1 = {
            "workflow_id": self.workflow.id,
            "name": "Preset 1",
            "param_values": {},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": -1,
        }
        res1 = self.client.post("/api/workflow-presets", json=payload1)
        assert res1.status_code == 201
        assert res1.json()["sort_order"] == 0

        # 2. Create second preset with default sort_order (0) -> gets sort_order 1
        payload2 = {
            "workflow_id": self.workflow.id,
            "name": "Preset 2",
            "param_values": {},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": -1,
        }
        res2 = self.client.post("/api/workflow-presets", json=payload2)
        assert res2.status_code == 201
        assert res2.json()["sort_order"] == 1

        # 3. Create preset for a different workflow -> gets sort_order 0
        workflow2 = models.Workflow(name="test_wf_2", json_body="{}")
        self.db.add(workflow2)
        self.db.commit()
        self.db.refresh(workflow2)

        payload_wf2 = {
            "workflow_id": workflow2.id,
            "name": "Preset WF2",
            "param_values": {},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": -1,
        }
        res_wf2 = self.client.post("/api/workflow-presets", json=payload_wf2)
        assert res_wf2.status_code == 201
        assert res_wf2.json()["sort_order"] == 0

        # 4. Create third preset with explicit non-zero sort_order (e.g., 10)
        payload3 = {
            "workflow_id": self.workflow.id,
            "name": "Preset 3",
            "param_values": {},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": -1,
            "sort_order": 10,
        }
        res3 = self.client.post("/api/workflow-presets", json=payload3)
        assert res3.status_code == 201
        assert res3.json()["sort_order"] == 10

        # 5. Create fourth preset with default sort_order (0) -> gets max_sort (10) + 1 = 11
        payload4 = {
            "workflow_id": self.workflow.id,
            "name": "Preset 4",
            "param_values": {},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": -1,
        }
        res4 = self.client.post("/api/workflow-presets", json=payload4)
        assert res4.status_code == 201
        assert res4.json()["sort_order"] == 11

        # 6. Reorder and create new preset -> gets next sequential sort_order
        p1_id = res1.json()["id"]
        p2_id = res2.json()["id"]
        p3_id = res3.json()["id"]
        p4_id = res4.json()["id"]
        self.client.put(
            "/api/workflow-presets/reorder",
            json={"ordered_ids": [p4_id, p3_id, p2_id, p1_id]},
        )
        # Now sort_orders are 0, 1, 2, 3

        payload5 = {
            "workflow_id": self.workflow.id,
            "name": "Preset 5",
            "param_values": {},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": -1,
        }
        res5 = self.client.post("/api/workflow-presets", json=payload5)
        assert res5.status_code == 201
        assert res5.json()["sort_order"] == 4


