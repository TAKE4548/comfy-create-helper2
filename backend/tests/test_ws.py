"""Tests for /api/ws WebSocket endpoint (REQ-288 / REQ-289)."""
import asyncio
import json
import sys
from types import SimpleNamespace
from typing import cast
import pytest
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from app.main import app
import app.routers.ws as ws_router
from app.routers.ws import ConnectionManager


def _receive_until(ws, message_type: str) -> dict:
    for _ in range(5):
        msg = json.loads(ws.receive_text())
        if msg.get("type") == "GENERATION_SNAPSHOT":
            assert isinstance(msg.get("data"), dict)
            assert msg.get("version") == 1
            assert msg.get("epoch") == msg["data"].get("epoch")
            assert msg.get("revision") == msg["data"].get("revision")
            assert msg["data"].get("version") == 1
        if msg.get("type") == message_type:
            return msg
    raise AssertionError(f"did not receive {message_type}")

# ── BE-01: WebSocket 接続確立 ──
def test_ws_connect():
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws") as ws:
            # 接続成功 (例外が発生しないこと)
            assert ws is not None

# ── BE-02: SYSTEM_STATS メッセージ受信 ──
def test_ws_receives_system_stats():
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws") as ws:
            msg = _receive_until(ws, "SYSTEM_STATS")
            assert msg["type"] == "SYSTEM_STATS"
            stats = msg["data"]
            assert "cpu_pct" in stats
            assert "ram_pct" in stats

# ── BE-03: メトリクス値の型検証 ──
def test_ws_stats_types():
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws") as ws:
            stats = _receive_until(ws, "SYSTEM_STATS")["data"]
            assert isinstance(stats["cpu_pct"], (int, float))
            assert 0 <= stats["cpu_pct"] <= 100
            assert isinstance(stats["ram_pct"], (int, float))
            assert 0 <= stats["ram_pct"] <= 100

# ── BE-04: SMI/GPU モニター不可時のフォールバック ──
def test_ws_gpu_fallback_when_smi_unavailable():
    """GPU メトリクスが利用できない場合 gpu_pct=null になること。"""
    with patch(
        "app.services.resource_monitor.ResourceMonitorService._get_gpu_stats",
        new_callable=AsyncMock,
        return_value=(None, None, None, None)
    ):
        with TestClient(app) as client:
            with client.websocket_connect("/api/ws") as ws:
                stats = _receive_until(ws, "SYSTEM_STATS")["data"]
                assert stats["gpu_pct"] is None
                assert stats["vram_pct"] is None

# ── BE-05: クライアント切断時の正常終了 ──
def test_ws_disconnect_graceful():
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws") as ws:
            pass  # コンテキスト終了で切断
        # 例外が外に漏れないこと = テスト PASS

# ── BE-06: 複数クライアント同時接続 ──
def test_ws_multiple_clients():
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws") as ws1:
            with client.websocket_connect("/api/ws") as ws2:
                initial1 = json.loads(ws1.receive_text())
                initial2 = json.loads(ws2.receive_text())
                assert initial1["type"] == "GENERATION_SNAPSHOT"
                assert isinstance(initial1["data"], dict)
                assert initial1["version"] == 1
                assert initial1["epoch"] == initial1["data"]["epoch"]
                assert initial1["revision"] == initial1["data"]["revision"]
                assert initial2["type"] == "GENERATION_SNAPSHOT"
                assert isinstance(initial2["data"], dict)
                assert initial2["version"] == 1
                assert initial2["epoch"] == initial2["data"]["epoch"]
                assert initial2["revision"] == initial2["data"]["revision"]

                stats1 = _receive_until(ws1, "SYSTEM_STATS")
                stats2 = _receive_until(ws2, "SYSTEM_STATS")
                assert "cpu_pct" in stats1["data"]
                assert "cpu_pct" in stats2["data"]


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [asyncio.CancelledError, RuntimeError])
async def test_ws_endpoint_disconnects_client_when_handler_is_cancelled_or_fails(monkeypatch, failure):
    local_manager = ConnectionManager()
    monkeypatch.setattr(ws_router, "manager", local_manager)
    monkeypatch.setattr(ws_router, "_origin_allowed", lambda _origin, _websocket: True)

    class FailingWebSocket:
        headers = {}
        url = SimpleNamespace(scheme="ws", netloc="testserver")

        async def accept(self) -> None:
            return None

        async def receive_text(self) -> str:
            raise failure("receive failed")

    websocket = FailingWebSocket()
    with pytest.raises(failure):
        await ws_router.ws_endpoint(cast(WebSocket, websocket))
    assert local_manager.active_connections == []


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel_stage", ["accept", "reconcile"])
async def test_ws_endpoint_unregisters_client_when_connect_is_cancelled(monkeypatch, cancel_stage):
    local_manager = ConnectionManager()
    reconcile_started = asyncio.Event()
    release_reconcile = asyncio.Event()

    async def request_snapshot() -> None:
        reconcile_started.set()
        await release_reconcile.wait()

    local_manager.configure_generation(lambda: {}, request_snapshot)
    monkeypatch.setattr(ws_router, "manager", local_manager)
    monkeypatch.setattr(ws_router, "_origin_allowed", lambda _origin, _websocket: True)

    class DelayedWebSocket:
        headers = {}
        url = SimpleNamespace(scheme="ws", netloc="testserver")

        async def accept(self) -> None:
            if cancel_stage == "accept":
                raise asyncio.CancelledError

        async def send_text(self, _message: str) -> None:
            return None

        async def receive_text(self) -> str:
            await asyncio.Future()
            raise AssertionError("unreachable")

    websocket = DelayedWebSocket()
    handler = asyncio.create_task(ws_router.ws_endpoint(cast(WebSocket, websocket)))
    if cancel_stage == "reconcile":
        await asyncio.wait_for(reconcile_started.wait(), 1)
        assert local_manager.active_connections
        handler.cancel()

    with pytest.raises(asyncio.CancelledError):
        await handler
    assert local_manager.active_connections == []
    assert websocket not in local_manager._clients

