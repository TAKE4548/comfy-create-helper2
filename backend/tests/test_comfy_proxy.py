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

