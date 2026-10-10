from __future__ import annotations

import asyncio
import json
from collections import deque
from typing import Any, cast

import pytest
from fastapi import WebSocket
from app.routers.ws import ConnectionManager


class FakeWebSocket:
    def __init__(self) -> None:
        self.accept_calls = 0
        self.sent: deque[str] = deque()
        self.sent_event = asyncio.Event()
        self.send_started: asyncio.Event | None = None
        self.send_gate: asyncio.Event | None = None

    async def accept(self) -> None:
        self.accept_calls += 1

    async def send_text(self, message: str) -> None:
        if self.send_started is not None:
            self.send_started.set()
        if self.send_gate is not None:
            await self.send_gate.wait()
        self.sent.append(message)
        self.sent_event.set()

    async def next_message(self) -> dict[str, Any]:
        for _ in range(100):
            if self.sent:
                message = json.loads(self.sent.popleft())
                if not self.sent:
                    self.sent_event.clear()
                return message
            self.sent_event.clear()
            await asyncio.wait_for(self.sent_event.wait(), 1)
        raise AssertionError("message not sent")


def _snapshot(revision: int) -> dict[str, Any]:
    return {
        "version": 1,
        "epoch": "test",
        "revision": revision,
        "normal_group_id": None,
        "jobs": [],
        "batches": [],
        "upstream": {"http_ready": True, "ws_connected": True, "failure_since": None},
    }


def _envelope(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "GENERATION_SNAPSHOT",
        "version": 1,
        "epoch": snapshot["epoch"],
        "revision": snapshot["revision"],
        "data": snapshot,
    }


@pytest.mark.asyncio
async def test_connection_orders_reconciled_initial_snapshot_before_newer_buffered_revision() -> None:
    manager = ConnectionManager()
    websocket = FakeWebSocket()
    reconcile_started = asyncio.Event()
    finish_reconcile = asyncio.Event()
    latest = {"value": _snapshot(3)}

    async def request_snapshot() -> None:
        reconcile_started.set()
        await finish_reconcile.wait()

    manager.configure_generation(lambda: latest["value"], request_snapshot)
    connecting = asyncio.create_task(manager.connect(cast(WebSocket, websocket)))
    await reconcile_started.wait()
    await manager.publish_generation(_snapshot(2))
    await manager.publish_generation(_snapshot(4))
    latest["value"] = _snapshot(3)
    finish_reconcile.set()
    await connecting

    initial = await websocket.next_message()
    newer = await websocket.next_message()
    assert initial == _envelope(_snapshot(3))
    assert newer == _envelope(_snapshot(4))
    await manager.disconnect(cast(WebSocket, websocket))


@pytest.mark.asyncio
async def test_generation_and_stats_coalesce_while_single_writer_is_slow() -> None:
    manager = ConnectionManager()
    websocket = FakeWebSocket()
    websocket.send_started = asyncio.Event()
    websocket.send_gate = asyncio.Event()
    snapshot = _snapshot(1)
    manager.configure_generation(lambda: snapshot, _noop)
    await manager.connect(cast(WebSocket, websocket))
    await asyncio.wait_for(websocket.send_started.wait(), 1)

    await manager.publish_generation(_snapshot(2))
    await manager.publish_generation(_snapshot(3))
    await manager.broadcast(json.dumps({"type": "SYSTEM_STATS", "data": {"cpu_pct": 1}}))
    await manager.broadcast(json.dumps({"type": "SYSTEM_STATS", "data": {"cpu_pct": 2}}))
    recovered = {"type": "VRAM_RECOVERED", "data": {"free_gb": 8.0}}
    await manager.broadcast(json.dumps(recovered))
    websocket.send_gate.set()

    sent = [await websocket.next_message() for _ in range(4)]
    assert sent[0] == _envelope(_snapshot(1))
    assert sent[1] == _envelope(_snapshot(3))
    assert sent[2] == {"type": "SYSTEM_STATS", "data": {"cpu_pct": 2}}
    assert sent[3] == recovered
    await manager.disconnect(cast(WebSocket, websocket))


async def _noop() -> None:
    return None


@pytest.mark.asyncio
async def test_duplicate_connection_disconnect_and_zero_client_publishing_are_idempotent() -> None:
    manager = ConnectionManager()
    websocket = FakeWebSocket()
    manager.configure_generation(lambda: _snapshot(0), _noop)
    await manager.publish_generation(_snapshot(1))
    await manager.connect(cast(WebSocket, websocket))
    await manager.connect(cast(WebSocket, websocket))
    assert websocket.accept_calls == 1
    assert len(manager.active_connections) == 1
    initial = await websocket.next_message()
    assert initial == _envelope(_snapshot(0))
    await manager.disconnect(cast(WebSocket, websocket))
    await manager.disconnect(cast(WebSocket, websocket))
    await manager.publish_generation(_snapshot(2))
    await manager.broadcast('{"type":"VRAM_RECOVERED","data":{}}')
    assert manager.active_connections == []


@pytest.mark.asyncio
async def test_send_failure_disconnects_client_without_blocking_publisher() -> None:
    manager = ConnectionManager()

    class BrokenSocket(FakeWebSocket):
        async def send_text(self, _message: str) -> None:
            raise RuntimeError("closed socket")

    websocket = BrokenSocket()
    manager.configure_generation(lambda: _snapshot(1), _noop)
    await manager.connect(cast(WebSocket, websocket))
    for _ in range(100):
        if not manager.active_connections:
            break
        await asyncio.sleep(0.005)
    assert manager.active_connections == []
    await asyncio.wait_for(manager.publish_generation(_snapshot(2)), 0.1)
