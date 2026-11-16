"""E2E and Integration Tests for VRAM Guard (REQ-260)."""
import asyncio
import json
import sys
import time
from typing import Any, Iterator

import httpx
import pytest
from hypothesis import given, settings, strategies as st
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.database import engine, get_db_context
from app.models import AppSetting
from app.services.comfy_generation_bridge import ComfyGenerationBridge
from app.services.resource_monitor import (
    ComfyVramSnapshot,
    WindowsGpuMonitor,
    evaluate_vram_guard,
    parse_comfy_system_stats,
    resource_monitor,
    sum_adapter_dedicated_usage,
)


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


# ---------------------------------------------------------------------------
# Own-residual aware guard / primary-adapter VRAM / fresh sampling
# ---------------------------------------------------------------------------

GIB = 1024 ** 3
MIB = 1024 ** 2


def _payload(total: float, free: float, reserved: float, torch_free: float) -> dict[str, Any]:
    return {
        "devices": [
            {
                "vram_total": int(total * GIB),
                "vram_free": int(free * GIB),
                "torch_vram_total": int(reserved * GIB),
                "torch_vram_free": int(torch_free * GIB),
            }
        ]
    }


def _snapshot(total: float, free: float, reserved: float, torch_free: float) -> ComfyVramSnapshot:
    snap = parse_comfy_system_stats(_payload(total, free, reserved, torch_free))
    assert snap is not None
    return snap


