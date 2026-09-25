"""Tests for /api/ws WebSocket endpoint (REQ-288)."""
import asyncio
import json
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app

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
            data = ws.receive_text()
            msg = json.loads(data)
            assert msg["type"] == "SYSTEM_STATS"
            stats = msg["data"]
            assert "cpu_pct" in stats
            assert "ram_pct" in stats

# ── BE-03: メトリクス値の型検証 ──
def test_ws_stats_types():
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws") as ws:
            data = ws.receive_text()
            stats = json.loads(data)["data"]
            assert isinstance(stats["cpu_pct"], (int, float))
            assert 0 <= stats["cpu_pct"] <= 100
            assert isinstance(stats["ram_pct"], (int, float))
            assert 0 <= stats["ram_pct"] <= 100

# ── BE-04: AMD SMI 不可時のフォールバック ──
def test_ws_gpu_fallback_when_smi_unavailable():
    """rocm-smi が利用できない場合 gpu_pct=null になること。"""
    with patch(
        "app.services.resource_monitor.ResourceMonitorService._get_gpu_stats",
        new_callable=AsyncMock,
        return_value=(None, None, None, None)
    ):
        with TestClient(app) as client:
            with client.websocket_connect("/api/ws") as ws:
                data = ws.receive_text()
                stats = json.loads(data)["data"]
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
                msg1 = json.loads(ws1.receive_text())
                msg2 = json.loads(ws2.receive_text())
                assert msg1["type"] == "SYSTEM_STATS"
                assert msg2["type"] == "SYSTEM_STATS"
