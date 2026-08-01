import unittest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import httpx
from app.main import app


class TestComfyProxyAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

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