@pytest.fixture
def restore_monitor() -> Iterator[None]:
    saved = (
        resource_monitor._min_free_gb,
        resource_monitor._guard_enabled,
        resource_monitor._last_vram_safe,
        resource_monitor._last_vram_free_gb,
        resource_monitor._last_vram_total_gb,
    )
    resource_monitor.configure_comfy_stats(None)
    resource_monitor.update_threshold(6.0, True)
    try:
        yield
    finally:
        resource_monitor.configure_comfy_stats(None)
        (
            resource_monitor._min_free_gb,
            resource_monitor._guard_enabled,
            resource_monitor._last_vram_safe,
            resource_monitor._last_vram_free_gb,
            resource_monitor._last_vram_total_gb,
        ) = saved


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-1")
@settings(max_examples=100, deadline=None)
@given(
    total=st.integers(min_value=1, max_value=64),
    free_frac=st.floats(min_value=0.0, max_value=1.0),
    reserved_frac=st.floats(min_value=0.0, max_value=1.0),
    torch_free_frac=st.floats(min_value=0.0, max_value=1.0),
    delta_frac=st.floats(min_value=0.0, max_value=1.0),
)
def test_guard_free_treats_own_torch_reserve_as_reclaimable(
    total: int, free_frac: float, reserved_frac: float, torch_free_frac: float, delta_frac: float
) -> None:
    """[REQ-432/AC-1] guard_free stays within [0, T], never shrinks as the reserve grows, and equals F with no reserve."""
    t = total * GIB
    f = int(t * free_frac)
    r = int(t * reserved_frac)
    rf = int(r * torch_free_frac)
    r2 = r + int((t - r) * delta_frac)

    def decide(reserved: int) -> float:
        snap = ComfyVramSnapshot(t, f, reserved, rf)
        d = evaluate_vram_guard(guard_enabled=True, min_free_gb=6.0, host_free_gb=None, comfy=snap)
        assert d.guard_free_gb is not None
        return d.guard_free_gb

    base = decide(r)
    assert 0.0 <= base <= total + 0.01
    assert decide(r2) >= base - 0.01
    no_reserve = evaluate_vram_guard(
        guard_enabled=True, min_free_gb=6.0, host_free_gb=None, comfy=ComfyVramSnapshot(t, f, 0, 0)
    )
    assert no_reserve.guard_free_gb is not None
    assert abs(no_reserve.guard_free_gb - f / GIB) <= 0.01


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-1")
def test_measured_post_generation_residual_is_not_held() -> None:
    """[REQ-432/AC-1] Measured post-generation point B (T=16, F=6.76, R=7.216, Rf=0.2, min=6) is safe via comfyui."""
    snap = _snapshot(16.0, 6.76, 7.216, 0.2)
    decision = evaluate_vram_guard(guard_enabled=True, min_free_gb=6.0, host_free_gb=5.3, comfy=snap)
    assert decision.safe is True
    assert decision.source == "comfyui"
    assert decision.hold_reason is None
    assert decision.guard_free_gb is not None and abs(decision.guard_free_gb - 13.78) <= 0.01
    assert decision.own_residual_gb is not None and abs(decision.own_residual_gb - 7.22) <= 0.01


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-1")
@pytest.mark.asyncio
async def test_sample_guard_status_excludes_own_residual_with_bridge(restore_monitor: None) -> None:
    """[REQ-432/AC-1] With a real bridge returning point B, the host-held residual no longer holds generation."""

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/system_stats"
        return httpx.Response(200, json=_payload(16.0, 6.76, 7.216, 0.2))

    client = httpx.AsyncClient(base_url="http://comfy.test:8188", transport=httpx.MockTransport(handler))
    bridge = ComfyGenerationBridge("http://comfy.test:8188", client_id="backend-client", http_client=client)
    try:
        resource_monitor.configure_comfy_stats(bridge.system_stats)
        with patch.object(
            resource_monitor, "_get_gpu_stats", new_callable=AsyncMock, return_value=(10.0, 10.7, 16.0, 66.9)
        ):
            status = await resource_monitor.sample_guard_status()
    finally:
        await client.aclose()
    assert status["vram_safe"] is True
    assert status["vram_free_gb"] == 5.3
    assert status["vram_guard_free_gb"] >= 6.0
    assert status["vram_measure_source"] == "comfyui"


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-2")
def test_external_occupancy_is_held_with_external_reason() -> None:
    """[REQ-432/AC-2] Another process holding VRAM (little free, small own reserve) is held as external."""
    snap = _snapshot(16.0, 2.0, 0.5, 0.2)
    decision = evaluate_vram_guard(guard_enabled=True, min_free_gb=6.0, host_free_gb=14.0, comfy=snap)
    assert decision.safe is False
    assert decision.hold_reason == "external"
    assert decision.source == "comfyui"
    assert decision.guard_free_gb is not None and decision.guard_free_gb < 6.0


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-2")
def test_host_fallback_hold_is_unattributed() -> None:
    """[REQ-432/AC-2] Without ComfyUI stats the host value decides and a hold is unattributed."""
    decision = evaluate_vram_guard(guard_enabled=True, min_free_gb=6.0, host_free_gb=3.0, comfy=None)
    assert decision.safe is False
    assert decision.hold_reason == "unattributed"
    assert decision.source == "host"
    assert decision.guard_free_gb == 3.0
    assert decision.own_residual_gb is None


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-2")
@settings(max_examples=100, deadline=None)
@given(
    enabled=st.booleans(),
    min_free=st.integers(min_value=0, max_value=32).map(float),
    host_free=st.one_of(st.none(), st.integers(min_value=0, max_value=64).map(float)),
    use_comfy=st.booleans(),
    free=st.integers(min_value=0, max_value=16),
    reserved=st.integers(min_value=0, max_value=16),
    torch_free_frac=st.floats(min_value=0.0, max_value=1.0),
)
def test_hold_reason_invariants(
    enabled: bool, min_free: float, host_free: float | None, use_comfy: bool, free: int, reserved: int, torch_free_frac: float
) -> None:
    """[REQ-432/AC-2] hold_reason is None iff safe; disabled guard is always safe; equality with the threshold is safe."""
    comfy = ComfyVramSnapshot(16 * GIB, free * GIB, reserved * GIB, int(reserved * GIB * torch_free_frac)) if use_comfy else None
    d = evaluate_vram_guard(guard_enabled=enabled, min_free_gb=min_free, host_free_gb=host_free, comfy=comfy)
    assert (d.hold_reason is None) == d.safe
    if not enabled:
        assert d.safe is True
    if comfy is None and host_free is None:
        assert d.safe is True and d.source is None and d.guard_free_gb is None
    if comfy is None and host_free is not None:
        assert d.source == "host"
    at_threshold = evaluate_vram_guard(guard_enabled=True, min_free_gb=min_free, host_free_gb=min_free, comfy=None)
    assert at_threshold.safe is True


