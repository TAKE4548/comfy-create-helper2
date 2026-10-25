from __future__ import annotations

import asyncio
import copy
import inspect
import logging
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Protocol
from urllib.parse import urlencode

from app.schemas.generation import (
    ActionOutcome,
    BatchAccepted,
    BatchRequest,
    CancelOperation,
    CancelRequest,
    CancelResult,
    CancelTarget,
    GenerationPort,
    JobStatus,
    JobView,
    ReleaseOperation,
    ReleaseOutcome,
    ReleaseRequest,
    ReleaseResult,
    ReleaseUpstreamCheck,
    RepositoryPort,
    StateSnapshot,
    UpstreamQueueView,
)

logger = logging.getLogger(__name__)


def _should_log_reconcile_failure(count: int) -> bool:
    """Return True for the failure counts that are logged at WARNING level.

    Counts are at ~2.5 s intervals: 1st failure, then roughly 60 s, 120 s, 240 s,
    480 s, and every 10 minutes after that.
    """
    if count == 1 or count in {24, 48, 96, 192}:
        return True
    return count > 192 and (count - 192) % 240 == 0
_CONFIRMED_TERMINAL: set[str] = {"succeeded", "failed", "cancelled", "released"}
_TERMINAL: set[str] = _CONFIRMED_TERMINAL | {"unconfirmed"}  # preview消去(_snapshot/on_preview)専用で残す
_POLL_SECONDS = 0.2
_RECONCILE_SECONDS = 2.5


@dataclass(frozen=True)
class _PendingJob:
    job_id: str
    batch_id: str
    scope: str
    graph: dict[str, Any]


class RequestRepositoryPort(RepositoryPort, Protocol):
    def find_request(self, request_id: str) -> dict[str, Any] | None: ...
    def release_unconfirmed(self, job_id: str, release: dict[str, Any]) -> dict[str, Any] | None: ...
    def annotate_late_identity(self, job_id: str, prompt_id: str) -> dict[str, Any] | None: ...
    def get_job(self, job_id: str) -> dict[str, Any] | None: ...
    def find_job_by_prompt(self, prompt_id: str) -> dict[str, Any] | None: ...


class LiveBridgePort(GenerationPort, Protocol):
    def get_upstream_state(self) -> dict[str, Any]: ...

    def get_preview(self, prompt_id: str) -> tuple[bytes, str] | None: ...


