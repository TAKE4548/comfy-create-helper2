"""Backend fault injection tests for ComfyUI proxy router using respx."""
import pytest
import respx
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
import app.routers.comfy as comfy_router


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