def _invalid_payload(**override: Any) -> dict[str, Any]:
    dev = {
        "vram_total": 16 * GIB,
        "vram_free": 8 * GIB,
        "torch_vram_total": 2 * GIB,
        "torch_vram_free": 1 * GIB,
    }
    dev.update(override)
    return {"devices": [dev]}


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-2")
@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(_invalid_payload(vram_free=-1), id="neg"),
        pytest.param(_invalid_payload(vram_free=float("nan")), id="nan"),
        pytest.param(_invalid_payload(vram_free=float("inf")), id="inf"),
        pytest.param(_invalid_payload(vram_free=True), id="bool"),
        pytest.param({"devices": []}, id="empty"),
        pytest.param(_invalid_payload(torch_vram_free=3 * GIB), id="rf_gt_r"),
        pytest.param(_invalid_payload(vram_free=17 * GIB), id="f_gt_t"),
        pytest.param(_invalid_payload(vram_total=0, vram_free=0), id="t_zero"),
        pytest.param([], id="not_dict"),
    ],
)
def test_parse_comfy_system_stats_rejects_invalid_payloads(payload: Any) -> None:
    """[REQ-432/AC-2] Malformed or inconsistent /system_stats payloads parse to None without raising."""
    assert parse_comfy_system_stats(payload) is None


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-2")
@pytest.mark.asyncio
async def test_system_stats_broadcast_carries_hold_reason_and_recovery(restore_monitor: None) -> None:
    """[REQ-432/AC-2] External occupancy broadcasts hold_reason=external; recovery emits exactly one VRAM_RECOVERED."""
    messages: list[dict[str, Any]] = []
    free_gib = {"value": 2.0}

    async def broadcast(text: str) -> None:
        messages.append(json.loads(text))

    async def provider() -> dict[str, Any]:
        return _payload(16.0, free_gib["value"], 0.0, 0.0)

    sleeps = {"count": 0}

    async def fake_sleep(_: float) -> None:
        sleeps["count"] += 1
        if sleeps["count"] == 1:
            free_gib["value"] = 12.0
            return
        raise asyncio.CancelledError

    resource_monitor.configure_comfy_stats(provider)
    resource_monitor._last_vram_safe = None
    with patch.object(
        resource_monitor, "_get_gpu_stats", new_callable=AsyncMock, return_value=(10.0, 4.0, 16.0, 25.0)
    ), patch("asyncio.sleep", new=fake_sleep):
        try:
            await resource_monitor._run(broadcast)
        except asyncio.CancelledError:
            pass

    stats = [m["data"] for m in messages if m["type"] == "SYSTEM_STATS"]
    assert len(stats) == 2
    assert stats[0]["vram_hold_reason"] == "external"
    assert stats[0]["vram_safe"] is False
    assert stats[0]["vram_measure_source"] == "comfyui"
    assert stats[1]["vram_safe"] is True
    assert stats[1]["vram_hold_reason"] is None
    assert len([m for m in messages if m["type"] == "VRAM_RECOVERED"]) == 1


