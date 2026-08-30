import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app import schemas

client = TestClient(app)

@pytest.mark.asyncio
async def test_speech_batch_lifecycle():
    with patch("app.services.speech_parser.call_llm", new_callable=AsyncMock) as mock_call_llm:
        mock_call_llm.return_value = (
            "<interpretation>親しい挨拶</interpretation>\n"
            "<reasoning>親密さを付加</reasoning>\n"
            "<dialogue>変換後のセリフ</dialogue>"
        )
        
        payload = {
            "tone_prompt": "ツンデレ風に",
            "items": [
                {
                    "id": "1_b1",
                    "snapshot_id": 1,
                    "bubble_id": "b1",
                    "bubble_index": 0,
                    "text": "こんにちは"
                },
                {
                    "id": "1_b2",
                    "snapshot_id": 1,
                    "bubble_id": "b2",
                    "bubble_index": 1,
                    "text": "さようなら"
                }
            ]
        }
        
        res = client.post("/api/speech-batch/jobs", json=payload)
        assert res.status_code == 201
        data = res.json()
        job_id = data["job_id"]
        assert data["total_count"] == 2
        assert len(data["items"]) == 2
        
        # Wait for async background task to complete
        await asyncio.sleep(0.2)
        
        res = client.get(f"/api/speech-batch/jobs/{job_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "completed"
        assert data["completed_count"] == 2
        assert data["items"][0]["rewritten_text"] == "変換後のセリフ"
        assert data["items"][0]["scene_interpretation"] == "親しい挨拶"
        assert data["items"][0]["reasoning"] == "親密さを付加"
        assert data["items"][1]["rewritten_text"] == "変換後のセリフ"
        
        # Test retry item with revision_instruction
        retry_payload = {
            "revision_instruction": "もっと怒った感じで",
        }
        res = client.post(f"/api/speech-batch/jobs/{job_id}/items/1_b1/retry", json=retry_payload)
        assert res.status_code == 200
        await asyncio.sleep(0.2)
        res = client.get(f"/api/speech-batch/jobs/{job_id}")
        data = res.json()
        assert data["status"] == "completed"
        assert data["items"][0]["revision_instruction"] == "もっと怒った感じで"
        assert data["items"][0]["previous_rewritten_text"] == "変換後のセリフ"


@pytest.mark.asyncio
async def test_speech_batch_with_scene_hint_and_image():
    with patch("app.routers.speech_batch.load_image_as_base64", return_value="dummybase64"), \
         patch("app.services.speech_parser.call_llm", new_callable=AsyncMock) as mock_call_llm, \
         patch("pathlib.Path.exists", return_value=True):
        mock_call_llm.return_value = "<dialogue>変換後のマルチモーダルセリフ</dialogue>"

        payload = {
            "tone_prompt": "ツンデレ風に",
            "items": [
                {
                    "id": "10_b1",
                    "snapshot_id": 10,
                    "bubble_id": "b1",
                    "bubble_index": 0,
                    "text": "何見てるのよ",
                    "scene_hint": "照れながら視線を逸らす",
                    "include_image": True,
                    "image_path": "snapshots/test10.png"
                }
            ]
        }

        res = client.post("/api/speech-batch/jobs", json=payload)
        assert res.status_code == 201
        data = res.json()
        job_id = data["job_id"]
        assert data["items"][0]["scene_hint"] == "照れながら視線を逸らす"
        assert data["items"][0]["include_image"] is True
        assert data["items"][0]["image_path"] == "snapshots/test10.png"

        await asyncio.sleep(0.2)

        res = client.get(f"/api/speech-batch/jobs/{job_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "completed"
        assert data["items"][0]["rewritten_text"] == "変換後のマルチモーダルセリフ"
        mock_call_llm.assert_called_once()
        call_kwargs = mock_call_llm.call_args.kwargs
        assert call_kwargs["image_data"] == "dummybase64"
        assert "【場面の状況・ヒント】\n照れながら視線を逸らす" in call_kwargs["user_prompt"]
        assert "※画像が添付されています" in call_kwargs["user_prompt"]

