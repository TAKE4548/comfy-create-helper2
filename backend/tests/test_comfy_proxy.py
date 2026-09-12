import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
import httpx
from app.main import app
import app.routers.comfy as comfy_router


class TestComfyProxyAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        comfy_router._object_info_cache = None

    def tearDown(self):
        comfy_router._object_info_cache = None
        if comfy_router._client is not None:
            # Synchronously close test client if any
            pass

    def test_get_comfy_client_singleton(self):
        comfy_router._client = None
        client1 = comfy_router.get_comfy_client()
        client2 = comfy_router.get_comfy_client()
        self.assertIs(client1, client2)
        self.assertFalse(client1.is_closed)

    def test_close_comfy_client(self):
        import asyncio
        client = comfy_router.get_comfy_client()
        self.assertFalse(client.is_closed)
        asyncio.run(comfy_router.close_comfy_client())
        self.assertIsNone(comfy_router._client)

    @patch("httpx.AsyncClient.get")
    def test_get_comfy_object_info_success(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "KSampler": {
                "input": {
                    "required": {
                        "sampler_name": [["euler", "heun"], {}]
                    }
                }
            }
        }
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        response = self.client.get("/api/comfy/object-info/KSampler")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("KSampler", data)

    @patch("httpx.AsyncClient.get")
    def test_get_comfy_object_info_error_fallback(self, mock_get):
        mock_get.side_effect = httpx.ConnectError("Connection refused")

        response = self.client.get("/api/comfy/object-info/KSampler")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {})

    @patch("httpx.AsyncClient.get")
    def test_get_object_info_cached(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"KSampler": {"input": {}}}
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        # 1回目 (fetch)
        res1 = self.client.get("/api/comfy/object_info")
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json(), {"KSampler": {"input": {}}})
        self.assertEqual(mock_get.call_count, 1)

        # 2回目 (キャッシュヒット)
        res2 = self.client.get("/api/comfy/object_info")
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json(), {"KSampler": {"input": {}}})
        self.assertEqual(mock_get.call_count, 1)

    @patch("httpx.AsyncClient.get")
    def test_get_object_info_failure_503(self, mock_get):
        mock_get.side_effect = httpx.ConnectError("Connection refused")

        res = self.client.get("/api/comfy/object_info")
        self.assertEqual(res.status_code, 503)
        self.assertIn("ComfyUI server is unavailable or starting up", res.json().get("detail", ""))

    @patch("httpx.AsyncClient.post")
    def test_post_prompt_proxy_success(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"prompt_id": "p-123", "number": 1}'
        mock_post.return_value = mock_response

        res = self.client.post("/api/comfy/prompt", json={"prompt": {"3": {}}, "client_id": "c-1"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"prompt_id": "p-123", "number": 1})

    @patch("httpx.AsyncClient.get")
    def test_get_queue_proxy(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"queue_running": [], "queue_pending": []}'
        mock_get.return_value = mock_response

        res = self.client.get("/api/comfy/queue")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"queue_running": [], "queue_pending": []})

    @patch("httpx.AsyncClient.post")
    def test_post_queue_clear_proxy(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"status": "ok"}'
        mock_post.return_value = mock_response

        res = self.client.post("/api/comfy/queue", json={"clear": True})
        self.assertEqual(res.status_code, 200)

    @patch("httpx.AsyncClient.post")
    def test_post_interrupt_proxy(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"status": "interrupted"}'
        mock_post.return_value = mock_response

        res = self.client.post("/api/comfy/interrupt")
        self.assertEqual(res.status_code, 200)

    @patch("httpx.AsyncClient.get")
    def test_get_history_proxy(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"prompt-1": {"outputs": {}}}'
        mock_get.return_value = mock_response

        res = self.client.get("/api/comfy/history")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"prompt-1": {"outputs": {}}})
        mock_get.assert_called_once_with(f"{comfy_router.settings.comfy_url}/history", params={"max_items": 200}, timeout=15.0)

    @patch("httpx.AsyncClient.get")
    def test_get_history_proxy_with_max_items(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"prompt-1": {"outputs": {}}}'
        mock_get.return_value = mock_response

        res = self.client.get("/api/comfy/history?max_items=50")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"prompt-1": {"outputs": {}}})
        mock_get.assert_called_once_with(f"{comfy_router.settings.comfy_url}/history", params={"max_items": 50}, timeout=15.0)

    @patch("httpx.AsyncClient.get")
    def test_get_prompt_history_proxy(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"prompt-123": {"outputs": {"9": {"images": []}}}}'
        mock_get.return_value = mock_response

        res = self.client.get("/api/comfy/history/prompt-123")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"prompt-123": {"outputs": {"9": {"images": []}}}})
        mock_get.assert_called_once_with(f"{comfy_router.settings.comfy_url}/history/prompt-123", timeout=15.0)

    @patch("httpx.AsyncClient.head")
    @patch("httpx.AsyncClient.get")
    def test_get_comfy_thumbnail_success(self, mock_get, mock_head):
        from PIL import Image
        import io
        img = Image.new("RGB", (512, 512), color="red")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = png_bytes
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        # HEAD チェック: ComfyUI に画像が存在する（200）
        mock_head_resp = MagicMock()
        mock_head_resp.status_code = 200
        mock_head.return_value = mock_head_resp

        comfy_router._thumbnail_cache.clear()
        res = self.client.get("/api/comfy/thumbnail?filename=test.png&size=128&quality=80")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("content-type"), "image/webp")
        self.assertIn("max-age=604800", res.headers.get("cache-control", ""))

        # 2回目: キャッシュヒット確認（mock_get が呼ばれないこと）
        mock_get.reset_mock()
        res2 = self.client.get("/api/comfy/thumbnail?filename=test.png&size=128&quality=80")
        self.assertEqual(res2.status_code, 200)
        mock_get.assert_not_called()


    @patch("httpx.AsyncClient.get")
    def test_get_comfy_thumbnail_not_found(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_get.return_value = mock_resp

        comfy_router._thumbnail_cache.clear()
        res = self.client.get("/api/comfy/thumbnail?filename=notfound.png")
        self.assertEqual(res.status_code, 404)



    @patch("httpx.AsyncClient.head")
    def test_get_comfy_thumbnail_disk_cache_hit(self, mock_head):
        """ディスクキャッシュが存在する場合、ComfyUI への GET が発生せず即座に WebP が返ること。"""
        import io
        import tempfile
        from pathlib import Path
        from PIL import Image
        from unittest.mock import patch as mock_patch

        # WebP バイト列を生成
        img = Image.new("RGB", (64, 64), color="blue")
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=80)
        webp_bytes = buf.getvalue()

        # HEAD リクエストは 200 を返す（ComfyUI に画像が存在する）
        mock_head_resp = MagicMock()
        mock_head_resp.status_code = 200
        mock_head.return_value = mock_head_resp

        with tempfile.TemporaryDirectory() as tmpdir:
            # ディスクキャッシュパスをモック
            fake_disk_path = Path(tmpdir) / "fake_thumb.webp"
            fake_disk_path.write_bytes(webp_bytes)

            comfy_router._thumbnail_cache.clear()
            with mock_patch.object(comfy_router, "_get_thumbnail_disk_path", return_value=fake_disk_path):
                with mock_patch("httpx.AsyncClient.get") as mock_get:
                    res = self.client.get("/api/comfy/thumbnail?filename=disk_hit.png&size=64&quality=80")
                    self.assertEqual(res.status_code, 200)
                    self.assertEqual(res.headers.get("content-type"), "image/webp")
                    # ComfyUI GET は呼ばれていないこと
                    mock_get.assert_not_called()

    @patch("httpx.AsyncClient.head")
    @patch("httpx.AsyncClient.get")
    def test_get_comfy_thumbnail_disk_cache_corrupt_recovery(self, mock_get, mock_head):
        """ディスクキャッシュが 0 バイト破損の場合、自動削除して ComfyUI から再取得・再生成されること。"""
        import io
        import tempfile
        from pathlib import Path
        from PIL import Image
        from unittest.mock import patch as mock_patch

        # ComfyUI からの PNG レスポンス
        img = Image.new("RGB", (128, 128), color="green")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.content = png_bytes
        mock_get_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_get_resp

        with tempfile.TemporaryDirectory() as tmpdir:
            # 0バイトの破損キャッシュファイルを配置
            fake_disk_path = Path(tmpdir) / "corrupt_thumb.webp"
            fake_disk_path.write_bytes(b"")  # 0バイト（破損）

            comfy_router._thumbnail_cache.clear()
            with mock_patch.object(comfy_router, "_get_thumbnail_disk_path", return_value=fake_disk_path):
                res = self.client.get("/api/comfy/thumbnail?filename=corrupt.png&size=128&quality=80")
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res.headers.get("content-type"), "image/webp")
                # 破損ファイルを削除してから ComfyUI で再取得・再生成されていること
                # (ファイルは再生成されて size > 0 になる)
                self.assertTrue(fake_disk_path.exists())
                self.assertGreater(fake_disk_path.stat().st_size, 0)
                # ComfyUI GET が呼ばれていること（リカバリの証明）
                mock_get.assert_called_once()

    def test_prune_disk_cache_if_needed(self):
        """4,000件超過時に古い順にファイルが削除されて 3,600件まで間引かれること。"""
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            disk_dir = Path(tmpdir)
            # 4,001件の .webp ファイルを作成
            total = 4001
            for i in range(total):
                f = disk_dir / f"thumb_{i:05d}.webp"
                f.write_bytes(b"dummy")

            comfy_router._prune_disk_cache_if_needed(disk_dir)

            remaining = list(disk_dir.glob("*.webp"))
            self.assertLessEqual(len(remaining), comfy_router._DISK_CACHE_TARGET_FILES)
