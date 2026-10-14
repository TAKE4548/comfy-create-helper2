import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models, database

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
    app.dependency_overrides[get_db] = override_get_db
    old_session_local = database.SessionLocal
    database.SessionLocal = TestingSessionLocal
    Base.metadata.create_all(bind=connection)
    yield
    Base.metadata.drop_all(bind=connection)
    database.SessionLocal = old_session_local
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_translate_fallback_default_ja_to_en():
    # DBが空の場合、デフォルトのシステムプロンプトを用いて ja_to_en 翻訳を行う
    mock_response_data = {
        "choices": [
            {
                "message": {
                    "content": "Translated English Prompt"
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
            json={"text": "女の子、笑顔", "direction": "ja_to_en"}
        )
        assert response.status_code == 200
        assert response.json() == "Translated English Prompt"
        
        # 検証: ポストパラメータ
        mock_client.post.assert_called_once()
        payload = mock_client.post.call_args[1]["json"]
        assert "professional prompt translator" in payload["messages"][0]["content"]
        assert payload["messages"][1]["content"] == "女の子、笑顔"
        # translation_model が空なので None から fallback される (デフォルトは settings.llm_model が call_llm 内部で使われる)
        # テストではモックの payload 内の model を検証
        assert payload["model"] is not None


def test_translate_with_db_records():
    # DBにカスタムプロンプトと翻訳モデルを設定
    db = TestingSessionLocal()
    db.add(models.LlmPrompt(
        key="translation_ja_to_en",
        content="Custom translation prompt.",
        description="Custom translator",
    ))
    db.add(models.LlmPrompt(
        key="translation_model",
        content="translation-llm-model",
        description="model name",
    ))
    db.commit()

    mock_response_data = {
        "choices": [
            {
                "message": {
                    "content": "Custom Translated Text"
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
        assert response.json() == "Custom Translated Text"
        
        # 検証: DBのカスタムプロンプトおよびカスタムモデルが使われているか
        mock_client.post.assert_called_once()
        payload = mock_client.post.call_args[1]["json"]
        assert payload["messages"][0]["content"] == "Custom translation prompt."
        assert payload["model"] == "translation-llm-model"


def test_translate_en_to_ja():
    # DBに en_to_ja 用のカスタムプロンプトを設定
    db = TestingSessionLocal()
    db.add(models.LlmPrompt(
        key="translation_en_to_ja",
        content="Custom EN-to-JP translator prompt.",
        description="Custom JP translator",
    ))
    db.commit()

    mock_response_data = {
        "choices": [
            {
                "message": {
                    "content": "こんにちは"
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
            json={"text": "Hello", "direction": "en_to_ja"}
        )
        assert response.status_code == 200
        assert response.json() == "こんにちは"
        
        mock_client.post.assert_called_once()
        payload = mock_client.post.call_args[1]["json"]
        assert payload["messages"][0]["content"] == "Custom EN-to-JP translator prompt."
