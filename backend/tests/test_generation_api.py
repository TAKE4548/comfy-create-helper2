from __future__ import annotations

import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.routers.comfy import ImageAvailability


class FakeBridge:
    def __init__(self) -> None:
        self.started = 0
        self.stopped = 0
        self.on_event: Any = None
        self.on_preview: Any = None
        self.pending: list[dict[str, Any]] = []
        self.running: list[dict[str, Any]] = []
        self.submissions: list[dict[str, Any]] = []
        self.preview: dict[str, tuple[bytes, str]] = {}
        self.queue_error: Exception | None = None

    async def start(self, on_event: Any, on_preview: Any) -> None:
        self.started += 1
        self.on_event = on_event
        self.on_preview = on_preview

    async def stop(self) -> None:
        self.stopped += 1

    def get_upstream_state(self) -> dict[str, Any]:
        return {"http_ready": True, "ws_connected": True, "failure_since": None}

    def get_preview(self, prompt_id: str) -> tuple[bytes, str] | None:
        return self.preview.get(prompt_id)

    async def submit(self, graph: dict[str, Any]) -> dict[str, Any]:
        self.submissions.append(graph)
        prompt_id = f"prompt-{len(self.submissions)}"
        self.pending.append({"prompt_id": prompt_id, "client_id": "backend"})
        return {"prompt_id": prompt_id}

    async def queue(self) -> dict[str, Any]:
        if self.queue_error is not None:
            raise self.queue_error
        return {"running": list(self.running), "pending": list(self.pending)}

    async def history(self, prompt_id: str | None = None) -> dict[str, Any]:
        return {}

    async def interrupt(self, prompt_id: str) -> None:
        return None

    async def clear_queue(self) -> dict[str, Any]:
        self.pending.clear()
        return {"cleared": True}

    async def delete_queue(self, prompt_ids: list[str]) -> dict[str, Any]:
        self.pending = [item for item in self.pending if item["prompt_id"] not in prompt_ids]
        return {"deleted": prompt_ids}

    async def interrupt_all(self) -> dict[str, Any]:
        self.running.clear()
        return {"interrupted": True}

    async def delete_history(self, prompt_ids: list[str]) -> None:
        return None


class FakeMonitor:
    def __init__(self) -> None:
        self.status = {"vram_guard_enabled": True, "vram_min_free_gb": 2.0, "vram_free_gb": 1.0}
        self.started = 0
        self.stopped = 0
        self.broadcast: Any = None

    def get_vram_status(self) -> dict[str, Any]:
        return dict(self.status)

    async def start(self, broadcast: Any) -> None:
        self.started += 1
        self.broadcast = broadcast

    async def stop(self) -> None:
        self.stopped += 1


@pytest.fixture
def api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, Any]]:
    from app import main

    database_path = tmp_path / "generation-api.sqlite"
    test_engine = create_engine(
        f"sqlite:///{database_path.as_posix()}",
        connect_args={"check_same_thread": False},
    )
    models.Base.metadata.create_all(bind=test_engine)
    test_session_local = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    bridge = FakeBridge()
    monitor = FakeMonitor()
    monkeypatch.setattr(main, "engine", test_engine)
    monkeypatch.setattr(main, "SessionLocal", test_session_local)
    monkeypatch.setattr(main, "run_migrations", lambda: None)
    monkeypatch.setattr(main, "seed_initial_data", lambda _db: None)
    monkeypatch.setattr(main, "ComfyGenerationBridge", lambda _url: bridge)
    monkeypatch.setattr(main, "resource_monitor", monitor)

    async def no_op_close() -> None:
        return None

    monkeypatch.setattr(main.comfy, "close_comfy_client", no_op_close)
    manager = main.ws_router.manager
    old_supplier = manager._snapshot_supplier
    old_request = manager._request_snapshot
    try:
        with TestClient(main.app) as client:
            yield {
                "client": client,
                "app": main.app,
                "bridge": bridge,
                "monitor": monitor,
                "engine": test_engine,
                "session_local": test_session_local,
                "manager": manager,
            }
            service = main.app.state.generation_service
        assert bridge.stopped == 1
        assert monitor.stopped == 1
        assert service._worker is None
    finally:
        manager._snapshot_supplier = old_supplier
        manager._request_snapshot = old_request
        test_engine.dispose()


