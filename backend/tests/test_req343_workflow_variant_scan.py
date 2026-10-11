import unittest
import json
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
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


class TestWorkflowVariantScan(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        models.Base.metadata.drop_all(bind=connection)
        models.Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        self.stage_main = models.StageMaster(
            key="main",
            name="Main Stage",
            sort_order=1,
            suffix="_main",
            search_keywords=json.dumps(["main", "txt2img"]),
        )
        self.stage_refiner = models.StageMaster(
            key="refiner",
            name="Refiner Stage",
            sort_order=2,
            suffix="_refiner",
            search_keywords=json.dumps(["refiner", "img2img"]),
        )
        self.db.add_all([self.stage_main, self.stage_refiner])
        self.db.commit()
        self.db.refresh(self.stage_main)
        self.db.refresh(self.stage_refiner)

        self.master_prompt = models.MappingMaster(
            role="prompt",
            base_key="prompt",
            param_name="text",
            input_type="string",
            display_name="Prompt",
            expected_class_types=json.dumps(["CLIPTextEncode"]),
            title_patterns=json.dumps(["Prompt"]),
            sort_order=1,
        )
        self.db.add(self.master_prompt)
        self.db.commit()
        self.db.refresh(self.master_prompt)

        self.variant_main = models.MappingVariant(
            master_id=self.master_prompt.id,
            stage_id=self.stage_main.id,
            custom_role_override=None,
            is_enabled=True,
            sort_order=1,
        )
        self.variant_refiner = models.MappingVariant(
            master_id=self.master_prompt.id,
            stage_id=self.stage_refiner.id,
            custom_role_override=None,
            is_enabled=True,
            sort_order=2,
        )
        self.db.add_all([self.variant_main, self.variant_refiner])
        self.db.commit()
        self.db.refresh(self.variant_main)
        self.db.refresh(self.variant_refiner)

    def tearDown(self):
        self.db.close()
        app.dependency_overrides[get_db] = self.old_override

    def test_scan_workflow_variants_matching(self):
        workflow_json = {
            "1": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Main Prompt"},
                "inputs": {"text": "masterpiece, best quality"},
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Refiner Prompt"},
                "inputs": {"text": "highly detailed"},
            },
        }

        resp = self.client.post("/api/workflows/scan", json={"json_body": workflow_json})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        matched = data.get("matched", [])
        self.assertEqual(len(matched), 2)

        matched_main = next((m for m in matched if m.get("stage_key") == "main"), None)
        self.assertIsNotNone(matched_main)
        self.assertEqual(matched_main["node_id"], "1")
        self.assertEqual(matched_main["role"], "prompt_main")
        self.assertEqual(matched_main["variant_id"], self.variant_main.id)
        self.assertEqual(matched_main["stage_id"], self.stage_main.id)

        matched_refiner = next((m for m in matched if m.get("stage_key") == "refiner"), None)
        self.assertIsNotNone(matched_refiner)
        self.assertEqual(matched_refiner["node_id"], "2")
        self.assertEqual(matched_refiner["role"], "prompt_refiner")
        self.assertEqual(matched_refiner["variant_id"], self.variant_refiner.id)
        self.assertEqual(matched_refiner["stage_id"], self.stage_refiner.id)

    def test_workflow_crud_with_variant_id(self):
        workflow_json = {
            "1": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Main Prompt"},
                "inputs": {"text": "hello"},
            }
        }

        create_payload = {
            "name": "wf_test_variants",
            "json_body": workflow_json,
            "mappings": [
                {
                    "master_id": self.master_prompt.id,
                    "node_id": "1",
                    "variant_id": self.variant_main.id,
                }
            ],
        }
        res = self.client.post("/api/workflows", json=create_payload)
        self.assertEqual(res.status_code, 201)
        wf_id = res.json()["id"]

        get_res = self.client.get(f"/api/workflows/{wf_id}")
        self.assertEqual(get_res.status_code, 200)
        wf_data = get_res.json()
        mappings = wf_data.get("mappings", [])
        self.assertEqual(len(mappings), 1)
        self.assertEqual(mappings[0]["variant_id"], self.variant_main.id)
        self.assertEqual(mappings[0]["role"], "prompt_main")
        self.assertEqual(mappings[0]["master_id"], self.master_prompt.id)

        update_payload = {
            "mappings": [
                {
                    "master_id": self.master_prompt.id,
                    "node_id": "1",
                    "variant_id": self.variant_refiner.id,
                }
            ]
        }
        put_res = self.client.put(f"/api/workflows/{wf_id}", json=update_payload)
        self.assertEqual(put_res.status_code, 200)

        get_res2 = self.client.get(f"/api/workflows/{wf_id}")
        self.assertEqual(get_res2.status_code, 200)
        mappings2 = get_res2.json().get("mappings", [])
        self.assertEqual(len(mappings2), 1)
        self.assertEqual(mappings2[0]["variant_id"], self.variant_refiner.id)
        self.assertEqual(mappings2[0]["role"], "prompt_refiner")

        copy_res = self.client.post(f"/api/workflows/{wf_id}/copy", json={"name": "wf_test_variants_copy"})
        self.assertEqual(copy_res.status_code, 201)
        copy_id = copy_res.json()["id"]

        get_copy_res = self.client.get(f"/api/workflows/{copy_id}")
        self.assertEqual(get_copy_res.status_code, 200)
        copy_mappings = get_copy_res.json().get("mappings", [])
        self.assertEqual(len(copy_mappings), 1)
        self.assertEqual(copy_mappings[0]["variant_id"], self.variant_refiner.id)
        self.assertEqual(copy_mappings[0]["role"], "prompt_refiner")

        new_json = {"2": {"class_type": "CLIPTextEncode", "inputs": {"text": "world"}}}
        self.client.put(f"/api/workflows/{wf_id}", json={
            "json_body": new_json,
            "mappings": [
                {
                    "master_id": self.master_prompt.id,
                    "node_id": "2",
                    "variant_id": self.variant_main.id,
                }
            ],
        })

        rb_res = self.client.post(f"/api/workflows/{wf_id}/rollback")
        self.assertEqual(rb_res.status_code, 200)

        get_rb_res = self.client.get(f"/api/workflows/{wf_id}")
        self.assertEqual(get_rb_res.status_code, 200)
        rb_mappings = get_rb_res.json().get("mappings", [])
        self.assertEqual(len(rb_mappings), 1)
        self.assertEqual(rb_mappings[0]["variant_id"], self.variant_refiner.id)
        self.assertEqual(rb_mappings[0]["role"], "prompt_refiner")

    def test_workflow_update_with_empty_mappings(self):
        """Red Team 1: all slots cleared -> saving 0 mappings must succeed and persist empty."""
        workflow_json = {"1": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}}}
        res = self.client.post("/api/workflows", json={
            "name": "wf_test_empty_mappings",
            "json_body": workflow_json,
            "mappings": [
                {
                    "master_id": self.master_prompt.id,
                    "node_id": "1",
                    "variant_id": self.variant_main.id,
                }
            ],
        })
        self.assertEqual(res.status_code, 201)
        wf_id = res.json()["id"]

        put_res = self.client.put(f"/api/workflows/{wf_id}", json={"mappings": []})
        self.assertEqual(put_res.status_code, 200)

        get_res = self.client.get(f"/api/workflows/{wf_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json().get("mappings", []), [])

        create_res = self.client.post("/api/workflows", json={
            "name": "wf_test_created_empty",
            "json_body": workflow_json,
            "mappings": [],
        })
        self.assertEqual(create_res.status_code, 201)
