from __future__ import annotations

import asyncio
from typing import Any, Literal
from uuid import uuid4

import pytest

from app.schemas.generation import BatchRequest, CancelRequest, CancelTarget, JobStatus
from app.services.generation_service import GenerationService


class MemoryRepository:
    def __init__(self) -> None:
        self.jobs: dict[str, dict[str, Any]] = {}
        self.batches: dict[str, dict[str, Any]] = {}
        self.request_results: dict[str, dict[str, Any]] = {}
        self.epoch = "epoch-1"
        self.revision = 0
        self.fail_snapshot = False
        self.fail_snapshot_after_accept = False
        self.accept_error: Exception | None = None
        self.fail_prompt_bind_once = False

    def accept_batch(self, payload: BatchRequest) -> dict[str, Any]:
        if self.accept_error:
            raise self.accept_error
        if payload.request_id in self.request_results:
            return dict(self.request_results[payload.request_id])
        batch_id = str(uuid4())
        job_ids = [str(uuid4()) for _ in payload.items]
        active_group = next(
            (
                job["normal_group_id"]
                for job in self.jobs.values()
                if job["scope"] == "normal"
                and job["status"] not in {"succeeded", "failed", "cancelled"}
                and job["normal_group_id"] is not None
            ),
            None,
        )
        if payload.scope == "normal" and active_group is None:
            active_group = str(uuid4())
        for job_id in job_ids:
            self.jobs[job_id] = {
                "job_id": job_id,
                "request_id": payload.request_id,
                "prompt_id": None,
                "session_id": payload.session_id,
                "scope": payload.scope,
                "batch_id": batch_id,
                "normal_group_id": active_group if payload.scope == "normal" else None,
                "project_id": payload.project_id,
                "status": "queued",
                "started_at": None,
                "finished_at": None,
                "node": None,
                "outputs": [],
                "failure": None,
            }
        self.batches[batch_id] = {
            "batch_id": batch_id,
            "scope": payload.scope,
            "project_id": payload.project_id,
        }
        self.revision += 1
        accepted = {"batch_id": batch_id, "job_ids": job_ids, "epoch": self.epoch, "revision": self.revision}
        self.request_results[payload.request_id] = accepted
        if self.fail_snapshot_after_accept:
            self.fail_snapshot = True
        return accepted

    def find_request(self, request_id: str) -> dict[str, Any] | None:
        return self.request_results.get(request_id)

    def snapshot(self) -> dict[str, Any]:
        if self.fail_snapshot:
            raise RuntimeError("snapshot unavailable")
        return {
            "version": 1,
            "epoch": self.epoch,
            "revision": self.revision,
            "normal_group_id": next(
                (
                    job["normal_group_id"]
                    for job in self.jobs.values()
                    if job["scope"] == "normal" and job["status"] not in {"succeeded", "failed", "cancelled"}
                ),
                None,
            ),
            "jobs": list(self.jobs.values()),
            "batches": list(self.batches.values()),
            "upstream": {"http_ready": True, "ws_connected": True, "failure_since": None},
        }

    def transition(self, job_id: str, status: JobStatus, **fields: Any) -> dict[str, Any]:
        if fields.get("prompt_id") is not None and self.fail_prompt_bind_once:
            self.fail_prompt_bind_once = False
            raise RuntimeError("temporary metadata commit failure")
        self.jobs[job_id].update(status=status, **fields)
        self.revision += 1
        return self.jobs[job_id]


class FakeBridge:
    def __init__(self) -> None:
        self.submissions: list[dict[str, Any]] = []
        self.running: list[dict[str, Any]] = []
        self.pending: list[dict[str, Any]] = []
        self.deleted: list[list[str]] = []
        self.clears = 0
        self.interrupts: list[str] = []
        self.interrupt_all_calls = 0
        self.submit_error: Exception | None = None
        self.queue_error: Exception | None = None
        self.history_error: Exception | None = None
        self.delete_error: Exception | None = None
        self.clear_error: Exception | None = None
        self.interrupt_all_error: Exception | None = None
        self.delete_response: dict[str, Any] = {}
        self.clear_response: dict[str, Any] = {}
        self.interrupt_all_response: dict[str, Any] = {}
        self.history_by_prompt: dict[str, dict[str, Any]] = {}
        self.after_delete_queue: Any = None
        self.submit_started: asyncio.Event | None = None
        self.submit_gate: asyncio.Event | None = None
        self.upstream_state: dict[str, bool | str | None] = {"http_ready": True, "ws_connected": True, "failure_since": None}
        self.previews: dict[str, tuple[bytes, str]] = {}

    def get_upstream_state(self) -> dict[str, Any]:
        return dict(self.upstream_state)

    def get_preview(self, prompt_id: str) -> tuple[bytes, str] | None:
        return self.previews.get(prompt_id)

    async def submit(self, graph: dict[str, Any]) -> dict[str, Any]:
        self.submissions.append(graph)
        if self.submit_started is not None:
            self.submit_started.set()
        if self.submit_gate is not None:
            await self.submit_gate.wait()
        if self.submit_error:
            raise self.submit_error
        prompt_id = str(uuid4())
        self.pending.append({"prompt_id": prompt_id, "client_id": "backend"})
        return {"prompt_id": prompt_id}

    async def queue(self) -> dict[str, Any]:
        if self.queue_error:
            raise self.queue_error
        return {"running": self.running, "pending": self.pending}

    async def history(self, prompt_id: str | None = None) -> dict[str, Any]:
        if self.history_error:
            raise self.history_error
        if prompt_id and prompt_id in self.history_by_prompt:
            return {prompt_id: self.history_by_prompt[prompt_id]}
        return {}

    async def interrupt(self, prompt_id: str) -> None:
        self.interrupts.append(prompt_id)

    async def clear_queue(self) -> dict[str, Any]:
        if self.clear_error:
            raise self.clear_error
        self.clears += 1
        self.pending.clear()
        return dict(self.clear_response)

    async def delete_queue(self, prompt_ids: list[str]) -> dict[str, Any]:
        if self.delete_error:
            raise self.delete_error
        self.deleted.append(prompt_ids)
        self.pending = [item for item in self.pending if item["prompt_id"] not in prompt_ids]
        if self.after_delete_queue is not None:
            self.after_delete_queue()
        return dict(self.delete_response)

    async def interrupt_all(self) -> dict[str, Any]:
        if self.interrupt_all_error:
            raise self.interrupt_all_error
        self.interrupt_all_calls += 1
        self.running.clear()
        return dict(self.interrupt_all_response)

    async def delete_history(self, prompt_ids: list[str]) -> None:
        return None