def _payload(count: int = 1) -> dict[str, Any]:
    return {
        "request_id": str(uuid4()),
        "session_id": "client-session-1",
        "scope": "normal",
        "items": [
            {"graph": {"1": {"class_type": "SaveImage"}}, "workflow_id": 1, "param_values": {}}
            for _ in range(count)
        ],
    }


def _assert_error_envelope(response: Any, status_code: int) -> None:
    assert response.status_code == status_code
    detail = response.json()["detail"]
    assert {"code", "message", "outcome", "request_id", "job_id"} <= detail.keys()


def test_generation_endpoints_use_real_repository_service_and_typed_errors(api: dict[str, Any]) -> None:
    client = api["client"]
    payload = _payload()
    accepted_response = client.post("/api/generation/batches", json=payload)
    assert accepted_response.status_code == 202
    accepted = accepted_response.json()
    assert len(accepted["job_ids"]) == 1

    state = client.get("/api/generation/state")
    assert state.status_code == 200
    assert state.json()["jobs"][0]["job_id"] == accepted["job_ids"][0]
    lookup = client.get(f"/api/generation/requests/{payload['request_id']}")
    assert lookup.status_code == 200
    assert lookup.json()["job_ids"] == accepted["job_ids"]
    assert client.get("/api/generation/upstream-queue").status_code == 200

    job_id = accepted["job_ids"][0]
    cancel = client.post(f"/api/generation/jobs/{job_id}/cancel?only_unsubmitted=true")
    assert cancel.status_code == 200
    assert cancel.json()["outcome"] == "cancelled"
    repeat = client.post(f"/api/generation/jobs/{job_id}/cancel?only_unsubmitted=true")
    assert repeat.status_code == 200
    assert repeat.json()["outcome"] == "already_terminal"
    assert client.get(f"/api/generation/preview/{job_id}").status_code == 404
    assert client.get(f"/api/generation/images/{job_id}/availability").json() == []
    assert client.post("/api/generation/cancel", json={"scope": "normal", "mode": "queued"}).status_code == 200

    missing = client.post("/api/generation/jobs/unknown-job/cancel?only_unsubmitted=true")
    _assert_error_envelope(missing, 404)
    invalid = client.post("/api/generation/batches", json={**_payload(), "items": []})
    _assert_error_envelope(invalid, 422)
    _assert_error_envelope(client.get("/api/generation/requests/not-a-uuid"), 422)
    _assert_error_envelope(client.get(f"/api/generation/requests/{uuid4()}"), 404)


def test_generation_state_read_failure_returns_typed_503_without_partial_state(api: dict[str, Any]) -> None:
    from app.models import GenerationJob

    models.Base.metadata.tables[GenerationJob.__tablename__].drop(bind=api["engine"])
    response = api["client"].get("/api/generation/state")
    _assert_error_envelope(response, 503)


def test_upstream_queue_failure_is_typed_503(api: dict[str, Any]) -> None:
    api["bridge"].queue_error = RuntimeError("upstream offline")
    _assert_error_envelope(api["client"].get("/api/generation/upstream-queue"), 503)
    cancel = api["client"].post("/api/generation/cancel", json={"mode": "queued"})
    assert cancel.status_code == 202
    assert cancel.json()["upstream_clear"] == "unconfirmed"


def test_single_pending_cancel_confirms_after_ack_and_empty_history(api: dict[str, Any]) -> None:
    payload = _payload()
    accepted = api["client"].post("/api/generation/batches", json=payload).json()
    job_id = accepted["job_ids"][0]
    repository = api["app"].state.generation_repository
    repository.transition(job_id, "submitting", prompt_id="route-cancel-prompt")
    api["bridge"].pending = [{"prompt_id": "route-cancel-prompt", "client_id": "backend"}]

    guarded = api["client"].post(f"/api/generation/jobs/{job_id}/cancel?only_unsubmitted=true")
    assert guarded.status_code == 200
    assert guarded.json()["outcome"] == "not_cancelled"
    regular = api["client"].post(f"/api/generation/jobs/{job_id}/cancel")
    assert regular.status_code == 200
    assert regular.json()["outcome"] == "cancelled"