PRIMARY = "0x00000000_0x0000d1b5"
OTHER = "0x00000000_0x0000e2c6"


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-3")
@settings(max_examples=100, deadline=None)
@given(
    entries=st.lists(
        st.tuples(
            st.sampled_from(["primary", "other", "third"]),
            st.integers(min_value=0, max_value=3),
            st.integers(min_value=0, max_value=10 ** 11),
            st.booleans(),
        ),
        max_size=12,
    )
)
def test_adapter_usage_counts_only_primary_luid(entries: list[tuple[str, int, int, bool]]) -> None:
    """[REQ-432/AC-3] Only samples of the primary LUID (any phys_N, any case) are summed; no match falls back to all."""
    luids = {"primary": PRIMARY, "other": OTHER, "third": "0x00000001_0x00000002"}
    samples = []
    for tag, phys, value, upper in entries:
        name = f"luid_{luids[tag]}_phys_{phys}"
        samples.append((name.upper() if upper else name, float(value)))
    primary_total = float(sum(v for (tag, _, v, _) in entries if tag == "primary"))
    all_total = float(sum(v for (_, _, v, _) in entries))
    has_primary = any(tag == "primary" for (tag, _, _, _) in entries)
    assert sum_adapter_dedicated_usage(samples, PRIMARY) == (primary_total if has_primary else all_total)


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-3")
def test_measured_two_adapter_instances_use_primary_only() -> None:
    """[REQ-432/AC-3] Measured 10734MiB on the primary adapter plus 4000MiB on another counts only the primary."""
    samples = [
        ("luid_0x00000000_0x0000d1b5_phys_0", float(10734 * MIB)),
        ("luid_0x00000000_0x0000e2c6_phys_0", float(4000 * MIB)),
    ]
    assert sum_adapter_dedicated_usage(samples, PRIMARY) == float(10734 * MIB)


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-3")
@pytest.mark.parametrize(
    "primary",
    [pytest.param(None, id="unresolved"), pytest.param("0x00000009_0x00000009", id="no_match")],
)
def test_adapter_usage_falls_back_to_total_when_primary_unresolved(primary: str | None) -> None:
    """[REQ-432/AC-3] An unresolved or non-matching primary LUID sums all samples instead of returning 0."""
    samples = [
        ("luid_0x00000000_0x0000d1b5_phys_0", float(10734 * MIB)),
        ("luid_0x00000000_0x0000e2c6_phys_0", float(4000 * MIB)),
    ]
    assert sum_adapter_dedicated_usage(samples, primary) == float(14734 * MIB)


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-3")
@pytest.mark.skipif(sys.platform != "win32", reason="WindowsGpuMonitor is Windows-only")
def test_windows_collect_reports_primary_adapter_usage() -> None:
    """[REQ-432/AC-3] collect() reports VRAM usage of the primary adapter only (I/O boundary replaced)."""
    monitor = object.__new__(WindowsGpuMonitor)
    monitor._initialized = True
    monitor._pdh = MagicMock()
    monitor._h_query = object()
    monitor._h_vram = object()
    monitor._h_gpu = object()
    monitor.PDH_FMT_LARGE = 0x400
    monitor.PDH_FMT_DOUBLE = 0x200
    monitor.primary_luid_hex = PRIMARY
    monitor.vram_total_gb = 16.0
    items = [
        ("luid_0x00000000_0x0000d1b5_phys_0", float(10734 * MIB)),
        ("luid_0x00000000_0x0000e2c6_phys_0", float(4000 * MIB)),
    ]
    with patch.object(monitor, "_read_counter_items", return_value=items):
        _gpu_pct, vram_used_gb, vram_total_gb, vram_pct = monitor.collect()
    assert vram_used_gb == round(10734 * MIB / GIB, 1)
    assert vram_total_gb == 16.0
    assert vram_pct == round(vram_used_gb / 16.0 * 100, 1)


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-4")
@pytest.mark.asyncio
async def test_sample_guard_status_ignores_stale_cache(restore_monitor: None) -> None:
    """[REQ-432/AC-4] A stale low cached free value is ignored; each call re-samples host I/O and the provider."""
    resource_monitor._last_vram_free_gb = 1.0
    provider = AsyncMock(return_value=None)
    resource_monitor.configure_comfy_stats(provider)
    with patch.object(
        resource_monitor, "_get_gpu_stats", new_callable=AsyncMock, return_value=(10.0, 4.0, 16.0, 25.0)
    ) as host:
        first = await resource_monitor.sample_guard_status()
        second = await resource_monitor.sample_guard_status()
    assert first["vram_safe"] is True and second["vram_safe"] is True
    assert first["vram_free_gb"] == 12.0
    assert host.await_count == 2
    assert provider.await_count == 2


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-4")
@pytest.mark.asyncio
async def test_comfy_stats_timeout_falls_back_to_fresh_host_value(restore_monitor: None) -> None:
    """[REQ-432/AC-4] A hanging ComfyUI stats call is abandoned after ~1s and the fresh host value decides."""

    async def slow() -> dict[str, Any]:
        await asyncio.sleep(2)
        return _payload(16.0, 12.0, 0.0, 0.0)

    resource_monitor.configure_comfy_stats(slow)
    started = time.monotonic()
    with patch.object(
        resource_monitor, "_get_gpu_stats", new_callable=AsyncMock, return_value=(10.0, 4.0, 16.0, 25.0)
    ):
        status = await resource_monitor.sample_guard_status()
    elapsed = time.monotonic() - started
    assert 0.9 <= elapsed < 1.9
    assert status["vram_measure_source"] == "host"
    assert status["vram_guard_free_gb"] == 12.0