def _payload(*, scope: str = "normal", project_id: int | None = None, count: int = 1) -> BatchRequest:
    return BatchRequest.model_validate(
        {
            "request_id": str(uuid4()),
            "session_id": "session-a",
            "scope": scope,
            "project_id": project_id,
            "items": [
                {"graph": {"id": str(index)}, "workflow_id": 0, "param_values": {"enabled": False}}
                for index in range(count)
            ],
        }
    )


@pytest.mark.asyncio
async def test_worker_submits_committed_jobs_without_browser_and_never_retries_unknown_post() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    await service.start()
    accepted = await service.accept(_payload())
    await asyncio.sleep(0.05)
    job = repository.jobs[accepted["job_ids"][0]]
    assert bridge.submissions == [{"id": "0"}]
    assert job["status"] == "submitting"
    assert job["prompt_id"] is not None
    await service.stop()

    repository2 = MemoryRepository()
    bridge2 = FakeBridge()
    bridge2.submit_error = TimeoutError("upstream response lost")
    service2 = GenerationService(repository2, bridge2, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    await service2.start()
    accepted2 = await service2.accept(_payload())
    await asyncio.sleep(0.05)
    assert repository2.jobs[accepted2["job_ids"][0]]["status"] == "unconfirmed"
    assert len(bridge2.submissions) == 1
    await service2.stop()


@pytest.mark.asyncio
async def test_worker_uses_frozen_graph_accepted_before_mutation() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    payload = _payload()
    await service.accept(payload)
    payload.items[0].graph["id"] = "mutated-after-accept"
    await service.start()
    await asyncio.sleep(0.3)
    assert bridge.submissions == [{"id": "0"}]
    await service.stop()


@pytest.mark.asyncio
async def test_known_prompt_binding_retry_never_reposts_and_worker_continues_to_next_job() -> None:
    repository = MemoryRepository()
    repository.fail_prompt_bind_once = True
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    await service.start()
    accepted = await service.accept(_payload(count=2))
    await asyncio.sleep(0.5)
    assert len(bridge.submissions) == 2
    first, second = (repository.jobs[job_id] for job_id in accepted["job_ids"])
    assert first["prompt_id"] is not None
    assert second["prompt_id"] is not None
    assert first["status"] == second["status"] == "submitting"
    await asyncio.sleep(0.3)
    assert len(bridge.submissions) == 2
    await service.stop()


@pytest.mark.asyncio
async def test_normal_group_reused_while_jobs_are_unfinished_and_reopened_after_terminal() -> None:
    repository = MemoryRepository()
    service = GenerationService(repository, FakeBridge(), clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    first = await service.accept(_payload())
    group1 = repository.jobs[first["job_ids"][0]]["normal_group_id"]
    second = await service.accept(_payload())
    assert repository.jobs[second["job_ids"][0]]["normal_group_id"] == group1
    for job_id in [*first["job_ids"], *second["job_ids"]]:
        repository.transition(job_id, "succeeded", finished_at="2026-10-10T00:00:01Z")
    third = await service.accept(_payload())
    assert repository.jobs[third["job_ids"][0]]["normal_group_id"] != group1


@pytest.mark.asyncio
async def test_post_commit_snapshot_or_publish_failure_does_not_reject_acceptance() -> None:
    repository = MemoryRepository()
    repository.fail_snapshot_after_accept = True
    async def failed_publish(_: dict[str, Any]) -> None:
        raise RuntimeError("disconnected browser")
    service = GenerationService(repository, FakeBridge(), clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=failed_publish)
    accepted = await service.accept(_payload())
    assert accepted["job_ids"]
    assert accepted["job_ids"][0] in repository.jobs


@pytest.mark.asyncio
async def test_precommit_failure_returns_no_acceptance_and_queues_no_worker_job() -> None:
    repository = MemoryRepository()
    repository.accept_error = RuntimeError("database commit failed")
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)

    with pytest.raises(RuntimeError, match="database commit failed"):
        await service.accept(_payload())

    await service.start()
    await asyncio.sleep(0.25)
    assert repository.jobs == {}
    assert bridge.submissions == []
    await service.stop()


@pytest.mark.asyncio
async def test_shutdown_during_upstream_post_marks_job_unconfirmed_without_resend() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    bridge.submit_started = asyncio.Event()
    bridge.submit_gate = asyncio.Event()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    await service.start()
    accepted = await service.accept(_payload())
    await asyncio.wait_for(bridge.submit_started.wait(), timeout=2)

    await service.stop()

    job_id = accepted["job_ids"][0]
    assert repository.jobs[job_id]["status"] == "unconfirmed"
    assert len(bridge.submissions) == 1


@pytest.mark.asyncio
async def test_request_replay_never_requeues_submitted_or_terminal_jobs() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    payload = _payload()
    await service.start()
    first = await service.accept(payload)
    await asyncio.sleep(0.3)
    replay = await service.accept(payload)
    assert replay["job_ids"] == first["job_ids"]
    await asyncio.sleep(0.3)
    assert len(bridge.submissions) == 1
    repository.transition(first["job_ids"][0], "succeeded", finished_at="2026-10-10T00:00:01Z")
    replay_terminal = await service.accept(payload)
    await asyncio.sleep(0.3)
    assert replay_terminal["job_ids"] == first["job_ids"]
    assert len(bridge.submissions) == 1

    uncertain_payload = _payload()
    bridge.submit_error = TimeoutError("upstream response lost")
    uncertain = await service.accept(uncertain_payload)
    await asyncio.sleep(0.3)
    assert repository.jobs[uncertain["job_ids"][0]]["status"] == "unconfirmed"
    await service.accept(uncertain_payload)
    await asyncio.sleep(0.3)
    assert len(bridge.submissions) == 2
    await service.stop()

    restarted = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    after_restart = await restarted.accept(payload)
    assert after_restart["job_ids"] == first["job_ids"]
    await restarted.start()
    await asyncio.sleep(0.3)
    assert len(bridge.submissions) == 2
    await restarted.stop()


@pytest.mark.asyncio
async def test_publish_receives_snapshot_data_without_event_envelope() -> None:
    received: list[dict[str, Any]] = []
    repository = MemoryRepository()
    service = GenerationService(repository, FakeBridge(), clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=received.append)

    await service.accept(_payload())

    assert received[-1]["version"] == 1
    assert "type" not in received[-1]
    assert "jobs" in received[-1]


@pytest.mark.asyncio
async def test_started_at_is_set_when_job_is_first_observed_running() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "submitting", prompt_id="prompt-1")
    bridge.pending = [{"prompt_id": "prompt-1", "client_id": "server"}]
    await service.reconcile()
    assert repository.jobs[job_id]["started_at"] is None

    bridge.pending = []
    bridge.running = [{"prompt_id": "prompt-1", "client_id": "server"}]
    await service.reconcile()
    assert repository.jobs[job_id]["status"] == "running"
    assert repository.jobs[job_id]["started_at"] == "2026-10-10T00:00:00Z"


