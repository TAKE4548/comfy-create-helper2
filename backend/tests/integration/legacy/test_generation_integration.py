from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import pytest
from websockets.asyncio.server import serve as websocket_serve
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from PIL import Image
from unittest.mock import MagicMock, patch
import io
import urllib.parse

from app.database import Base
from app.models import PromptMetadata, Snapshot, Workflow
from app.routers.generation import router as generation_api_router
from app.routers.ws import manager as ws_manager, router as ws_api_router
from app.schemas.generation import BatchRequest
from app.services.comfy_generation_bridge import ComfyGenerationBridge
from app.services.generation_repository import GenerationRepository
from app.services.generation_service import GenerationService
from app.services.snapshot_service import SnapshotService
from app.schemas.snapshot import SnapshotCreate
from app.config import settings


class LocalUpstream:
    """HTTP-level Comfy mock used by the real bridge, service, and repository."""

    def __init__(self) -> None:
        self.prompt_calls: list[dict[str, Any]] = []
        self.pending: list[list[Any]] = []
        self.running: list[list[Any]] = []
        self.history: dict[str, Any] = {}
        self.prompt_outcome: str = "accepted"
        self.prompt_error: Exception | None = None
        self.queue_error: Exception | None = None
        self.queue_responses: list[dict[str, Any]] = []
        self.delete_ack: dict[str, Any] = {}
        self.calls: list[tuple[str, str]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append((request.method, request.url.path))
        if request.url.path == "/prompt":
            self.prompt_calls.append(json.loads(request.content))
            if self.prompt_error is not None:
                raise self.prompt_error
            if self.prompt_outcome == "rejected":
                return httpx.Response(400, json={"error": "invalid graph", "node_errors": {"3": "bad input"}})
            prompt_id = f"prompt-{len(self.prompt_calls)}"
            return httpx.Response(200, json={"prompt_id": prompt_id, "node_errors": {"optional": "warning"}})
        if request.url.path == "/queue" and request.method == "GET":
            if self.queue_error is not None:
                raise self.queue_error
            if self.queue_responses:
                return httpx.Response(200, json=self.queue_responses.pop(0))
            return httpx.Response(200, json={"queue_running": self.running, "queue_pending": self.pending})
        if request.url.path == "/queue" and request.method == "POST":
            body = json.loads(request.content)
            if body.get("delete") is not None:
                selected = set(body["delete"])
                self.pending = [row for row in self.pending if row[1] not in selected]
                return httpx.Response(200, json=self.delete_ack)
            if body.get("clear"):
                self.pending = []
                return httpx.Response(200, json=self.delete_ack)
        if request.url.path.startswith("/history/"):
            prompt_id = request.url.path.rsplit("/", 1)[-1]
            value = self.history.get(prompt_id)
            return httpx.Response(200, json={prompt_id: value} if value is not None else {})
        if request.url.path == "/history":
            return httpx.Response(200, json=self.history)
        return httpx.Response(200, json={})


def _integration_app(
    tmp_path: Path,
    upstream: LocalUpstream,
    *,
    bridge_url: str = "http://upstream.test:8188",
    start_bridge: bool = False,
) -> tuple[FastAPI, GenerationService, ComfyGenerationBridge, Any]:
    db_path = tmp_path / "generation-integration.sqlite"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    repository = GenerationRepository(sessions, epoch="integration-epoch")
    transport = httpx.MockTransport(upstream)
    http = httpx.AsyncClient(base_url="http://upstream.test:8188", transport=transport)
    bridge = ComfyGenerationBridge(bridge_url, client_id="backend-integration", http_client=http)
    bridge._owns_http = True
    service = GenerationService(
        repository,
        bridge,
        clock=lambda: "2026-10-10T00:00:00Z",
        vram_status=lambda: {"guard_enabled": False, "free_vram_mb": None, "min_free_vram_mb": 0},
        publish=ws_manager.publish_generation,
    )
    app = FastAPI()
    app.include_router(generation_api_router)
    app.include_router(ws_api_router)
    app.state.generation_service = service
    ws_manager.configure_generation(service.snapshot, service.reconcile)
    ws_manager._latest_generation = None

    @app.post("/__test__/system-stats")
    async def publish_test_stats() -> dict[str, str]:
        await ws_manager.broadcast(json.dumps({"type": "SYSTEM_STATS", "data": {"cpu_pct": 1.0}}))
        return {"status": "sent"}

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if start_bridge:
            await bridge.start(service.on_event, service.on_preview)
        await service.start()
        try:
            yield
        finally:
            await service.stop()
            await bridge.stop()
            ws_manager._snapshot_supplier = None
            ws_manager._request_snapshot = None
            ws_manager._latest_generation = None
            engine.dispose()

    app.router.lifespan_context = lifespan
    return app, service, bridge, sessions


def _batch(*, scope: str = "normal", session_id: str = "session-a", project_id: int | None = None) -> dict[str, Any]:
    return {
        "request_id": str(uuid4()),
        "session_id": session_id,
        "scope": scope,
        "project_id": project_id,
        "items": [{
            "graph": {"3": {"class_type": "SaveImage", "_meta": {"title": "Frozen Save"}}},
            "workflow_id": 12,
            "param_values": {"seed": 0, "__prompt_surgeon_metadata_v1": json.dumps({"version": 1, "session_id": session_id})},
            "applied_assets": {"model": "checkpoint.safetensors"},
        }],
    }


async def _eventually_state(client: AsyncClient, job_id: str, status: str, timeout: float = 3.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    latest: dict[str, Any] = {}
    while time.monotonic() < deadline:
        latest = (await client.get("/api/generation/state")).json()
        job = next((item for item in latest.get("jobs", []) if item["job_id"] == job_id), None)
        if job is not None and job["status"] == status:
            return job
        await asyncio.sleep(0.02)
    raise AssertionError(f"job {job_id} did not reach {status}: {latest}")


@pytest.mark.asyncio
async def test_real_bridge_service_repository_router_accepts_and_completes_without_browser(tmp_path: Path) -> None:
    upstream = LocalUpstream()
    active_upstream_socket: list[Any] = []
    upstream_connected = asyncio.Event()

    async def upstream_ws(websocket: Any) -> None:
        active_upstream_socket.append(websocket)
        upstream_connected.set()
        await websocket.wait_closed()

    async with websocket_serve(upstream_ws, "127.0.0.1", 0) as server:
        upstream_socket = next(iter(server.sockets))
        assert upstream_socket is not None
        ws_port = upstream_socket.getsockname()[1]
        app, service, _bridge, sessions = _integration_app(
            tmp_path, upstream, bridge_url=f"http://127.0.0.1:{ws_port}", start_bridge=True,
        )
        async with app.router.lifespan_context(app):
            await asyncio.wait_for(upstream_connected.wait(), timeout=2)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                request_payload = _batch()
                accepted_response = await client.post("/api/generation/batches", json=request_payload)
                assert accepted_response.status_code == 202
                accepted = accepted_response.json()
                assert accepted["epoch"] == "integration-epoch"
                assert len(accepted["job_ids"]) == 1
                job_id = accepted["job_ids"][0]
                await asyncio.sleep(0.21)
                state = (await client.get("/api/generation/state")).json()
                job = next(item for item in state["jobs"] if item["job_id"] == job_id)
                assert job["prompt_id"] == "prompt-1"
                assert state["upstream"]["ws_connected"] is True
                assert upstream.prompt_calls == [{"prompt": {"3": {"class_type": "SaveImage", "_meta": {"title": "Frozen Save"}}}, "client_id": "backend-integration"}]
                replay_response = await client.post("/api/generation/batches", json=request_payload)
                assert replay_response.status_code == 202
                replay = replay_response.json()
                assert replay["batch_id"] == accepted["batch_id"]
                assert replay["job_ids"] == accepted["job_ids"]
                assert len(upstream.prompt_calls) == 1
                with sessions() as db:
                    metadata = db.get(PromptMetadata, "prompt-1")
                    assert metadata is not None
                    frozen = json.loads(metadata.param_values)
                    assert frozen["seed"] == 0
                    assert json.loads(frozen["__prompt_surgeon_metadata_v1"])["prompt_id"] == "prompt-1"
                    assert metadata.workflow_id == 12
                    assert json.loads(metadata.applied_assets or "{}") == {"model": "checkpoint.safetensors"}

                await active_upstream_socket[0].send(json.dumps({"type": "execution_start", "data": {"prompt_id": "prompt-1"}}))
                await _eventually_state(client, job_id, "running")
                upstream.running = [[1, "prompt-1", {}, {"client_id": "backend-integration"}, []]]
                await active_upstream_socket[0].send(b"\x00\x00\x00\x01\x00\x00\x00\x02preview-frame")
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline and _bridge.get_preview("prompt-1") is None:
                    await asyncio.sleep(0.02)
                preview = await client.get(f"/api/generation/preview/{job_id}")
                assert preview.status_code == 200
                assert preview.content == b"preview-frame"
                assert preview.headers["content-type"] == "image/png"
                upstream.history["prompt-1"] = {
                    "outputs": {"3": {"images": [{"filename": "result.png", "subfolder": "", "type": "output"}]}},
                    "status": {"completed": True, "status_str": "success", "messages": []},
                }
                await active_upstream_socket[0].send(json.dumps({"type": "execution_success", "data": {"prompt_id": "prompt-1"}}))
                job = await _eventually_state(client, job_id, "succeeded")
                assert job["outputs"][0]["view_url"].startswith("/api/comfy/view?")
                assert job["node"] is None
                assert len(upstream.prompt_calls) == 1


@pytest.mark.asyncio
async def test_real_bridge_cancel_uses_empty_ack_and_empty_history_after_pending_disappears(tmp_path: Path) -> None:
    upstream = LocalUpstream()
    app, _service, _bridge, _sessions = _integration_app(tmp_path, upstream)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            accepted = (await client.post("/api/generation/batches", json=_batch())).json()
            job_id = accepted["job_ids"][0]
            await asyncio.sleep(0.25)
            prompt_id = next(item for item in (await client.get("/api/generation/state")).json()["jobs"] if item["job_id"] == job_id)["prompt_id"]
            assert prompt_id == "prompt-1"
            upstream.pending = [[1, prompt_id, {}, {"client_id": "backend-integration"}, []]]
            upstream.delete_ack = {}
            response = await client.post(f"/api/generation/jobs/{job_id}/cancel")
            assert response.status_code == 200
            assert response.json()["outcome"] == "cancelled"
            assert upstream.pending == []
            assert upstream.history == {}
            assert (await client.get("/api/generation/state")).json()["jobs"][0]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_normal_scope_cancel_protects_studio_and_global_all_clears_remaining_work(tmp_path: Path) -> None:
    upstream = LocalUpstream()
    app, _service, _bridge, _sessions = _integration_app(tmp_path, upstream)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            normal = (await client.post("/api/generation/batches", json=_batch(session_id="normal-session"))).json()
            studio = (await client.post("/api/generation/batches", json=_batch(scope="studio", session_id="studio-session", project_id=21))).json()
            await asyncio.sleep(0.4)
            normal_id = normal["job_ids"][0]
            studio_id = studio["job_ids"][0]
            snapshot = (await client.get("/api/generation/state")).json()
            normal_job = next(item for item in snapshot["jobs"] if item["job_id"] == normal_id)
            studio_job = next(item for item in snapshot["jobs"] if item["job_id"] == studio_id)
            assert normal_job["prompt_id"] == "prompt-1"
            assert studio_job["prompt_id"] == "prompt-2"
            upstream.pending = [
                [1, normal_job["prompt_id"], {}, {"client_id": "backend-integration"}, []],
                [2, studio_job["prompt_id"], {}, {"client_id": "backend-integration"}, []],
            ]
            normal_cancel = await client.post("/api/generation/cancel", json={"scope": "normal", "mode": "queued"})
            assert normal_cancel.status_code == 200
            assert all(item[1] != normal_job["prompt_id"] for item in upstream.pending)
            assert any(item[1] == studio_job["prompt_id"] for item in upstream.pending)
            updated = (await client.get("/api/generation/state")).json()
            assert next(item for item in updated["jobs"] if item["job_id"] == normal_id)["status"] == "cancelled"
            assert next(item for item in updated["jobs"] if item["job_id"] == studio_id)["status"] != "cancelled"

            upstream.delete_ack = {}
            all_cancel = await client.post("/api/generation/cancel", json={"scope": "all", "mode": "all"})
            assert all_cancel.status_code == 200
            assert upstream.pending == []
            assert all_cancel.json()["upstream_clear"] == "confirmed"
            final_state = (await client.get("/api/generation/state")).json()
            assert next(item for item in final_state["jobs"] if item["job_id"] == studio_id)["status"] == "cancelled"


@pytest.mark.asyncio
async def test_bridge_running_target_race_never_interrupts_the_newly_running_foreign_prompt(tmp_path: Path) -> None:
    upstream = LocalUpstream()
    app, _service, _bridge, _sessions = _integration_app(tmp_path, upstream)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            accepted = (await client.post("/api/generation/batches", json=_batch())).json()
            job_id = accepted["job_ids"][0]
            await asyncio.sleep(0.25)
            prompt_id = next(item for item in (await client.get("/api/generation/state")).json()["jobs"] if item["job_id"] == job_id)["prompt_id"]
            assert prompt_id == "prompt-1"
            target_running = {"queue_running": [[1, prompt_id, {}, {"client_id": "backend-integration"}, []]], "queue_pending": []}
            foreign_running = {"queue_running": [[2, "foreign-prompt", {}, {"client_id": "other-client"}, []]], "queue_pending": []}
            # Service sees its target first; Bridge's immediate preflight detects that
            # Comfy's unscoped interrupt would hit another job.
            upstream.queue_responses = [target_running, foreign_running]

            response = await client.post(f"/api/generation/jobs/{job_id}/cancel")
            assert response.status_code == 202
            assert response.json()["outcome"] == "unconfirmed"
            assert ("POST", "/interrupt") not in upstream.calls
            final_state = (await client.get("/api/generation/state")).json()
            job = next(item for item in final_state["jobs"] if item["job_id"] == job_id)
            assert job["status"] not in {"cancelled", "succeeded", "failed"}


def test_snapshot_service_saves_new_relative_and_legacy_absolute_view_urls_independently_of_metadata(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db_engine = create_engine(f"sqlite:///{tmp_path / 'snapshot-integration.sqlite'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(db_engine)
    sessions = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    images_dir = tmp_path / "snapshots"
    monkeypatch.setattr(settings, "snapshot_dir", str(images_dir))
    monkeypatch.setattr(settings, "comfy_url", "http://configured-upstream:8188")
    source = io.BytesIO()
    Image.new("RGB", (96, 64), (40, 90, 140)).save(source, format="PNG")
    original_bytes = source.getvalue()

    class MockImageResponse:
        def __enter__(self) -> "MockImageResponse":
            return self

        def __exit__(self, *_args: Any) -> None:
            return None

        def read(self) -> bytes:
            return original_bytes

    relative = "/api/comfy/view?filename=trial.png&subfolder=&type=temp&t=prompt-relative"
    legacy_absolute = "http://old-manager-host:8899/view?filename=legacy.png&subfolder=old&type=output&t=prompt-legacy"
    preserved_params = {"enabled": False, "seed": 0, "empty": "", "nullable": None}
    try:
        with sessions() as db:
            workflow = Workflow(name="Integration workflow", json_body="{}")
            db.add(workflow)
            db.commit()
            db.refresh(workflow)
            calls: list[str] = []

            def open_original(request: Any, timeout: float) -> MockImageResponse:
                assert timeout == 10
                calls.append(request.full_url)
                return MockImageResponse()

            with patch("urllib.request.urlopen", side_effect=open_original):
                relative_saved = SnapshotService.create_snapshot(db, SnapshotCreate(
                    workflow_id=workflow.id, image_path=relative, params=preserved_params,
                ))
                legacy_saved = SnapshotService.create_snapshot(db, SnapshotCreate(
                    workflow_id=workflow.id, image_path=legacy_absolute, params=preserved_params,
                ))
            assert len(calls) == 2
            parsed_relative = urllib.parse.urlsplit(calls[0])
            assert (parsed_relative.scheme, parsed_relative.netloc, parsed_relative.path) == (
                "http", "configured-upstream:8188", "/view",
            )
            assert urllib.parse.parse_qs(parsed_relative.query, keep_blank_values=True) == {
                "filename": ["trial.png"], "subfolder": [""], "type": ["temp"],
            }
            parsed_legacy = urllib.parse.urlsplit(calls[1])
            assert (parsed_legacy.scheme, parsed_legacy.netloc, parsed_legacy.path) == (
                "http", "configured-upstream:8188", "/view",
            )
            assert urllib.parse.parse_qs(parsed_legacy.query, keep_blank_values=True) == {
                "filename": ["legacy.png"], "subfolder": ["old"], "type": ["output"],
            }
            assert relative_saved.params == json.dumps(preserved_params)
            assert legacy_saved.params == json.dumps(preserved_params)
            assert relative_saved.image_path != legacy_saved.image_path
            saved_rows = [db.get(Snapshot, relative_saved.id), db.get(Snapshot, legacy_saved.id)]
            saved_files = [images_dir / row.image_path.rsplit("/", 1)[-1] for row in saved_rows if row is not None and row.image_path]
            thumb_files = [images_dir / row.thumbnail_path.rsplit("/", 1)[-1] for row in saved_rows if row is not None and row.thumbnail_path]
            assert all(path.exists() for path in [*saved_files, *thumb_files])
            db.add(PromptMetadata(prompt_id="prompt-relative", workflow_id=workflow.id, param_values="{}"))
            db.commit()
            metadata = db.get(PromptMetadata, "prompt-relative")
            assert metadata is not None
            db.delete(metadata)
            db.commit()
            assert db.get(Snapshot, relative_saved.id) is not None
            assert db.get(Snapshot, legacy_saved.id) is not None
            assert all(path.exists() for path in [*saved_files, *thumb_files])
    finally:
        db_engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(("outcome", "expected_status", "prompt_calls"), [
    ("rejected", "failed", 1),
    ("timeout", "unconfirmed", 1),
])
async def test_real_bridge_distinguishes_validation_rejection_from_unknown_submit_without_resend(
    tmp_path: Path, outcome: str, expected_status: str, prompt_calls: int,
) -> None:
    upstream = LocalUpstream()
    if outcome == "rejected":
        upstream.prompt_outcome = "rejected"
    else:
        upstream.prompt_error = httpx.ReadTimeout("response lost after possible acceptance")
    app, _service, _bridge, _sessions = _integration_app(tmp_path, upstream)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            accepted = (await client.post("/api/generation/batches", json=_batch())).json()
            job = await _eventually_state(client, accepted["job_ids"][0], expected_status)
            assert job["prompt_id"] is None
            assert len(upstream.prompt_calls) == prompt_calls
            await asyncio.sleep(0.3)
            assert len(upstream.prompt_calls) == prompt_calls


@pytest.mark.asyncio
async def test_live_upstream_health_changes_advance_wire_revision_without_database_reads_mutating_it(tmp_path: Path) -> None:
    upstream = LocalUpstream()
    app, service, bridge, _sessions = _integration_app(tmp_path, upstream)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            healthy = (await client.get("/api/generation/state")).json()
            assert healthy["upstream"]["http_ready"] is True
            upstream.queue_error = httpx.ConnectError("mock queue unavailable")
            with pytest.raises(httpx.ConnectError):
                await bridge.queue()
            await service.on_event({"type": "unrelated", "data": {}})
            unhealthy = (await client.get("/api/generation/state")).json()
            assert unhealthy["revision"] > healthy["revision"]
            assert unhealthy["upstream"]["http_ready"] is False
            assert unhealthy["upstream"]["failure_since"] is not None
            repeated = (await client.get("/api/generation/state")).json()
            assert repeated["revision"] == unhealthy["revision"]
            upstream.queue_error = None
            await bridge.queue()
            await service.on_event({"type": "unrelated", "data": {}})
            recovered = (await client.get("/api/generation/state")).json()
            assert recovered["revision"] > unhealthy["revision"]
            assert recovered["upstream"] == {"http_ready": True, "ws_connected": False, "failure_since": None}


def test_generation_websocket_sends_atomic_initial_snapshot_and_keeps_system_stats_channel(tmp_path: Path) -> None:
    upstream = LocalUpstream()
    app, service, _bridge, _sessions = _integration_app(tmp_path, upstream)
    with TestClient(app) as client:
        state = service.snapshot()
        with client.websocket_connect("/api/ws") as websocket:
            first = json.loads(websocket.receive_text())
            assert first == {
                "type": "GENERATION_SNAPSHOT",
                "version": state["version"],
                "epoch": state["epoch"],
                "revision": state["revision"],
                "data": state,
            }
            assert client.post("/__test__/system-stats").json() == {"status": "sent"}
            stats = json.loads(websocket.receive_text())
            assert stats == {"type": "SYSTEM_STATS", "data": {"cpu_pct": 1.0}}
