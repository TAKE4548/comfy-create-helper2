import unittest
import json
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models

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

class TestWorkflowsCopy(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        models.Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        # Seed source workflow
        self.wf = models.Workflow(
            name="source_wf",
            json_body='{"nodes": []}',
            default_applied_assets='{"positive": []}'
        )
        self.db.add(self.wf)
        self.db.flush()

        # Add mapping
        self.master = models.MappingMaster(
            role="positive",
            param_name="text",
            input_type="string",
            display_name="Positive Prompt"
        )
        self.db.add(self.master)
        self.db.flush()

        self.mapping = models.WorkflowMapping(
            workflow_id=self.wf.id,
            master_id=self.master.id,
            node_id="6"
        )
        self.db.add(self.mapping)

        # Add preset
        self.preset = models.WorkflowPreset(
            workflow_id=self.wf.id,
            name="default_preset",
            param_values='{"positive": "1girl"}',
            applied_assets='{}',
            batch_size=1,
            seed_mode="fixed",
            seed=42,
            sort_order=10
        )
        self.db.add(self.preset)

        # Add snapshot (should NOT be copied)
        self.snapshot = models.Snapshot(
            workflow_id=self.wf.id,
            params='{"prompt": "1girl"}',
            image_path="original.png"
        )
        self.db.add(self.snapshot)

        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)
        if self.old_override:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_copy_workflow_success(self):
        payload = {"name": "copied_wf"}
        response = self.client.post(f"/api/workflows/{self.wf.id}/copy", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        new_id = data["id"]
        self.assertEqual(data["name"], "copied_wf")

        # Verify database record
        new_wf = self.db.query(models.Workflow).filter(models.Workflow.id == new_id).first()
        self.assertIsNotNone(new_wf)
        self.assertEqual(new_wf.name, "copied_wf")
        self.assertEqual(new_wf.json_body, '{"nodes": []}')
        self.assertEqual(new_wf.default_applied_assets, '{"positive": []}')

        # Verify mappings copied
        self.assertEqual(len(new_wf.mappings), 1)
        self.assertEqual(new_wf.mappings[0].node_id, "6")
        self.assertEqual(new_wf.mappings[0].master_id, self.master.id)

        # Verify presets copied
        self.assertEqual(len(new_wf.presets), 1)
        self.assertEqual(new_wf.presets[0].name, "default_preset")
        self.assertEqual(new_wf.presets[0].sort_order, 10)
        self.assertEqual(json.loads(new_wf.presets[0].param_values), {"positive": "1girl"})

        # Verify snapshots NOT copied
        snapshots_count = self.db.query(models.Snapshot).filter(models.Snapshot.workflow_id == new_id).count()
        self.assertEqual(snapshots_count, 0)

    def test_copy_workflow_not_found(self):
        payload = {"name": "non_existent_copy"}
        response = self.client.post("/api/workflows/99999/copy", json=payload)
        self.assertEqual(response.status_code, 404)

    def test_copy_workflow_conflict(self):
        payload = {"name": "source_wf"}  # Same name
        response = self.client.post(f"/api/workflows/{self.wf.id}/copy", json=payload)
        self.assertEqual(response.status_code, 409)
