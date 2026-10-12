import unittest

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base, get_db
from app.main import app
from app.schemas.workflow import WorkflowMappingRead


engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


class TestReq353SeedMappingAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        db = TestingSessionLocal()
        db.add_all([
            models.StageMaster(key="main", name="Main", suffix="", search_keywords="[]", previous_suffixes="[]", is_builtin=True, is_active=True, sort_order=0),
            models.StageMaster(key="rough", name="Rough", suffix="_rough", search_keywords="[]", previous_suffixes="[]", is_builtin=True, is_active=True, sort_order=1),
        ])
        db.commit()
        db.close()

    def tearDown(self):
        Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def _create_master(self, base_key, fallback_param_names=None):
        response = self.client.post(
            "/api/mapping-masters",
            json={
                "base_key": base_key,
                "name": base_key,
                "param_name": "seed",
                "input_type": "seed",
                "base_title_patterns": ["KSampler"],
                "fallback_param_names": fallback_param_names,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def _create_workflow(self, name, mappings):
        response = self.client.post(
            "/api/workflows",
            json={
                "name": name,
                "json_body": {"1": {"class_type": "KSampler", "inputs": {}}},
                "mappings": mappings,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_get_workflow_returns_ordered_fallbacks_for_master_and_variant_mapping(self):
        master = self._create_master("req353_seed", ["noise_seed", "seed_alt"])
        variant_id = master["variants"][0]["id"]
        workflow_id = self._create_workflow(
            "REQ-353 fallback order",
            [
                {"master_id": master["id"], "node_id": "1"},
                {"master_id": master["id"], "variant_id": variant_id, "node_id": "2"},
            ],
        )

        response = self.client.get(f"/api/workflows/{workflow_id}")

        self.assertEqual(response.status_code, 200, response.text)
        mappings = response.json()["mappings"]
        self.assertEqual(mappings[0]["fallback_param_names"], ["noise_seed", "seed_alt"])
        self.assertEqual(mappings[0]["variant_id"], None)
        self.assertEqual(mappings[1]["fallback_param_names"], ["noise_seed", "seed_alt"])
        self.assertEqual(mappings[1]["master_id"], master["id"])
        self.assertEqual(mappings[1]["variant_id"], variant_id)

    def test_get_workflow_preserves_null_and_empty_fallbacks(self):
        null_master = self._create_master("req353_null")
        empty_master = self._create_master("req353_empty", ["temporary"])
        db = TestingSessionLocal()
        empty_row = db.query(models.MappingMaster).filter_by(id=empty_master["id"]).one()
        empty_row.fallback_param_names = "[]"
        db.commit()
        db.close()
        workflow_id = self._create_workflow(
            "REQ-353 null versus empty",
            [
                {"master_id": null_master["id"], "node_id": "1"},
                {"master_id": empty_master["id"], "node_id": "2"},
            ],
        )

        response = self.client.get(f"/api/workflows/{workflow_id}")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["mappings"][0]["fallback_param_names"])
        self.assertEqual(response.json()["mappings"][1]["fallback_param_names"], [])

    def test_get_missing_workflow_returns_404(self):
        response = self.client.get("/api/workflows/999999")
        self.assertEqual(response.status_code, 404)

    def test_schema_rejects_malformed_fallback_json_and_non_lists(self):
        base = {"id": 1, "master_id": 1, "node_id": "1"}
        for value in ("{bad json", "{}", ["noise_seed", 2]):
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    WorkflowMappingRead(**base, fallback_param_names=value)


if __name__ == "__main__":
    unittest.main()