@pytest.mark.asyncio
async def test_live_events_update_progress_using_frozen_graph_then_save_history_before_terminal() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    received: list[dict[str, Any]] = []
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=received.append)
    payload = _payload()
    payload.items[0].graph = {
        "42": {"class_type": "KSampler", "_meta": {"title": "Frozen sampler"}}
    }
    accepted = await service.accept(payload)
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "submitting", prompt_id="prompt-events")

    await service.on_event({"type": "execution_start", "data": {"prompt_id": "prompt-events"}})
    started_at = repository.jobs[job_id]["started_at"]
    await service.on_event({
        "type": "progress",
        "prompt_id": "prompt-events",
        "data": {"node": "42", "value": 2, "max": 5},
    })
    assert repository.jobs[job_id]["status"] == "running"
    assert repository.jobs[job_id]["started_at"] == started_at
    assert repository.jobs[job_id]["node"] == {"id": "42", "name": "Frozen sampler", "value": 2.0, "max": 5.0}

    bridge.history_by_prompt["prompt-events"] = {
        "status": {"completed": True, "status_str": "success", "messages": [["execution_success", {}]]},
        "outputs": {"7": {"images": [{"filename": "result.png"}]}},
    }
    await service.on_event({"type": "execution_success", "data": {"prompt_id": "prompt-events"}})
    assert repository.jobs[job_id]["status"] == "succeeded"
    assert repository.jobs[job_id]["outputs"][0]["availability"] == "unknown"
    assert received[-1]["jobs"][0]["status"] == "succeeded"


@pytest.mark.asyncio
async def test_executing_null_node_immediately_completes_job_and_publishes_snapshot() -> None:
    """[REQ-385/AC-1] ComfyUI executing event with node: null signals prompt completion."""
    repository = MemoryRepository()
    bridge = FakeBridge()
    received: list[dict[str, Any]] = []
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=received.append)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="prompt-exec-null", started_at="2026-10-10T00:00:00Z")

    bridge.history_by_prompt["prompt-exec-null"] = {
        "status": {"completed": True, "status_str": "success", "messages": [["execution_success", {}]]},
        "outputs": {"7": {"images": [{"filename": "finished.png"}]}},
    }

    # ComfyUI sends executing event with node: null upon completion
    await service.on_event({"type": "executing", "data": {"prompt_id": "prompt-exec-null", "node": None}})

    assert repository.jobs[job_id]["status"] == "succeeded"
    assert "filename=finished.png" in repository.jobs[job_id]["outputs"][0]["view_url"]
    assert received[-1]["jobs"][0]["status"] == "succeeded"


@pytest.mark.asyncio
async def test_cancel_running_job_with_executing_null_node_transitions_to_cancelled() -> None:
    """[REQ-385/AC-3] Cancelled running job transitioning via executing(node: null) is confirmed as cancelled."""
    repository = MemoryRepository()
    bridge = FakeBridge()
    received: list[dict[str, Any]] = []
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=received.append)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    prompt_id = "prompt-cancel-exec-null"
    repository.transition(job_id, "running", prompt_id=prompt_id, started_at="2026-10-10T00:00:00Z")
    bridge.running = [{"prompt_id": prompt_id, "client_id": "backend"}]

    # Issue cancel operation
    cancel_op = await service.cancel_operation(CancelRequest(mode="single", target=CancelTarget(job_id=job_id)))
    assert cancel_op.items[0].job_id == job_id

    # Upstream stops execution and sends executing with node: null
    bridge.history_by_prompt[prompt_id] = {
        "status": {"completed": True, "status_str": "success", "messages": [["execution_interrupted", {}]]},
        "outputs": {},
    }
    await service.on_event({"type": "executing", "data": {"prompt_id": prompt_id, "node": None}})

    assert repository.jobs[job_id]["status"] == "cancelled"
    assert received[-1]["jobs"][0]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_preview_url_changes_only_for_received_frames_and_never_persists_or_survives_terminal() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    published: list[dict[str, Any]] = []
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=published.append)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="prompt-preview", started_at="2026-10-10T00:00:00Z")
    before_revision = repository.revision
    before_wire_revision = service.snapshot()["revision"]
    assert service.snapshot()["jobs"][0]["preview_url"] is None
    bridge.previews["prompt-preview"] = (b"latest-frame", "image/png")
    bridge.upstream_state = {"http_ready": False, "ws_connected": False, "failure_since": "2026-10-10T00:00:01Z"}

    await service.on_preview("prompt-preview", b"frame", "image/png")

    assert repository.revision == before_revision
    assert service.snapshot()["upstream"] == bridge.upstream_state
    assert service.snapshot()["revision"] > before_wire_revision
    first_preview = "/api/generation/preview/" + job_id + "?revision=1"
    assert service.snapshot()["jobs"][0]["preview_url"] == first_preview
    assert service.snapshot()["jobs"][0]["preview_url"] == first_preview  # reconnect snapshot keeps received frame URL

    repository.transition(job_id, "running", node={"id": "node", "name": "Sampler", "value": 2, "max": 5})
    bridge.upstream_state = {"http_ready": True, "ws_connected": True, "failure_since": None}
    assert service.snapshot()["jobs"][0]["preview_url"] == first_preview
    await service.on_preview("prompt-preview", b"next-frame", "image/png")
    second_preview = "/api/generation/preview/" + job_id + "?revision=2"
    assert service.snapshot()["jobs"][0]["preview_url"] == second_preview
    assert repository.revision == before_revision + 1  # only the explicit node transition persisted

    repository.transition(job_id, "succeeded", finished_at="2026-10-10T00:00:03Z")
    assert service.snapshot()["jobs"][0]["preview_url"] is None


@pytest.mark.asyncio
async def test_preview_callback_for_unknown_or_terminal_job_does_not_create_preview_url() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="known-preview")
    await service.on_preview("unknown-prompt", b"frame", "image/png")
    assert service.snapshot()["jobs"][0]["preview_url"] is None
    repository.transition(job_id, "failed", finished_at="2026-10-10T00:00:01Z")
    await service.on_preview("known-preview", b"late-frame", "image/png")
    assert service.snapshot()["jobs"][0]["preview_url"] is None