def test_single_running_cancel_without_terminal_history_is_unconfirmed(api: dict[str, Any]) -> None:
    accepted = api["client"].post("/api/generation/batches", json=_payload()).json()
    job_id = accepted["job_ids"][0]
    repository = api["app"].state.generation_repository
    repository.transition(job_id, "submitting", prompt_id="route-running-prompt")
    api["bridge"].running = [{"prompt_id": "route-running-prompt", "client_id": "backend"}]

    guarded = api["client"].post(f"/api/generation/jobs/{job_id}/cancel?only_unsubmitted=true")
    assert guarded.status_code == 200
    assert guarded.json()["outcome"] == "not_cancelled"
    regular = api["client"].post(f"/api/generation/jobs/{job_id}/cancel")
    assert regular.status_code == 202
    assert regular.json()["outcome"] == "unconfirmed"


def test_preview_is_binary_and_availability_uses_upstream_image_identity(api: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import comfy

    client = api["client"]
    accepted = client.post("/api/generation/batches", json=_payload()).json()
    job_id = accepted["job_ids"][0]
    repository = api["app"].state.generation_repository
    repository.transition(job_id, "submitting", prompt_id="preview-prompt")
    api["bridge"].preview["preview-prompt"] = (b"binary-preview", "image/png")
    preview = client.get(f"/api/generation/preview/{job_id}")
    assert preview.status_code == 200
    assert preview.content == b"binary-preview"
    assert preview.headers["content-type"] == "image/png"

    repository.transition(
        job_id,
        "succeeded",
        outputs=[{
            "node_id": "8",
            "index": 0,
            "view_url": "/api/comfy/view?filename=out.png&subfolder=folder%2Fone&type=output&t=preview-prompt",
            "thumbnail_url": "/api/comfy/thumbnail?filename=out.png&subfolder=folder%2Fone&type=output",
            "availability": "unknown",
        }],
    )
    observed: list[tuple[str, str, str]] = []

    async def probe(filename: str, subfolder: str = "", image_type: str = "output") -> ImageAvailability:
        observed.append((filename, subfolder, image_type))
        return ImageAvailability(availability="present")

    monkeypatch.setattr(comfy, "probe_image_availability", probe)
    result = client.get(f"/api/generation/images/{job_id}/availability")
    assert result.status_code == 200
    assert result.json()[0]["availability"] == "present"
    assert observed == [("out.png", "folder/one", "output")]


def test_lifespan_owns_bridge_worker_with_zero_browser_connections(api: dict[str, Any]) -> None:
    assert api["bridge"].started == 1
    assert api["app"].state.generation_service._worker is not None
    assert api["app"].state.generation_service._worker.done() is False
    assert api["monitor"].started == 1
    assert api["bridge"].on_event == api["app"].state.generation_service.on_event
    assert api["bridge"].on_preview == api["app"].state.generation_service.on_preview
    assert api["manager"]._snapshot_supplier == api["app"].state.generation_service.snapshot
    assert api["manager"]._request_snapshot == api["app"].state.generation_service.reconcile
    assert api["monitor"].broadcast == api["manager"].broadcast
    assert api["manager"].active_connections == []


def test_committed_work_continues_after_request_without_browser_connection(api: dict[str, Any]) -> None:
    client = api["client"]
    payload = _payload()
    response = client.post("/api/generation/batches", json=payload)
    assert response.status_code == 202
    job_id = response.json()["job_ids"][0]
    assert client.get(f"/api/generation/requests/{payload['request_id']}").status_code == 200

    api["monitor"].status["vram_free_gb"] = 4.0
    for _ in range(100):
        if api["bridge"].submissions:
            break
        time.sleep(0.01)
    assert api["bridge"].submissions
    snapshot = client.get("/api/generation/state").json()
    assert next(job for job in snapshot["jobs"] if job["job_id"] == job_id)["prompt_id"] is not None
