from __future__ import annotations

import asyncio
import json
import socket
import struct
from pathlib import Path
from typing import Any

import httpx
import pytest
from websockets.asyncio import client as websocket_client

import app.services.comfy_generation_bridge as bridge_module
from app.services.comfy_generation_bridge import ComfyGenerationBridge, UpstreamResponseError


def _http_bridge(handler: Any) -> ComfyGenerationBridge:
    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(base_url="http://comfy.test:8188", transport=transport)
    bridge = ComfyGenerationBridge("http://comfy.test:8188", client_id="backend-client", http_client=client)
    bridge._owns_http = True
    return bridge


@pytest.mark.asyncio
async def test_http_ports_use_backend_client_id_and_exact_normalized_contracts() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.path == "/prompt":
            return httpx.Response(200, json={"prompt_id": "p1", "number": 4})
        if request.url.path == "/queue":
            return httpx.Response(
                200,
                json={
                    "queue_running": [[1, "running-prompt", {}, {"client_id": "backend-client"}, []]],
                    "queue_pending": [[2, "pending-prompt", {}, {"client_id": "other"}, []]],
                },
            )
        if request.url.path == "/history/p1":
            return httpx.Response(200, json={"p1": {"status": {"completed": True, "status_str": "success"}, "outputs": {}}})
        if request.url.path == "/history":
            if request.method == "POST":
                assert json.loads(request.content) == {"delete": ["p1", "p2"]}
                assert request.extensions["timeout"]["read"] == 5.0
            return httpx.Response(200, json={"p1": {"status": {"completed": True, "status_str": "success"}}})
        return httpx.Response(200, json={})

    bridge = _http_bridge(handler)
    try:
        submitted = await bridge.submit({"node": {"class_type": "SaveImage"}})
        queue = await bridge.queue()
        history_one = await bridge.history("p1")
        history_all = await bridge.history()
        await bridge.delete_history(["p1", "p2"])

        assert submitted["prompt_id"] == "p1"
        prompt_call = next(request for request in calls if request.url.path == "/prompt")
        assert json.loads(prompt_call.content) == {
            "prompt": {"node": {"class_type": "SaveImage"}},
            "client_id": "backend-client",
        }
        assert queue == {
            "running": [{"prompt_id": "running-prompt", "client_id": "backend-client"}],
            "pending": [{"prompt_id": "pending-prompt", "client_id": "other"}],
        }
        assert history_one["p1"]["status"]["status_str"] == "success"
        assert history_all["p1"]["status"]["completed"] is True
        delete_call = next(request for request in calls if request.url.path == "/history" and request.method == "POST")
        assert json.loads(delete_call.content) == {"delete": ["p1", "p2"]}
        assert delete_call.extensions["timeout"]["read"] == 5.0
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_submit_validation_400_returns_definitive_rejection_without_retry() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(400, json={"error": "invalid prompt", "node_errors": {"7": {"errors": ["bad"]}}})

    bridge = _http_bridge(handler)
    try:
        result = await bridge.submit({"bad": True})
        assert result == {"error": "invalid prompt", "node_errors": {"7": {"errors": ["bad"]}}}
        assert len(calls) == 1
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_submit_validation_422_non_json_returns_rejection_message() -> None:
    bridge = _http_bridge(lambda _request: httpx.Response(422, text="graph validation rejected"))
    try:
        result = await bridge.submit({"bad": True})
        assert result["error"] == "graph validation rejected"
        assert result["node_errors"] is None
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_submit_prompt_id_with_partial_node_errors_is_confirmed() -> None:
    bridge = _http_bridge(
        lambda _request: httpx.Response(200, json={"prompt_id": "accepted-prompt", "node_errors": {"7": {"errors": ["partial"]}}})
    )
    try:
        result = await bridge.submit({"graph": True})
        assert result["prompt_id"] == "accepted-prompt"
        assert "node_errors" in result
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_submit_without_prompt_id_requires_explicit_rejection_or_is_unknown() -> None:
    rejected = _http_bridge(lambda _request: httpx.Response(200, json={"node_errors": {"7": {"errors": ["bad"]}}}))
    try:
        result = await rejected.submit({"bad": True})
        assert result["error"]
        assert result["node_errors"]
    finally:
        await rejected.stop()

    unknown = _http_bridge(lambda _request: httpx.Response(200, json={"number": 4}))
    try:
        with pytest.raises(UpstreamResponseError, match="did not confirm prompt_id"):
            await unknown.submit({"unclear": True})
    finally:
        await unknown.stop()


