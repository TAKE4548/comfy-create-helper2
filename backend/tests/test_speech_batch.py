import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db_context
from app.routers.speech_batch import batch_manager, SpeechBatchManager


@pytest.mark.asyncio
async def test_speech_batch_lifecycle():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
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

            res = await client.post("/api/speech-batch/jobs", json=payload)
            assert res.status_code == 201
            data = res.json()
            job_id = data["job_id"]
            assert data["total_count"] == 2
            assert len(data["items"]) == 2

            # Wait for async background task to complete
            await asyncio.sleep(0.2)

            res = await client.get(f"/api/speech-batch/jobs/{job_id}")
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
            res = await client.post(f"/api/speech-batch/jobs/{job_id}/items/1_b1/retry", json=retry_payload)
            assert res.status_code == 200
            await asyncio.sleep(0.2)
            res = await client.get(f"/api/speech-batch/jobs/{job_id}")
            data = res.json()
            assert data["status"] == "completed"
            assert data["items"][0]["revision_instruction"] == "もっと怒った感じで"
            assert data["items"][0]["previous_rewritten_text"] == "変換後のセリフ"


@pytest.mark.asyncio
async def test_speech_batch_with_scene_hint_and_image():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
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

            res = await client.post("/api/speech-batch/jobs", json=payload)
            assert res.status_code == 201
            data = res.json()
            job_id = data["job_id"]
            assert data["items"][0]["scene_hint"] == "照れながら視線を逸らす"
            assert data["items"][0]["include_image"] is True
            assert data["items"][0]["image_path"] == "snapshots/test10.png"

            await asyncio.sleep(0.2)

            res = await client.get(f"/api/speech-batch/jobs/{job_id}")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "completed"
            assert data["items"][0]["rewritten_text"] == "変換後のマルチモーダルセリフ"
            mock_call_llm.assert_called_once()
            call_kwargs = mock_call_llm.call_args.kwargs
            assert call_kwargs["image_data"] == "dummybase64"
            assert "【場面の状況・ヒント】\n照れながら視線を逸らす" in call_kwargs["user_prompt"]
            assert "※画像が添付されています" in call_kwargs["user_prompt"]


@pytest.mark.asyncio
async def test_speech_batch_concurrency_and_cancellation():
    """複数アイテムの並行キャンセル・リトライ時に競合せずデッドロックしないことを検証"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        async def slow_call_llm(*args, **kwargs):
            await asyncio.sleep(0.05)
            return "<dialogue>遅延完了セリフ</dialogue>"

        with patch("app.services.speech_parser.call_llm", side_effect=slow_call_llm):
            payload = {
                "tone_prompt": "標準トーン",
                "items": [
                    {"id": f"c_{i}", "snapshot_id": 1, "bubble_id": f"b_{i}", "bubble_index": i, "text": f"セリフ{i}"}
                    for i in range(5)
                ]
            }
            res = await client.post("/api/speech-batch/jobs", json=payload)
            assert res.status_code == 201
            job_id = res.json()["job_id"]

            # 並行してアイテムキャンセルとリトライを発火
            cancel_coro = client.post(f"/api/speech-batch/jobs/{job_id}/items/c_3/cancel")
            retry_coro = client.post(f"/api/speech-batch/jobs/{job_id}/items/c_1/retry", json={"revision_instruction": "変更"})
            results = await asyncio.gather(cancel_coro, retry_coro)
            assert results[0].status_code == 200
            assert results[1].status_code == 200

            # 処理完了を待機
            await asyncio.sleep(0.5)

            res = await client.get(f"/api/speech-batch/jobs/{job_id}")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] in ("completed", "cancelled")
            # キャンセルしたアイテムが cancelled であること
            item_c3 = next(it for it in data["items"] if it["id"] == "c_3")
            assert item_c3["status"] == "cancelled"


@pytest.mark.asyncio
async def test_speech_batch_memory_pruning():
    """max_history を超えた場合に最古の完了ジョブが自動削除されることを検証"""
    custom_manager = SpeechBatchManager(max_history=3)
    with patch("app.routers.speech_batch.batch_manager", custom_manager):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            with patch("app.services.speech_parser.call_llm", new_callable=AsyncMock) as mock_call_llm:
                mock_call_llm.return_value = "<dialogue>OK</dialogue>"

                job_ids = []
                for i in range(4):
                    payload = {
                        "tone_prompt": "トーン",
                        "items": [{"id": f"p_{i}", "snapshot_id": 1, "bubble_id": "b1", "bubble_index": 0, "text": f"テスト{i}"}]
                    }
                    res = await client.post("/api/speech-batch/jobs", json=payload)
                    assert res.status_code == 201
                    job_ids.append(res.json()["job_id"])
                    await asyncio.sleep(0.1)

                # 最古のジョブ (job_ids[0]) がプルーニングされ 404 になること
                assert len(custom_manager._jobs) == 3
                assert job_ids[0] not in custom_manager._jobs
                assert job_ids[1] in custom_manager._jobs
                assert job_ids[2] in custom_manager._jobs
                assert job_ids[3] in custom_manager._jobs


@pytest.mark.asyncio
async def test_speech_batch_async_thread_offloading():
    """_sync_load_item_image および _sync_fetch_batch_prerequisites が asyncio.to_thread 経由で実行されることを検証"""
    with patch("app.routers.speech_batch.asyncio.to_thread", wraps=asyncio.to_thread) as spy_to_thread, \
         patch("app.routers.speech_batch._sync_load_item_image", return_value="b64test") as mock_load, \
         patch("app.services.speech_parser.call_llm", new_callable=AsyncMock) as mock_call_llm:
        mock_call_llm.return_value = "<dialogue>オフロード確認</dialogue>"

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            payload = {
                "tone_prompt": "トーン",
                "items": [{
                    "id": "offload_1",
                    "snapshot_id": 1,
                    "bubble_id": "b1",
                    "bubble_index": 0,
                    "text": "テスト",
                    "include_image": True,
                    "image_path": "snapshots/sample.png",
                }]
            }
            res = await client.post("/api/speech-batch/jobs", json=payload)
            assert res.status_code == 201
            job_id = res.json()["job_id"]
            await asyncio.sleep(0.2)

            # to_thread が呼び出されたことを確認
            assert spy_to_thread.called
            res = await client.get(f"/api/speech-batch/jobs/{job_id}")
            assert res.json()["status"] == "completed"


def test_get_db_context_cleanup():
    """get_db_context が例外発生時にも確実に close されることを検証"""
    closed = False

    class MockSession:
        def close(self):
            nonlocal closed
            closed = True

    with patch("app.database.SessionLocal", return_value=MockSession()):
        with pytest.raises(RuntimeError):
            with get_db_context() as db:
                raise RuntimeError("Test error inside session")

        assert closed is True