@pytest.mark.asyncio
async def test_wire_revision_tracks_live_health_without_jobs_and_reconcile_publishes_changes() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    published: list[dict[str, Any]] = []
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=published.append)

    first = service.snapshot()
    await service._publish_snapshot()
    same = service.snapshot()
    assert first["revision"] == same["revision"]
    assert repository.revision == 0

    bridge.upstream_state = {"http_ready": False, "ws_connected": False, "failure_since": "2026-10-10T00:00:01Z"}
    observed_failure = service.snapshot()
    await service.reconcile()
    failed = service.snapshot()
    assert failed["revision"] > first["revision"]
    assert failed["upstream"]["failure_since"] == "2026-10-10T00:00:01Z"
    assert published[-1]["revision"] == failed["revision"]
    assert published[-1]["upstream"] == bridge.upstream_state
    assert repository.revision == 0
    assert observed_failure["revision"] == failed["revision"]

    stable = service.snapshot()
    assert stable["revision"] == failed["revision"]
    bridge.upstream_state = {"http_ready": False, "ws_connected": True, "failure_since": "2026-10-10T00:00:01Z"}
    observed_ws = service.snapshot()
    await service.reconcile()
    ws_recovered = service.snapshot()
    assert ws_recovered["revision"] > stable["revision"]
    assert published[-1]["revision"] == ws_recovered["revision"]
    assert observed_ws["revision"] == ws_recovered["revision"]
    bridge.upstream_state = {"http_ready": True, "ws_connected": True, "failure_since": None}
    await service.reconcile()
    recovered = service.snapshot()
    assert recovered["revision"] > failed["revision"]
    assert recovered["upstream"] == bridge.upstream_state
    assert published[-1]["revision"] == recovered["revision"]
    assert repository.revision == 0


def test_wire_revision_never_regresses_below_committed_job_revisions() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    initial = service.snapshot()["revision"]
    accepted = repository.accept_batch(_payload())
    after_accept = service.snapshot()["revision"]
    assert after_accept >= accepted["revision"] > initial
    repository.transition(accepted["job_ids"][0], "running")
    after_transition = service.snapshot()["revision"]
    assert after_transition >= repository.revision > after_accept


@pytest.mark.asyncio
async def test_event_without_prompt_id_requires_unique_verified_running_job() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "submitting", prompt_id="verified-prompt")
    bridge.running = [{"prompt_id": "verified-prompt", "client_id": "server"}]

    await service.on_event({"type": "execution_start", "data": {}})
    assert repository.jobs[job_id]["status"] == "running"

    repository.transition(job_id, "submitting")
    bridge.running.append({"prompt_id": "ambiguous", "client_id": "server"})
    await service.on_event({"type": "execution_start", "data": {}})
    assert repository.jobs[job_id]["status"] == "submitting"


@pytest.mark.asyncio
async def test_reconcile_unexpected_interruption_remains_unconfirmed() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="unrequested-interrupt")
    bridge.history_by_prompt["unrequested-interrupt"] = {
        "status": {"completed": True, "status_str": "error", "messages": [["execution_interrupted", {}]]},
        "outputs": {},
    }

    await service.reconcile()

    assert repository.jobs[job_id]["status"] == "unconfirmed"


@pytest.mark.asyncio
async def test_vram_wait_can_be_cancelled_without_upstream_post() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    status = {"vram_guard_enabled": True, "vram_free_gb": 1.0, "vram_min_free_gb": 2.0}
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: status, publish=None)
    await service.start()
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    await asyncio.sleep(0.3)
    assert bridge.submissions == []
    result = await service.cancel(job_id)
    assert result.outcome == "cancelled"
    await asyncio.sleep(0.3)
    assert bridge.submissions == []
    assert repository.jobs[job_id]["status"] == "cancelled"
    await service.stop()


@pytest.mark.asyncio
async def test_cancel_unsubmitted_is_scoped_idempotent_and_never_touches_upstream() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    first = await service.accept(_payload(count=2))
    second = await service.accept(_payload())
    target_id, sibling_id = first["job_ids"]

    cancelled = await service.cancel_unsubmitted(target_id)
    repeated = await service.cancel_unsubmitted(target_id)

    assert cancelled.outcome == "cancelled"
    assert repeated.outcome == "already_terminal"
    assert repository.jobs[target_id]["status"] == "cancelled"
    assert repository.jobs[sibling_id]["status"] == "queued"
    assert repository.jobs[second["job_ids"][0]]["status"] == "queued"
    assert target_id not in service._pending_ids
    assert sibling_id in service._pending_ids
    assert bridge.submissions == []
    assert bridge.deleted == []
    assert bridge.clears == 0
    assert bridge.interrupts == []


@pytest.mark.asyncio
async def test_cancel_unsubmitted_rejects_missing_and_preserves_submitted_or_running_jobs() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload(count=3))
    queued_id, submitted_id, running_id = accepted["job_ids"]
    repository.transition(submitted_id, "submitting", prompt_id="already-submitted")
    repository.transition(running_id, "running", prompt_id="already-running")

    missing = await service.cancel_unsubmitted("unknown-id")
    submitted = await service.cancel_unsubmitted(submitted_id)
    running = await service.cancel_unsubmitted(running_id)
    terminal = await service.cancel_unsubmitted(queued_id)

    assert missing.outcome == "rejected"
    assert submitted.outcome == running.outcome == "not_cancelled"
    assert terminal.outcome == "cancelled"
    assert repository.jobs[submitted_id]["status"] == "submitting"
    assert repository.jobs[running_id]["status"] == "running"
    assert bridge.submissions == []
    assert bridge.deleted == []
    assert bridge.clears == 0
    assert bridge.interrupts == []


@pytest.mark.asyncio
async def test_cancel_unsubmitted_dispatch_race_never_cancels_after_upstream_submission() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    bridge.submit_started = asyncio.Event()
    bridge.submit_gate = asyncio.Event()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    await service.start()
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    await asyncio.wait_for(bridge.submit_started.wait(), 2)
    cancel_task = asyncio.create_task(service.cancel_unsubmitted(job_id))
    bridge.submit_gate.set()
    result = await asyncio.wait_for(cancel_task, 2)

    assert result.outcome == "not_cancelled"
    assert repository.jobs[job_id]["status"] == "submitting"
    assert repository.jobs[job_id]["prompt_id"] is not None
    assert len(bridge.submissions) == 1
    await service.stop()


@pytest.mark.asyncio
async def test_vram_wait_releases_once_when_guard_becomes_safe() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    status = {"vram_guard_enabled": True, "vram_free_gb": 1.0, "vram_min_free_gb": 2.0}
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: status, publish=None)
    await service.start()
    accepted = await service.accept(_payload())
    await asyncio.sleep(0.25)
    assert bridge.submissions == []
    status["vram_free_gb"] = 2.5
    await asyncio.sleep(0.35)
    assert bridge.submissions == [{"id": "0"}]
    assert repository.jobs[accepted["job_ids"][0]]["prompt_id"] is not None
    await service.stop()