@pytest.mark.asyncio
async def test_submit_timeout_remains_unknown_and_is_not_retried() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("prompt response lost")

    bridge = _http_bridge(handler)
    try:
        with pytest.raises(httpx.ReadTimeout):
            await bridge.submit({"graph": True})
        assert calls == 1
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_submit_server_error_remains_ambiguous_and_is_not_retried() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503, json={"error": "upstream busy"})

    bridge = _http_bridge(handler)
    try:
        with pytest.raises(httpx.HTTPStatusError):
            await bridge.submit({"graph": True})
        assert calls == 1
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_upstream_health_preserves_first_failure_and_resets_after_http_success() -> None:
    failures = 0
    timestamps = iter(
        [
            "2026-10-10T00:00:00Z",
            "2026-10-10T00:00:05Z",
        ]
    )

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal failures
        failures += 1
        if failures <= 2:
            return httpx.Response(503, json={"detail": "offline"})
        return httpx.Response(200, json={"queue_running": [], "queue_pending": []})

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(base_url="http://comfy.test:8188", transport=transport)
    bridge = ComfyGenerationBridge(
        "http://comfy.test:8188",
        client_id="backend-client",
        http_client=client,
        clock=lambda: next(timestamps),
    )
    try:
        assert bridge.get_upstream_state() == {
            "http_ready": False,
            "ws_connected": False,
            "failure_since": None,
        }
        with pytest.raises(httpx.HTTPStatusError):
            await bridge.queue()
        first = bridge.get_upstream_state()
        assert first["http_ready"] is False
        assert first["failure_since"] == "2026-10-10T00:00:00Z"

        with pytest.raises(httpx.HTTPStatusError):
            await bridge.queue()
        assert bridge.get_upstream_state()["failure_since"] == "2026-10-10T00:00:00Z"

        assert await bridge.queue() == {"running": [], "pending": []}
        assert bridge.get_upstream_state() == {
            "http_ready": True,
            "ws_connected": False,
            "failure_since": None,
        }
    finally:
        await bridge.stop()
        await bridge._http.aclose()


@pytest.mark.asyncio
async def test_single_interrupt_preflights_target_twice_and_never_interrupts_wrong_prompt() -> None:
    queue_reads = 0
    post_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal queue_reads
        if request.method == "GET" and request.url.path == "/queue":
            queue_reads += 1
            running = "target" if queue_reads == 1 else "other"
            return httpx.Response(200, json={"queue_running": [[1, running, {}, {}, []]], "queue_pending": []})
        if request.method == "POST":
            post_paths.append(request.url.path)
        return httpx.Response(200, json={})

    bridge = _http_bridge(handler)
    try:
        with pytest.raises(RuntimeError, match="no longer the uniquely observed running prompt"):
            await bridge.interrupt("target")
        assert queue_reads == 2
        assert post_paths == []
    finally:
        await bridge.stop()


class _FakeSocket:
    def __init__(self, events: list[str | bytes]) -> None:
        self.events = iter(events)
        self.block = asyncio.Event()

    def __aiter__(self) -> _FakeSocket:
        return self

    async def __anext__(self) -> str | bytes:
        try:
            return next(self.events)
        except StopIteration:
            await self.block.wait()
            raise StopAsyncIteration


