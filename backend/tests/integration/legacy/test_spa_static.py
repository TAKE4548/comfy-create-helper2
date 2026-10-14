import tempfile
import unittest
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.main import SPAStaticFiles, app


class TestSPAStaticFiles(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dist_path = Path(self.temp_dir.name)

        # Create dummy index.html and static asset
        (self.dist_path / "index.html").write_text("<!DOCTYPE html><html><body>SPA Root</body></html>", encoding="utf-8")
        assets_dir = self.dist_path / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        (assets_dir / "main.js").write_text("console.log('main');", encoding="utf-8")

        # Test app with SPAStaticFiles mounted at root
        self.test_app = FastAPI()

        @self.test_app.get("/health")
        def health():
            return {"status": "ok"}

        @self.test_app.get("/api/config")
        def get_config():
            return {"status": "ok"}

        self.test_app.mount("/", SPAStaticFiles(directory=str(self.dist_path), html=True), name="frontend")
        self.client = TestClient(self.test_app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_root_serves_index_html(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("SPA Root", response.text)

    def test_static_asset_serves_file(self):
        response = self.client.get("/assets/main.js")
        self.assertEqual(response.status_code, 200)
        self.assertIn("console.log('main');", response.text)

    def test_spa_route_fallback(self):
        response = self.client.get("/presets")
        self.assertEqual(response.status_code, 200)
        self.assertIn("SPA Root", response.text)

        response2 = self.client.get("/generate/123")
        self.assertEqual(response2.status_code, 200)
        self.assertIn("SPA Root", response2.text)

    def test_missing_asset_returns_404(self):
        response = self.client.get("/assets/notfound.js")
        self.assertEqual(response.status_code, 404)

        response2 = self.client.get("/image.png")
        self.assertEqual(response2.status_code, 404)

    def test_missing_api_returns_404_json(self):
        response = self.client.get("/api/nonexistent")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Not Found"})

    def test_actual_app_health_and_config(self):
        actual_client = TestClient(app)
        res_health = actual_client.get("/health")
        self.assertEqual(res_health.status_code, 200)
        self.assertEqual(res_health.json()["status"], "ok")

        res_config = actual_client.get("/api/config")
        self.assertEqual(res_config.status_code, 200)
        self.assertIn("comfy_url", res_config.json())


if __name__ == "__main__":
    unittest.main()
