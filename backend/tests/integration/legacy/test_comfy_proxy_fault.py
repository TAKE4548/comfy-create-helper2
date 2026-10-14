"""Backend fault injection tests for ComfyUI proxy router using respx."""
import pytest
import respx
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
import app.routers.comfy as comfy_router


@respx.mock
def test_original_view_preserves_bytes_mime_and_fixed_upstream():
    original = b'original-png-bytes'
    route = respx.get(f"{settings.comfy_url}/view").respond(
        200, content=original, headers={"content-type": "image/png"}
    )
    response = TestClient(app).get('/api/comfy/view', params={
        'filename': 'a b.png', 'subfolder': 'nested/folder', 'type': 'output',
        't': 'metadata-only', 'host': 'http://example.invalid',
    })
    assert response.status_code == 200
    assert response.content == original
    assert response.headers['content-type'] == 'image/png'
    assert dict(route.calls.last.request.url.params) == {
        'filename': 'a b.png', 'subfolder': 'nested/folder', 'type': 'output',
    }


@pytest.mark.parametrize('head_status,get_status,expected', [
    (200, None, 'present'), (404, None, 'missing'),
    (405, 200, 'present'), (405, 404, 'missing'),
    (503, 200, 'present'), (503, 503, 'unknown'),
])
@respx.mock
def test_original_availability_identity_without_job_uuid(head_status, get_status, expected):
    respx.head(f"{settings.comfy_url}/view").respond(head_status)
    route = respx.get(f"{settings.comfy_url}/view").respond(get_status or 200)
    response = TestClient(app).get('/api/comfy/image-availability', params={'filename': 'legacy.png'})
    assert response.status_code == 200
    assert response.json() == {'availability': expected}
    assert route.called is (get_status is not None)


@respx.mock
def test_original_availability_network_failure_is_unknown():
    respx.head(f"{settings.comfy_url}/view").mock(side_effect=httpx.ConnectTimeout('offline'))
    respx.get(f"{settings.comfy_url}/view").mock(side_effect=httpx.ReadTimeout('offline'))
    response = TestClient(app).get('/api/comfy/image-availability?filename=keep.png')
    assert response.json() == {'availability': 'unknown'}


@pytest.mark.parametrize('layer', ['memory', 'disk'])
@respx.mock
def test_missing_original_does_not_immediately_delete_orphan_thumbnail(tmp_path, monkeypatch, layer):
    key = 'output::orphan.png:256:80'
    path = tmp_path / 'orphan-thumb.webp'
    monkeypatch.setattr(comfy_router, '_get_thumbnail_disk_path', lambda _key: path)
    path.write_bytes(b'cached-webp')
    comfy_router._thumbnail_cache.clear()
    if layer == 'memory':
        comfy_router._thumbnail_cache[key] = b'cached-webp'
    respx.head(f"{settings.comfy_url}/view").respond(404)
    response = TestClient(app).get('/api/comfy/thumbnail?filename=orphan.png')
    # Under REQ-362 zero-probe architecture, cached thumbnails return 200 without upstream HEAD probe
    assert response.status_code == 200
    assert response.content == b'cached-webp'
    assert path.read_bytes() == b'cached-webp'
    if layer == 'memory':
        assert comfy_router._thumbnail_cache[key] == b'cached-webp'
    comfy_router._thumbnail_cache.clear()


@pytest.mark.parametrize(('upstream_status', 'expected_status'), [(404, 404), (502, 502), (503, 502)])
@respx.mock
def test_original_view_distinguishes_missing_from_upstream_failure(upstream_status, expected_status):
    route = respx.get(f"{settings.comfy_url}/view").respond(upstream_status)
    response = TestClient(app).get('/api/comfy/view', params={'filename': 'status.png'})

    assert response.status_code == expected_status
    assert route.called


@respx.mock
def test_original_view_timeout_is_bad_gateway():
    respx.get(f"{settings.comfy_url}/view").mock(side_effect=httpx.ReadTimeout('offline'))
    response = TestClient(app).get('/api/comfy/view', params={'filename': 'timeout.png'})

    assert response.status_code == 502


@pytest.fixture
def client():
    # Reset in-memory cache before tests
    comfy_router._object_info_cache = None
    return TestClient(app)


@respx.mock
def test_comfy_object_info_connect_timeout(client):
    respx.get(f"{settings.comfy_url}/object_info").mock(
        side_effect=httpx.ConnectTimeout("Connection timed out")
    )
    response = client.get("/api/comfy/object_info")
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"].lower()


@respx.mock
def test_comfy_object_info_read_timeout(client):
    respx.get(f"{settings.comfy_url}/object_info").mock(
        side_effect=httpx.ReadTimeout("Read timed out")
    )
    response = client.get("/api/comfy/object_info")
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"].lower()


@respx.mock
def test_comfy_object_info_corrupted_json(client):
    # e.g., NGINX 502 HTML error page returned instead of valid JSON
    respx.get(f"{settings.comfy_url}/object_info").mock(
        return_value=httpx.Response(200, text="<html><body>502 Bad Gateway</body></html>", headers={"content-type": "text/html"})
    )
    response = client.get("/api/comfy/object_info")
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"].lower()


@respx.mock
def test_comfy_prompt_connect_timeout(client):
    respx.post(f"{settings.comfy_url}/prompt").mock(
        side_effect=httpx.ConnectTimeout("Connection timed out")
    )
    response = client.post("/api/comfy/prompt", json={"prompt": {"3": {"class_type": "KSampler"}}})
    assert response.status_code == 502
    assert "prompt error" in response.json()["detail"].lower()


@respx.mock
def test_comfy_prompt_read_timeout(client):
    respx.post(f"{settings.comfy_url}/prompt").mock(
        side_effect=httpx.ReadTimeout("Read timed out")
    )
    response = client.post("/api/comfy/prompt", json={"prompt": {"3": {"class_type": "KSampler"}}})
    assert response.status_code == 502
    assert "prompt error" in response.json()["detail"].lower()
