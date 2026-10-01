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
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


class TestPromptMetadataRouter(unittest.TestCase):
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

    def test_save_and_get_prompt_metadata(self):
        # 1. 保存 (POST)
        payload = {
            "prompt_id": "p-12345",
            "workflow_id": 1,
            "param_values": {"prompt": "a beautiful landscape", "steps": 20},
            "applied_assets": {"loras": [{"name": "detailer", "strength": 0.8}]}
        }
        res = self.client.post("/api/prompt-metadata", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok", "prompt_id": "p-12345"})

        # 2. 取得 (GET)
        res_get = self.client.get("/api/prompt-metadata/p-12345")
        self.assertEqual(res_get.status_code, 200)
        data = res_get.json()
        self.assertEqual(data["prompt_id"], "p-12345")
        self.assertEqual(data["workflow_id"], 1)
        self.assertEqual(data["param_values"]["prompt"], "a beautiful landscape")
        self.assertEqual(data["applied_assets"]["loras"][0]["name"], "detailer")

    def test_upsert_prompt_metadata(self):
        # 初回保存
        self.client.post("/api/prompt-metadata", json={
            "prompt_id": "p-upsert",
            "workflow_id": 1,
            "param_values": {"seed": 111}
        })
        # 更新
        res = self.client.post("/api/prompt-metadata", json={
            "prompt_id": "p-upsert",
            "workflow_id": 2,
            "param_values": {"seed": 999},
            "applied_assets": {"test": True}
        })
        self.assertEqual(res.status_code, 200)

        res_get = self.client.get("/api/prompt-metadata/p-upsert")
        self.assertEqual(res_get.status_code, 200)
        data = res_get.json()
        self.assertEqual(data["workflow_id"], 2)
        self.assertEqual(data["param_values"]["seed"], 999)

    def test_get_not_found(self):
        res = self.client.get("/api/prompt-metadata/non-existent")
        self.assertEqual(res.status_code, 404)
