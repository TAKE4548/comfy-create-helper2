import asyncio
import json
import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models, database
from app.config import settings
from app.services.speech_draft_service import (
    SceneVlmCompletion,
    VlmResponseShapeError,
    call_scene_vlm,
    call_vlm,
)

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


def test_call_vlm_sends_jpeg_data_url():
    response = MagicMock()
    response.json.return_value = {"choices": [{"message": {"content": "description"}}]}
    response.raise_for_status.return_value = None
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class:
        client_class.return_value.__aenter__.return_value.post = AsyncMock(return_value=response)
        assert asyncio.run(call_vlm("jpeg-bytes", "prompt", "model")) == "description"
        payload = client_class.return_value.__aenter__.return_value.post.call_args.kwargs["json"]
    assert payload["model"] == "model"
    assert payload["messages"][0]["content"] == "prompt"
    assert payload["messages"][1]["content"][0]["image_url"]["url"] == "data:image/jpeg;base64,jpeg-bytes"
    assert payload["messages"][1]["content"][1]["text"] == "この画像の内容を日本語で簡潔に説明してください。"


def test_call_scene_vlm_uses_instance_id_and_json_schema():
    response = MagicMock()
    response.json.return_value = {
        "choices": [{"message": {"content": '{"scene_interpretation":"雨","items":[]}'}, "finish_reason": "stop"}]
    }
    response.raise_for_status.return_value = None
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class:
        client_class.return_value.__aenter__.return_value.post = AsyncMock(return_value=response)
        result = asyncio.run(call_scene_vlm("jpeg-bytes", "scene prompt", "loaded-instance-id"))
        payload = client_class.return_value.__aenter__.return_value.post.call_args.kwargs["json"]

    assert result == SceneVlmCompletion(content='{"scene_interpretation":"雨","items":[]}', finish_reason="stop")
    assert payload["model"] == "loaded-instance-id"
    assert payload["messages"][0]["content"].startswith("scene prompt")
    assert "指定JSON" in payload["messages"][0]["content"]
    assert payload["messages"][1]["content"][0]["image_url"]["url"] == "data:image/jpeg;base64,jpeg-bytes"
    assert "指定JSON" in payload["messages"][1]["content"][1]["text"]
    json_schema = payload["response_format"]
    assert json_schema["type"] == "json_schema"
    assert json_schema["json_schema"]["strict"] is True
    schema = json_schema["json_schema"]["schema"]
    assert schema["required"] == ["scene_interpretation", "items"]
    assert schema["properties"]["items"]["minItems"] == 1
    item_schema = schema["properties"]["items"]["items"]
    assert item_schema["required"] == ["role", "speaker", "text", "position"]
    assert item_schema["properties"]["role"]["enum"] == ["main", "sub", "se"]
    assert item_schema["properties"]["position"]["enum"] == [
        "top_right", "center_right", "center", "top_left", "bottom_left"
    ]


@pytest.mark.parametrize("finish_reason", ["length", "content_filter", None])
def test_call_scene_vlm_returns_incomplete_finish_reasons(finish_reason):
    response = MagicMock()
    response.json.return_value = {
        "choices": [{"message": {"content": None}, "finish_reason": finish_reason}]
    }
    response.raise_for_status.return_value = None
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class:
        client_class.return_value.__aenter__.return_value.post = AsyncMock(return_value=response)
        result = asyncio.run(call_scene_vlm("jpeg", "prompt", "instance"))
    assert result == SceneVlmCompletion(content=None, finish_reason=finish_reason)


@pytest.mark.parametrize("body", [{}, {"choices": []}, {"choices": [{}]}, {"choices": [{"message": None}]}])
def test_call_scene_vlm_rejects_missing_response_shape(body):
    response = MagicMock()
    response.json.return_value = body
    response.raise_for_status.return_value = None
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class:
        client_class.return_value.__aenter__.return_value.post = AsyncMock(return_value=response)
        with pytest.raises(VlmResponseShapeError) as exc_info:
            asyncio.run(call_scene_vlm("jpeg", "prompt", "instance"))
    assert str(exc_info.value) == VlmResponseShapeError.code


def test_call_scene_vlm_http_error_does_not_expose_response_body():
    request = httpx.Request("POST", "http://localhost/chat/completions")
    response = httpx.Response(400, text="secret model diagnostic", request=request)
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class:
        client_class.return_value.__aenter__.return_value.post = AsyncMock(return_value=response)
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            asyncio.run(call_scene_vlm("jpeg", "prompt", "instance"))
    assert "secret model diagnostic" not in str(exc_info.value)


