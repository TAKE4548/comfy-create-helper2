import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

class TestConfigAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_get_config(self):
        response = self.client.get("/api/config")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("comfy_url", data)
        self.assertEqual(data["comfy_url"], settings.comfy_url)

if __name__ == "__main__":
    unittest.main()