@pytest.mark.asyncio
async def test_ws_reconnect_uses_existing_backoff_and_reuses_backend_client_id(monkeypatch: pytest.MonkeyPatch) -> None:
    bridge = ComfyGenerationBridge(
        "http://comfy.test:8188",
        client_id="backend id",
        http_client=httpx.AsyncClient(base_url="http://comfy.test:8188", transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"queue_running": [], "queue_pending": []}))),
    )
    attempts: list[str] = []
    delays: list[float] = []

    def connect(uri: str, **_kwargs: Any) -> _FakeConnect:
        attempts.append(uri)
        if len(attempts) == 1:
            raise ConnectionError("initial connection failed")
        return _FakeConnect(_FakeSocket([]))

    async def immediate_sleep(delay: float) -> None:
        delays.append(delay)
        await asyncio.sleep(0)

    bridge._sleep = immediate_sleep
    bridge._jitter = lambda _minimum, _maximum: 0.25
    monkeypatch.setattr(websocket_client, "connect", connect)
    await bridge.start(lambda _event: None, lambda *_args: None)
    try:
        for _ in range(100):
            if len(attempts) >= 2:
                break
            await asyncio.sleep(0.01)
        assert len(attempts) >= 2
        assert attempts[0] == "ws://comfy.test:8188/ws?clientId=backend%20id"
        assert attempts[1] == attempts[0]
        assert delays[0] == 1.25
    finally:
        await bridge.stop()
        await bridge._http.aclose()


@pytest.mark.asyncio
async def test_binary_frame_without_unique_running_job_is_not_cross_associated() -> None:
    bridge = _http_bridge(
        lambda request: httpx.Response(
            200,
            json={
                "queue_running": [[1, "p1", {}, {}, []], [2, "p2", {}, {}, []]],
                "queue_pending": [],
            },
        )
    )
    previews: list[tuple[str, bytes, str]] = []
    try:
        await bridge._handle_binary_message(struct.pack(">II", 1, 1) + b"not-associated")
        assert previews == []
        assert bridge.get_preview("p1") is None
        assert bridge.get_preview("p2") is None
    finally:
        await bridge.stop()
        await bridge._http.aclose()


class _FakeConnect:
    def __init__(self, socket: _FakeSocket) -> None:
        self.socket = socket

    async def __aenter__(self) -> _FakeSocket:
        return self.socket

    async def __aexit__(self, *_: object) -> None:
        return None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("platform", "comfy_url", "expected_uri", "use_ipv4"),
    [
        ("win32", "http://localhost:8188", "ws://localhost:8188/ws?clientId=backend%20id", True),
        ("win32", "http://127.0.0.1:8188", "ws://127.0.0.1:8188/ws?clientId=backend%20id", False),
        ("win32", "http://[::1]:8188", "ws://[::1]:8188/ws?clientId=backend%20id", False),
        ("linux", "http://localhost:8188", "ws://localhost:8188/ws?clientId=backend%20id", False),
    ],
)
async def test_ws_uses_ipv4_only_for_windows_localhost_without_changing_uri(
    monkeypatch: pytest.MonkeyPatch,
    platform: str,
    comfy_url: str,
    expected_uri: str,
    use_ipv4: bool,
) -> None:
    bridge = ComfyGenerationBridge(
        comfy_url,
        client_id="backend id",
        http_client=httpx.AsyncClient(base_url=comfy_url, transport=httpx.MockTransport(lambda _request: httpx.Response(200, json={}))),
    )
    calls: list[tuple[str, dict[str, Any]]] = []

    def connect(uri: str, **kwargs: Any) -> _FakeConnect:
        calls.append((uri, kwargs))
        return _FakeConnect(_FakeSocket([]))

    monkeypatch.setattr(bridge_module.sys, "platform", platform)
    monkeypatch.setattr(websocket_client, "connect", connect)
    bridge._sleep = lambda _delay: asyncio.sleep(60)
    await bridge.start(lambda _event: None, lambda *_args: None)
    try:
        for _ in range(50):
            if calls:
                break
            await asyncio.sleep(0.01)
        assert calls
        uri, kwargs = calls[0]
        assert uri == expected_uri
        assert kwargs["max_size"] is None
        if use_ipv4:
            assert kwargs["family"] == socket.AF_INET
        else:
            assert "family" not in kwargs
    finally:
        await bridge.stop()
        await bridge._http.aclose()


