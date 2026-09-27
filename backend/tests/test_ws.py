"""Tests for /api/ws WebSocket endpoint (REQ-288 / REQ-289)."""
import asyncio
import json
import sys
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
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

# ── BE-07: Windows 実機または WindowsGpuMonitor 統合テスト (REQ-289) ──
def test_ws_windows_gpu_monitor_metrics():
    """Windows 環境で WindowsGpuMonitor が正常動作し、動的メトリクスが返却されること。"""
    with TestClient(app) as client:
        with client.websocket_connect("/api/ws") as ws:
            data = ws.receive_text()
            stats = json.loads(data)["data"]
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
                data = ws.receive_text()
                stats = json.loads(data)["data"]
                # エラー時でも WebSocket は配信され、CPU/RAM は取得できる
                assert "cpu_pct" in stats
                assert stats["gpu_pct"] is None
                assert stats["vram_total_gb"] == 16.0


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