@pytest.mark.asyncio
async def test_normal_scope_never_clears_global_queue_and_skips_interrupt_for_protected_work() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    normal = await service.accept(_payload())
    studio = await service.accept(_payload(scope="studio", project_id=7))
    normal_id, studio_id = normal["job_ids"][0], studio["job_ids"][0]
    repository.transition(normal_id, "submitting", prompt_id="normal-prompt")
    repository.transition(studio_id, "running", prompt_id="studio-prompt")
    bridge.pending = [
        {"prompt_id": "normal-prompt", "client_id": "server"},
        {"prompt_id": "legacy-prompt", "client_id": None},
    ]
    bridge.running = [{"prompt_id": "studio-prompt", "client_id": "server"}]

    result = await service.cancel_operation(CancelRequest(scope="normal", mode="all"))

    assert result.upstream_interrupt == "skipped"
    assert result.items[-2].outcome == "not_cancelled"
    assert bridge.clears == 0
    assert bridge.interrupts == []
    assert "legacy-prompt" in {item["prompt_id"] for item in bridge.pending}
    assert "normal-prompt" not in {item["prompt_id"] for item in bridge.pending}


@pytest.mark.asyncio
async def test_normal_queued_deletes_only_known_normal_prompt_ids() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    normal = await service.accept(_payload())
    studio = await service.accept(_payload(scope="studio", project_id=3))
    repository.transition(normal["job_ids"][0], "submitting", prompt_id="normal-prompt")
    repository.transition(studio["job_ids"][0], "submitting", prompt_id="studio-prompt")
    bridge.pending = [
        {"prompt_id": "normal-prompt", "client_id": "server"},
        {"prompt_id": "studio-prompt", "client_id": "server"},
        {"prompt_id": "legacy-prompt", "client_id": None},
    ]

    result = await service.cancel_operation(CancelRequest(scope="normal", mode="queued"))

    assert bridge.deleted == [["normal-prompt"]]
    assert bridge.clears == 0
    assert {item["prompt_id"] for item in bridge.pending} == {"studio-prompt", "legacy-prompt"}
    assert result.upstream_clear == "confirmed"
    assert repository.jobs[normal["job_ids"][0]]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_pending_job_that_starts_during_delete_remains_running_and_unconfirmed() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "submitting", prompt_id="racing-prompt")
    bridge.pending = [{"prompt_id": "racing-prompt", "client_id": "server"}]
    bridge.after_delete_queue = lambda: bridge.running.append({"prompt_id": "racing-prompt", "client_id": "server"})

    result = await service.cancel_operation(CancelRequest(scope="normal", mode="queued"))

    assert bridge.deleted == [["racing-prompt"]]
    assert repository.jobs[job_id]["status"] == "running"
    assert result.items[0].outcome == "unconfirmed"
    assert result.upstream_clear == "unconfirmed"


@pytest.mark.asyncio
async def test_normal_running_interrupt_is_attempted_only_for_confirmed_target_and_rechecks_race() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    normal = await service.accept(_payload())
    normal_queued = await service.accept(_payload())
    job_id = normal["job_ids"][0]
    queued_id = normal_queued["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="normal-running")
    repository.transition(queued_id, "submitting", prompt_id="normal-pending")
    bridge.running = [{"prompt_id": "normal-running", "client_id": "server"}]

    attempted = await service.cancel_operation(CancelRequest(scope="normal", mode="all"))

    assert bridge.interrupts == ["normal-running"]
    assert attempted.upstream_interrupt == "unconfirmed"
    assert repository.jobs[job_id]["status"] == "running"

    bridge.running = [{"prompt_id": "normal-running", "client_id": "server"}]
    bridge.pending = [{"prompt_id": "normal-pending", "client_id": "server"}]
    bridge.after_delete_queue = lambda: bridge.running.append({"prompt_id": "new-studio", "client_id": "other"})

    skipped = await service.cancel_operation(CancelRequest(scope="normal", mode="all"))

    assert bridge.deleted == [["normal-pending"]]
    assert bridge.interrupts == ["normal-running"]
    assert skipped.upstream_interrupt == "skipped"
    assert any(item.prompt_id == "new-studio" and item.outcome == "not_cancelled" for item in skipped.items)


@pytest.mark.asyncio
async def test_single_interrupt_ack_keeps_running_job_unconfirmed_until_history_confirms() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="still-running")
    bridge.running = [{"prompt_id": "still-running", "client_id": "server"}]

    response = await service.cancel_operation(CancelRequest(mode="single", target=CancelTarget(job_id=job_id)))

    assert response.items[0].outcome == "unconfirmed"
    assert response.upstream_interrupt == "unconfirmed"
    assert repository.jobs[job_id]["status"] == "running"

    bridge.running = []
    bridge.history_by_prompt["still-running"] = {
        "status": {"completed": True, "status_str": "error", "messages": [["execution_interrupted", {}]]},
        "outputs": {},
    }
    await service.reconcile()
    assert repository.jobs[job_id]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_global_interrupt_preserves_success_that_races_with_queue_clear_and_interrupt() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload(scope="studio", project_id=9))
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="finishing-prompt")
    bridge.running = [{"prompt_id": "finishing-prompt", "client_id": "server"}]
    bridge.history_by_prompt["finishing-prompt"] = {
        "status": {"completed": True, "status_str": "success", "messages": [["execution_success", {}]]},
        "outputs": {"3": {"images": [{"filename": "finished.png"}]}},
    }

    response = await service.cancel_operation(CancelRequest(mode="all"))

    assert bridge.clears == 1
    assert bridge.interrupt_all_calls == 1
    assert repository.jobs[job_id]["status"] == "succeeded"
    assert response.items[0].outcome == "already_terminal"
    assert response.items[0].status == "succeeded"


@pytest.mark.asyncio
async def test_global_queued_and_all_preserve_global_cancel_behavior_including_legacy() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    normal = await service.accept(_payload())
    studio = await service.accept(_payload(scope="studio", project_id=3))
    repository.transition(normal["job_ids"][0], "submitting", prompt_id="normal-prompt")
    repository.transition(studio["job_ids"][0], "submitting", prompt_id="studio-prompt")
    bridge.pending = [
        {"prompt_id": "normal-prompt", "client_id": "server"},
        {"prompt_id": "studio-prompt", "client_id": "server"},
        {"prompt_id": "legacy-prompt", "client_id": None},
    ]
    bridge.running = [{"prompt_id": "running-prompt", "client_id": None}]

    queued = await service.cancel_operation(CancelRequest(mode="queued"))
    assert queued.scope == "all"
    assert bridge.clears == 1
    assert not bridge.pending
    assert any(item.prompt_id == "legacy-prompt" and item.job_id is None for item in queued.items)
    assert bridge.interrupt_all_calls == 0

    bridge.pending = [{"prompt_id": "studio-next", "client_id": "server"}]
    bridge.running = [{"prompt_id": "studio-running", "client_id": "server"}]
    all_result = await service.cancel_operation(CancelRequest(mode="all"))
    assert all_result.scope == "all"
    assert bridge.clears == 2
    assert bridge.interrupt_all_calls == 1
    assert not bridge.pending
    assert not bridge.running


