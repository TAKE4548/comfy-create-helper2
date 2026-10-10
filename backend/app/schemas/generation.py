from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

Scope = Literal["normal", "studio"]
JobStatus = Literal[
    "queued", "submitting", "running", "succeeded", "failed", "cancelled", "unconfirmed"
]
CancelMode = Literal["single", "queued", "all"]
CancelScope = Literal["all", "normal"]
ActionOutcome = Literal["confirmed", "unconfirmed", "failed", "not_requested", "skipped"]


class _ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _utc_timestamp(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("timestamp must be an ISO 8601 UTC string") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(None):
        raise ValueError("timestamp must include the UTC timezone")
    return value


class BatchItem(_ContractModel):
    graph: dict[str, Any]
    workflow_id: int | None = None
    param_values: dict[str, Any]
    applied_assets: dict[str, Any] | None = None
    set_name: str | None = None


class BatchRequest(_ContractModel):
    request_id: str
    session_id: str
    scope: Scope
    project_id: int | None = None
    items: list[BatchItem]

    @field_validator("request_id")
    @classmethod
    def validate_request_id(cls, value: str) -> str:
        try:
            UUID(value)
        except ValueError as exc:
            raise ValueError("request_id must be a UUID") from exc
        return value

    @model_validator(mode="after")
    def validate_scope_and_items(self) -> BatchRequest:
        if not self.items:
            raise ValueError("items must not be empty")
        if self.scope == "studio" and self.project_id is None:
            raise ValueError("project_id is required for studio scope")
        return self


class NodeView(_ContractModel):
    id: str
    name: str
    value: float
    max: float


class ImageView(_ContractModel):
    node_id: str
    index: int
    view_url: str
    thumbnail_url: str
    availability: Literal["present", "missing", "unknown"]


class FailureView(_ContractModel):
    reason: str
    outcome: Literal["failed", "unconfirmed"]


class JobView(_ContractModel):
    job_id: str
    request_id: str
    prompt_id: str | None
    session_id: str
    scope: Scope
    batch_id: str
    normal_group_id: str | None
    project_id: int | None
    status: JobStatus
    started_at: str | None
    finished_at: str | None
    node: NodeView | None
    outputs: list[ImageView]
    failure: FailureView | None
    preview_url: str | None = None

    _validate_started_at = field_validator("started_at")(_utc_timestamp)
    _validate_finished_at = field_validator("finished_at")(_utc_timestamp)


class BatchView(_ContractModel):
    batch_id: str
    scope: Scope
    project_id: int | None


class UpstreamView(_ContractModel):
    http_ready: bool
    ws_connected: bool
    failure_since: str | None

    _validate_failure_since = field_validator("failure_since")(_utc_timestamp)


class StateSnapshot(_ContractModel):
    version: Literal[1]
    epoch: str
    revision: int
    normal_group_id: str | None
    jobs: list[JobView]
    batches: list[BatchView]
    upstream: UpstreamView


class BatchAccepted(_ContractModel):
    batch_id: str
    job_ids: list[str]
    epoch: str
    revision: int


class RequestLookup(_ContractModel):
    batch_id: str
    job_ids: list[str]


class CancelTarget(_ContractModel):
    job_id: str | None = None
    prompt_id: str | None = None


class CancelRequest(_ContractModel):
    scope: CancelScope = "all"
    mode: CancelMode
    target: CancelTarget | None = None

    @model_validator(mode="after")
    def validate_target(self) -> CancelRequest:
        if self.mode == "single":
            if self.scope != "all":
                raise ValueError("single cancellation requires scope=all")
            if self.target is None or (self.target.job_id is None) == (self.target.prompt_id is None):
                raise ValueError("single cancellation requires exactly one target identifier")
        elif self.target is not None:
            raise ValueError("queued and all cancellation do not accept a target")
        return self


class CancelResult(_ContractModel):
    job_id: str | None
    prompt_id: str | None
    status: JobStatus | None
    outcome: Literal["cancelled", "not_cancelled", "already_terminal", "unconfirmed", "rejected"]
    message: str


class CancelOperation(_ContractModel):
    scope: CancelScope
    message: str
    mode: CancelMode
    items: list[CancelResult]
    upstream_clear: ActionOutcome
    upstream_interrupt: ActionOutcome
    epoch: str
    revision: int


class UpstreamQueueItem(_ContractModel):
    prompt_id: str
    client_id: str | None


class UpstreamQueueView(_ContractModel):
    running: list[UpstreamQueueItem]
    pending: list[UpstreamQueueItem]


class ErrorDetail(_ContractModel):
    code: str
    message: str
    outcome: Literal["failed", "unconfirmed"] | None
    request_id: str | None
    job_id: str | None


class ErrorEnvelope(_ContractModel):
    detail: ErrorDetail


class GenerationPort(Protocol):
    async def submit(self, graph: dict[str, Any]) -> dict[str, Any]: ...

    async def queue(self) -> dict[str, Any]: ...

    async def history(self, prompt_id: str | None = None) -> dict[str, Any]: ...

    async def interrupt(self, prompt_id: str) -> None: ...

    async def clear_queue(self) -> dict[str, Any]: ...

    async def delete_queue(self, prompt_ids: list[str]) -> dict[str, Any]: ...

    async def interrupt_all(self) -> dict[str, Any]: ...

    async def delete_history(self, prompt_ids: list[str]) -> None: ...


class RepositoryPort(Protocol):
    def accept_batch(self, payload: BatchRequest) -> dict[str, Any]: ...

    def snapshot(self) -> dict[str, Any]: ...

    def transition(self, job_id: str, status: JobStatus, **fields: Any) -> dict[str, Any]: ...
