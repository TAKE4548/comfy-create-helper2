import io
import urllib.parse
from pathlib import Path
from unittest.mock import MagicMock, patch
from PIL import Image
import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.services.snapshot_service import SnapshotService, resolve_internal_comfy_url


def _create_sample_png_bytes() -> bytes:
    img = Image.new("RGBA", (200, 200), color=(0, 128, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# --- 1. URL 正規化ユニットテスト ---

def test_resolve_internal_comfy_url_rewrites_external_host():
    """[REQ-267/AC-1] resolve_internal_comfy_url rewrites external host to internal comfy base URL."""
    external_url = "http://192.168.3.13:8188/view?filename=test.png&type=temp"
    base_url = "http://localhost:8188"
    resolved = resolve_internal_comfy_url(external_url, base_url)
    assert resolved == "http://localhost:8188/view?filename=test.png&type=temp"


def test_resolve_internal_comfy_url_preserves_non_comfy_urls():
    """[REQ-267/AC-1] resolve_internal_comfy_url preserves non-comfy URLs unchanged."""
    external_url = "https://example.com/photo.png"
    base_url = "http://localhost:8188"
    resolved = resolve_internal_comfy_url(external_url, base_url)
    assert resolved == "https://example.com/photo.png"


def test_resolve_relative_and_absolute_manager_view_urls_to_upstream_view():
    """[REQ-267/AC-1][REQ-333/AC-1] resolve_internal_comfy_url resolves manager view URLs to upstream view stripping t param."""
    base_url = "http://upstream.example:8188/"
    relative = "/api/comfy/view?filename=0.png&subfolder=&type=temp&seed=0&enabled=false&t=prompt-123"
    assert resolve_internal_comfy_url(relative, base_url) == (
        "http://upstream.example:8188/view?filename=0.png&subfolder=&type=temp&seed=0&enabled=false"
    )
    assert resolve_internal_comfy_url(
        "http://old-host:8188/api/comfy/view?filename=test.png&t=old-id", base_url
    ) == "http://upstream.example:8188/view?filename=test.png"
    assert resolve_internal_comfy_url(
        "http://old-host:8188/view?filename=legacy.png&t=prompt-456", base_url
    ) == "http://upstream.example:8188/view?filename=legacy.png"
    assert resolve_internal_comfy_url(
        "http://old-host:8188/view/subfolder/test.png", base_url
    ) == "http://upstream.example:8188/view/subfolder/test.png"
    assert resolve_internal_comfy_url(
        "http://old-host:8188/not-a-view?filename=test.png", base_url
    ) == "http://old-host:8188/not-a-view?filename=test.png"


# --- 2. サービス層結合テスト ---

def test_snapshot_service_create_and_query(db_session: Session):
    """[REQ-267/AC-1] SnapshotService creates snapshot in SAVEPOINT session and queries it back."""
    workflow = models.Workflow(name="wf_create_query", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    payload = schemas.SnapshotCreate(
        workflow_id=workflow.id,
        image_path="/api/snapshots/images/test_direct.webp",
        thumbnail_path="/api/snapshots/images/thumb_test_direct.webp",
        params={"prompt": "cyberpunk city", "seed": 42},
    )
    snapshot = SnapshotService.create_snapshot(db_session, payload)
    assert snapshot.id is not None
    assert snapshot.workflow_id == workflow.id
    assert snapshot.image_path == "/api/snapshots/images/test_direct.webp"

    queried = SnapshotService.get_snapshot(db_session, snapshot.id)
    assert queried is not None
    assert queried.id == snapshot.id


def test_create_snapshot_with_external_comfy_url_saves_webp_and_thumbnail(db_session: Session):
    """[REQ-267/AC-1][REQ-267/AC-2] SnapshotService downloads external Comfy image and generates webp + thumbnail in isolated sandbox."""
    workflow = models.Workflow(name="wf_external_download", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    png_bytes = _create_sample_png_bytes()
    external_url = "http://192.168.1.100:8188/view?filename=test_render.png&subfolder=&type=output"

    mock_response = MagicMock()
    mock_response.read.return_value = png_bytes
    mock_response.__enter__.return_value = mock_response

    with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
        payload = schemas.SnapshotCreate(
            workflow_id=workflow.id,
            image_path=external_url,
            params={"prompt": "cyberpunk city"},
        )
        snapshot = SnapshotService.create_snapshot(db_session, payload)

        assert snapshot.image_path is not None
        assert snapshot.thumbnail_path is not None
        assert snapshot.image_path.startswith("/api/snapshots/images/")
        assert snapshot.image_path.endswith(".webp")
        assert snapshot.thumbnail_path.startswith("/api/snapshots/images/thumb_")
        assert snapshot.thumbnail_path.endswith(".webp")

        called_req = mock_urlopen.call_args[0][0]
        expected_host = urllib.parse.urlparse(settings.comfy_url).netloc
        assert expected_host in called_req.full_url
        assert "/view?filename=test_render.png" in called_req.full_url

        img_filename = snapshot.image_path.split("/")[-1]
        thumb_filename = snapshot.thumbnail_path.split("/")[-1]
        img_path = settings.snapshot_path / img_filename
        thumb_path = settings.snapshot_path / thumb_filename

        assert img_path.exists()
        assert thumb_path.exists()


def test_create_snapshot_downloads_relative_view_without_forwarding_metadata_key(db_session: Session):
    """[REQ-267/AC-1] SnapshotService downloads relative /view URL stripping metadata query param 't'."""
    workflow = models.Workflow(name="wf_relative_view", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    png_bytes = _create_sample_png_bytes()
    mock_response = MagicMock()
    mock_response.read.return_value = png_bytes
    mock_response.__enter__.return_value = mock_response
    params = {"seed": 0, "enabled": False, "empty": "", "nullable": None}
    original_image_path = "/api/comfy/view?filename=try.png&subfolder=&type=temp&t=prompt-req333"

    with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
        payload = schemas.SnapshotCreate(
            workflow_id=workflow.id,
            image_path=original_image_path,
            params=params,
        )
        snapshot = SnapshotService.create_snapshot(db_session, payload)

        target_url = mock_urlopen.call_args[0][0].full_url
        assert urllib.parse.urlparse(target_url).path == "/view"
        assert "t" not in urllib.parse.parse_qs(urllib.parse.urlparse(target_url).query)
        assert urllib.parse.parse_qs(urllib.parse.urlparse(target_url).query, keep_blank_values=True) == {
            "filename": ["try.png"], "subfolder": [""], "type": ["temp"]
        }

        assert snapshot.image_path is not None
        saved_path = settings.snapshot_path / snapshot.image_path.rsplit("/", 1)[-1]
        assert saved_path.exists()
        with Image.open(saved_path) as saved_image:
            assert saved_image.size == (200, 200)


def test_create_snapshot_downloads_absolute_manager_view_url(db_session: Session):
    """[REQ-267/AC-1] SnapshotService downloads absolute manager view URL."""
    workflow = models.Workflow(name="wf_abs_view", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    mock_response = MagicMock()
    mock_response.read.return_value = _create_sample_png_bytes()
    mock_response.__enter__.return_value = mock_response
    absolute_url = "http://old-manager-host:8899/api/comfy/view?filename=absolute.png&type=output&t=prompt-abs"

    with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
        payload = schemas.SnapshotCreate(
            workflow_id=workflow.id,
            image_path=absolute_url,
            params={"seed": 0, "enabled": False},
        )
        snapshot = SnapshotService.create_snapshot(db_session, payload)

        called_url = mock_urlopen.call_args[0][0].full_url
        assert urllib.parse.urlparse(called_url).path == "/view"
        assert "t" not in urllib.parse.parse_qs(urllib.parse.urlparse(called_url).query)
        assert snapshot.image_path is not None
        image_path = settings.snapshot_path / snapshot.image_path.rsplit("/", 1)[-1]
        assert image_path.exists()


def test_database_error_cleans_both_downloaded_original_and_thumbnail(db_session: Session):
    """[REQ-267/AC-4] Database commit error triggers rollback and cleans up downloaded images from disk."""
    workflow = models.Workflow(name="wf_db_err", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    mock_response = MagicMock()
    mock_response.read.return_value = _create_sample_png_bytes()
    mock_response.__enter__.return_value = mock_response
    payload = schemas.SnapshotCreate(
        workflow_id=workflow.id,
        image_path="/api/comfy/view?filename=partial.png&type=output",
        params={"seed": 0, "enabled": False},
    )

    with patch("urllib.request.urlopen", return_value=mock_response):
        with patch.object(db_session, "commit", side_effect=RuntimeError("commit failed")):
            with pytest.raises(RuntimeError, match="commit failed"):
                SnapshotService.create_snapshot(db_session, payload)

    assert list(settings.snapshot_path.iterdir()) == []


def test_create_snapshot_downloads_generic_external_image_url(db_session: Session):
    """[REQ-267/AC-1] SnapshotService downloads generic external image URL."""
    workflow = models.Workflow(name="wf_generic_ext", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    external_url = "https://cdn.example.test/assets/generic.png?version=2"
    mock_response = MagicMock()
    mock_response.read.return_value = _create_sample_png_bytes()
    mock_response.__enter__.return_value = mock_response

    with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
        payload = schemas.SnapshotCreate(
            workflow_id=workflow.id,
            image_path=external_url,
            params={"source": "legacy external image"},
        )
        snapshot = SnapshotService.create_snapshot(db_session, payload)

        assert mock_urlopen.call_args[0][0].full_url == external_url
        assert snapshot.image_path is not None
        assert snapshot.thumbnail_path is not None
        assert snapshot.image_path.startswith("/api/snapshots/images/")
        assert snapshot.thumbnail_path.startswith("/api/snapshots/images/thumb_")
        img_p = settings.snapshot_path / snapshot.image_path.rsplit("/", 1)[-1]
        thumb_p = settings.snapshot_path / snapshot.thumbnail_path.rsplit("/", 1)[-1]
        assert img_p.exists()
        assert thumb_p.exists()


def test_generic_external_download_files_are_cleaned_when_database_commit_fails(db_session: Session):
    """[REQ-267/AC-4] Generic external download cleans up files if commit fails."""
    workflow = models.Workflow(name="wf_cleanup_fail", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    mock_response = MagicMock()
    mock_response.read.return_value = _create_sample_png_bytes()
    mock_response.__enter__.return_value = mock_response
    payload = schemas.SnapshotCreate(
        workflow_id=workflow.id,
        image_path="https://cdn.example.test/assets/rollback.png",
        params={"seed": 0},
    )

    with patch("urllib.request.urlopen", return_value=mock_response):
        with patch.object(db_session, "commit", side_effect=RuntimeError("commit failed")):
            with pytest.raises(RuntimeError, match="commit failed"):
                SnapshotService.create_snapshot(db_session, payload)

    assert list(settings.snapshot_path.iterdir()) == []


def test_create_snapshot_download_failure_raises_502_and_rolls_back(db_session: Session):
    """[REQ-267/AC-4] SnapshotService raises 502 HTTPException when image download fails and creates no DB records."""
    workflow = models.Workflow(name="wf_download_fail", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    external_url = "http://192.168.1.100:8188/view?filename=nonexistent.png"

    with patch("urllib.request.urlopen", side_effect=Exception("Connection refused / 404 Not Found")):
        payload = schemas.SnapshotCreate(
            workflow_id=workflow.id,
            image_path=external_url,
            params={"prompt": "failed snapshot"},
        )
        with pytest.raises(HTTPException) as exc_info:
            SnapshotService.create_snapshot(db_session, payload)
        assert exc_info.value.status_code == 502
        assert "Failed to download snapshot image from ComfyUI" in exc_info.value.detail

        snapshots = db_session.query(models.Snapshot).filter(models.Snapshot.workflow_id == workflow.id).all()
        assert len(snapshots) == 0


def test_snapshot_service_list_and_filter(db_session: Session):
    """[REQ-267/AC-1] SnapshotService.list_snapshots filters by workflow_id, lora_id, tag_set_id."""
    wf1 = models.Workflow(name="wf_filter_1", json_body="{}")
    wf2 = models.Workflow(name="wf_filter_2", json_body="{}")
    lora1 = models.Lora(model_name="test_lora_filter.safetensors")
    tag_set1 = models.TagSet(name="test_tags_filter", tags="[]")
    db_session.add_all([wf1, wf2, lora1, tag_set1])
    db_session.flush()

    p1 = schemas.SnapshotCreate(
        workflow_id=wf1.id,
        image_path="/api/snapshots/images/s1.webp",
        thumbnail_path="/api/snapshots/images/thumb_s1.webp",
        params={"prompt": "s1"},
        loras=[schemas.SnapshotLoraCreate(lora_id=lora1.id, strength=0.8, role="positive")],
        tag_sets=[schemas.SnapshotTagSetCreate(tag_set_id=tag_set1.id, role="positive")],
    )
    p2 = schemas.SnapshotCreate(
        workflow_id=wf2.id,
        image_path="/api/snapshots/images/s2.webp",
        thumbnail_path="/api/snapshots/images/thumb_s2.webp",
        params={"prompt": "s2"},
    )
    s1 = SnapshotService.create_snapshot(db_session, p1)
    s2 = SnapshotService.create_snapshot(db_session, p2)

    all_wf1 = SnapshotService.list_snapshots(db_session, workflow_id=wf1.id)
    assert len(all_wf1) == 1
    assert all_wf1[0].id == s1.id

    by_lora = SnapshotService.list_snapshots(db_session, lora_id=lora1.id)
    assert len(by_lora) == 1
    assert by_lora[0].id == s1.id

    by_tag = SnapshotService.list_snapshots(db_session, tag_set_id=tag_set1.id)
    assert len(by_tag) == 1
    assert by_tag[0].id == s1.id


def test_snapshot_service_zero_production_file_leak(db_session: Session):
    """[REQ-356/AC-4][REQ-356/AC-5] Verify snapshot creation strictly writes to isolated tmp_path and never touches production db/snapshots."""
    prod_snapshot_dir = Path("db/snapshots").resolve()
    before_files = set(prod_snapshot_dir.glob("*")) if prod_snapshot_dir.exists() else set()

    workflow = models.Workflow(name="wf_prod_guard", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    png_bytes = _create_sample_png_bytes()
    mock_response = MagicMock()
    mock_response.read.return_value = png_bytes
    mock_response.__enter__.return_value = mock_response

    with patch("urllib.request.urlopen", return_value=mock_response):
        payload = schemas.SnapshotCreate(
            workflow_id=workflow.id,
            image_path="http://127.0.0.1:8188/view?filename=guard_test.png",
            params={"prompt": "guard test"},
        )
        SnapshotService.create_snapshot(db_session, payload)

    after_files = set(prod_snapshot_dir.glob("*")) if prod_snapshot_dir.exists() else set()
    # Zero new files written to production directory
    assert after_files == before_files