@pytest.mark.asyncio
async def test_global_queued_pending_targets_confirm_from_ack_empty_queues_and_empty_history() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    normal = await service.accept(_payload())
    studio = await service.accept(_payload(scope="studio", project_id=3))
    repository.transition(normal["job_ids"][0], "submitting", prompt_id="normal-global-pending")
    repository.transition(studio["job_ids"][0], "submitting", prompt_id="studio-global-pending")
    bridge.pending = [
        {"prompt_id": "normal-global-pending", "client_id": "server"},
        {"prompt_id": "studio-global-pending", "client_id": "server"},
        {"prompt_id": "legacy-global-pending", "client_id": None},
    ]

    result = await service.cancel_operation(CancelRequest(mode="queued"))

    assert result.upstream_clear == "confirmed"
    assert all(item.outcome == "cancelled" for item in result.items)
    assert repository.jobs[normal["job_ids"][0]]["status"] == "cancelled"
    assert repository.jobs[studio["job_ids"][0]]["status"] == "cancelled"
    assert any(item.job_id is None and item.prompt_id == "legacy-global-pending" for item in result.items)


@pytest.mark.asyncio
async def test_global_all_pending_only_confirms_no_running_interrupt_after_each_target_is_confirmed() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    normal = await service.accept(_payload())
    studio = await service.accept(_payload(scope="studio", project_id=3))
    repository.transition(normal["job_ids"][0], "submitting", prompt_id="normal-pending")
    repository.transition(studio["job_ids"][0], "submitting", prompt_id="studio-pending")
    bridge.pending = [
        {"prompt_id": "normal-pending", "client_id": "server"},
        {"prompt_id": "studio-pending", "client_id": "server"},
        {"prompt_id": "legacy-pending", "client_id": None},
    ]
    bridge.history_by_prompt["studio-pending"] = {
        "status": {"completed": True, "status_str": "success", "messages": [["execution_success", {}]]},
        "outputs": {},
    }

    result = await service.cancel_operation(CancelRequest(mode="all"))

    assert bridge.clears == 1
    assert bridge.interrupt_all_calls == 1
    assert not bridge.running and not bridge.pending
    assert result.upstream_clear == "confirmed"
    assert result.upstream_interrupt == "confirmed"
    assert {item.outcome for item in result.items} == {"cancelled", "already_terminal"}
    assert repository.jobs[normal["job_ids"][0]]["status"] == "cancelled"
    assert repository.jobs[studio["job_ids"][0]]["status"] == "succeeded"


@pytest.mark.asyncio
async def test_global_all_pending_only_keeps_interrupt_unconfirmed_when_target_history_is_unknown() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    normal = await service.accept(_payload())
    repository.transition(normal["job_ids"][0], "submitting", prompt_id="unknown-history-pending")
    bridge.pending = [{"prompt_id": "unknown-history-pending", "client_id": "server"}]
    bridge.history_error = RuntimeError("history unavailable")

    result = await service.cancel_operation(CancelRequest(mode="all"))

    assert result.upstream_clear == "confirmed"
    assert result.upstream_interrupt == "unconfirmed"
    assert result.items[0].outcome == "unconfirmed"


@pytest.mark.asyncio
async def test_queue_read_failure_does_not_erase_known_local_cancel_or_claim_empty_queue() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    bridge.queue_error = RuntimeError("upstream queue unavailable")

    result = await service.cancel_operation(CancelRequest(mode="queued"))

    assert repository.jobs[job_id]["status"] == "cancelled"
    assert result.items[0].outcome == "cancelled"
    assert result.upstream_clear == "unconfirmed"
    assert bridge.clears == 1


@pytest.mark.asyncio
async def test_reconcile_requires_terminal_history_and_builds_encoded_unknown_images() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "submitting", prompt_id="prompt-1")

    # A missing queue entry without history is not evidence of completion.
    await service.reconcile()
    assert repository.jobs[job_id]["status"] == "submitting"

    bridge.history_by_prompt["prompt-1"] = {
        "status": {"completed": True, "status_str": "success", "messages": [["execution_success", {}]]},
        "outputs": {"node/1": {"images": [{"filename": "a b#.png", "subfolder": "out/x", "type": "output"}]}},
    }
    await service.reconcile()
    job = repository.jobs[job_id]
    assert job["status"] == "succeeded"
    assert job["outputs"][0]["availability"] == "unknown"
    assert "filename=a+b%23.png" in job["outputs"][0]["view_url"]
    assert "subfolder=out%2Fx" in job["outputs"][0]["view_url"]
    assert "t=prompt-1" in job["outputs"][0]["view_url"]
    assert "node%2F1" not in job["outputs"][0]["view_url"]


@pytest.mark.asyncio
async def test_execution_interrupted_is_unconfirmed_without_known_cancel_request() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    known_cancel = await service.accept(_payload())
    unexpected = await service.accept(_payload())
    cancel_id, fail_id = known_cancel["job_ids"][0], unexpected["job_ids"][0]
    repository.transition(cancel_id, "running", prompt_id="prompt-cancel")
    repository.transition(fail_id, "running", prompt_id="prompt-external")
    bridge.running = [
        {"prompt_id": "prompt-cancel", "client_id": "server"},
        {"prompt_id": "prompt-external", "client_id": "server"},
    ]
    bridge.history_by_prompt = {
        "prompt-cancel": {"status": {"completed": True, "status_str": "error", "messages": [["execution_interrupted", {}]]}, "outputs": {}},
        "prompt-external": {"status": {"completed": True, "status_str": "error", "messages": [["execution_interrupted", {}]]}, "outputs": {}},
    }

    await service.cancel(cancel_id)
    bridge.running = []
    await service.reconcile()

    assert repository.jobs[cancel_id]["status"] == "cancelled"
    assert repository.jobs[fail_id]["status"] == "unconfirmed"


@pytest.mark.asyncio
async def test_single_legacy_prompt_pending_removal_confirms_with_empty_history() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    bridge.pending = [{"prompt_id": "legacy-prompt", "client_id": None}]
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)

    result = await service.cancel_operation(
        CancelRequest(mode="single", target=CancelTarget(prompt_id="legacy-prompt"))
    )

    assert result.items[0].job_id is None
    assert result.items[0].prompt_id == "legacy-prompt"
    assert result.items[0].status is None
    assert result.items[0].outcome == "cancelled"
    assert result.upstream_clear == "confirmed"
    assert bridge.deleted == [["legacy-prompt"]]
    assert repository.jobs == {}


