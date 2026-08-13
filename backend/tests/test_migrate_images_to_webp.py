import io
import unittest
from pathlib import Path
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from unittest.mock import patch

from app.database import Base
from app import models
from app.config import settings
from scripts.migrate_images_to_webp import migrate_images

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class TestMigrateImagesToWebP(unittest.TestCase):
    def setUp(self):
        models.Base.metadata.create_all(bind=engine)
        self.db = TestingSessionLocal()

        self.workflow = models.Workflow(name="test_wf_migrate", json_body="{}")
        self.db.add(self.workflow)
        self.db.commit()

        # Create sample PNG in snapshot_path
        self.test_png_filename = "legacy_test.png"
        self.test_png_path = settings.snapshot_path / self.test_png_filename
        img = Image.new("RGBA", (500, 500), color=(0, 255, 0, 255))
        img.save(self.test_png_path, format="PNG")

        self.snapshot = models.Snapshot(
            workflow_id=self.workflow.id,
            params="{}",
            image_path=f"/api/snapshots/images/{self.test_png_filename}",
            thumbnail_path=None
        )
        self.db.add(self.snapshot)
        self.db.commit()
        self.snapshot_id = self.snapshot.id
        self.db.close()

    def tearDown(self):
        models.Base.metadata.drop_all(bind=engine)

        # Cleanup created test files if any remain
        for f in [self.test_png_path, settings.snapshot_path / "legacy_test.webp", settings.snapshot_path / "thumb_legacy_test.webp"]:
            if f.exists():
                try:
                    f.unlink()
                except Exception:
                    pass

    def test_migrate_images_converts_png_and_sets_thumbnail(self):
        with patch("scripts.migrate_images_to_webp.SessionLocal", side_effect=TestingSessionLocal):
            migrate_images()

        db2 = TestingSessionLocal()
        try:
            snapshot = db2.query(models.Snapshot).filter(models.Snapshot.id == self.snapshot_id).first()
            self.assertIsNotNone(snapshot)
            self.assertEqual(snapshot.image_path, "/api/snapshots/images/legacy_test.webp")
            self.assertEqual(snapshot.thumbnail_path, "/api/snapshots/images/thumb_legacy_test.webp")
        finally:
            db2.close()

        webp_path = settings.snapshot_path / "legacy_test.webp"
        thumb_path = settings.snapshot_path / "thumb_legacy_test.webp"
        self.assertTrue(webp_path.exists())
        self.assertTrue(thumb_path.exists())


if __name__ == "__main__":
    unittest.main()
