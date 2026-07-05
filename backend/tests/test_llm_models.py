import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models, database
from app.config import settings

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


@pytest.fixture(autouse=True)
def setup_db():
    # Override get_db dependency
    app.dependency_overrides[get_db] = override_get_db
    # Override app.database.SessionLocal
    old_session_local = database.SessionLocal
    database.SessionLocal = TestingSessionLocal
    # Create all tables
    Base.metadata.create_all(bind=connection)
    
    yield
    
    # Clean up tables
    Base.metadata.drop_all(bind=connection)
    # Restore SessionLocal
    database.SessionLocal = old_session_local
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


@pytest.mark.anyio
async def test_get_models_mock():
    mock_response_data = {
        "data": [
            {"id": "meta-llama-3-8b-instruct"},
            {"id": "gpt-4o"}
        ]
    }
    
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_response_data
        mock_resp.raise_for_status = lambda: None
        
        mock_client.get.return_value = mock_resp
        mock_client_class.return_value.__aenter__.return_value = mock_client

        response = client.get("/api/llm-prompts/models")
        assert response.status_code == 200
        models_list = response.json()
        assert "meta-llama-3-8b-instruct" in models_list
        assert "gpt-4o" in models_list


def test_get_current_model_default():
    # When no model is stored in DB, returns the setting
    response = client.get("/api/llm-prompts/current-model")
    assert response.status_code == 200
    data = response.json()
    assert data["key"] == "llm_model"
    assert data["content"] == settings.llm_model


def test_put_and_get_current_model():
    # Test PUT saves to DB
    response = client.put("/api/llm-prompts/current-model", json={"model": "my-custom-model"})
    assert response.status_code == 200
    data = response.json()
    assert data["key"] == "llm_model"
    assert data["content"] == "my-custom-model"

    # Verify GET returns the saved model
    response = client.get("/api/llm-prompts/current-model")
    assert response.status_code == 200
    data = response.json()
    assert data["content"] == "my-custom-model"


@pytest.mark.anyio
async def test_call_llm_override():
    from app.services.llm_request import call_llm
    
    mock_response_data = {
        "choices": [
            {
                "message": {
                    "content": "LLM response text"
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

        # Call LLM with explicit model override
        res = await call_llm("system", "user", model="override-model-name")
        assert res == "LLM response text"
        
        # Verify the payload sent to httpx contains the override model
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert call_args is not None
        payload = call_args[1]["json"]
        assert payload["model"] == "override-model-name"