# ── BE-07: Windows 実機または WindowsGpuMonitor 統合テスト (REQ-289) ──
def test_ws_windows_gpu_monitor_metrics():
    """Windows 環境で WindowsGpuMonitor が正常動作し、動的メトリクスが返却されること。"""
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws") as ws:
            stats = _receive_until(ws, "SYSTEM_STATS")["data"]
            if sys.platform == "win32":
                # Windows 実機では gpu_pct, vram_used_gb, vram_total_gb, vram_pct が取得できる
                assert stats["gpu_pct"] is not None
                assert isinstance(stats["gpu_pct"], (int, float))
                assert 0.0 <= stats["gpu_pct"] <= 100.0

                assert stats["vram_total_gb"] is not None
                assert stats["vram_total_gb"] > 0
                assert isinstance(stats["vram_total_gb"], (int, float))

                if stats["vram_used_gb"] is not None:
                    assert isinstance(stats["vram_used_gb"], (int, float))
                    assert 0.0 <= stats["vram_used_gb"] <= stats["vram_total_gb"] * 1.5

# ── BE-08: WindowsGpuMonitor 例外発生時のフォールバック (Red Teaming) ──
def test_ws_windows_gpu_monitor_exception_handling():
    """WindowsGpuMonitor.collect が例外を発生させた場合でもクラッシュせずフォールバックすること。"""
    mock_monitor = MagicMock()
    mock_monitor.vram_total_gb = 16.0
    mock_monitor.collect.side_effect = RuntimeError("PDH query error")

    with patch("app.services.resource_monitor.resource_monitor._win_gpu_monitor", mock_monitor):
        with TestClient(app) as client:
            with client.websocket_connect("/api/ws") as ws:
                stats = _receive_until(ws, "SYSTEM_STATS")["data"]
                # エラー時でも WebSocket は配信され、CPU/RAM は取得できる
                assert "cpu_pct" in stats
                assert stats["gpu_pct"] is None
                assert stats["vram_total_gb"] == 16.0


def test_ws_rejects_unapproved_origin():
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as error:
            with client.websocket_connect("/api/ws", headers={"Origin": "https://foreign.invalid"}):
                pass
        assert error.value.code == 1008


@pytest.mark.parametrize("origin", ["http://testserver", "http://localhost:5173"])
def test_ws_accepts_same_origin_or_configured_development_origin(origin: str):
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws", headers={"Origin": origin}) as ws:
            assert ws is not None


# ── BE-09: WindowsGpuMonitor 全エンジンMAX集計およびLUIDフィルタリング (REQ-290) ──
def test_windows_gpu_monitor_engine_max_and_luid_filtering():
    """WindowsGpuMonitor がプライマリLUIDを検出し、全エンジンMAX集計で正常にメトリクスを取得すること。"""
    from app.services.resource_monitor import WindowsGpuMonitor
    monitor = WindowsGpuMonitor()
    try:
        if sys.platform == "win32":
            assert monitor.primary_luid_hex is not None
            assert monitor.primary_luid_hex.startswith("0x")
            # PDH サンプリングのために短時間待機
            import time
            time.sleep(0.1)
            gpu_pct, vram_used_gb, vram_total_gb, vram_pct = monitor.collect()
            assert gpu_pct is not None
            assert 0.0 <= gpu_pct <= 100.0
            assert vram_total_gb is not None and vram_total_gb > 0
    finally:
        if hasattr(monitor, "close"):
            monitor.close()
