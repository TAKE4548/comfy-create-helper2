import json
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
    app.dependency_overrides[get_db] = override_get_db
    old_session_local = database.SessionLocal
    database.SessionLocal = TestingSessionLocal
    Base.metadata.create_all(bind=connection)
    yield
    Base.metadata.drop_all(bind=connection)
    database.SessionLocal = old_session_local
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_speech_draft_endpoint():
    db = TestingSessionLocal()
    
    # Create workflow
    wf = models.Workflow(
        name="test_wf",
        json_body="{}"
    )
    db.add(wf)
    db.flush()

    # Create snapshot
    snapshot = models.Snapshot(
        workflow_id=wf.id,
        params=json.dumps({"positive": "1girl, holding a book"}),
        image_path="/api/snapshots/images/test_snapshot_img.png"
    )
    db.add(snapshot)
    
    # Seed prompt configuration
    db.add(models.LlmPrompt(
        key="speech_draft_vlm_model",
        content="vlm-model-name",
        description=""
    ))
    db.add(models.LlmPrompt(
        key="speech_draft_vlm_prompt",
        content="VLM system instructions",
        description=""
    ))
    db.add(models.LlmPrompt(
        key="speech_draft_llm_model",
        content="llm-model-name",
        description=""
    ))
    db.add(models.LlmPrompt(
        key="speech_draft_llm_prompt",
        content="LLM system instructions",
        description=""
    ))
    db.commit()

    # Create dummy image file content
    dummy_img_content = b"dummy image bytes"
    
    # Set up mocked async httpx calls (first for call_vlm, second for call_llm inside llm_request)
    # Actually, we can patch AsyncClient.post to handle both requests sequentially:
    # 1. VLM: returns description
    # 2. LLM: returns final dialogue draft
    
    mock_resp_vlm = MagicMock()
    mock_resp_vlm.status_code = 200
    mock_resp_vlm.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": "A girl is standing in a library, holding a book."
                }
            }
        ]
    }
    mock_resp_vlm.raise_for_status = lambda: None

    mock_resp_llm = MagicMock()
    mock_resp_llm.status_code = 200
    mock_resp_llm.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": "「今日はこの本を読もうかな」"
                }
            }
        ]
    }
    mock_resp_llm.raise_for_status = lambda: None

    from unittest.mock import mock_open
    with patch("builtins.open", mock_open(read_data=dummy_img_content)):
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.post.side_effect = [mock_resp_vlm, mock_resp_llm]
            mock_client_class.return_value.__aenter__.return_value = mock_client

            response = client.post(
                "/api/llm-prompts/speech-draft",
                json={"snapshot_id": snapshot.id}
            )
            
            assert response.status_code == 200
            assert response.json() == {"draft": "「今日はこの本を読もうかな」"}
            
            # Verify HTTP calls
            assert mock_client.post.call_count == 2
            
            # Verify first call payload (VLM)
            vlm_call_payload = mock_client.post.call_args_list[0][1]["json"]
            assert vlm_call_payload["model"] == "vlm-model-name"
            assert vlm_call_payload["messages"][0]["content"] == "VLM system instructions"
            assert vlm_call_payload["messages"][1]["content"][0]["type"] == "image_url"
            
            # Verify second call payload (LLM)
            llm_call_payload = mock_client.post.call_args_list[1][1]["json"]
            assert llm_call_payload["model"] == "llm-model-name"
            assert llm_call_payload["messages"][0]["content"] == "LLM system instructions"
            assert "A girl is standing in a library" in llm_call_payload["messages"][1]["content"]
            assert "1girl, holding a book" in llm_call_payload["messages"][1]["content"]
