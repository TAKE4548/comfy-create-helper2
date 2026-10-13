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

    def test_req358_workflow_copy_preserves_independent_mapping_slot_states(self):
        """[REQ-358/AC-23] Copy preserves slot state and later edits remain workflow-local."""
        original_states = {"m:1": True, "v:2": False}
        self.wf.mapping_slot_states = json.dumps(original_states)
        self.db.commit()

        copied = self.client.post(
            f"/api/workflows/{self.wf.id}/copy",
            json={"name": "REQ-358 copied state"},
        )
        self.assertEqual(copied.status_code, 201, copied.text)
        copied_id = copied.json()["id"]
        self.assertEqual(
            self.client.get(f"/api/workflows/{copied_id}").json()["mapping_slot_states"],
            original_states,
        )

        edited = self.client.put(
            f"/api/workflows/{copied_id}",
            json={"mapping_slot_states": {"m:1": False}},
        )
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(
            self.client.get(f"/api/workflows/{self.wf.id}").json()["mapping_slot_states"],
            original_states,
        )

    def test_copy_workflow_with_bypass_profiles(self):
        # 1. BypassProfile を持つワークフローを作成
        wf = models.Workflow(name="Source WF", json_body="{}")
        self.db.add(wf)
        self.db.commit()
        self.db.refresh(wf)
        
        profile = models.BypassProfile(
            workflow_id=wf.id,
            name="Test Bypass Profile",
            bypassed_node_ids='["10", "20"]',
            is_enabled=True,
        )
        self.db.add(profile)
        self.db.commit()

        # 2. ワークフローのコピーAPIを実行
        response = self.client.post(f"/api/workflows/{wf.id}/copy", json={"name": "Copied WF"})
        self.assertEqual(response.status_code, 201)
        new_wf_id = response.json()["id"]

        # 3. コピー先ワークフローのバイパスプロファイル一覧を取得して検証
        res_profiles = self.client.get(f"/api/workflows/{new_wf_id}/bypass-profiles")
        self.assertEqual(res_profiles.status_code, 200)
        profiles_data = res_profiles.json()
        self.assertEqual(len(profiles_data), 1)
        self.assertEqual(profiles_data[0]["name"], "Test Bypass Profile")
        self.assertEqual(profiles_data[0]["bypassed_node_ids"], ["10", "20"])
        self.assertEqual(profiles_data[0]["is_enabled"], True)

    def test_copy_workflow_not_found(self):
        payload = {"name": "non_existent_copy"}
        response = self.client.post("/api/workflows/99999/copy", json=payload)
        self.assertEqual(response.status_code, 404)

    def test_copy_workflow_conflict(self):
        payload = {"name": "source_wf"}  # Same name
        response = self.client.post(f"/api/workflows/{self.wf.id}/copy", json=payload)
        self.assertEqual(response.status_code, 409)

    def test_copy_empty_workflow(self):
        empty_wf = models.Workflow(
            name="empty_wf",
            json_body='{"nodes": []}',
            default_applied_assets=None
        )
        self.db.add(empty_wf)
        self.db.commit()

        payload = {"name": "copied_empty_wf"}
        response = self.client.post(f"/api/workflows/{empty_wf.id}/copy", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        new_id = data["id"]
        self.assertEqual(data["name"], "copied_empty_wf")

        new_wf = self.db.query(models.Workflow).filter(models.Workflow.id == new_id).first()
        self.assertIsNotNone(new_wf)
        self.assertEqual(len(new_wf.mappings), 0)
        self.assertEqual(len(new_wf.presets), 0)

    def test_update_workflow_name_conflict(self):
        wf_a = models.Workflow(
            name="wf_a",
            json_body='{"nodes": []}',
            default_applied_assets=None
        )
        wf_b = models.Workflow(
            name="wf_b",
            json_body='{"nodes": []}',
            default_applied_assets=None
        )
        self.db.add(wf_a)
        self.db.add(wf_b)
        self.db.commit()

        payload = {"name": "wf_a"}
        response = self.client.put(f"/api/workflows/{wf_b.id}", json=payload)
        self.assertEqual(response.status_code, 409)
        self.assertIn("detail", response.json())

    def test_create_workflow_invalid_json_body(self):
        payload = {
            "name": "invalid_json_wf",
            "json_body": ""
        }
        response = self.client.post("/api/workflows", json=payload)
        self.assertIn(response.status_code, [400, 422])

    def test_update_workflow_invalid_json_body(self):
        payload = {
            "json_body": ""
        }
        response = self.client.put(f"/api/workflows/{self.wf.id}", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_copy_workflow_with_param_sync_groups(self):
        wf = models.Workflow(name="Source Sync WF", json_body="{}")
        self.db.add(wf)
        self.db.commit()
        self.db.refresh(wf)

        sync_group = models.ParamSyncGroup(
            workflow_id=wf.id,
            name="Test Sync Group",
            master_role="prompt_master",
            slave_roles='["prompt_slave_1", "prompt_slave_2"]',
            is_enabled=True,
        )
        self.db.add(sync_group)
        self.db.commit()

        response = self.client.post(f"/api/workflows/{wf.id}/copy", json={"name": "Copied Sync WF"})
        self.assertEqual(response.status_code, 201)
        new_wf_id = response.json()["id"]

        res_groups = self.client.get(f"/api/workflows/{new_wf_id}/param-sync-groups")
        self.assertEqual(res_groups.status_code, 200)
        groups_data = res_groups.json()
        self.assertEqual(len(groups_data), 1)
        self.assertEqual(groups_data[0]["name"], "Test Sync Group")
        self.assertEqual(groups_data[0]["master_role"], "prompt_master")
        self.assertEqual(groups_data[0]["slave_roles"], ["prompt_slave_1", "prompt_slave_2"])
        self.assertTrue(groups_data[0]["is_enabled"])


