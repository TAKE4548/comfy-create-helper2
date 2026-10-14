import io
import unittest
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models
from app.config import settings

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


class TestSnapshotsWebP(unittest.TestCase):
    def setUp(self):
        models.Base.metadata.create_all(bind=connection)
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        self.workflow = models.Workflow(name="test_wf_webp", json_body="{}")
        self.db.add(self.workflow)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)
        app.dependency_overrides.pop(get_db, None)

    def _create_sample_png_bytes(self) -> bytes:
        img = Image.new("RGBA", (400, 400), color=(255, 0, 0, 255))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def test_upload_image_generates_webp_and_thumbnail(self):
        png_bytes = self._create_sample_png_bytes()
        response = self.client.post(
            "/api/snapshots/upload",
            files={"file": ("test.png", png_bytes, "image/png")}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("image_path", data)
        self.assertIn("thumbnail_path", data)
        self.assertTrue(data["image_path"].endswith(".webp"))
        self.assertIn("/thumb_", data["thumbnail_path"])

        # Check physical files exist in settings.snapshot_path
        img_filename = data["image_path"].split("/")[-1]
        thumb_filename = data["thumbnail_path"].split("/")[-1]
        self.assertTrue((settings.snapshot_path / img_filename).exists())
        self.assertTrue((settings.snapshot_path / thumb_filename).exists())

    def test_create_snapshot_with_uploaded_image(self):
        png_bytes = self._create_sample_png_bytes()
        upload_res = self.client.post(
            "/api/snapshots/upload",
            files={"file": ("test.png", png_bytes, "image/png")}
        )
        upload_data = upload_res.json()

        payload = {
            "workflow_id": self.workflow.id,
            "image_path": upload_data["image_path"],
            "thumbnail_path": upload_data["thumbnail_path"],
            "params": {"prompt": "masterpiece"}
        }
        res = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["image_path"], upload_data["image_path"])
        self.assertEqual(data["thumbnail_path"], upload_data["thumbnail_path"])

        # GET /api/snapshots/{id}
        get_res = self.client.get(f"/api/snapshots/{data['id']}")
        self.assertEqual(get_res.status_code, 200)
        get_data = get_res.json()
        self.assertEqual(get_data["thumbnail_path"], upload_data["thumbnail_path"])

    def test_download_snapshot_formats(self):
        png_bytes = self._create_sample_png_bytes()
        upload_res = self.client.post(
            "/api/snapshots/upload",
            files={"file": ("test.png", png_bytes, "image/png")}
        )
        upload_data = upload_res.json()

        payload = {
            "workflow_id": self.workflow.id,
            "image_path": upload_data["image_path"],
            "thumbnail_path": upload_data["thumbnail_path"],
            "params": {}
        }
        res = self.client.post("/api/snapshots", json=payload)
        snapshot_id = res.json()["id"]

        # Download default (webp)
        dl_webp = self.client.get(f"/api/snapshots/{snapshot_id}/download?format=webp")
        self.assertEqual(dl_webp.status_code, 200)
        self.assertEqual(dl_webp.headers["content-type"], "image/webp")

        # Download png
        dl_png = self.client.get(f"/api/snapshots/{snapshot_id}/download?format=png")
        self.assertEqual(dl_png.status_code, 200)
        self.assertEqual(dl_png.headers["content-type"], "image/png")

        # Download jpeg
        dl_jpeg = self.client.get(f"/api/snapshots/{snapshot_id}/download?format=jpeg")
        self.assertEqual(dl_jpeg.status_code, 200)
        self.assertEqual(dl_jpeg.headers["content-type"], "image/jpeg")


if __name__ == "__main__":
    unittest.main()