class GenerationService:
    """Owns committed generation work independently from browser connections."""

    def __init__(
        self,
        repository: RequestRepositoryPort,
        bridge: LiveBridgePort,
        clock: Callable[[], Any],
        vram_status: Callable[[], dict[str, Any]],
        publish: Callable[[dict[str, Any]], Any] | None,
    ) -> None:
        self.repository = repository
        self.bridge = bridge
        self.clock = clock
        self.vram_status = vram_status
        self.publish = publish
        self._lock = asyncio.Lock()
        self._wake = asyncio.Event()
        self._pending: deque[_PendingJob] = deque()
        self._pending_ids: set[str] = set()
        self._accepted_request_ids: set[str] = set()
        self._frozen_graphs: dict[str, dict[str, Any]] = {}
        self._known_prompt_ids: dict[str, str] = {}
        self._preview_revisions: dict[str, int] = {}
        self._binding_retry: dict[str, str] = {}
        self._worker: asyncio.Task[None] | None = None
        self._vram_wait_started: dict[str, float] = {}
        self._vram_warned: set[str] = set()
        self._cancel_requested: set[str] = set()
        self._last_reconcile = 0.0
        self._reconcile_failures = 0
        # The repository revision tracks committed database writes.  The wire
        # revision also covers ephemeral state such as the live bridge health
        # overlay, so it is maintained here without writing on snapshot reads.
        self._wire_epoch: str | None = None
        self._wire_revision = 0
        self._wire_signature: dict[str, Any] | None = None
        self._last_published_signature: dict[str, Any] | None = None
        self._stopping = False
        self._recovery_pending = False

    async def start(self) -> None:
        if self._worker is not None and not self._worker.done():
            return
        self._stopping = False
        await self._recover_on_start()
        self._worker = asyncio.create_task(self._run_worker(), name="generation-worker")
        try:
            await self.reconcile()
        except Exception:
            logger.warning("Initial generation reconciliation failed; worker remains available", exc_info=True)

    async def stop(self) -> None:
        self._stopping = True
        self._wake.set()
        worker, self._worker = self._worker, None
        if worker is not None:
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass

    async def accept(self, payload: BatchRequest) -> dict[str, Any]:
        async with self._lock:
            previous = self.repository.find_request(payload.request_id)
            replay = previous is not None or payload.request_id in self._accepted_request_ids
            accepted = BatchAccepted.model_validate(self.repository.accept_batch(payload))
            if not replay and len(accepted.job_ids) != len(payload.items):
                # The repository has committed already; preserve its acceptance and
                # avoid constructing a partial in-memory queue.
                logger.error("Committed generation batch has mismatched job/item counts: %s", accepted.batch_id)
            elif not replay:
                new_jobs = [
                    (job_id, item)
                    for job_id, item in zip(accepted.job_ids, payload.items)
                    if job_id not in self._pending_ids
                ]
                self._pending.extend(
                    _PendingJob(job_id, accepted.batch_id, payload.scope, copy.deepcopy(item.graph))
                    for job_id, item in new_jobs
                )
                self._pending_ids.update(job_id for job_id, _ in new_jobs)
                self._frozen_graphs.update(
                    {job_id: copy.deepcopy(item.graph) for job_id, item in new_jobs}
                )
            self._accepted_request_ids.add(payload.request_id)
        self._wake.set()
        await self._publish_snapshot()
        return accepted.model_dump(mode="json")

    async def cancel(self, job_id: str) -> CancelResult:
        result = await self.cancel_operation(
            CancelRequest(scope="all", mode="single", target=CancelTarget(job_id=job_id))
        )
        return next((item for item in result.items if item.job_id == job_id), self._result(job_id, None, None, "rejected", "job not found"))

    _UNCONFIRMED_NOTE = "unconfirmed record: upstream state could not be confirmed; no cancellation was verified"
    _RELEASED_NOTE = "released record: no upstream cancellation was performed"
    _RECOVERY_REASONS: dict[str, str] = {
        "queued": "service restarted before upstream submission; the request was not sent upstream and is not resubmitted automatically",
        "submitting": "service restarted during upstream submission; whether upstream accepted it could not be confirmed",
    }

    def _mark_unconfirmed(self, job: JobView, reason: str) -> None:
        """unconfirmed -> unconfirmed は no-op（revision/publish を増やさない）。"""
        if job.status == "unconfirmed":
            return
        self.repository.transition(
            job.job_id, "unconfirmed",
            failure={"reason": reason, "outcome": "unconfirmed"},
            finished_at=self._now(),
        )

    @staticmethod
    def _resume_fields(job: JobView) -> dict[str, Any]:
        """unconfirmed から進行状態へ戻る時は未確認の failure/finished_at を消す。"""
        return {"failure": None, "finished_at": None} if job.status == "unconfirmed" else {}

    def _recover_orphaned_submissions(self) -> int:
        """同期。self._lock 保持下で呼ぶ。bridge 不使用。冪等（変換済みは対象外）。"""
        recovered = 0
        for job in self._snapshot().jobs:
            if job.status not in self._RECOVERY_REASONS or job.prompt_id is not None:
                continue
            if job.job_id in self._pending_ids:  # このプロセスの正規の送信待ち
                continue
            self.repository.transition(
                job.job_id, "unconfirmed",
                failure={"reason": self._RECOVERY_REASONS[job.status], "outcome": "unconfirmed"},
                finished_at=self._now(),
            )
            recovered += 1
        return recovered

    async def _recover_on_start(self) -> None:
        try:
            async with self._lock:
                recovered = self._recover_orphaned_submissions()
            self._recovery_pending = False
        except Exception:
            self._recovery_pending = True
            logger.warning("Startup recovery of orphaned submissions failed; the worker will retry", exc_info=True)
            return
        if recovered:
            await self._publish_snapshot()

    def _unconfirmed_leftovers(self, scope: str, results: list[CancelResult]) -> list[CancelResult]:
        reported = {item.job_id for item in results if item.job_id is not None}
        return [
            self._result(job.job_id, job.prompt_id, job.status, "unconfirmed", self._UNCONFIRMED_NOTE)
            for job in self._snapshot().jobs
            if job.status == "unconfirmed" and job.job_id not in reported
            and (scope == "all" or job.scope == "normal")
        ]

    async def cancel_unsubmitted(self, job_id: str) -> CancelResult:
        """Cancel only a locally queued generation that has never reached upstream."""
        publish = False
        async with self._lock:
            state = self._snapshot()
            job = self._find_job(state, job_id)
            if job is None:
                return self._result(job_id, None, None, "rejected", "job not found")
            if job.status == "released":
                return self._result(job.job_id, job.prompt_id, job.status, "not_cancelled", self._RELEASED_NOTE)
            if job.status in _CONFIRMED_TERMINAL:
                return self._result(job.job_id, job.prompt_id, job.status, "already_terminal", "job already ended")
            if job.status == "unconfirmed":
                return self._result(job.job_id, job.prompt_id, job.status, "unconfirmed", self._UNCONFIRMED_NOTE)
            if job.status != "queued" or job.prompt_id is not None:
                return self._result(job.job_id, job.prompt_id, job.status, "not_cancelled", "job was already submitted or is no longer locally queued")
            self._drop_pending({job.job_id})
            self._frozen_graphs.pop(job.job_id, None)
            self._vram_wait_started.pop(job.job_id, None)
            self._vram_warned.discard(job.job_id)
            self.repository.transition(job.job_id, "cancelled", finished_at=self._now())
            self._wake.set()
            publish = True
            result = self._result(job.job_id, None, "cancelled", "cancelled", "unsubmitted job cancelled")
        if publish:
            await self._publish_snapshot()
        return result

    async def cancel_queued(self, identifier: str) -> CancelResult:
        """Cancel one still-queued local or upstream job without interrupting execution."""
        publish = False
        async with self._lock:
            state = self._snapshot()
            job = self._find_job(state, identifier)
            if job is None:
                job = self._find_job_by_prompt(state, identifier)
            prompt_id = job.prompt_id if job is not None else identifier
            if job is not None and job.status == "released":
                return self._result(job.job_id, job.prompt_id, job.status, "not_cancelled", self._RELEASED_NOTE)
            if job is not None and job.status in _CONFIRMED_TERMINAL:
                return self._result(job.job_id, job.prompt_id, job.status, "already_terminal", "job already ended")
            if job is not None and job.status == "queued" and job.prompt_id is None:
                self._drop_pending({job.job_id})
                self._frozen_graphs.pop(job.job_id, None)
                self._vram_wait_started.pop(job.job_id, None)
                self._vram_warned.discard(job.job_id)
                self.repository.transition(job.job_id, "cancelled", finished_at=self._now())
                self._wake.set()
                publish = True
                result = self._result(job.job_id, None, "cancelled", "cancelled", "queued job cancelled before upstream submission")
            elif not prompt_id or (job is not None and not job.prompt_id):
                return self._result(job.job_id if job else None, None, job.status if job else None, "unconfirmed", "upstream prompt is not yet known")
            else:
                try:
                    queue = UpstreamQueueView.model_validate(await self.bridge.queue())
                except Exception as exc:
                    if job is not None and job.status not in _CONFIRMED_TERMINAL:
                        self._mark_unconfirmed(job, f"queue state unavailable: {exc}")
                        publish = True
                    result = self._result(job.job_id if job else None, prompt_id, "unconfirmed" if (job and job.status not in _CONFIRMED_TERMINAL) else (job.status if job else None), "unconfirmed", f"queue state unavailable: {exc}")
                else:
                    if any(item.prompt_id == prompt_id for item in queue.running):
                        result = self._result(job.job_id if job else None, prompt_id, job.status if job else None, "not_cancelled", "job has already started")
                    elif not any(item.prompt_id == prompt_id for item in queue.pending):
                        if job is not None and job.status == "running":
                            result = self._result(job.job_id, prompt_id, job.status, "not_cancelled", "job is no longer pending")
                        else:
                            if job is not None and job.status not in _CONFIRMED_TERMINAL:
                                self._mark_unconfirmed(job, "job is absent from pending queue; cancellation is unconfirmed")
                                publish = True
                            result = self._result(job.job_id if job else None, prompt_id, "unconfirmed" if (job and job.status not in _CONFIRMED_TERMINAL) else (job.status if job else None), "unconfirmed", "job is absent from pending queue; cancellation is unconfirmed")
                    else:
                        try:
                            ack = await self.bridge.delete_queue([prompt_id])
                            refreshed = UpstreamQueueView.model_validate(await self.bridge.queue())
                        except Exception as exc:
                            if job is not None and job.status not in _CONFIRMED_TERMINAL:
                                self._mark_unconfirmed(job, f"queue deletion unconfirmed: {exc}")
                                publish = True
                            result = self._result(job.job_id if job else None, prompt_id, "unconfirmed" if (job and job.status not in _CONFIRMED_TERMINAL) else (job.status if job else None), "unconfirmed", f"queue deletion unconfirmed: {exc}")
                        else:
                            if any(item.prompt_id == prompt_id for item in refreshed.running):
                                result = self._result(job.job_id if job else None, prompt_id, job.status if job else None, "not_cancelled", "job started while cancellation was being confirmed")
                            else:
                                outcome, record = await self._pending_removal_outcome(
                                    prompt_id, refreshed, self._valid_cancel_ack(ack, "delete", [prompt_id])
                                )
                                if outcome is None:
                                    if job is not None and job.status not in _CONFIRMED_TERMINAL:
                                        self._mark_unconfirmed(job, "queue removal or history confirmation is unavailable")
                                        publish = True
                                    result = self._result(job.job_id if job else None, prompt_id, "unconfirmed" if (job and job.status not in _CONFIRMED_TERMINAL) else (job.status if job else None), "unconfirmed", "queue removal or history confirmation is unavailable")
                                elif job is None:
                                    result = self._result(None, prompt_id, None, "cancelled" if outcome == "cancelled" else "already_terminal", "legacy pending prompt removal confirmed")
                                else:
                                    self._apply_cancel_history_outcome(job.job_id, prompt_id, outcome, record)
                                    current = self._find_job(self._snapshot(), job.job_id)
                                    if current is not None and current.status == "running":
                                        result = self._result(job.job_id, prompt_id, current.status, "not_cancelled", "job started while cancellation was being confirmed")
                                    else:
                                        publish = current is not None and current.status != job.status
                                        if current is not None and current.status == "cancelled":
                                            result = self._result(job.job_id, prompt_id, "cancelled", "cancelled", "pending queue removal confirmed")
                                        elif current is not None and current.status in {"succeeded", "failed"}:
                                            result = self._result(job.job_id, prompt_id, current.status, "already_terminal", "terminal history was preserved")
                                        else:
                                            result = self._result(job.job_id, prompt_id, job.status, "unconfirmed", "queue removal did not confirm a terminal outcome")
        if publish:
            await self._publish_snapshot()
        return result

    async def cancel_operation(self, payload: CancelRequest) -> CancelOperation:
        async with self._lock:
            state = self._snapshot()
            if payload.mode == "single":
                results, clear_outcome, interrupt_outcome, message = await self._cancel_single(state, payload)
            elif payload.scope == "all":
                results, clear_outcome, interrupt_outcome, message = await self._cancel_global(state, payload.mode)
            else:
                results, clear_outcome, interrupt_outcome, message = await self._cancel_normal(state, payload.mode)
            if payload.mode != "single":
                results = [*results, *self._unconfirmed_leftovers(payload.scope, results)]
            try:
                updated_state = self._snapshot()
            except Exception:
                updated_state = state
                message = f"{message}; state snapshot unavailable, resynchronization is required"
            self._wake.set()
            result = CancelOperation(
                scope=payload.scope,
                message=message,
                mode=payload.mode,
                items=results,
                upstream_clear=clear_outcome,
                upstream_interrupt=interrupt_outcome,
                epoch=updated_state.epoch,
                revision=updated_state.revision,
            )
        await self._publish_snapshot()
        return result

    async def release_unconfirmed(self, payload: ReleaseRequest) -> ReleaseOperation:
        publish = False
        async with self._lock:
            results: list[ReleaseResult] = []
            for job_id in payload.job_ids:
                result, changed = await self._release_one(job_id, payload.session_id)
                results.append(result)
                publish = publish or changed
            state = self._snapshot()
            operation = ReleaseOperation(items=results, epoch=state.epoch, revision=state.revision)
        if publish:
            await self._publish_snapshot()
        return operation

    async def _release_one(self, job_id: str, session_id: str | None) -> tuple[ReleaseResult, bool]:
        job = self._find_job(self._snapshot(), job_id)
        if job is None:
            return self._release_result(None, None, "rejected", "job not found"), False
        if job.status == "released":
            previous = job.release.upstream_check if job.release else None
            return self._release_result(job, job.status, "already_released", "record was already released", previous), False
        if job.status != "unconfirmed":
            return self._release_result(job, job.status, "not_released", f"only unconfirmed records can be released (status={job.status})"), False
        check: ReleaseUpstreamCheck = "skipped_no_identity"
        changed = False
        if job.prompt_id is not None:
            changed = True  # 照合で状態が動く可能性があるため常に publish
            try:
                await self._reconcile_locked()
                check = "not_found"
            except Exception:
                logger.warning("Upstream check before release failed for %s", job_id, exc_info=True)
                check = "unavailable"
            current = self._find_job(self._snapshot(), job_id)
            if current is None or current.status != "unconfirmed":
                status = current.status if current is not None else None
                return self._release_result(current or job, status, "not_released", "upstream state was confirmed; the record was not released"), True
        release = {
            "released_at": self._now(), "released_by_session": session_id,
            "reason": "user_release", "upstream_check": check, "late_prompt_id": None,
        }
        view = self.repository.release_unconfirmed(job.job_id, release)
        if view is None:
            return self._release_result(job, job.status, "not_released", "record state changed before release"), changed
        self._drop_pending({job.job_id})
        self._frozen_graphs.pop(job.job_id, None)
        self._vram_wait_started.pop(job.job_id, None)
        self._vram_warned.discard(job.job_id)
        self._cancel_requested.discard(job.job_id)
        self._known_prompt_ids.pop(job.job_id, None)   # _binding_retry は late identity 用に残す
        return self._release_result(job, "released", "released", "unconfirmed record released by user; upstream was not cancelled", check), True

    @staticmethod
    def _release_result(
        job: JobView | None,
        status: JobStatus | None,
        outcome: ReleaseOutcome,
        message: str,
        check: ReleaseUpstreamCheck | None = None,
    ) -> ReleaseResult:
        return ReleaseResult(
            job_id=job.job_id if job else None,
            prompt_id=job.prompt_id if job else None,
            status=status,
            outcome=outcome,
            message=message,
            upstream_check=check,
        )

    async def reconcile(self) -> None:
        async with self._lock:
            changed = await self._reconcile_locked()
        if changed:
            await self._publish_snapshot()

    async def on_event(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        data = event.get("data")
        if not isinstance(event_type, str) or not isinstance(data, dict):
            return
        if event_type == "status":
            self._wake.set()
        prompt_id = event.get("prompt_id")
        if not isinstance(prompt_id, str):
            prompt_id = data.get("prompt_id")
        if not isinstance(prompt_id, str):
            running_jobs = [j for j in self._snapshot().jobs if j.status == "running" and isinstance(j.prompt_id, str)]
            if len(running_jobs) == 1:
                prompt_id = running_jobs[0].prompt_id
        if not isinstance(prompt_id, str):
            prompt_id = await self._verified_event_prompt()
        if not isinstance(prompt_id, str):
            await self._publish_if_composite_changed()
            return
        async with self._lock:
            state = self._snapshot()
            job = next((candidate for candidate in state.jobs if candidate.prompt_id == prompt_id), None)
            if job is None or job.status in _CONFIRMED_TERMINAL:
                await self._publish_if_composite_changed()
                return
            now = self._now()
            if event_type in {"execution_start", "executing", "progress"}:
                raw_node = data.get("node")
                node_id = str(raw_node) if raw_node is not None else None
                if event_type == "executing" and node_id is None:
                    # ComfyUI sends executing with node: null to signal execution completion
                    await self._handle_prompt_completion(job, prompt_id, now)
                else:
                    fields: dict[str, Any] = {}
                    if job.status != "running":
                        fields.update(status="running", started_at=job.started_at or now)
                        fields.update(self._resume_fields(job))
                    progress = event_type == "progress"
                    if node_id is None and progress:
                        if job.node is not None:
                            node_id = job.node.id
                        else:
                            graph = self._frozen_graphs.get(job.job_id, {})
                            node_id = next(
                                (
                                    str(nid)
                                    for nid, nval in graph.items()
                                    if isinstance(nval, dict) and "Sampler" in str(nval.get("class_type", ""))
                                ),
                                "sampler",
                            )
                    if isinstance(node_id, str):
                        node = self._node_progress(job.job_id, node_id, data, job.node)
                        if node is not None:
                            fields["node"] = node
                    if not fields:
                        return
                    status: JobStatus = "running" if "status" in fields else job.status
                    fields.pop("status", None)
                    self.repository.transition(job.job_id, status, **fields)
            elif event_type == "execution_error":
                reason = data.get("exception_message") or data.get("error") or "ComfyUI execution failed"
                self.repository.transition(
                    job.job_id,
                    "failed",
                    failure={"reason": str(reason), "outcome": "failed"},
                    finished_at=now,
                )
                self._cancel_requested.discard(job.job_id)
                self._frozen_graphs.pop(job.job_id, None)
            elif event_type == "execution_interrupted":
                if job.job_id in self._cancel_requested:
                    self.repository.transition(job.job_id, "cancelled", finished_at=now)
                else:
                    self._mark_unconfirmed(job, "upstream execution interrupted without a known cancel request")
                self._cancel_requested.discard(job.job_id)
                self._frozen_graphs.pop(job.job_id, None)
            elif event_type == "execution_success":
                await self._handle_prompt_completion(job, prompt_id, now)
            else:
                return
        await self._publish_snapshot()

    async def _handle_prompt_completion(self, job: JobView, prompt_id: str, now: str) -> None:
        try:
            history = await self.bridge.history(prompt_id)
        except Exception:
            logger.warning("History unavailable after completion signal for %s", prompt_id, exc_info=True)
            return
        record = history.get(prompt_id) if isinstance(history, dict) else None
        if not isinstance(record, dict):
            return
        raw_status = record.get("status")
        raw_status = raw_status if isinstance(raw_status, dict) else {}
        messages = raw_status.get("messages", [])
        event_names = {
            str(message[0])
            for message in messages
            if isinstance(message, (list, tuple)) and message
        } if isinstance(messages, list) else set()
        if raw_status.get("status_str") == "error" or "execution_error" in event_names:
            self.repository.transition(
                job.job_id,
                "failed",
                failure={"reason": "ComfyUI execution failed", "outcome": "failed"},
                finished_at=now,
            )
            self._cancel_requested.discard(job.job_id)
            self._frozen_graphs.pop(job.job_id, None)
        elif "execution_interrupted" in event_names:
            if job.job_id in self._cancel_requested:
                self.repository.transition(job.job_id, "cancelled", finished_at=now)
            else:
                self._mark_unconfirmed(job, "upstream execution interrupted without a known cancel request")
            self._cancel_requested.discard(job.job_id)
            self._frozen_graphs.pop(job.job_id, None)
        elif raw_status.get("completed") is True and (
            raw_status.get("status_str") == "success" or "execution_success" in event_names
        ):
            if job.job_id in self._cancel_requested:
                self.repository.transition(job.job_id, "cancelled", finished_at=now)
                self._cancel_requested.discard(job.job_id)
            else:
                self.repository.transition(
                    job.job_id,
                    "succeeded",
                    outputs=self._history_outputs(prompt_id, record.get("outputs")),
                    finished_at=now,
                )
                self._eager_cache_outputs(record.get("outputs"))
            self._frozen_graphs.pop(job.job_id, None)

    async def on_preview(self, prompt_id: str, frame: bytes, mime: str) -> None:
        del frame, mime  # Preview bytes stay in the bridge's ephemeral cache.
        async with self._lock:
            state = self._snapshot()
            job = next((candidate for candidate in state.jobs if candidate.prompt_id == prompt_id), None)
            if job is None or job.status in _TERMINAL:
                return
            # The job URL changes only after a frame arrives; unrelated state
            # revisions leave this per-job token untouched.
            self._preview_revisions[job.job_id] = self._preview_revisions.get(job.job_id, 0) + 1
            # Re-read once so the wire signature includes the new preview URL.
            self._advance_wire_revision(self._snapshot())
        await self._publish_snapshot()

    async def _verified_event_prompt(self) -> str | None:
        try:
            queue = UpstreamQueueView.model_validate(await self.bridge.queue())
        except Exception:
            return None
        if len(queue.running) != 1:
            return None
        return queue.running[0].prompt_id

    def _node_progress(
        self, job_id: str, node_id: str, data: dict[str, Any], previous: Any
    ) -> dict[str, Any] | None:
        value = data.get("value", previous.value if previous and previous.id == node_id else 0.0)
        maximum = data.get("max", previous.max if previous and previous.id == node_id else 0.0)
        if not isinstance(value, (int, float)) or not isinstance(maximum, (int, float)):
            return None
        graph_node = self._frozen_graphs.get(job_id, {}).get(node_id)
        graph_node = graph_node if isinstance(graph_node, dict) else {}
        metadata = graph_node.get("_meta")
        metadata = metadata if isinstance(metadata, dict) else {}
        name = metadata.get("title")
        if not isinstance(name, str) or not name:
            name = graph_node.get("class_type")
        if not isinstance(name, str) or not name:
            name = node_id
        return {"id": node_id, "name": name, "value": float(value), "max": float(maximum)}

    def snapshot(self) -> dict[str, Any]:
        return self._snapshot().model_dump(mode="json")

    async def _run_worker(self) -> None:
        while not self._stopping:
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=_POLL_SECONDS)
            except asyncio.TimeoutError:
                pass
            self._wake.clear()
            async with self._lock:
                loop = asyncio.get_running_loop()
                self._retry_prompt_bindings()
                if loop.time() - self._last_reconcile >= _RECONCILE_SECONDS:
                    if self._recovery_pending:
                        try:
                            if self._recover_orphaned_submissions():
                                await self._publish_snapshot()
                            self._recovery_pending = False
                        except Exception:
                            logger.warning("Retry of startup recovery failed", exc_info=True)
                    try:
                        changed = await self._reconcile_locked()
                    except Exception:
                        self._reconcile_failures += 1
                        count = self._reconcile_failures
                        if not _should_log_reconcile_failure(count):
                            logger.debug("Generation reconciliation failed", exc_info=True)
                        elif count == 1:
                            logger.warning("Generation reconciliation failed", exc_info=True)
                        else:
                            logger.warning("Generation reconciliation still failing (%d consecutive)", count)
                    else:
                        if self._reconcile_failures:
                            logger.info("Generation reconciliation recovered after %d failures", self._reconcile_failures)
                            self._reconcile_failures = 0
                        if changed:
                            await self._publish_snapshot()
                if not self._pending:
                    continue
                item = self._pending[0]
                try:
                    current = next((job for job in self._snapshot().jobs if job.job_id == item.job_id), None)
                except Exception:
                    logger.warning("Could not read committed job %s before dispatch", item.job_id, exc_info=True)
                    continue
                if current is None or current.status != "queued" or current.prompt_id is not None:
                    self._pending.popleft()
                    self._pending_ids.discard(item.job_id)
                    continue
                try:
                    status = self.vram_status()
                except Exception:
                    logger.warning("VRAM status is unavailable; the generation guard cannot block submission", exc_info=True)
                    status = {}
                if self._is_vram_blocked(status):
                    now_seconds = self._clock_seconds()
                    started = self._vram_wait_started.setdefault(item.job_id, now_seconds)
                    if now_seconds - started >= 10.0 and item.job_id not in self._vram_warned:
                        logger.warning("Generation %s is waiting for the configured VRAM threshold", item.job_id)
                        self._vram_warned.add(item.job_id)
                    continue
                self._pending.popleft()
                self._pending_ids.discard(item.job_id)
                self._vram_wait_started.pop(item.job_id, None)
                self._vram_warned.discard(item.job_id)
                try:
                    self.repository.transition(item.job_id, "submitting")
                except Exception:
                    logger.exception("Could not mark generation %s as submitting", item.job_id)
                    continue
                await self._publish_snapshot()
                try:
                    response = await self.bridge.submit(item.graph)
                except asyncio.CancelledError:
                    self.repository.transition(
                        item.job_id,
                        "unconfirmed",
                        failure={"reason": "service stopped during upstream submission", "outcome": "unconfirmed"},
                        finished_at=self._now(),
                    )
                    raise
                except Exception as exc:
                    logger.warning("Generation submit result is unknown for %s: %s", item.job_id, exc)
                    self.repository.transition(
                        item.job_id,
                        "unconfirmed",
                        failure={"reason": "upstream submission outcome is unknown", "outcome": "unconfirmed"},
                        finished_at=self._now(),
                    )
                    await self._publish_snapshot()
                    continue
                if isinstance(response, dict) and response.get("error"):
                    reason = str(response["error"])
                    self.repository.transition(
                        item.job_id,
                        "failed",
                        failure={"reason": reason, "outcome": "failed"},
                        finished_at=self._now(),
                    )
                    await self._publish_snapshot()
                    continue
                prompt_id = response.get("prompt_id") if isinstance(response, dict) else None
                if not isinstance(prompt_id, str) or not prompt_id:
                    self.repository.transition(
                        item.job_id,
                        "unconfirmed",
                        failure={"reason": "upstream response did not confirm prompt_id", "outcome": "unconfirmed"},
                        finished_at=self._now(),
                    )
                else:
                    self._known_prompt_ids[item.job_id] = prompt_id
                    try:
                        self.repository.transition(item.job_id, "submitting", prompt_id=prompt_id)
                    except Exception:
                        logger.exception("Upstream accepted %s but prompt binding commit failed", item.job_id)
                        self._binding_retry[item.job_id] = prompt_id
                        try:
                            self.repository.transition(
                                item.job_id,
                                "unconfirmed",
                                failure={"reason": "upstream accepted prompt but local prompt binding is pending", "outcome": "unconfirmed"},
                            )
                        except Exception:
                            logger.exception("Could not mark prompt binding as unconfirmed for %s", item.job_id)
                await self._publish_snapshot()

    def _retry_prompt_bindings(self) -> None:
        for job_id, prompt_id in list(self._binding_retry.items()):
            try:
                current = self._find_job(self._snapshot(), job_id)
                if current is not None and current.status == "released":
                    self.repository.annotate_late_identity(job_id, prompt_id)  # None=重複等: 状態不変
                else:
                    self.repository.transition(job_id, "submitting", prompt_id=prompt_id, failure=None, finished_at=None)
            except Exception:
                logger.warning("Prompt binding retry failed for %s; upstream POST will not be repeated", job_id, exc_info=True)
                continue
            self._binding_retry.pop(job_id, None)

    async def _cancel_single(
        self, state: StateSnapshot, payload: CancelRequest
    ) -> tuple[list[CancelResult], ActionOutcome, ActionOutcome, str]:
        assert payload.target is not None
        target = payload.target
        job = (
            self._find_job(state, target.job_id)
            if target.job_id is not None
            else self._find_job_by_prompt(state, target.prompt_id)
        )
        if job is None:
            prompt_id = target.prompt_id
            if prompt_id is None:
                return [self._result(None, None, None, "rejected", "job not found")], "not_requested", "not_requested", "job not found"
            try:
                queue = UpstreamQueueView.model_validate(await self.bridge.queue())
            except Exception as exc:
                return [self._result(None, prompt_id, None, "unconfirmed", f"queue state unavailable: {exc}")], "not_requested", "unconfirmed", "queue state unavailable"
            if any(item.prompt_id == prompt_id for item in queue.pending):
                try:
                    ack = await self.bridge.delete_queue([prompt_id])
                    latest = UpstreamQueueView.model_validate(await self.bridge.queue())
                except Exception as exc:
                    return [self._result(None, prompt_id, None, "unconfirmed", f"legacy queue deletion unconfirmed: {exc}")], "unconfirmed", "not_requested", "legacy queue deletion unconfirmed"
                outcome, _ = await self._pending_removal_outcome(
                    prompt_id, latest, self._valid_cancel_ack(ack, "delete", [prompt_id])
                )
                if outcome == "cancelled":
                    return [self._result(None, prompt_id, None, "cancelled", "legacy queued prompt removal confirmed by queue and history")], "confirmed", "not_requested", "legacy prompt cancelled"
                if outcome in {"succeeded", "failed"}:
                    return [self._result(None, prompt_id, None, "already_terminal", "legacy prompt reached a terminal outcome before cancellation")], "confirmed", "not_requested", "legacy prompt already ended"
                return [self._result(None, prompt_id, None, "unconfirmed", "legacy prompt removal or history confirmation is unavailable")], "unconfirmed", "not_requested", "legacy cancellation is unconfirmed"
            if any(item.prompt_id == prompt_id for item in queue.running):
                try:
                    await self.bridge.interrupt(prompt_id)
                except Exception as exc:
                    return [self._result(None, prompt_id, None, "unconfirmed", f"legacy interrupt outcome unknown: {exc}")], "not_requested", "unconfirmed", "legacy interrupt outcome unknown"
                return [self._result(None, prompt_id, None, "unconfirmed", "legacy interrupt was requested; target outcome requires reconciliation")], "not_requested", "unconfirmed", "legacy interrupt outcome is unconfirmed"
            return [self._result(None, prompt_id, None, "unconfirmed", "legacy prompt is absent from queue but terminal state is unknown")], "not_requested", "unconfirmed", "queue absence does not confirm cancellation"
        if job.status == "released":
            return [self._result(job.job_id, job.prompt_id, job.status, "not_cancelled", self._RELEASED_NOTE)], "not_requested", "not_requested", self._RELEASED_NOTE
        if job.status in _CONFIRMED_TERMINAL:
            return [self._result(job.job_id, job.prompt_id, job.status, "already_terminal", "job already ended")], "not_requested", "not_requested", "job already ended"
        if job.status == "queued" and job.prompt_id is None:
            self._drop_pending({job.job_id})
            self.repository.transition(job.job_id, "cancelled", finished_at=self._now())
            return [self._result(job.job_id, None, "cancelled", "cancelled", "queued job cancelled before upstream submission")], "not_requested", "not_requested", "queued job cancelled"
        if not job.prompt_id:
            return [self._result(job.job_id, None, job.status, "unconfirmed", "upstream prompt is not yet known")], "not_requested", "unconfirmed", "submission outcome is not confirmed"
        try:
            queue = UpstreamQueueView.model_validate(await self.bridge.queue())
        except Exception as exc:
            self._mark_unconfirmed(job, f"queue state unavailable: {exc}")
            return [self._result(job.job_id, job.prompt_id, "unconfirmed", "unconfirmed", f"queue state unavailable: {exc}")], "not_requested", "unconfirmed", "queue state unavailable"
        if any(item.prompt_id == job.prompt_id for item in queue.pending):
            try:
                self._cancel_requested.add(job.job_id)
                ack = await self.bridge.delete_queue([job.prompt_id])
                refreshed = UpstreamQueueView.model_validate(await self.bridge.queue())
            except Exception as exc:
                self._mark_unconfirmed(job, f"queue deletion unconfirmed: {exc}")
                return [self._result(job.job_id, job.prompt_id, "unconfirmed", "unconfirmed", f"queue deletion unconfirmed: {exc}")], "unconfirmed", "not_requested", "queue deletion unconfirmed"
            outcome, record = await self._pending_removal_outcome(
                job.prompt_id, refreshed, self._valid_cancel_ack(ack, "delete", [job.prompt_id])
            )
            if outcome in {"cancelled", "succeeded", "failed"}:
                self._apply_cancel_history_outcome(job.job_id, job.prompt_id, outcome, record)
                current = self._find_job(self._snapshot(), job.job_id)
                if current is not None and current.status == "cancelled":
                    return [self._result(job.job_id, job.prompt_id, "cancelled", "cancelled", "pending removal and history read confirmed cancellation")], "confirmed", "not_requested", "queued job cancelled"
                if current is not None and current.status in {"succeeded", "failed"}:
                    return [self._result(job.job_id, job.prompt_id, current.status, "already_terminal", "terminal history was preserved")], "confirmed", "not_requested", "job was already terminal"
            changed = await self._reconcile_cancel_state({job.job_id})
            current = self._find_job(changed, job.job_id)
            message = "queue deletion was acknowledged but queue/history proof is incomplete"
            return [self._result(job.job_id, job.prompt_id, current.status if current else job.status, "unconfirmed", message)], "unconfirmed", "not_requested", message
        if any(item.prompt_id == job.prompt_id for item in queue.running):
            self._cancel_requested.add(job.job_id)
            try:
                await self.bridge.interrupt(job.prompt_id)
            except Exception as exc:
                self._mark_unconfirmed(job, f"interrupt outcome unknown: {exc}")
                return [self._result(job.job_id, job.prompt_id, "unconfirmed", "unconfirmed", f"interrupt outcome unknown: {exc}")], "not_requested", "unconfirmed", "interrupt outcome unknown"
            changed = await self._reconcile_cancel_state({job.job_id})
            current = self._find_job(changed, job.job_id)
            if current is not None and current.status == "cancelled":
                return [self._result(job.job_id, job.prompt_id, "cancelled", "cancelled", "history confirmed cancellation")], "not_requested", "confirmed", "target cancellation confirmed"
            if current is not None and current.status in {"succeeded", "failed"}:
                return [self._result(job.job_id, job.prompt_id, current.status, "already_terminal", "job completed before cancellation was confirmed")], "not_requested", "unconfirmed", "job was already terminal"
            return [self._result(job.job_id, job.prompt_id, current.status if current else job.status, "unconfirmed", "interrupt was acknowledged but cancellation is not confirmed")], "not_requested", "unconfirmed", "interrupt target outcome is unconfirmed"
        self._mark_unconfirmed(job, "job is absent from queue but terminal state is unknown")
        return [self._result(job.job_id, job.prompt_id, "unconfirmed", "unconfirmed", "job is absent from queue but terminal state is unknown")], "not_requested", "unconfirmed", "queue absence does not confirm cancellation"

    async def _cancel_global(
        self, state: StateSnapshot, mode: str
    ) -> tuple[list[CancelResult], ActionOutcome, ActionOutcome, str]:
        try:
            before = UpstreamQueueView.model_validate(await self.bridge.queue())
        except Exception as exc:
            before = None
            logger.warning("Could not read upstream queue before global cancellation: %s", exc)
        local_ids = {job.job_id for job in state.jobs if job.status == "queued" and job.prompt_id is None}
        self._drop_pending(local_ids)
        result_targets: list[tuple[str | None, str | None]] = []
        interrupt_targets: list[str] = []
        results: list[CancelResult] = []
        pending_proof_ids: set[str] = set()
        for job in state.jobs:
            if job.job_id in local_ids:
                self.repository.transition(job.job_id, "cancelled", finished_at=self._now())
                results.append(self._result(job.job_id, None, "cancelled", "cancelled", "queued job cancelled before upstream submission"))
        try:
            clear_ack = await self.bridge.clear_queue()
            after_clear = UpstreamQueueView.model_validate(await self.bridge.queue())
            clear_ack_valid = self._valid_cancel_ack(clear_ack, "clear")
            clear_ok = before is not None and clear_ack_valid and not after_clear.pending
            clear_outcome: ActionOutcome = "confirmed" if clear_ok else "unconfirmed"
        except Exception as exc:
            clear_ack_valid = False
            after_clear = None
            clear_outcome = "unconfirmed"
            logger.warning("Global queue clear outcome is unknown: %s", exc)
        jobs_by_prompt = {job.prompt_id: job for job in state.jobs if job.prompt_id is not None}
        if before is not None:
            for upstream in before.pending:
                queued_job = jobs_by_prompt.get(upstream.prompt_id)
                if queued_job is not None and queued_job.status not in _CONFIRMED_TERMINAL:
                    self._cancel_requested.add(queued_job.job_id)
                result_targets.append((queued_job.job_id if queued_job else None, upstream.prompt_id))
            if clear_ack_valid and after_clear is not None:
                post_clear_running = {item.prompt_id for item in after_clear.running}
                post_clear_pending = {item.prompt_id for item in after_clear.pending}
                pending_proof_ids = {
                    item.prompt_id for item in before.pending
                    if item.prompt_id not in post_clear_running and item.prompt_id not in post_clear_pending
                }
        interrupt_outcome: ActionOutcome = "not_requested"
        message = "queued jobs cancelled"
        interrupt_ack_valid = False
        if mode == "all":
            running_targets = before.running if before is not None else []
            if after_clear is not None:
                # A prompt may have moved from pending to running during clear.
                running_targets = after_clear.running
            for upstream in running_targets:
                running_job = jobs_by_prompt.get(upstream.prompt_id)
                if running_job is not None and running_job.status not in _CONFIRMED_TERMINAL:
                    self._cancel_requested.add(running_job.job_id)
                result_targets.append((running_job.job_id if running_job else None, upstream.prompt_id))
                interrupt_targets.append(upstream.prompt_id)
            try:
                interrupt_ack = await self.bridge.interrupt_all()
                interrupt_ack_valid = self._valid_cancel_ack(interrupt_ack, "interrupt")
                interrupt_outcome = "unconfirmed" if interrupt_targets or not interrupt_ack_valid else "unconfirmed"
            except Exception as exc:
                interrupt_outcome = "unconfirmed"
                message = f"queue clear completed or partially completed; interrupt outcome unknown: {exc}"
        accounted_prompts = {prompt_id for _, prompt_id in result_targets if prompt_id is not None}
        target_statuses = {"queued", "submitting", "running"} if mode == "all" else {"queued", "submitting"}
        missing_active = [
            job for job in state.jobs
            if job.prompt_id is not None
            and job.status in target_statuses
            and job.prompt_id not in accounted_prompts
        ]
        for job in missing_active:
            self._mark_unconfirmed(job, "job missing from upstream queue during global cancel")
            self._cancel_requested.discard(job.job_id)
            results.append(self._result(job.job_id, job.prompt_id, "unconfirmed", "unconfirmed", "job was missing from upstream queue during bulk cancellation"))
        try:
            final_queue = UpstreamQueueView.model_validate(await self.bridge.queue())
        except Exception as exc:
            final_queue = None
            logger.warning("Could not read upstream queue after global cancellation: %s", exc)
        refreshed = await self._reconcile_cancel_state({job_id for job_id, _ in result_targets if job_id is not None})
        pending_outcomes: dict[str, str] = {}
        if final_queue is not None:
            for prompt_id in pending_proof_ids:
                outcome, record = await self._pending_removal_outcome(prompt_id, final_queue, clear_ack_valid)
                if outcome is not None:
                    pending_outcomes[prompt_id] = outcome
                    queued_job = jobs_by_prompt.get(prompt_id)
                    if queued_job is not None:
                        self._apply_cancel_history_outcome(queued_job.job_id, prompt_id, outcome, record)
            refreshed = self._snapshot()
        for target_job_id, target_prompt_id in result_targets:
            current = self._find_job(refreshed, target_job_id) if target_job_id is not None else None
            if current is not None and current.status == "cancelled":
                results.append(self._result(target_job_id, target_prompt_id, "cancelled", "cancelled", "history confirmed cancellation"))
            elif current is not None and current.status in {"succeeded", "failed"}:
                results.append(self._result(target_job_id, target_prompt_id, current.status, "already_terminal", "terminal result was preserved"))
            elif target_job_id is None and target_prompt_id is not None:
                outcome = pending_outcomes.get(target_prompt_id)
                if outcome == "cancelled":
                    results.append(self._result(None, target_prompt_id, None, "cancelled", "queue removal and successful history read confirmed legacy cancellation"))
                elif outcome in {"succeeded", "failed"}:
                    results.append(self._result(None, target_prompt_id, None, "already_terminal", "legacy prompt completed before cancellation"))
                else:
                    results.append(self._result(None, target_prompt_id, None, "unconfirmed", "upstream request was acknowledged but cancellation is unconfirmed"))
            else:
                outcome = pending_outcomes.get(target_prompt_id or "")
                if outcome == "cancelled":
                    results.append(self._result(target_job_id, target_prompt_id, "cancelled", "cancelled", "queue removal and successful history read confirmed cancellation"))
                elif outcome in {"succeeded", "failed"}:
                    results.append(self._result(target_job_id, target_prompt_id, outcome, "already_terminal", "terminal history was preserved"))
                else:
                    results.append(self._result(target_job_id, target_prompt_id, current.status if current else None, "unconfirmed", "queue/interrupt acknowledgement did not confirm cancellation"))
        if mode == "all" and not interrupt_targets:
            empty_history_confirmed = False
            queues_empty_after_ack = (
                before is not None
                and not before.running
                and after_clear is not None
                and not after_clear.running
                and not after_clear.pending
                and final_queue is not None
                and not final_queue.running
                and not final_queue.pending
                and clear_ack_valid
                and interrupt_ack_valid
            )
            if queues_empty_after_ack and before is not None and not before.pending:
                try:
                    history = await self.bridge.history(None)
                    empty_history_confirmed = isinstance(history, dict)
                except Exception:
                    empty_history_confirmed = False
            if empty_history_confirmed:
                interrupt_outcome = "confirmed"
            elif queues_empty_after_ack and before is not None and before.pending:
                pending_outcomes_by_id = {
                    item.prompt_id: item.outcome
                    for item in results
                    if item.prompt_id is not None
                }
                pending_targets_confirmed = all(
                    pending_outcomes_by_id.get(item.prompt_id) in {"cancelled", "already_terminal"}
                    for item in before.pending
                )
                if pending_targets_confirmed:
                    interrupt_outcome = "confirmed"
        elif interrupt_targets and all(
            any(item.prompt_id == prompt_id and item.outcome == "cancelled" for item in results)
            for prompt_id in interrupt_targets
        ):
            interrupt_outcome = "confirmed"
        return results, clear_outcome, interrupt_outcome, message

    async def _reconcile_cancel_state(self, job_ids: set[str]) -> StateSnapshot:
        try:
            await self._reconcile_locked()
        except Exception:
            logger.warning("Cancellation reconciliation could not confirm upstream state", exc_info=True)
        state = self._snapshot()
        for job in state.jobs:
            if job.job_id not in job_ids or job.prompt_id is None or job.status in {"succeeded", "failed", "cancelled", "released"}:
                continue
            outcome = await self._history_cancel_outcome(job.prompt_id)
            if outcome == "cancelled":
                if job.job_id in self._cancel_requested:
                    self.repository.transition(job.job_id, "cancelled", finished_at=self._now())
                    self._cancel_requested.discard(job.job_id)
                else:
                    self._mark_unconfirmed(job, "execution interrupted outside a known cancel request")
            elif outcome == "succeeded":
                record = await self.bridge.history(job.prompt_id)
                value = record.get(job.prompt_id) if isinstance(record, dict) else None
                if isinstance(value, dict):
                    self.repository.transition(
                        job.job_id,
                        "succeeded",
                        outputs=self._history_outputs(job.prompt_id, value.get("outputs")),
                        finished_at=self._now(),
                    )
                    self._cancel_requested.discard(job.job_id)
            elif outcome == "failed":
                self.repository.transition(
                    job.job_id,
                    "failed",
                    failure={"reason": "ComfyUI execution failed", "outcome": "failed"},
                    finished_at=self._now(),
                )
                self._cancel_requested.discard(job.job_id)
        return self._snapshot()

    def find_job(self, job_id: str) -> JobView | None:
        return self._find_job(self._snapshot(), job_id)

    def _find_job(self, state: StateSnapshot, job_id: str | None) -> JobView | None:
        if job_id is None:
            return None
        job = next((item for item in state.jobs if item.job_id == job_id), None)
        if job is not None:
            return job
        # Jobs outside the bounded delivery window are still addressable by id.
        row = self.repository.get_job(job_id)
        return JobView.model_validate(row) if row is not None else None

    def _find_job_by_prompt(self, state: StateSnapshot, prompt_id: str | None) -> JobView | None:
        if prompt_id is None:
            return None
        job = next((item for item in state.jobs if item.prompt_id == prompt_id), None)
        if job is not None:
            return job
        row = self.repository.find_job_by_prompt(prompt_id)
        return JobView.model_validate(row) if row is not None else None

    async def _history_cancel_outcome(self, prompt_id: str) -> str | None:
        try:
            history = await self.bridge.history(prompt_id)
        except Exception:
            return None
        return self._history_outcome(history, prompt_id)

    @staticmethod
    def _history_outcome(history: Any, prompt_id: str) -> str | None:
        record = history.get(prompt_id) if isinstance(history, dict) else None
        if not isinstance(record, dict):
            return None
        status = record.get("status")
        status = status if isinstance(status, dict) else {}
        messages = status.get("messages", [])
        events = {
            str(message[0])
            for message in messages
            if isinstance(message, (list, tuple)) and message
        } if isinstance(messages, list) else set()
        if status.get("completed") is True and "execution_interrupted" in events:
            return "cancelled"
        if status.get("completed") is True and (
            status.get("status_str") == "success" or "execution_success" in events
        ):
            return "succeeded"
        if "execution_error" in events or status.get("status_str") == "error":
            return "failed"
        return None

    @staticmethod
    def _valid_cancel_ack(response: Any, operation: str, prompt_ids: list[str] | None = None) -> bool:
        if not isinstance(response, dict) or "error" in response:
            return False
        status = response.get("status")
        if isinstance(status, str) and status.lower() in {"error", "failed", "timeout"}:
            return False
        if operation == "clear" and "cleared" in response and response.get("cleared") is not True:
            return False
        if operation == "interrupt" and "interrupted" in response and response.get("interrupted") is not True:
            return False
        if operation == "delete" and "deleted" in response:
            deleted = response["deleted"]
            if isinstance(deleted, list) and prompt_ids is not None:
                if not set(prompt_ids).issubset({item for item in deleted if isinstance(item, str)}):
                    return False
            else:
                return False
        return True

    async def _pending_removal_outcome(
        self, prompt_id: str, post_queue: UpstreamQueueView, acknowledged: bool
    ) -> tuple[str | None, dict[str, Any] | None]:
        if not acknowledged or any(
            item.prompt_id == prompt_id for item in [*post_queue.running, *post_queue.pending]
        ):
            return None, None
        try:
            history = await self.bridge.history(prompt_id)
        except Exception:
            return None, None
        if not isinstance(history, dict):
            return None, None
        record = history.get(prompt_id)
        if prompt_id in history and not isinstance(record, dict):
            return None, None
        if isinstance(record, dict) and not isinstance(record.get("status"), dict):
            return None, None
        outcome = self._history_outcome(history, prompt_id)
        return (outcome or "cancelled"), record if isinstance(record, dict) else None

    def _apply_cancel_history_outcome(
        self, job_id: str, prompt_id: str, outcome: str, record: dict[str, Any] | None
    ) -> None:
        current = self._find_job(self._snapshot(), job_id)
        if current is None or current.status in {"succeeded", "failed", "cancelled", "released"}:
            return
        if outcome == "cancelled":
            self.repository.transition(job_id, "cancelled", finished_at=self._now())
        elif outcome == "succeeded":
            self.repository.transition(
                job_id,
                "succeeded",
                outputs=self._history_outputs(prompt_id, record.get("outputs") if record else None),
                finished_at=self._now(),
            )
        elif outcome == "failed":
            self.repository.transition(
                job_id,
                "failed",
                failure={"reason": "ComfyUI execution failed", "outcome": "failed"},
                finished_at=self._now(),
            )
        if outcome in {"cancelled", "succeeded", "failed"}:
            self._cancel_requested.discard(job_id)

    async def _cancel_normal(
        self, state: StateSnapshot, mode: str
    ) -> tuple[list[CancelResult], ActionOutcome, ActionOutcome, str]:
        local_normal = {
            job.job_id
            for job in state.jobs
            if job.scope == "normal" and job.status == "queued" and job.prompt_id is None
        }
        self._drop_pending(local_normal)
        results: list[CancelResult] = []
        for job_id in sorted(local_normal):
            self.repository.transition(job_id, "cancelled", finished_at=self._now())
            results.append(self._result(job_id, None, "cancelled", "cancelled", "normal job cancelled before upstream submission"))
        try:
            queue = UpstreamQueueView.model_validate(await self.bridge.queue())
        except Exception as exc:
            for job in state.jobs:
                if job.scope == "normal" and job.status not in _CONFIRMED_TERMINAL and job.prompt_id is not None:
                    self._mark_unconfirmed(job, f"queue state unavailable: {exc}")
                    self._cancel_requested.discard(job.job_id)
                    results.append(self._result(job.job_id, job.prompt_id, "unconfirmed", "unconfirmed", f"queue state unavailable: {exc}"))
            return results, "failed", "skipped" if mode == "all" else "not_requested", f"queue state unavailable: {exc}; upstream interrupt skipped"
        jobs_by_prompt = {job.prompt_id: job for job in state.jobs if job.prompt_id is not None}
        known_normal = {
            prompt_id
            for prompt_id, job in jobs_by_prompt.items()
            if job.scope == "normal" and job.status not in _CONFIRMED_TERMINAL
        }
        missing_normal_queued = [
            job for job in state.jobs
            if job.scope == "normal" and job.status in {"queued", "submitting"} and job.prompt_id is not None
            and job.prompt_id not in {item.prompt_id for item in queue.pending}
            and job.prompt_id not in {item.prompt_id for item in queue.running}
        ]
        for job in missing_normal_queued:
            self._mark_unconfirmed(job, "normal queued job missing from upstream queue during cancel")
            self._cancel_requested.discard(job.job_id)
            results.append(self._result(job.job_id, job.prompt_id, "unconfirmed", "unconfirmed", "normal job was missing from upstream queue during bulk cancellation"))
        pending_normal = [item.prompt_id for item in queue.pending if item.prompt_id in known_normal]
        result_targets: list[tuple[str, str]] = []
        pending_proof_ids: set[str] = set()
        clear_outcome: ActionOutcome = "not_requested"
        if pending_normal:
            try:
                result_targets.extend((jobs_by_prompt[prompt_id].job_id, prompt_id) for prompt_id in pending_normal)
                self._cancel_requested.update(jobs_by_prompt[prompt_id].job_id for prompt_id in pending_normal)
                ack = await self.bridge.delete_queue(pending_normal)
                refreshed = UpstreamQueueView.model_validate(await self.bridge.queue())
                remains = {item.prompt_id for item in refreshed.pending}.intersection(pending_normal)
                became_running = {item.prompt_id for item in refreshed.running}.intersection(pending_normal)
                valid_ack = self._valid_cancel_ack(ack, "delete", pending_normal)
                clear_outcome = "confirmed" if valid_ack and not remains and not became_running else "unconfirmed"
                if valid_ack:
                    pending_proof_ids = set(pending_normal) - remains - became_running
            except Exception as exc:
                clear_outcome = "unconfirmed"
                logger.warning("Normal queued deletion was not confirmed: %s", exc)
                result_targets.extend((jobs_by_prompt[prompt_id].job_id, prompt_id) for prompt_id in pending_normal)
        interrupt_outcome: ActionOutcome = "not_requested"
        interrupt_job_ids: set[str] = set()
        message = "normal queued jobs processed"
        if mode == "all":
            # Re-read after deleting the selected normal prompts. A Studio or
            # unknown job may have entered the upstream queue during deletion.
            try:
                latest = UpstreamQueueView.model_validate(await self.bridge.queue())
                latest_protected: list[Any] = [
                    item
                    for item in [*latest.running, *latest.pending]
                    if item.prompt_id not in known_normal
                ]
                queue_uncertain = False
            except Exception:
                latest = None
                latest_protected = []
                queue_uncertain = True
            if latest_protected or queue_uncertain:
                interrupt_outcome = "skipped"
                message = "通常実行中を維持しました。Studioまたは未分類jobを保護するため実行中断を見送りました"
                for upstream in latest_protected:
                    protected_job = jobs_by_prompt.get(upstream.prompt_id)
                    results.append(self._result(protected_job.job_id if protected_job else None, upstream.prompt_id, protected_job.status if protected_job else None, "not_cancelled", "Studio or unclassified upstream work was protected"))
                if queue_uncertain:
                    message = "queue state unavailable after deleting normal jobs; interrupt skipped to protect Studio and unclassified work"
            else:
                assert latest is not None
                normal_running = [item for item in latest.running if item.prompt_id in known_normal]
                if len(normal_running) == 1:
                    selected = normal_running[0]
                    selected_job = jobs_by_prompt[selected.prompt_id]
                    self._cancel_requested.add(selected_job.job_id)
                    interrupt_job_ids.add(selected_job.job_id)
                    try:
                        await self.bridge.interrupt(selected.prompt_id)
                        interrupt_outcome = "unconfirmed"
                        result_targets.append((selected_job.job_id, selected.prompt_id))
                        message = "通常生成の中断を要求しましたが、上流の競合可能性があるため結果未確認です"
                    except Exception as exc:
                        interrupt_outcome = "unconfirmed"
                        result_targets.append((selected_job.job_id, selected.prompt_id))
                        logger.warning("Normal interrupt outcome is unknown: %s", exc)
                        message = "通常生成の中断結果は未確認です"
                elif normal_running:
                    interrupt_outcome = "skipped"
                    message = "実行中jobを一意に確認できず中断を見送りました"
                    for upstream in normal_running:
                        job = jobs_by_prompt[upstream.prompt_id]
                        results.append(self._result(job.job_id, upstream.prompt_id, job.status, "not_cancelled", "running target was not uniquely confirmed"))
                else:
                    # A stale DB running marker with no matching upstream queue entry
                    # cannot authorize the unscoped Comfy interrupt endpoint.
                    stale_running = [job for job in state.jobs if job.scope == "normal" and job.status == "running"]
                    if stale_running:
                        interrupt_outcome = "skipped"
                        message = "通常実行中jobを上流queueで確認できず中断を見送りました"
                        for job in stale_running:
                            self._mark_unconfirmed(job, "job missing from upstream queue during normal cancel")
                            self._cancel_requested.discard(job.job_id)
                            results.append(self._result(job.job_id, job.prompt_id, "unconfirmed", "unconfirmed", "normal job was missing from upstream queue during bulk cancellation"))
        try:
            final_queue = UpstreamQueueView.model_validate(await self.bridge.queue())
        except Exception:
            final_queue = None
        refreshed_state = await self._reconcile_cancel_state({job_id for job_id, _ in result_targets})
        pending_outcomes: dict[str, str] = {}
        if final_queue is not None:
            for prompt_id in pending_proof_ids:
                outcome, record = await self._pending_removal_outcome(prompt_id, final_queue, True)
                if outcome is not None:
                    pending_outcomes[prompt_id] = outcome
                    self._apply_cancel_history_outcome(jobs_by_prompt[prompt_id].job_id, prompt_id, outcome, record)
            refreshed_state = self._snapshot()
        for job_id, prompt_id in dict.fromkeys(result_targets):
            current = self._find_job(refreshed_state, job_id)
            if current is not None and current.status == "cancelled":
                results.append(self._result(job_id, prompt_id, "cancelled", "cancelled", "history confirmed cancellation"))
                continue
            if current is not None and current.status in {"succeeded", "failed"}:
                results.append(self._result(job_id, prompt_id, current.status, "already_terminal", "terminal result was preserved"))
                continue
            if prompt_id in pending_outcomes and pending_outcomes[prompt_id] in {"cancelled", "succeeded", "failed"}:
                outcome = pending_outcomes[prompt_id]
                if outcome == "cancelled":
                    results.append(self._result(job_id, prompt_id, "cancelled", "cancelled", "pending removal and history read confirmed cancellation"))
                else:
                    results.append(self._result(job_id, prompt_id, outcome, "already_terminal", "terminal history was preserved"))
                continue
            results.append(self._result(job_id, prompt_id, current.status if current else None, "unconfirmed", "queue/interrupt acknowledgement did not confirm cancellation"))
        if interrupt_job_ids and all(
            any(item.job_id == job_id and item.outcome == "cancelled" for item in results)
            for job_id in interrupt_job_ids
        ):
            interrupt_outcome = "confirmed"
        return results, clear_outcome, interrupt_outcome, message

    async def _reconcile_locked(self) -> bool:
        state = self._snapshot()
        queue = UpstreamQueueView.model_validate(await self.bridge.queue())
        jobs_by_prompt = {job.prompt_id: job for job in state.jobs if job.prompt_id is not None}
        running = {item.prompt_id for item in queue.running}
        pending = {item.prompt_id for item in queue.pending}
        changed = False

        for prompt_id, job in jobs_by_prompt.items():
            if job.status in _CONFIRMED_TERMINAL:
                continue
            if prompt_id in running:
                if job.status != "running":
                    self.repository.transition(job.job_id, "running", started_at=job.started_at or self._now(), **self._resume_fields(job))
                    changed = True
                continue
            if prompt_id in pending:
                if job.status not in {"queued", "running"}:
                    self.repository.transition(job.job_id, "queued", **self._resume_fields(job))
                    changed = True
                continue

            try:
                history = await self.bridge.history(prompt_id)
            except Exception:
                logger.debug("History lookup unavailable for %s", prompt_id, exc_info=True)
                continue
            record = history.get(prompt_id) if isinstance(history, dict) else None
            if not isinstance(record, dict):
                if job.status == "submitting":
                    continue
                self._mark_unconfirmed(job, "upstream execution completed or lost without recorded history")
                self._cancel_requested.discard(job.job_id)
                changed = True
                continue
            raw_status = record.get("status")
            raw_status = raw_status if isinstance(raw_status, dict) else {}
            messages = raw_status.get("messages", [])
            event_names = {
                str(message[0])
                for message in messages
                if isinstance(message, (list, tuple)) and message
            } if isinstance(messages, list) else set()
            if "execution_interrupted" in event_names:
                if job.job_id in self._cancel_requested:
                    self.repository.transition(job.job_id, "cancelled", finished_at=self._now())
                    self._cancel_requested.discard(job.job_id)
                elif job.status != "unconfirmed":
                    self._mark_unconfirmed(job, "execution interrupted outside a known cancel request")
                    changed = True
                continue
            if "execution_error" in event_names or raw_status.get("status_str") == "error":
                self.repository.transition(
                    job.job_id,
                    "failed",
                    failure={"reason": "ComfyUI execution failed", "outcome": "failed"},
                    finished_at=self._now(),
                )
                self._cancel_requested.discard(job.job_id)
                changed = True
                continue
            if raw_status.get("completed") is True and raw_status.get("status_str") == "success":
                outputs = self._history_outputs(prompt_id, record.get("outputs"))
                self.repository.transition(
                    job.job_id,
                    "succeeded",
                    outputs=outputs,
                    finished_at=self._now(),
                )
                self._cancel_requested.discard(job.job_id)
                changed = True

        self._last_reconcile = asyncio.get_running_loop().time()
        # This includes live HTTP/WS health changes even when no jobs changed.
        final_state = self._snapshot()
        return changed or self._signature(final_state) != self._last_published_signature

    def _eager_cache_outputs(self, raw_outputs: Any) -> None:
        if not isinstance(raw_outputs, dict):
            return
        try:
            from app.routers.comfy import eager_cache_full_webp
            for node_output in raw_outputs.values():
                if not isinstance(node_output, dict):
                    continue
                images = node_output.get("images", [])
                if not isinstance(images, list):
                    continue
                for image in images:
                    if isinstance(image, dict) and isinstance(image.get("filename"), str):
                        asyncio.create_task(
                            eager_cache_full_webp(
                                image["filename"],
                                str(image.get("subfolder", "")),
                                str(image.get("type", "output")),
                            )
                        )
        except Exception as e:
            logger.warning("Failed to schedule eager cache for outputs: %s", e)

    @staticmethod
    def _history_outputs(prompt_id: str, raw_outputs: Any) -> list[dict[str, Any]]:
        if not isinstance(raw_outputs, dict):
            return []
        result: list[dict[str, Any]] = []
        for node_id, node_output in raw_outputs.items():
            if not isinstance(node_output, dict):
                continue
            images = node_output.get("images", [])
            if not isinstance(images, list):
                continue
            for index, image in enumerate(images):
                if not isinstance(image, dict) or not isinstance(image.get("filename"), str):
                    continue
                filename = image["filename"]
                subfolder = str(image.get("subfolder", ""))
                image_type = str(image.get("type", "output"))
                common = {"filename": filename, "subfolder": subfolder, "type": image_type}
                view_query = urlencode({**common, "t": prompt_id})
                thumbnail_query = urlencode(common)
                result.append(
                    {
                        "node_id": str(node_id),
                        "index": index,
                        "view_url": f"/api/comfy/view?{view_query}",
                        "thumbnail_url": f"/api/comfy/thumbnail?{thumbnail_query}",
                        "availability": "unknown",
                    }
                )
        return result

    def _snapshot(self) -> StateSnapshot:
        raw = self.repository.snapshot()
        raw = dict(raw)
        raw_jobs = raw.get("jobs")
        if isinstance(raw_jobs, list):
            jobs_with_preview: list[Any] = []
            for raw_job in raw_jobs:
                if not isinstance(raw_job, dict):
                    jobs_with_preview.append(raw_job)
                    continue
                job_data = dict(raw_job)
                revision = self._preview_revisions.get(str(job_data.get("job_id", "")), 0)
                status = job_data.get("status")
                if status in _TERMINAL:
                    self._preview_revisions.pop(str(job_data.get("job_id", "")), None)
                    job_data["preview_url"] = None
                elif revision <= 0:
                    job_data["preview_url"] = None
                else:
                    job_data["preview_url"] = (
                        f"/api/generation/preview/{job_data['job_id']}?revision={revision}"
                    )
                jobs_with_preview.append(job_data)
            raw["jobs"] = jobs_with_preview
        try:
            upstream = dict(self.bridge.get_upstream_state())
            raw["upstream"] = upstream
        except Exception:
            logger.debug("Live upstream health is unavailable; using repository snapshot", exc_info=True)
        state = StateSnapshot.model_validate(raw)
        snapshot_data = state.model_dump(mode="json")
        raw_revision = state.revision
        epoch_changed = self._wire_epoch is not None and state.epoch != self._wire_epoch
        signature_data = dict(snapshot_data)
        signature_data.pop("revision", None)
        if self._wire_epoch is None:
            self._wire_epoch = state.epoch
            self._wire_revision = raw_revision
            self._wire_signature = signature_data
        elif epoch_changed:
            self._wire_epoch = state.epoch
            self._wire_revision = max(raw_revision, self._wire_revision + 1)
            self._wire_signature = signature_data
        else:
            if signature_data != self._wire_signature:
                self._wire_revision = max(raw_revision, self._wire_revision + 1)
                self._wire_signature = signature_data
            else:
                self._wire_revision = max(raw_revision, self._wire_revision)
        snapshot_data["revision"] = self._wire_revision
        return StateSnapshot.model_validate(snapshot_data)

    @staticmethod
    def _signature(state: StateSnapshot) -> dict[str, Any]:
        data = state.model_dump(mode="json")
        data.pop("revision", None)
        return data

    def _advance_wire_revision(self, state: StateSnapshot | None = None) -> None:
        """Advance an ephemeral wire-only refresh token, without repository writes."""
        if state is None:
            state = self._snapshot()
        self._wire_revision = max(self._wire_revision, state.revision) + 1
        signature_data = state.model_dump(mode="json")
        signature_data.pop("revision", None)
        self._wire_signature = signature_data

    async def _publish_snapshot(self) -> None:
        if self.publish is None:
            return
        try:
            snapshot = self._snapshot().model_dump(mode="json")
            result = self.publish(snapshot)
            if inspect.isawaitable(result):
                await result
            self._last_published_signature = self._signature(StateSnapshot.model_validate(snapshot))
        except Exception:
            # Publishing is downstream of committed state and cannot undo acceptance.
            logger.debug("Generation snapshot publication failed", exc_info=True)

    async def _publish_if_composite_changed(self) -> None:
        try:
            state = self._snapshot()
            if self._signature(state) != self._last_published_signature:
                await self._publish_snapshot()
        except Exception:
            logger.debug("Could not publish changed generation snapshot", exc_info=True)

    def _is_vram_blocked(self, status: dict[str, Any]) -> bool:
        if not status.get("vram_guard_enabled"):
            return False
        free = status.get("vram_free_gb")
        minimum = status.get("vram_min_free_gb")
        if isinstance(free, (int, float)) and isinstance(minimum, (int, float)):
            return free < minimum
        return False

    def _drop_pending(self, job_ids: set[str]) -> None:
        if not job_ids:
            return
        self._pending = deque(item for item in self._pending if item.job_id not in job_ids)
        self._pending_ids.difference_update(job_ids)

    def _now(self) -> str:
        value = self.clock()
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        return str(value)

    def _clock_seconds(self) -> float:
        value = self.clock()
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.timestamp()
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return parsed.timestamp()
            except ValueError:
                pass
        return asyncio.get_running_loop().time()

    @staticmethod
    def _result(
        job_id: str | None,
        prompt_id: str | None,
        status: str | None,
        outcome: str,
        message: str,
    ) -> CancelResult:
        return CancelResult(
            job_id=job_id,
            prompt_id=prompt_id,
            status=status,  # type: ignore[arg-type]
            outcome=outcome,  # type: ignore[arg-type]
            message=message,
        )