def test_call_scene_vlm_waits_for_recovered_instance_readiness():
    request = httpx.Request("POST", "http://localhost/chat/completions")
    not_ready = httpx.Response(400, json={"error": "Model is unloaded."}, request=request)
    ready = httpx.Response(200, json={
        "choices": [{"message": {"content": '{"scene_interpretation":"ok","items":[]}'},
                     "finish_reason": "stop"}]
    }, request=request)
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class, \
         patch("app.services.speech_draft_service.asyncio.sleep", new_callable=AsyncMock) as sleep:
        post = client_class.return_value.__aenter__.return_value.post
        post.side_effect = [not_ready, ready]
        result = asyncio.run(call_scene_vlm("jpeg", "prompt", "same-instance"))
        assert [call.kwargs["json"]["model"] for call in post.call_args_list] == [
            "same-instance", "same-instance"
        ]
        sleep.assert_awaited_once()
    assert result.finish_reason == "stop"


def test_call_scene_vlm_retries_read_timeout_after_exact_starting_error():
    request = httpx.Request("POST", "http://localhost/chat/completions")
    not_ready = httpx.Response(400, json={"error": "Model is unloaded."}, request=request)
    ready = httpx.Response(200, json={
        "choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]
    }, request=request)
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class, \
         patch("app.services.speech_draft_service.asyncio.sleep", new_callable=AsyncMock):
        post = client_class.return_value.__aenter__.return_value.post
        post.side_effect = [not_ready, httpx.ReadTimeout("still starting", request=request), ready]
        result = asyncio.run(call_scene_vlm("jpeg", "prompt", "same-instance"))
        assert post.await_count == 3
        assert all(call.kwargs["json"]["model"] == "same-instance" for call in post.call_args_list)
    assert result.content == "{}"


def test_call_scene_vlm_does_not_retry_initial_read_timeout():
    request = httpx.Request("POST", "http://localhost/chat/completions")
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class:
        post = client_class.return_value.__aenter__.return_value.post
        post.side_effect = httpx.ReadTimeout("generation timed out", request=request)
        with pytest.raises(httpx.ReadTimeout):
            asyncio.run(call_scene_vlm("jpeg", "prompt", "same-instance"))
        post.assert_awaited_once()


def test_call_scene_vlm_does_not_retry_other_http_400():
    request = httpx.Request("POST", "http://localhost/chat/completions")
    rejected = httpx.Response(400, json={"error": "Invalid schema."}, request=request)
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class:
        post = client_class.return_value.__aenter__.return_value.post
        post.return_value = rejected
        with pytest.raises(httpx.HTTPStatusError):
            asyncio.run(call_scene_vlm("jpeg", "prompt", "same-instance"))
        post.assert_awaited_once()


def test_call_scene_vlm_readiness_retry_is_bounded():
    request = httpx.Request("POST", "http://localhost/chat/completions")
    not_ready = httpx.Response(400, json={"error": "Model is unloaded."}, request=request)
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class, \
         patch("app.services.speech_draft_service._READY_RETRY_SECONDS", 0.001), \
         patch("app.services.speech_draft_service._READY_POLL_SECONDS", 0):
        post = client_class.return_value.__aenter__.return_value.post
        post.return_value = not_ready
        with pytest.raises(RuntimeError, match="LM_STUDIO_INSTANCE_NOT_READY"):
            asyncio.run(call_scene_vlm("jpeg", "prompt", "same-instance"))
        assert post.await_count >= 1


def test_call_vlm_400_includes_response_body():
    request = httpx.Request("POST", "http://localhost/chat/completions")
    response = httpx.Response(400, text="invalid image", request=request)
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class:
        client_class.return_value.__aenter__.return_value.post = AsyncMock(return_value=response)
        with pytest.raises(Exception, match="400.*invalid image"):
            asyncio.run(call_vlm("jpeg-bytes", "prompt", "model"))


@pytest.mark.parametrize("error_type", [httpx.ConnectError, httpx.TimeoutException])
def test_call_vlm_transport_errors_remain_classifiable(error_type):
    request = httpx.Request("POST", "http://localhost/chat/completions")
    with patch("app.services.speech_draft_service.httpx.AsyncClient") as client_class:
        client_class.return_value.__aenter__.return_value.post = AsyncMock(
            side_effect=error_type("transport failure", request=request)
        )
        with pytest.raises(error_type):
            asyncio.run(call_vlm("jpeg-bytes", "prompt", "model"))


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
