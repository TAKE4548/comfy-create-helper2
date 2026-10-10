import io
import unittest
import tempfile
import urllib.parse
from pathlib import Path
from unittest.mock import patch, MagicMock
from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models, schemas
from app.config import settings
from app.services.snapshot_service import SnapshotService, resolve_internal_comfy_url

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


class TestSnapshotServiceREQ267(unittest.TestCase):
    def setUp(self):
        self.snapshot_temp = tempfile.TemporaryDirectory()
        self.old_snapshot_dir = settings.snapshot_dir
        settings.snapshot_dir = self.snapshot_temp.name
        models.Base.metadata.create_all(bind=connection)
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        self.workflow = models.Workflow(name="test_wf_req267", json_body="{}")
        self.db.add(self.workflow)
        self.db.commit()

        # 一時作成されるスナップショット画像ファイルのクリーンアップ用リスト
        self.created_files = []

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

        for p in self.created_files:
            if p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass
        settings.snapshot_dir = self.old_snapshot_dir
        self.snapshot_temp.cleanup()

    def _create_sample_png_bytes(self) -> bytes:
        img = Image.new("RGBA", (200, 200), color=(0, 128, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    # --- 1. URL 正規化ユニットテスト ---
    def test_resolve_internal_comfy_url_rewrites_external_host(self):
        external_url = "http://192.168.3.13:8188/view?filename=test.png&type=temp"
        base_url = "http://localhost:8188"
        resolved = resolve_internal_comfy_url(external_url, base_url)
        self.assertEqual(resolved, "http://localhost:8188/view?filename=test.png&type=temp")

    def test_resolve_internal_comfy_url_preserves_non_comfy_urls(self):
        external_url = "https://example.com/photo.png"
        base_url = "http://localhost:8188"
        resolved = resolve_internal_comfy_url(external_url, base_url)
        self.assertEqual(resolved, "https://example.com/photo.png")

    def test_resolve_relative_and_absolute_manager_view_urls_to_upstream_view(self):
        base_url = "http://upstream.example:8188/"
        relative = "/api/comfy/view?filename=0.png&subfolder=&type=temp&seed=0&enabled=false&t=prompt-123"
        self.assertEqual(
            resolve_internal_comfy_url(relative, base_url),
            "http://upstream.example:8188/view?filename=0.png&subfolder=&type=temp&seed=0&enabled=false",
        )
        self.assertEqual(
            resolve_internal_comfy_url("http://old-host:8188/api/comfy/view?filename=test.png&t=old-id", base_url),
            "http://upstream.example:8188/view?filename=test.png",
        )
        self.assertEqual(
            resolve_internal_comfy_url("http://old-host:8188/view?filename=legacy.png&t=prompt-456", base_url),
            "http://upstream.example:8188/view?filename=legacy.png",
        )
        self.assertEqual(
            resolve_internal_comfy_url("http://old-host:8188/view/subfolder/test.png", base_url),
            "http://upstream.example:8188/view/subfolder/test.png",
        )
        self.assertEqual(
            resolve_internal_comfy_url("http://old-host:8188/not-a-view?filename=test.png", base_url),
            "http://old-host:8188/not-a-view?filename=test.png",
        )

    def test_create_snapshot_downloads_relative_view_without_forwarding_metadata_key(self):
        png_bytes = self._create_sample_png_bytes()
        mock_response = MagicMock()
        mock_response.read.return_value = png_bytes
        mock_response.__enter__.return_value = mock_response
        params = {"seed": 0, "enabled": False, "empty": "", "nullable": None}
        original_image_path = "/api/comfy/view?filename=try.png&subfolder=&type=temp&t=prompt-req333"
        original_prompt_id = urllib.parse.parse_qs(urllib.parse.urlparse(original_image_path).query)["t"][0]

        with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
            response = self.client.post("/api/snapshots", json={
                "workflow_id": self.workflow.id,
                "image_path": original_image_path,
                "params": params,
            })
        self.assertEqual(response.status_code, 201)
        target_url = mock_urlopen.call_args[0][0].full_url
        self.assertEqual(urllib.parse.urlparse(target_url).path, "/view")
        self.assertNotIn("t", urllib.parse.parse_qs(urllib.parse.urlparse(target_url).query))
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlparse(target_url).query, keep_blank_values=True), {
            "filename": ["try.png"], "subfolder": [""], "type": ["temp"]
        })

        data = response.json()
        self.assertEqual(data["params"], params)
        self.assertEqual(original_image_path, "/api/comfy/view?filename=try.png&subfolder=&type=temp&t=prompt-req333")
        self.assertEqual(original_prompt_id, "prompt-req333")
        saved_path = settings.snapshot_path / data["image_path"].rsplit("/", 1)[-1]
        self.created_files.append(saved_path)
        with Image.open(saved_path) as saved_image:
            self.assertEqual(saved_image.size, (200, 200))

    def test_create_snapshot_downloads_absolute_manager_view_url(self):
        mock_response = MagicMock()
        mock_response.read.return_value = self._create_sample_png_bytes()
        mock_response.__enter__.return_value = mock_response
        absolute_url = "http://old-manager-host:8899/api/comfy/view?filename=absolute.png&type=output&t=prompt-abs"

        with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
            response = self.client.post("/api/snapshots", json={
                "workflow_id": self.workflow.id,
                "image_path": absolute_url,
                "params": {"seed": 0, "enabled": False},
            })

        self.assertEqual(response.status_code, 201)
        called_url = mock_urlopen.call_args[0][0].full_url
        self.assertEqual(urllib.parse.urlparse(called_url).path, "/view")
        self.assertNotIn("t", urllib.parse.parse_qs(urllib.parse.urlparse(called_url).query))
        self.assertEqual(urllib.parse.urlparse(absolute_url).query, "filename=absolute.png&type=output&t=prompt-abs")
        self.assertEqual(response.json()["params"], {"seed": 0, "enabled": False})
        image_path = settings.snapshot_path / response.json()["image_path"].rsplit("/", 1)[-1]
        self.created_files.append(image_path)

    def test_database_error_cleans_both_downloaded_original_and_thumbnail(self):
        mock_response = MagicMock()
        mock_response.read.return_value = self._create_sample_png_bytes()
        mock_response.__enter__.return_value = mock_response
        payload = schemas.SnapshotCreate(
            workflow_id=self.workflow.id,
            image_path="/api/comfy/view?filename=partial.png&type=output",
            params={"seed": 0, "enabled": False},
        )

        with patch("urllib.request.urlopen", return_value=mock_response):
            with patch.object(self.db, "commit", side_effect=RuntimeError("commit failed")):
                with self.assertRaisesRegex(RuntimeError, "commit failed"):
                    SnapshotService.create_snapshot(self.db, payload)

        self.assertEqual(list(settings.snapshot_path.iterdir()), [])

    def test_create_snapshot_downloads_generic_external_image_url(self):
        external_url = "https://cdn.example.test/assets/generic.png?version=2"
        mock_response = MagicMock()
        mock_response.read.return_value = self._create_sample_png_bytes()
        mock_response.__enter__.return_value = mock_response

        with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
            response = self.client.post("/api/snapshots", json={
                "workflow_id": self.workflow.id,
                "image_path": external_url,
                "params": {"source": "legacy external image"},
            })

        self.assertEqual(response.status_code, 201)
        self.assertEqual(mock_urlopen.call_args[0][0].full_url, external_url)
        data = response.json()
        self.assertTrue(data["image_path"].startswith("/api/snapshots/images/"))
        self.assertTrue(data["thumbnail_path"].startswith("/api/snapshots/images/thumb_"))
        for key in ("image_path", "thumbnail_path"):
            path = settings.snapshot_path / data[key].rsplit("/", 1)[-1]
            self.created_files.append(path)
            self.assertTrue(path.exists())

    def test_generic_external_download_files_are_cleaned_when_database_commit_fails(self):
        mock_response = MagicMock()
        mock_response.read.return_value = self._create_sample_png_bytes()
        mock_response.__enter__.return_value = mock_response
        payload = schemas.SnapshotCreate(
            workflow_id=self.workflow.id,
            image_path="https://cdn.example.test/assets/rollback.png",
            params={"seed": 0},
        )

        with patch("urllib.request.urlopen", return_value=mock_response):
            with patch.object(self.db, "commit", side_effect=RuntimeError("commit failed")):
                with self.assertRaisesRegex(RuntimeError, "commit failed"):
                    SnapshotService.create_snapshot(self.db, payload)

        self.assertEqual(list(settings.snapshot_path.iterdir()), [])

    # --- 2. スナップショット保存 API 結合テスト ---
    def test_create_snapshot_with_external_comfy_url_saves_webp_and_thumbnail(self):
        png_bytes = self._create_sample_png_bytes()
        external_url = "http://192.168.1.100:8188/view?filename=test_render.png&subfolder=&type=output"

        # urllib.request.urlopen をモック化してローカル画像バイナリを返す
        mock_response = MagicMock()
        mock_response.read.return_value = png_bytes
        mock_response.__enter__.return_value = mock_response

        with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
            payload = {
                "workflow_id": self.workflow.id,
                "image_path": external_url,
                "params": {"prompt": "cyberpunk city"}
            }
            res = self.client.post("/api/snapshots", json=payload)
            self.assertEqual(res.status_code, 201)
            data = res.json()

            # AC-1, AC-2: 保存先パスがローカルの WebP およびサムネイル形式で永続化されていること
            self.assertIn("image_path", data)
            self.assertIn("thumbnail_path", data)
            self.assertTrue(data["image_path"].startswith("/api/snapshots/images/"))
            self.assertTrue(data["image_path"].endswith(".webp"))
            self.assertTrue(data["thumbnail_path"].startswith("/api/snapshots/images/thumb_"))
            self.assertTrue(data["thumbnail_path"].endswith(".webp"))

            # 正しい内部URLでリクエストされたか検証
            called_req = mock_urlopen.call_args[0][0]
            expected_host = urllib.parse.urlparse(settings.comfy_url).netloc
            self.assertIn(expected_host, called_req.full_url)
            self.assertIn("/view?filename=test_render.png", called_req.full_url)

            # 実ファイルがディスクに生成されていることを確認
            img_filename = data["image_path"].split("/")[-1]
            thumb_filename = data["thumbnail_path"].split("/")[-1]
            img_path = settings.snapshot_path / img_filename
            thumb_path = settings.snapshot_path / thumb_filename
            self.created_files.extend([img_path, thumb_path])

            self.assertTrue(img_path.exists())
            self.assertTrue(thumb_path.exists())

            # DB レコードを確認
            db_snapshot = self.db.query(models.Snapshot).filter(models.Snapshot.id == data["id"]).first()
            self.assertIsNotNone(db_snapshot)
            self.assertEqual(db_snapshot.image_path, data["image_path"])
            self.assertEqual(db_snapshot.thumbnail_path, data["thumbnail_path"])

    def test_create_snapshot_download_failure_raises_502_and_rolls_back(self):
        external_url = "http://192.168.1.100:8188/view?filename=nonexistent.png"

        with patch("urllib.request.urlopen", side_effect=Exception("Connection refused / 404 Not Found")):
            payload = {
                "workflow_id": self.workflow.id,
                "image_path": external_url,
                "params": {"prompt": "failed snapshot"}
            }
            res = self.client.post("/api/snapshots", json=payload)
            self.assertEqual(res.status_code, 502)
            self.assertIn("Failed to download snapshot image from ComfyUI", res.json()["detail"])

            # DB に不完全なレコードが保存されていないことを確認
            snapshots = self.db.query(models.Snapshot).all()
            self.assertEqual(len(snapshots), 0)


if __name__ == "__main__":
    unittest.main()
