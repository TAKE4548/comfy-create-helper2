"""E2E and Integration Tests for VRAM Guard (REQ-260)."""
import asyncio
import json
import time
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.database import engine, get_db_context
from app.models import AppSetting
from app.services.resource_monitor import resource_monitor


class TestVramGuardAPI:
    @pytest.fixture(autouse=True)
    def clean_settings(self):
        """Clean up settings before and after tests."""
        AppSetting.__table__.create(bind=engine, checkfirst=True)
        with get_db_context() as db:
            db.query(AppSetting).filter(AppSetting.key.in_(["vram_min_free_gb", "vram_guard_enabled"])).delete()
            db.commit()
        resource_monitor.update_threshold(6.0, True)
        yield
        with get_db_context() as db:
            db.query(AppSetting).filter(AppSetting.key.in_(["vram_min_free_gb", "vram_guard_enabled"])).delete()
            db.commit()
        resource_monitor.update_threshold(6.0, True)

    def test_app_settings_persistence(self):
        """[REQ-260/AC-1] Test AppSetting persistence and reload logic."""
        with get_db_context() as db:
            setting = AppSetting(key="vram_min_free_gb", value="8.0")
            db.add(setting)
            guard = AppSetting(key="vram_guard_enabled", value="false")
            db.add(guard)
            db.commit()

        resource_monitor._load_settings_from_db()
        status = resource_monitor.get_vram_status()
        assert status["vram_min_free_gb"] == 8.0
        assert status["vram_guard_enabled"] is False

    def test_get_put_vram_settings(self):
        """[REQ-260/AC-2] Test GET /api/settings/vram and PUT /api/settings/vram with dynamic threshold update."""
        # Run lifespan setup so the request's database has its tables.
        with TestClient(app) as client:
            self._assert_vram_settings_round_trip(client)

    def _assert_vram_settings_round_trip(self, client: TestClient):

        res = client.get("/api/settings/vram")
        assert res.status_code == 200
        data = res.json()
        assert "vram_min_free_gb" in data
        assert "vram_guard_enabled" in data

        put_res = client.put(
            "/api/settings/vram",
            json={"vram_min_free_gb": 8.5, "vram_guard_enabled": True},
        )
        assert put_res.status_code == 200
        put_data = put_res.json()
        assert put_data["vram_min_free_gb"] == 8.5
        assert put_data["vram_guard_enabled"] is True

        with get_db_context() as db:
            rec = db.query(AppSetting).filter(AppSetting.key == "vram_min_free_gb").first()
            assert rec is not None
            assert rec.value == "8.5"

        assert resource_monitor._min_free_gb == 8.5
        assert resource_monitor._guard_enabled is True

        get_res = client.get("/api/settings/vram")
        assert get_res.status_code == 200
        assert get_res.json()["vram_min_free_gb"] == 8.5

    def test_vram_status_dynamic_threshold(self):
        """[REQ-260/AC-3] Test dynamic threshold effect on safe flag."""
        resource_monitor._last_vram_free_gb = 7.0
        resource_monitor._last_vram_total_gb = 16.0

        resource_monitor.update_threshold(6.0, True)
        with patch.object(
            resource_monitor,
            "_get_gpu_stats",
            new_callable=AsyncMock,
            return_value=(20.0, 9.0, 16.0, 56.25),
        ):
            stats = asyncio.run(resource_monitor._collect())
            assert stats["vram_free_gb"] == 7.0
            assert stats["vram_safe"] is True

        resource_monitor.update_threshold(8.0, True)
        with patch.object(
            resource_monitor,
            "_get_gpu_stats",
            new_callable=AsyncMock,
            return_value=(20.0, 9.0, 16.0, 56.25),
        ):
            stats = asyncio.run(resource_monitor._collect())
            assert stats["vram_free_gb"] == 7.0
            assert stats["vram_safe"] is False

        resource_monitor.update_threshold(8.0, False)
        with patch.object(
            resource_monitor,
            "_get_gpu_stats",
            new_callable=AsyncMock,
            return_value=(20.0, 9.0, 16.0, 56.25),
        ):
            stats = asyncio.run(resource_monitor._collect())
            assert stats["vram_safe"] is True

    def test_ws_broadcast_includes_vram_fields(self):
        """[REQ-260/AC-4] Verify /api/ws includes vram_free_gb, vram_safe, and vram_min_free_gb in SYSTEM_STATS."""
        resource_monitor.update_threshold(6.0, True)
        assert type(resource_monitor).INTERVAL == 2.5, "[REQ-394/AC-4] production INTERVAL must stay 2.5 before shortening"
        with patch.object(
            resource_monitor,
            "_get_gpu_stats",
            new_callable=AsyncMock,
            return_value=(15.0, 8.0, 16.0, 50.0),
        ), patch.object(resource_monitor, "INTERVAL", 0.05):
            with TestClient(app) as client:
                with client.websocket_connect("/api/ws") as ws:
                    started = time.monotonic()
                    msg = json.loads(ws.receive_text())
                    while msg.get("type") != "SYSTEM_STATS":
                        msg = json.loads(ws.receive_text())
                    assert time.monotonic() - started < 2.0, "[REQ-394/AC-4] SYSTEM_STATS waited for the production INTERVAL"
                    assert msg["type"] == "SYSTEM_STATS"
                    stats = msg["data"]
                    assert "vram_free_gb" in stats
                    assert "vram_safe" in stats
                    assert "vram_min_free_gb" in stats
                    assert stats["vram_free_gb"] == 8.0
                    assert stats["vram_safe"] is True
                    assert stats["vram_min_free_gb"] == 6.0

    @pytest.mark.asyncio
    async def test_vram_recovered_broadcast_event(self):
        """[REQ-260/AC-5] Verify VRAM_RECOVERED event is broadcast when transitioning from unsafe to safe."""
        broadcast_messages = []

        async def mock_broadcast(msg_text: str):
            broadcast_messages.append(json.loads(msg_text))

        resource_monitor.update_threshold(8.0, True)
        resource_monitor._last_vram_safe = False

        with patch.object(
            resource_monitor,
            "_get_gpu_stats",
            new_callable=AsyncMock,
            return_value=(10.0, 4.0, 16.0, 25.0),
        ), patch("asyncio.sleep", side_effect=asyncio.CancelledError):
            try:
                await resource_monitor._run(mock_broadcast)
            except asyncio.CancelledError:
                pass

        recovered_events = [m for m in broadcast_messages if m["type"] == "VRAM_RECOVERED"]
        assert len(recovered_events) >= 1
        recovery_data = recovered_events[0]["data"]
        assert recovery_data["vram_free_gb"] == 12.0
        assert recovery_data["vram_min_free_gb"] == 8.0
        assert "ts" in recovery_data