@pytest.mark.asyncio
async def test_single_legacy_pending_prompt_preserves_successful_history() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    bridge.pending = [{"prompt_id": "legacy-prompt", "client_id": None}]
    bridge.history_by_prompt["legacy-prompt"] = {
        "status": {"completed": True, "status_str": "success", "messages": [["execution_success", {}]]},
        "outputs": {"3": {"images": [{"filename": "done.png"}]}},
    }
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)

    result = await service.cancel_operation(
        CancelRequest(mode="single", target=CancelTarget(prompt_id="legacy-prompt"))
    )

    assert result.items[0].job_id is None
    assert result.items[0].outcome == "already_terminal"
    assert result.items[0].status is None
    assert result.upstream_clear == "confirmed"
    assert repository.jobs == {}


@pytest.mark.asyncio
async def test_single_legacy_running_prompt_uses_unconfirmed_target_result() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    bridge.running = [{"prompt_id": "legacy-running", "client_id": None}]
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)

    result = await service.cancel_operation(
        CancelRequest(mode="single", target=CancelTarget(prompt_id="legacy-running"))
    )

    assert bridge.interrupts == ["legacy-running"]
    assert result.items[0].job_id is None
    assert result.items[0].prompt_id == "legacy-running"
    assert result.items[0].status is None
    assert result.items[0].outcome == "unconfirmed"
    assert repository.jobs == {}


@pytest.mark.asyncio
async def test_single_managed_pending_delete_uses_empty_history_and_is_idempotent() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "submitting", prompt_id="pending-managed")
    bridge.pending = [{"prompt_id": "pending-managed", "client_id": "server"}]

    first = await service.cancel_operation(CancelRequest(mode="single", target=CancelTarget(job_id=job_id)))
    second = await service.cancel_operation(CancelRequest(mode="single", target=CancelTarget(job_id=job_id)))

    assert first.items[0].outcome == "cancelled"
    assert first.upstream_clear == "confirmed"
    assert repository.jobs[job_id]["status"] == "cancelled"
    assert second.items[0].outcome == "already_terminal"
    assert bridge.deleted == [["pending-managed"]]


@pytest.mark.asyncio
async def test_single_pending_that_moves_to_running_is_not_confirmed_by_pending_proof() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "submitting", prompt_id="single-race")
    bridge.pending = [{"prompt_id": "single-race", "client_id": "server"}]
    bridge.after_delete_queue = lambda: bridge.running.append({"prompt_id": "single-race", "client_id": "server"})

    result = await service.cancel_operation(CancelRequest(mode="single", target=CancelTarget(job_id=job_id)))

    assert result.items[0].outcome == "unconfirmed"
    assert repository.jobs[job_id]["status"] == "running"


@pytest.mark.asyncio
async def test_pending_cancel_does_not_confirm_after_delete_ack_error_or_timeout() -> None:
    for failure in ("response", "timeout"):
        repository = MemoryRepository()
        bridge = FakeBridge()
        service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
        accepted = await service.accept(_payload())
        job_id = accepted["job_ids"][0]
        repository.transition(job_id, "submitting", prompt_id=f"pending-{failure}")
        bridge.pending = [{"prompt_id": f"pending-{failure}", "client_id": "server"}]
        if failure == "response":
            bridge.delete_response = {"status": "error"}
        else:
            bridge.delete_error = TimeoutError("delete timed out")

        result = await service.cancel_operation(CancelRequest(mode="single", target=CancelTarget(job_id=job_id)))

        assert result.items[0].outcome == "unconfirmed"
        assert repository.jobs[job_id]["status"] != "cancelled"


@pytest.mark.asyncio
async def test_pending_cancel_history_failure_and_success_race_remain_terminal_or_unconfirmed() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted = await service.accept(_payload())
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "submitting", prompt_id="history-unavailable")
    bridge.pending = [{"prompt_id": "history-unavailable", "client_id": "server"}]
    bridge.history_error = RuntimeError("history 503")
    response = await service.cancel_operation(CancelRequest(mode="single", target=CancelTarget(job_id=job_id)))
    assert response.items[0].outcome == "unconfirmed"

    repository2 = MemoryRepository()
    bridge2 = FakeBridge()
    service2 = GenerationService(repository2, bridge2, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted2 = await service2.accept(_payload())
    job2 = accepted2["job_ids"][0]
    repository2.transition(job2, "submitting", prompt_id="history-success")
    bridge2.pending = [{"prompt_id": "history-success", "client_id": "server"}]
    bridge2.history_by_prompt["history-success"] = {
        "status": {"completed": True, "status_str": "success", "messages": [["execution_success", {}]]},
        "outputs": {"2": {"images": [{"filename": "finished.png"}]}},
    }
    terminal = await service2.cancel_operation(CancelRequest(mode="single", target=CancelTarget(job_id=job2)))
    assert repository2.jobs[job2]["status"] == "succeeded"
    assert terminal.items[0].outcome == "already_terminal"

    repository3 = MemoryRepository()
    bridge3 = FakeBridge()
    service3 = GenerationService(repository3, bridge3, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    accepted3 = await service3.accept(_payload())
    job3 = accepted3["job_ids"][0]
    repository3.transition(job3, "submitting", prompt_id="history-failure")
    bridge3.pending = [{"prompt_id": "history-failure", "client_id": "server"}]
    bridge3.history_by_prompt["history-failure"] = {
        "status": {"completed": True, "status_str": "error", "messages": [["execution_error", {}]]},
        "outputs": {},
    }
    failed = await service3.cancel_operation(CancelRequest(mode="single", target=CancelTarget(job_id=job3)))
    assert repository3.jobs[job3]["status"] == "failed"
    assert failed.items[0].outcome == "already_terminal"


@pytest.mark.asyncio
async def test_global_empty_queue_all_requires_clear_and_interrupt_acknowledgements() -> None:
    cases: tuple[tuple[Literal["queued", "all"], Literal["clear", "interrupt"]], ...] = (("queued", "clear"), ("all", "interrupt"))
    for mode, failing_action in cases:
        repository = MemoryRepository()
        bridge = FakeBridge()
        if failing_action == "clear":
            bridge.clear_response = {"status": "error"}
        if failing_action == "interrupt":
            bridge.interrupt_all_response = {"status": "error"}
        service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)

        result = await service.cancel_operation(CancelRequest(mode=mode))

        if mode == "queued":
            assert result.upstream_clear == "unconfirmed"
            assert result.items == []
        else:
            assert bridge.clears == bridge.interrupt_all_calls == 1
            assert result.upstream_interrupt == "unconfirmed"
            assert result.items == []


@pytest.mark.asyncio
async def test_empty_global_all_confirms_when_queue_history_and_both_acks_are_successful() -> None:
    service = GenerationService(MemoryRepository(), FakeBridge(), clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)

    result = await service.cancel_operation(CancelRequest(mode="all"))

    assert result.items == []
    assert result.upstream_clear == "confirmed"
    assert result.upstream_interrupt == "confirmed"


@pytest.mark.asyncio
async def test_global_all_pending_targets_confirm_from_delete_proof_without_fake_interrupt_history() -> None:
    repository = MemoryRepository()
    bridge = FakeBridge()
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)
    normal = await service.accept(_payload())
    studio = await service.accept(_payload(scope="studio", project_id=5))
    repository.transition(normal["job_ids"][0], "submitting", prompt_id="normal-all-pending")
    repository.transition(studio["job_ids"][0], "submitting", prompt_id="studio-all-pending")
    bridge.pending = [
        {"prompt_id": "normal-all-pending", "client_id": "server"},
        {"prompt_id": "studio-all-pending", "client_id": "server"},
    ]

    result = await service.cancel_operation(CancelRequest(mode="all"))

    assert bridge.clears == 1
    assert bridge.interrupt_all_calls == 1
    assert result.upstream_clear == "confirmed"
    assert repository.jobs[normal["job_ids"][0]]["status"] == "cancelled"
    assert repository.jobs[studio["job_ids"][0]]["status"] == "cancelled"
    assert all(item.outcome == "cancelled" for item in result.items)


