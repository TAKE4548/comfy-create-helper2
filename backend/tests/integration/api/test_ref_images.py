import hashlib
import io
import os
import time
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import get_db
from app.main import app
from app.routers.comfy import _get_full_webp_disk_path
from app.services.ref_image_store import RefImageStore

VIEW_URL = "http://localhost:8188/view"


def _img(fmt: str = "PNG", color: tuple[int, int, int] = (200, 30, 30), size: tuple[int, int] = (40, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def client(db_session: Session, mock_external_services):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    mock_external_services.get("http://localhost:8188/queue").mock(
        return_value=httpx.Response(200, json={"queue_running": [], "queue_pending": []})
    )
    mock_external_services.get("http://127.0.0.1:8188/queue").mock(
        return_value=httpx.Response(200, json={"queue_running": [], "queue_pending": []})
    )
    with TestClient(app) as test_client:
        yield test_client


def _store_files() -> list[Path]:
    root = RefImageStore.default().root()
    return sorted(p for p in root.rglob("*") if p.is_file()) if root.exists() else []


def _upload(client: TestClient, data: bytes, name: str = "a.png", ctype: str = "image/png"):
    return client.post("/api/ref-images/upload", files={"file": (name, data, ctype)})


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-5")
def test_upload_returns_read_model_and_serves_original_and_thumbnail(client: TestClient) -> None:
    """[REQ-427/AC-5] upload returns 201 RefImageRead and both GET endpoints serve the stored images."""
    data = _img("PNG")
    res = _upload(client, data)
    assert res.status_code == 201, res.text
    body = res.json()
    digest = hashlib.sha256(data).hexdigest()
    assert body == {
        "token": f"refimg:{digest}.png",
        "ref_id": f"{digest}.png",
        "media_type": "image/png",
        "width": 40,
        "height": 30,
        "byte_size": len(data),
        "view_url": f"/api/ref-images/{digest}.png",
        "thumbnail_url": f"/api/ref-images/{digest}.png/thumbnail",
    }
    original = client.get(body["view_url"])
    assert original.status_code == 200
    assert original.content == data
    assert original.headers["content-type"] == "image/png"
    thumb = client.get(body["thumbnail_url"])
    assert thumb.status_code == 200
    assert thumb.headers["content-type"] == "image/webp"
    assert Image.open(io.BytesIO(thumb.content)).format == "WEBP"


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-5")
def test_upload_rejections_use_fixed_codes_and_leave_store_unchanged(client: TestClient) -> None:
    """[REQ-427/AC-5] 415/413/422 carry detail.code and no file is stored."""
    _upload(client, _img("PNG", (1, 2, 3)))
    before = _store_files()

    res = _upload(client, b"not an image at all", "x.png", "image/png")
    assert (res.status_code, res.json()["detail"]["code"]) == (415, "unsupported_media_type")
    res = _upload(client, b"", "x.png", "image/png")
    assert (res.status_code, res.json()["detail"]["code"]) == (422, "empty_file")
    res = _upload(client, b"\x00" * (20 * 1024 * 1024 + 1), "big.png", "image/png")
    assert (res.status_code, res.json()["detail"]["code"]) == (413, "too_large")
    res = _upload(client, _img("GIF"), "x.png", "image/png")
    assert (res.status_code, res.json()["detail"]["code"]) == (415, "unsupported_media_type")
    assert _store_files() == before


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-4")
def test_history_import_from_comfyui_view(client: TestClient, mock_external_services: respx.MockRouter) -> None:
    """[REQ-427/AC-4] history import stores the ComfyUI /view image and returns a token."""
    data = _img("PNG", (5, 6, 7))
    route = mock_external_services.get(VIEW_URL).mock(return_value=httpx.Response(200, content=data))
    res = client.post("/api/ref-images/import", json={"source": "history", "filename": "out_001.png"})
    assert res.status_code == 201, res.text
    assert res.json()["token"] == f"refimg:{hashlib.sha256(data).hexdigest()}.png"
    assert route.called
    params = route.calls.last.request.url.params
    assert params["filename"] == "out_001.png" and params["type"] == "output"


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-4")
def test_history_import_falls_back_to_full_cache_and_reports_failures(
    client: TestClient, mock_external_services: respx.MockRouter
) -> None:
    """[REQ-427/AC-4] 404 uses the full_cache WebP; missing cache yields 404/502 by upstream state."""
    cached = _img("WEBP", (9, 9, 9))
    cache_path = _get_full_webp_disk_path("output::cached.png")
    cache_path.write_bytes(cached)

    mock_external_services.get(VIEW_URL).mock(return_value=httpx.Response(404))
    res = client.post("/api/ref-images/import", json={"source": "history", "filename": "cached.png"})
    assert res.status_code == 201, res.text
    assert res.json()["token"] == f"refimg:{hashlib.sha256(cached).hexdigest()}.webp"

    res = client.post("/api/ref-images/import", json={"source": "history", "filename": "missing.png"})
    assert (res.status_code, res.json()["detail"]["code"]) == (404, "source_not_found")

    mock_external_services.get(VIEW_URL).mock(side_effect=httpx.ConnectError("down"))
    res = client.post("/api/ref-images/import", json={"source": "history", "filename": "missing.png"})
    assert (res.status_code, res.json()["detail"]["code"]) == (502, "upstream_unavailable")


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-4")
def test_snapshot_import_success_idempotent_and_failures(client: TestClient, db_session: Session) -> None:
    """[REQ-427/AC-4] snapshot import: 201 and same token twice; unknown id and out-of-dir path are 404."""
    snap_dir = Path(settings.snapshot_path)
    data = _img("JPEG", (80, 90, 100))
    (snap_dir / "snap1.jpg").write_bytes(data)
    outside = snap_dir.parent / "outside.png"
    outside.write_bytes(_img("PNG"))

    wf = models.Workflow(name="wf_ref", json_body="{}")
    db_session.add(wf)
    db_session.flush()
    ok = models.Snapshot(workflow_id=wf.id, params="{}", image_path="snap1.jpg")
    escaping = models.Snapshot(workflow_id=wf.id, params="{}", image_path="../outside.png")
    absolute = models.Snapshot(workflow_id=wf.id, params="{}", image_path=str(outside))
    absent = models.Snapshot(workflow_id=wf.id, params="{}", image_path="nope.png")
    noimg = models.Snapshot(workflow_id=wf.id, params="{}", image_path=None)
    db_session.add_all([ok, escaping, absolute, absent, noimg])
    db_session.flush()

    first = client.post("/api/ref-images/import", json={"source": "snapshot", "snapshot_id": ok.id})
    second = client.post("/api/ref-images/import", json={"source": "snapshot", "snapshot_id": ok.id})
    assert first.status_code == second.status_code == 201
    assert first.json()["token"] == second.json()["token"]
    assert first.json()["token"].endswith(".jpg")

    for snapshot_id in (999999, escaping.id, absolute.id, absent.id, noimg.id):
        res = client.post("/api/ref-images/import", json={"source": "snapshot", "snapshot_id": snapshot_id})
        assert res.status_code == 404, (snapshot_id, res.text)


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-4")
@pytest.mark.parametrize(
    "payload",
    [
        {"source": "history", "filename": "../x.png"},
        {"source": "history", "filename": "a/b.png"},
        {"source": "history", "filename": "a\\b.png"},
        {"source": "history", "filename": "x.png", "subfolder": ".."},
        {"source": "history", "filename": "x.png", "subfolder": "/abs"},
        {"source": "history", "filename": "x.png", "type": "input"},
        {"source": "history"},
        {"source": "snapshot"},
        {"source": "history", "filename": "x.png", "extra": 1},
    ],
)
def test_import_rejects_unsafe_or_incomplete_requests_without_upstream_call(
    client: TestClient, mock_external_services: respx.MockRouter, payload: dict
) -> None:
    """[REQ-427/AC-4] Path traversal, bad type and missing fields are 422 and ComfyUI /view is never called."""
    route = mock_external_services.get(VIEW_URL).mock(return_value=httpx.Response(200, content=_img()))
    res = client.post("/api/ref-images/import", json=payload)
    assert res.status_code == 422, res.text
    assert not route.called


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-4")
def test_get_rejects_malformed_ref_ids(client: TestClient) -> None:
    """[REQ-427/AC-4] Malformed or traversal ref ids and unknown valid ids are 404."""
    for path in (
        f"/api/ref-images/{'a' * 63}.png",
        "/api/ref-images/..%2Fx",
        f"/api/ref-images/{'A' * 64}.png",
        f"/api/ref-images/{'a' * 64}.png",
        f"/api/ref-images/{'a' * 64}.png/thumbnail",
    ):
        assert client.get(path).status_code == 404, path
    res = client.get(f"/api/ref-images/{'a' * 63}.png")
    assert res.json()["detail"]["code"] == "not_found"


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_reupload_refreshes_mtime_and_get_touch_is_throttled(client: TestClient) -> None:
    """[REQ-427/AC-8] Re-upload refreshes mtime; GET refreshes only when older than 1h; Cache-Control has no immutable."""
    data = _img("PNG", (11, 22, 33))
    body = _upload(client, data).json()
    original = RefImageStore.default().root() / body["ref_id"]

    old = time.time() - 10 * 24 * 3600
    os.utime(original, (old, old))
    assert _upload(client, data).status_code == 201
    assert original.stat().st_mtime > old + 24 * 3600

    recent = time.time() - 600
    os.utime(original, (recent, recent))
    res = client.get(body["thumbnail_url"])
    assert res.status_code == 200
    assert abs(original.stat().st_mtime - recent) < 1.0
    assert res.headers["cache-control"] == "public, max-age=86400"
    assert "immutable" not in res.headers["cache-control"]

    stale = time.time() - 2 * 3600
    os.utime(original, (stale, stale))
    client.get(body["thumbnail_url"])
    assert original.stat().st_mtime > stale + 3600

    os.utime(original, (stale, stale))
    res = client.get(body["view_url"])
    assert res.headers["cache-control"] == "public, max-age=86400"
    assert original.stat().st_mtime > stale + 3600
