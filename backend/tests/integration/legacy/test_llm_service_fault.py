"""Backend fault injection tests for LLM service and router using respx."""
import pytest
import respx
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.services.llm_request import call_llm


from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app import database


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


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.asyncio
@respx.mock
async def test_call_llm_connect_timeout():
    respx.post(f"{settings.llm_base_url}/chat/completions").mock(
        side_effect=httpx.ConnectTimeout("LLM connection timed out")
    )
    with pytest.raises(httpx.ConnectTimeout):
        await call_llm(
            system_prompt="sys",
            user_prompt="user",
            timeout=5.0,
            model="test-model",
        )


@pytest.mark.asyncio
@respx.mock
async def test_call_llm_read_timeout():
    respx.post(f"{settings.llm_base_url}/chat/completions").mock(
        side_effect=httpx.ReadTimeout("LLM read timed out")
    )
    with pytest.raises(httpx.ReadTimeout):
        await call_llm(
            system_prompt="sys",
            user_prompt="user",
            timeout=5.0,
            model="test-model",
        )


@pytest.mark.asyncio
@respx.mock
async def test_call_llm_corrupted_response_missing_choices():
    respx.post(f"{settings.llm_base_url}/chat/completions").mock(
        return_value=httpx.Response(200, json={"error": "Internal model failure", "status": "failed"})
    )
    with pytest.raises(KeyError):
        await call_llm(
            system_prompt="sys",
            user_prompt="user",
            timeout=5.0,
            model="test-model",
        )


@respx.mock
def test_llm_prompts_translate_network_failure(client):
    respx.post(f"{settings.llm_base_url}/chat/completions").mock(
        side_effect=httpx.ConnectError("Connection refused by LLM host")
    )
    response = client.post(
        "/api/llm-prompts/translate",
        json={"text": "こんにちは", "direction": "ja_to_en"},
    )
    assert response.status_code == 500
    assert "Connection refused" in response.json()["detail"]


@respx.mock
def test_llm_prompts_scene_generate_timeout(client):
    respx.post(f"{settings.llm_base_url}/chat/completions").mock(
        side_effect=httpx.ReadTimeout("LLM inference timed out")
    )
    response = client.post(
        "/api/llm-prompts/scene-generate",
        json={
            "target_fields": ["Positive"],
            "base_params": {"Positive": "1girl"},
            "scenes": [{"id": "s1", "summary": "summer beach"}],
            "anima_mode": False,
        },
    )
    assert response.status_code == 500
    assert "timed out" in response.json()["detail"].lower()
