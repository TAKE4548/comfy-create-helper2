import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models, database

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


@pytest.fixture(autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    old_session_local = database.SessionLocal
    database.SessionLocal = TestingSessionLocal
    Base.metadata.create_all(bind=connection)
    yield
    Base.metadata.drop_all(bind=connection)
    database.SessionLocal = old_session_local
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_translate_applies_llm_params():
    db = TestingSessionLocal()
    db.add(models.LlmPrompt(
        key="llm_params_translation",
        content='{"temperature": 0.85, "top_p": 0.9, "max_tokens": 150, "presence_penalty": 0.5, "frequency_penalty": 0.6}',
        description="Translation parameters"
    ))
    db.commit()

    mock_response_data = {
        "choices": [
            {
                "message": {
                    "content": "Translated text"
                }
            }
        ]
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_response_data
        mock_resp.raise_for_status = lambda: None

        mock_client.post.return_value = mock_resp
        mock_client_class.return_value.__aenter__.return_value = mock_client

        response = client.post(
            "/api/llm-prompts/translate",
            json={"text": "こんにちは", "direction": "ja_to_en"}
        )
        assert response.status_code == 200
        assert response.json() == "Translated text"

        mock_client.post.assert_called_once()
        payload = mock_client.post.call_args[1]["json"]
        assert payload["temperature"] == 0.85
        assert payload["top_p"] == 0.9
        assert payload["max_tokens"] == 150
        assert payload["presence_penalty"] == 0.5
        assert payload["frequency_penalty"] == 0.6


def test_scene_generate_applies_llm_params():
    db = TestingSessionLocal()
    db.add(models.LlmPrompt(
        key="llm_params_scene_generate",
        content='{"temperature": 0.77, "top_p": 0.85, "max_tokens": 500, "presence_penalty": 0.2, "frequency_penalty": 0.3}',
        description="Scene generate parameters"
    ))
    # Fallback/Default scene generate system prompt
    db.add(models.LlmPrompt(
        key="scene_generate",
        content="System prompt",
        description="System prompt"
    ))
    db.commit()

    mock_response_data = {
        "choices": [
            {
                "message": {
                    "content": '[{"scene_id": "s1", "diff_params": {"FieldName": "tags"}}]'
                }
            }
        ]
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_response_data
        mock_resp.raise_for_status = lambda: None

        mock_client.post.return_value = mock_resp
        mock_client_class.return_value.__aenter__.return_value = mock_client

        response = client.post(
            "/api/llm-prompts/scene-generate",
            json={
                "target_fields": ["FieldName"],
                "base_params": {"FieldName": ""},
                "scenes": [{"id": "s1", "summary": "A sunny day"}],
                "anima_mode": False
            }
        )
        assert response.status_code == 200

        mock_client.post.assert_called_once()
        payload = mock_client.post.call_args[1]["json"]
        assert payload["temperature"] == 0.77
        assert payload["top_p"] == 0.85
        assert payload["max_tokens"] == 500
        assert payload["presence_penalty"] == 0.2
        assert payload["frequency_penalty"] == 0.3


def test_audit_applies_llm_params():
    db = TestingSessionLocal()
    db.add(models.LlmPrompt(
        key="llm_params_audit",
        content='{"temperature": 0.15, "top_p": 0.95, "max_tokens": 300, "presence_penalty": 0.1, "frequency_penalty": 0.1}',
        description="Audit parameters"
    ))
    db.commit()

    # XML tags corresponding to interference audit parse requirements
    mock_response_data = {
        "choices": [
            {
                "message": {
                    "content": "<remove_tags><item><tag>socks</tag><reason_jp>test</reason_jp></item></remove_tags>"
                }
            }
        ]
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_response_data
        mock_resp.raise_for_status = lambda: None

        mock_client.post.return_value = mock_resp
        mock_client_class.return_value.__aenter__.return_value = mock_client

        response = client.post(
            "/api/audit",
            json={
                "audit_types": ["interference"],
                "positive": "close-up, socks",
                "negative": "",
                "intent": "close-up",
                "model_hint": "sdxl"
            }
        )
        assert response.status_code == 200

        mock_client.post.assert_called_once()
        payload = mock_client.post.call_args[1]["json"]
        assert payload["temperature"] == 0.15
        assert payload["top_p"] == 0.95
        assert payload["max_tokens"] == 300
        assert payload["presence_penalty"] == 0.1
        assert payload["frequency_penalty"] == 0.1
