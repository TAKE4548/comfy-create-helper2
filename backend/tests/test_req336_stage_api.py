"""API tests for StageMaster CRUD, 3-layer deletion guards, and cascade endpoints (REQ-336)."""
import json
import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


class TestReq336StageAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)

    def tearDown(self):
        Base.metadata.drop_all(bind=connection)
        if self.old_override:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_list_and_create_stage(self):
        """Test listing and creating StageMaster records."""
        res = self.client.get("/api/stage-masters")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), [])

        # Create
        create_payload = {
            "key": "stage_refiner",
            "name": "Refiner Stage",
            "suffix": "_refiner",
            "search_keywords": ["refiner", "stage2"],
            "is_active": True,
            "sort_order": 1,
        }
        res_post = self.client.post("/api/stage-masters", json=create_payload)
        self.assertEqual(res_post.status_code, 201)
        data = res_post.json()
        self.assertEqual(data["key"], "stage_refiner")
        self.assertEqual(data["name"], "Refiner Stage")
        self.assertEqual(data["suffix"], "_refiner")
        self.assertEqual(data["search_keywords"], ["refiner", "stage2"])
        self.assertFalse(data["is_builtin"])
        stage_id = data["id"]

        # Duplicate key returns 400
        res_dup = self.client.post("/api/stage-masters", json=create_payload)
        self.assertEqual(res_dup.status_code, 400)
        self.assertIn("既に使用されています", res_dup.json()["detail"])

        # Get by ID
        res_get = self.client.get(f"/api/stage-masters/{stage_id}")
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.json()["id"], stage_id)

    def test_update_and_deactivate_cascade_to_variants(self):
        """Test updating stage and verifying that deactivation disables variants."""
        res_post = self.client.post("/api/stage-masters", json={
            "key": "detail",
            "name": "Detail",
            "suffix": "_detail",
            "is_active": True,
        })
        stage_id = res_post.json()["id"]

        # Add a mapping master and variant in DB
        db = TestingSessionLocal()
        group = models.MappingGroupMaster(key="grp", name="Grp")
        db.add(group)
        db.flush()
        master = models.MappingMaster(group_id=group.id, base_key="denoise", name="Denoise", param_name="denoise", input_type="float")
        db.add(master)
        db.flush()
        variant = models.MappingVariant(master_id=master.id, stage_id=stage_id, is_enabled=True)
        db.add(variant)
        db.commit()
        variant_id = variant.id
        db.close()

        # Update stage to inactive
        res_put = self.client.put(f"/api/stage-masters/{stage_id}", json={
            "name": "Detail (Inactive)",
            "is_active": False,
        })
        self.assertEqual(res_put.status_code, 200)
        self.assertFalse(res_put.json()["is_active"])
        self.assertEqual(res_put.json()["name"], "Detail (Inactive)")

        # Verify variant is_enabled cascaded to False
        db = TestingSessionLocal()
        v = db.get(models.MappingVariant, variant_id)
        self.assertIsNotNone(v)
        self.assertFalse(v.is_enabled)
        db.close()

        # Check include_inactive filter in list
        res_all = self.client.get("/api/stage-masters?include_inactive=true")
        self.assertEqual(len(res_all.json()), 1)
        res_active_only = self.client.get("/api/stage-masters?include_inactive=false")
        self.assertEqual(len(res_active_only.json()), 0)

    def test_reorder_stages(self):
        """Test reordering stage masters."""
        res1 = self.client.post("/api/stage-masters", json={"key": "s1", "name": "Stage 1", "suffix": "_1"})
        res2 = self.client.post("/api/stage-masters", json={"key": "s2", "name": "Stage 2", "suffix": "_2"})
        id1 = res1.json()["id"]
        id2 = res2.json()["id"]

        res_reorder = self.client.put("/api/stage-masters/reorder", json={"ordered_ids": [id2, id1]})
        self.assertEqual(res_reorder.status_code, 204)

        stages = self.client.get("/api/stage-masters").json()
        self.assertEqual([s["id"] for s in stages], [id2, id1])

    def test_deletion_guards_api(self):
        """Test API enforcement of builtin and usage deletion guards."""
        # Create builtin stage directly in DB
        db = TestingSessionLocal()
        builtin_stage = models.StageMaster(key="main", name="Main", suffix="", is_builtin=True, is_active=True)
        custom_stage = models.StageMaster(key="custom_stage", name="Custom", suffix="_c", is_builtin=False, is_active=True)
        db.add_all([builtin_stage, custom_stage])
        db.commit()
        builtin_id = builtin_stage.id
        custom_id = custom_stage.id
        db.close()

        # Delete builtin -> 400
        res_del_builtin = self.client.delete(f"/api/stage-masters/{builtin_id}")
        self.assertEqual(res_del_builtin.status_code, 400)
        self.assertIn("システム既定のステージは削除できません", res_del_builtin.json()["detail"])

        # Add active mapping usage to custom stage
        db = TestingSessionLocal()
        wf = models.Workflow(name="wf1", json_body="{}")
        db.add(wf)
        db.flush()
        grp = models.MappingGroupMaster(key="g", name="G")
        db.add(grp)
        db.flush()
        mm = models.MappingMaster(group_id=grp.id, base_key="k", name="K", param_name="k", input_type="int")
        db.add(mm)
        db.flush()
        mv = models.MappingVariant(master_id=mm.id, stage_id=custom_id)
        db.add(mv)
        db.flush()
        wm = models.WorkflowMapping(workflow_id=wf.id, variant_id=mv.id, node_id="10")
        db.add(wm)
        db.commit()
        db.close()

        # Check usages endpoint
        res_usages = self.client.get(f"/api/stage-masters/{custom_id}/usages")
        self.assertEqual(res_usages.status_code, 200)
        usages = res_usages.json()
        self.assertEqual(len(usages), 1)
        self.assertEqual(usages[0]["node_id"], "10")

        # Delete custom stage while in use -> 400
        res_del_used = self.client.delete(f"/api/stage-masters/{custom_id}")
        self.assertEqual(res_del_used.status_code, 400)
        self.assertIn("使用中のため削除できません", res_del_used.json()["detail"])

        # Remove mapping and verify successful delete -> 204
        db = TestingSessionLocal()
        db.query(models.WorkflowMapping).delete()
        db.commit()
        db.close()

        res_del_ok = self.client.delete(f"/api/stage-masters/{custom_id}")
        self.assertEqual(res_del_ok.status_code, 204)

        # Confirm deleted
        res_404 = self.client.get(f"/api/stage-masters/{custom_id}")
        self.assertEqual(res_404.status_code, 404)

    def test_cascade_preview_and_rename_endpoints(self):
        """Test cascade preview and execute endpoints."""
        res_post = self.client.post("/api/stage-masters", json={
            "key": "rough",
            "name": "Rough",
            "suffix": "_rough",
            "is_active": True,
        })
        stage_id = res_post.json()["id"]

        db = TestingSessionLocal()
        wf = models.Workflow(name="cascade_wf", json_body="{}")
        db.add(wf)
        db.flush()
        grp = models.MappingGroupMaster(key="p", name="P")
        db.add(grp)
        db.flush()
        mm = models.MappingMaster(group_id=grp.id, base_key="prompt", name="Prompt", param_name="text", input_type="textarea")
        db.add(mm)
        db.flush()
        mv = models.MappingVariant(master_id=mm.id, stage_id=stage_id)
        db.add(mv)
        db.flush()
        preset = models.WorkflowPreset(
            workflow_id=wf.id,
            name="p_test",
            param_values=json.dumps({"prompt_rough": "masterpiece"}),
            applied_assets="{}",
            batch_size=1,
            seed_mode="random",
            seed=0,
        )
        db.add(preset)
        db.commit()
        db.close()

        # GET preview
        res_prev_get = self.client.get(f"/api/stage-masters/{stage_id}/cascade-preview?new_suffix=_draft")
        self.assertEqual(res_prev_get.status_code, 200)
        p_data = res_prev_get.json()
        self.assertEqual(p_data["old_suffix"], "_rough")
        self.assertEqual(p_data["new_suffix"], "_draft")
        self.assertEqual(p_data["affected_variants_count"], 1)
        self.assertEqual(p_data["affected_presets_count"], 1)

        # POST preview
        res_prev_post = self.client.post(f"/api/stage-masters/{stage_id}/cascade-preview", json={"new_suffix": "_draft"})
        self.assertEqual(res_prev_post.status_code, 200)
        self.assertEqual(res_prev_post.json()["new_suffix"], "_draft")

        # Execute cascade rename
        res_rename = self.client.post(f"/api/stage-masters/{stage_id}/cascade-rename", json={
            "new_suffix": "_draft",
            "update_presets": True,
            "update_snapshots": True,
        })
        self.assertEqual(res_rename.status_code, 200)
        renamed_data = res_rename.json()
        self.assertEqual(renamed_data["suffix"], "_draft")
        self.assertEqual(renamed_data["previous_suffixes"], ["_rough"])

        # Check preset in DB
        db = TestingSessionLocal()
        p = db.query(models.WorkflowPreset).first()
        vals = json.loads(p.param_values)
        self.assertNotIn("prompt_rough", vals)
        self.assertEqual(vals["prompt_draft"], "masterpiece")
        db.close()


if __name__ == "__main__":
    unittest.main()
