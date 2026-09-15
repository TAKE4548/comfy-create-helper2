import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

class TestApiConfigNetwork(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_get_config_localhost(self):
        response = self.client.get("/api/config", headers={"host": "localhost:8000"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("comfy_url", data)
        self.assertEqual(data["comfy_url"], settings.comfy_url)

    def test_get_config_127_0_0_1(self):
        response = self.client.get("/api/config", headers={"host": "127.0.0.1:8000"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("comfy_url", data)
        self.assertEqual(data["comfy_url"], settings.comfy_url)

    def test_get_config_lan_ip(self):
        response = self.client.get("/api/config", headers={"host": "192.168.1.50:8000"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("comfy_url", data)
        self.assertIn("192.168.1.50", data["comfy_url"])
        self.assertNotIn("localhost", data["comfy_url"])
        self.assertNotIn("127.0.0.1", data["comfy_url"])

    def test_get_config_cors_header(self):
        response = self.client.options(
            "/api/config",
            headers={
                "Origin": "http://192.168.1.100:8000",
                "Access-Control-Request-Method": "GET",
            }
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://192.168.1.100:8000")

if __name__ == "__main__":
    unittest.main()