import logging  # noqa: E402

import app.services.resource_monitor as resource_monitor_module  # noqa: E402

_FALLBACK_LOGGER = "app.services.resource_monitor"
_TWO_ADAPTERS = [
    ("luid_0x00000000_0x0000d1b5_phys_0", float(10734 * MIB)),
    ("luid_0x00000000_0x0000e2c6_phys_0", float(4000 * MIB)),
]


def _fallback_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == _FALLBACK_LOGGER and r.levelno == logging.DEBUG]


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-3")
@pytest.mark.parametrize(
    "reason,primary,other",
    [
        pytest.param("unresolved", None, "0x00000009_0x00000009", id="unresolved"),
        pytest.param("no_match", "0x00000009_0x00000009", None, id="no_match"),
    ],
)
def test_adapter_usage_fallback_logs_debug_only_on_first_occurrence(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    reason: str,
    primary: str | None,
    other: str | None,
) -> None:
    """[REQ-432/AC-3] The all-adapter fallback emits exactly one debug log per process, shared by both reasons."""
    monkeypatch.setattr(resource_monitor_module, "_adapter_fallback_logged", False, raising=False)
    caplog.set_level(logging.DEBUG, logger=_FALLBACK_LOGGER)
    for _ in range(3):
        assert sum_adapter_dedicated_usage(_TWO_ADAPTERS, primary) == float(14734 * MIB)
    records = _fallback_records(caplog)
    assert len(records) == 1
    assert reason in records[0].getMessage()
    assert sum_adapter_dedicated_usage(iter(_TWO_ADAPTERS), other) == float(14734 * MIB)
    assert len(_fallback_records(caplog)) == 1


@getattr(pytest.mark, "REQ-432")
@getattr(pytest.mark, "AC-3")
def test_adapter_usage_primary_match_does_not_log_fallback(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """[REQ-432/AC-3] A primary-LUID match neither logs nor consumes the once-flag."""
    monkeypatch.setattr(resource_monitor_module, "_adapter_fallback_logged", False, raising=False)
    caplog.set_level(logging.DEBUG, logger=_FALLBACK_LOGGER)
    for _ in range(2):
        assert sum_adapter_dedicated_usage(_TWO_ADAPTERS, PRIMARY) == float(10734 * MIB)
    assert len(_fallback_records(caplog)) == 0
    assert sum_adapter_dedicated_usage(_TWO_ADAPTERS, None) == float(14734 * MIB)
    assert len(_fallback_records(caplog)) == 1
