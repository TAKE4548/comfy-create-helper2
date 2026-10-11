import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base, get_db
from app.main import app


engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


class TestReq350SeedMappingAPI(unittest.TestCase):
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

    def test_seed_type_round_trips_and_workflow_mapping_keeps_variant(self):
        created = self.client.post(
            "/api/mapping-masters",
            json={
                "base_key": "req350_seed",
                "name": "Seed",
                "param_name": "seed",
                "input_type": "seed",
                "base_title_patterns": ["KSampler"],
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        master = created.json()
        master_id = master["id"]
        variant_id = master["variants"][0]["id"]

        updated = self.client.put(
            f"/api/mapping-masters/{master_id}",
            json={"input_type": "seed"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["input_type"], "seed")

        reread = self.client.get(f"/api/mapping-masters/{master_id}")
        self.assertEqual(reread.status_code, 200, reread.text)
        self.assertEqual(reread.json()["input_type"], "seed")

        workflow_created = self.client.post(
            "/api/workflows",
            json={
                "name": "REQ-350 Seed contract",
                "json_body": {"1": {"class_type": "KSampler", "inputs": {}}},
                "mappings": [
                    {"master_id": master_id, "variant_id": variant_id, "node_id": "1"}
                ],
            },
        )
        self.assertEqual(workflow_created.status_code, 201, workflow_created.text)
        workflow = self.client.get(f"/api/workflows/{workflow_created.json()['id']}")
        self.assertEqual(workflow.status_code, 200, workflow.text)
        mapping = workflow.json()["mappings"][0]
        self.assertEqual(mapping["input_type"], "seed")
        self.assertEqual(mapping["variant_id"], variant_id)


if __name__ == "__main__":
    unittest.main()