@pytest.mark.asyncio
async def test_empty_global_all_stays_unconfirmed_when_history_read_fails() -> None:
    bridge = FakeBridge()
    bridge.history_error = RuntimeError("history 503")
    service = GenerationService(MemoryRepository(), bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)

    result = await service.cancel_operation(CancelRequest(mode="all"))

    assert result.items == []
    assert result.upstream_clear == "confirmed"
    assert result.upstream_interrupt == "unconfirmed"


@pytest.mark.asyncio
@getattr(pytest.mark, "REQ-386")
@getattr(pytest.mark, "AC-1")
async def test_progress_event_without_prompt_id_binds_to_single_active_job() -> None:
    """[REQ-386/AC-1] progress event without prompt_id falls back to single active running job."""
    repository = MemoryRepository()
    bridge = FakeBridge()
    received: list[dict[str, Any]] = []
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=received.append)
    payload = _payload()
    payload.items[0].graph = {
        "10": {"class_type": "KSampler", "_meta": {"title": "Main Sampler"}}
    }
    accepted = await service.accept(payload)
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="prompt-active-1", started_at="2026-10-10T00:00:00Z")

    await service.on_event({
        "type": "progress",
        "data": {"value": 5, "max": 20},
    })

    assert repository.jobs[job_id]["status"] == "running"
    assert repository.jobs[job_id]["node"] == {
        "id": "10",
        "name": "Main Sampler",
        "value": 5.0,
        "max": 20.0,
    }
    assert len(received) >= 1
    assert received[-1]["jobs"][0]["node"]["value"] == 5.0


@pytest.mark.asyncio
@getattr(pytest.mark, "REQ-386")
@getattr(pytest.mark, "AC-1")
async def test_progress_event_with_integer_node_id_updates_node_progress() -> None:
    """[REQ-386/AC-1] progress event with integer node ID safely normalizes to string and updates progress."""
    repository = MemoryRepository()
    bridge = FakeBridge()
    received: list[dict[str, Any]] = []
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=received.append)
    payload = _payload()
    payload.items[0].graph = {
        "12": {"class_type": "KSamplerAdvanced", "_meta": {"title": "Advanced Step"}}
    }
    accepted = await service.accept(payload)
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="prompt-int-node", started_at="2026-10-10T00:00:00Z")

    await service.on_event({
        "type": "progress",
        "prompt_id": "prompt-int-node",
        "data": {"node": 12, "value": 7, "max": 25},
    })

    assert repository.jobs[job_id]["node"] == {
        "id": "12",
        "name": "Advanced Step",
        "value": 7.0,
        "max": 25.0,
    }
    assert received[-1]["jobs"][0]["node"]["id"] == "12"


@pytest.mark.asyncio
@getattr(pytest.mark, "REQ-386")
@getattr(pytest.mark, "AC-1")
async def test_progress_event_boundary_zero_division_and_clamp() -> None:
    """[REQ-386/AC-1] progress event boundary: zero max or zero value does not raise ZeroDivisionError and safely updates node."""
    repository = MemoryRepository()
    bridge = FakeBridge()
    received: list[dict[str, Any]] = []
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=received.append)
    payload = _payload()
    payload.items[0].graph = {
        "10": {"class_type": "KSampler", "_meta": {"title": "Main Sampler"}}
    }
    accepted = await service.accept(payload)
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="prompt-boundary-zero", started_at="2026-10-10T00:00:00Z")

    await service.on_event({
        "type": "progress",
        "prompt_id": "prompt-boundary-zero",
        "data": {"node": "10", "value": 0, "max": 0},
    })
    assert repository.jobs[job_id]["node"]["value"] == 0.0
    assert repository.jobs[job_id]["node"]["max"] == 0.0

    await service.on_event({
        "type": "progress",
        "prompt_id": "prompt-boundary-zero",
        "data": {"node": "10", "value": 25, "max": 20},
    })
    assert repository.jobs[job_id]["node"]["value"] == 25.0
    assert repository.jobs[job_id]["node"]["max"] == 20.0


@pytest.mark.asyncio
@getattr(pytest.mark, "REQ-386")
@getattr(pytest.mark, "AC-1")
async def test_progress_event_multiple_jobs_without_prompt_id_dropped() -> None:
    """[REQ-386/AC-1] progress event without prompt_id is safely ignored when multiple running jobs exist."""
    repository = MemoryRepository()
    bridge = FakeBridge()
    received: list[dict[str, Any]] = []
    service = GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=received.append)
    payload = _payload(count=2)
    accepted = await service.accept(payload)
    job_1, job_2 = accepted["job_ids"][0], accepted["job_ids"][1]
    repository.transition(job_1, "running", prompt_id="prompt-multi-1", started_at="2026-10-10T00:00:00Z")
    repository.transition(job_2, "running", prompt_id="prompt-multi-2", started_at="2026-10-10T00:00:00Z")

    await service.on_event({
        "type": "progress",
        "data": {"value": 5, "max": 20},
    })

    assert repository.jobs[job_1].get("node") is None
    assert repository.jobs[job_2].get("node") is None