@pytest.mark.asyncio
async def test_resident_ws_routes_json_and_latest_binary_preview_to_verified_running_job(monkeypatch: pytest.MonkeyPatch) -> None:
    bridge = _http_bridge(lambda request: httpx.Response(200, json={"queue_running": [[1, "p1", {}, {}, []]], "queue_pending": []}))
    events: list[dict[str, Any]] = []
    upstream_states: list[dict[str, Any]] = []
    previews: list[tuple[str, bytes, str]] = []
    binary = struct.pack(">II", 1, 1) + b"jpeg-frame"
    socket = _FakeSocket(
        [
            json.dumps({"type": "progress", "data": {"value": 1, "max": 3}}),
            binary,
            json.dumps({"type": "execution_success", "data": {"prompt_id": "p1"}}),
        ]
    )
    monkeypatch.setattr(websocket_client, "connect", lambda *_args, **_kwargs: _FakeConnect(socket))
    bridge._sleep = lambda _delay: asyncio.sleep(60)  # type: ignore[method-assign]

    def record_event(event: dict[str, Any]) -> None:
        events.append(event)
        upstream_states.append(bridge.get_upstream_state())

    await bridge.start(record_event, lambda prompt_id, frame, mime: previews.append((prompt_id, frame, mime)))
    try:
        for _ in range(50):
            if any(event.get("type") == "execution_success" for event in events):
                break
            await asyncio.sleep(0.01)
        assert bridge.client_id == "backend-client"
        assert events[0]["type"] == "progress"
        assert events[0]["data"] == {"value": 1, "max": 3}
        assert events[0]["prompt_id"] == "p1"
        assert upstream_states[0]["http_ready"] is True
        assert upstream_states[0]["ws_connected"] is True
        assert previews == [("p1", b"jpeg-frame", "image/jpeg")]
        assert bridge.get_preview("p1") is None
        assert events[-1]["type"] == "execution_success"
        assert events[-1]["prompt_id"] == "p1"
    finally:
        await bridge.stop()
    assert bridge.get_upstream_state()["ws_connected"] is False


@pytest.mark.asyncio
async def test_binary_preview_uses_big_endian_and_ignores_truncated_or_unknown_headers() -> None:
    bridge = _http_bridge(
        lambda request: httpx.Response(200, json={"queue_running": [[1, "p1", {}, {}, []]], "queue_pending": []})
    )
    previews: list[tuple[str, bytes, str]] = []
    bridge._on_preview = lambda prompt_id, frame, mime: previews.append((prompt_id, frame, mime))
    try:
        await bridge._handle_binary_message(b"\x00\x00\x00\x01")
        await bridge._handle_binary_message(struct.pack(">II", 1, 99) + b"unsupported")
        assert previews == []
        await bridge._handle_binary_message(struct.pack(">II", 1, 2) + b"png-frame")
        assert previews == [("p1", b"png-frame", "image/png")]
        assert bridge.get_preview("p1") == (b"png-frame", "image/png")
    finally:
        await bridge.stop()
        await bridge._http.aclose()


@pytest.mark.asyncio
async def test_eager_full_webp_cache_on_executed_req362_ac3(tmp_path: Path) -> None:
    """[REQ-362/AC-3] ジョブ完了時 (executed)、フルサイズWebPが先行非同期生成されてディスクキャッシュに保存されること。"""
    import io
    from PIL import Image
    from unittest.mock import MagicMock, patch
    from app.routers import comfy as comfy_router

    # テスト用 PNG 画像データ
    img = Image.new("RGB", (100, 100), color="purple")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    fake_disk_path = tmp_path / "eager_full.webp"

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = png_bytes
    mock_resp.raise_for_status = MagicMock()

    with patch.object(comfy_router, "_get_full_webp_disk_path", return_value=fake_disk_path):
        with patch("httpx.AsyncClient.get", return_value=mock_resp):
            await comfy_router.eager_cache_full_webp("eager_test.png", "", "output")

            # ディスクに WebP キャッシュが保存されていること
            assert fake_disk_path.exists()
            assert fake_disk_path.stat().st_size > 0

            # 保存されたファイルが有効な WebP であること
            with Image.open(fake_disk_path) as saved_img:
                assert saved_img.format == "WEBP"
