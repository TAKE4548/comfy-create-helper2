import unittest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models, schemas
from app.services.llm_service import _parse_scene_generate

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

class TestSceneGenerator(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        models.Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)
        if self.old_override:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_parse_scene_generate(self):
        # Raw json response
        raw = '[{"scene_id": "1", "diff_params": {"positive": "1girl, cute"}}]'
        parsed = _parse_scene_generate(raw)
        self.assertEqual(parsed, [{"scene_id": "1", "diff_params": {"positive": "1girl, cute"}}])

        # Markdown fenced response
        raw_markdown = '```json\n[{"scene_id": "2", "diff_params": {"positive": "1boy"}}]\n```'
        parsed_md = _parse_scene_generate(raw_markdown)
        self.assertEqual(parsed_md, [{"scene_id": "2", "diff_params": {"positive": "1boy"}}])

    @patch("app.services.llm_service.call_llm", new_callable=AsyncMock)
    def test_scene_generate_endpoint(self, mock_call_llm):
        # Mock LLM response
        mock_call_llm.return_value = '[{"scene_id": "scene-abc", "diff_params": {"positive": "cute cat, playing"}}]'

        payload = {
            "target_fields": ["positive"],
            "base_params": {"positive": "cat"},
            "scenes": [
                {"id": "scene-abc", "summary": "可愛い猫が遊んでいる"}
            ]
        }
        response = self.client.post("/api/llm-prompts/scene-generate", json=payload)
        print("RESPONSE JSON:", response.json())
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["scene_id"], "scene-abc")
        self.assertEqual(data[0]["diff_params"]["positive"], "cute cat, playing")

        # Verify LLM was called
        mock_call_llm.assert_called_once()
