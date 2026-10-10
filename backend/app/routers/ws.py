from __future__ import annotations

import asyncio
import inspect
import json
import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import urlsplit

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class _ClientWriter:
    websocket: WebSocket
    wake: asyncio.Event = field(default_factory=asyncio.Event)
    initial_generation: str | None = None
    generation: str | None = None
    stats: str | None = None
    other: deque[str] = field(default_factory=deque)
    initializing: bool = True
    writer: asyncio.Task[None] | None = None


class ConnectionManager:
    """Manage one nonblocking writer and coalesced state slots per WebSocket."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self._clients: dict[WebSocket, _ClientWriter] = {}
        self._lock = asyncio.Lock()
        self._snapshot_supplier: Callable[[], Any] | None = None
        self._request_snapshot: Callable[[], Any] | None = None
        self._latest_generation: dict[str, Any] | None = None

    def configure_generation(
        self,
        snapshot_supplier: Callable[[], Any],
        request_snapshot: Callable[[], Any],
    ) -> None:
        self._snapshot_supplier = snapshot_supplier
        self._request_snapshot = request_snapshot

    async def connect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self._clients:
                return
            state = _ClientWriter(websocket)
            self.active_connections.append(websocket)
            self._clients[websocket] = state
        try:
            await websocket.accept()
        except Exception:
            await self.disconnect(websocket)
            raise

        if self._snapshot_supplier is not None:
            try:
                if self._request_snapshot is not None:
                    try:
                        await self._call(self._request_snapshot)
                    except Exception:
                        logger.warning("Initial generation reconciliation failed", exc_info=True)
                snapshot = await self._call(self._snapshot_supplier)
                if not isinstance(snapshot, dict):
                    raise TypeError("generation snapshot supplier must return a dict")
                initial = self._generation_message(snapshot)
                async with self._lock:
                    if self._clients.get(websocket) is not state:
                        return
                    state.initial_generation = initial
                    latest = self._latest_generation
                    if latest is not None and self._revision(latest) > self._revision(snapshot):
                        state.generation = self._generation_message(latest)
                    state.initializing = False
                    state.wake.set()
            except Exception:
                logger.warning("Could not prepare initial generation snapshot", exc_info=True)
                async with self._lock:
                    if self._clients.get(websocket) is state:
                        state.initializing = False
                        state.wake.set()

        state.writer = asyncio.create_task(self._writer(state), name="websocket-client-writer")

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            state = self._clients.pop(websocket, None)
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
            if state is None:
                return
            state.wake.set()
            writer = state.writer
            state.writer = None
        if writer is not None and writer is not asyncio.current_task():
            writer.cancel()
            try:
                await writer
            except asyncio.CancelledError:
                pass

    async def broadcast(self, message: str) -> None:
        try:
            decoded = json.loads(message)
        except (TypeError, json.JSONDecodeError):
            decoded = None
        async with self._lock:
            for state in self._clients.values():
                if isinstance(decoded, dict) and decoded.get("type") == "SYSTEM_STATS":
                    state.stats = message
                else:
                    state.other.append(message)
                state.wake.set()

    async def publish_generation(self, snapshot: dict[str, Any]) -> None:
        """Publish an atomic full snapshot; slow clients retain only the newest state."""
        message = self._generation_message(snapshot)
        async with self._lock:
            if (
                self._latest_generation is not None
                and self._revision(snapshot) <= self._revision(self._latest_generation)
            ):
                return
            self._latest_generation = snapshot
            for state in self._clients.values():
                if state.initializing:
                    # connect() compares this against the freshly reconciled snapshot.
                    continue
                state.generation = message
                state.wake.set()

    async def _writer(self, state: _ClientWriter) -> None:
        try:
            while True:
                await state.wake.wait()
                while True:
                    async with self._lock:
                        if self._clients.get(state.websocket) is not state:
                            return
                        if state.initial_generation is not None:
                            message, state.initial_generation = state.initial_generation, None
                        elif state.generation is not None:
                            message, state.generation = state.generation, None
                        elif state.stats is not None:
                            message, state.stats = state.stats, None
                        elif state.other:
                            message = state.other.popleft()
                        else:
                            state.wake.clear()
                            break
                    await state.websocket.send_text(message)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("WebSocket writer failed; disconnecting client", exc_info=True)
            await self.disconnect(state.websocket)

    @staticmethod
    async def _call(callback: Callable[[], Any]) -> Any:
        result = callback()
        if inspect.isawaitable(result):
            return await result
        return result

    @classmethod
    def _generation_message(cls, snapshot: dict[str, Any]) -> str:
        return json.dumps(
            {
                "type": "GENERATION_SNAPSHOT",
                "version": snapshot["version"],
                "epoch": snapshot["epoch"],
                "revision": snapshot["revision"],
                "data": snapshot,
            },
            separators=(",", ":"),
        )

    @staticmethod
    def _revision(snapshot: dict[str, Any]) -> int:
        revision = snapshot.get("revision", -1)
        return revision if isinstance(revision, int) else -1


manager = ConnectionManager()

router = APIRouter(prefix="/api", tags=["websocket"])


def _origin_allowed(origin: str | None, websocket: WebSocket) -> bool:
    # Native/local clients may omit Origin. Browser origins must exactly match
    # this request's canonical origin or an explicitly configured CORS origin.
    if origin is None:
        return True
    parsed = urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
        return False
    request_scheme = "https" if websocket.url.scheme == "wss" else "http"
    same_origin = f"{request_scheme}://{websocket.url.netloc}"
    return origin == same_origin or origin in settings.cors_origins_list


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    """Accept an allowed Origin and wait for client pings with a 30s timeout."""
    if not _origin_allowed(websocket.headers.get("origin"), websocket):
        await websocket.close(code=1008)
        return
    try:
        # Registration happens before accept/reconciliation finishes, so the
        # cleanup lifetime must include connect() itself as well as the read loop.
        await manager.connect(websocket)
        while True:
            await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        cleanup = asyncio.create_task(manager.disconnect(websocket))
        try:
            await asyncio.shield(cleanup)
        except asyncio.CancelledError:
            # A cancelled handler still owns its registered connection. Finish
            # cleanup in a separate task before allowing cancellation through.
            await cleanup
            raise
