from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.generation import (
    BatchAccepted,
    BatchItem,
    BatchRequest,
    BatchView,
    CancelOperation,
    CancelRequest,
    CancelResult,
    ErrorEnvelope,
    FailureView,
    ImageView,
    JobView,
    NodeView,
    RequestLookup,
    StateSnapshot,
    UpstreamQueueItem,
    UpstreamQueueView,
    UpstreamView,
)


def _request(**overrides: object) -> BatchRequest:
    payload: dict[str, object] = {
        "request_id": str(uuid4()),
        "session_id": "session-1",
        "scope": "normal",
        "items": [
            {
                "graph": {"1": {"inputs": {"seed": 0}}},
                "workflow_id": 0,
                "param_values": {"enabled": False, "empty": ""},
                "applied_assets": {},
                "set_name": "",
            }
        ],
    }
    payload.update(overrides)
    return BatchRequest.model_validate(payload)


def test_batch_request_validates_uuid_scope_items_and_studio_project() -> None:
    assert _request().items[0].param_values == {"enabled": False, "empty": ""}
    assert _request(scope="studio", project_id=12).project_id == 12

    invalid_changes: list[dict[str, object]] = [
        {"request_id": "not-a-uuid"},
        {"scope": "other"},
        {"items": []},
        {"scope": "studio"},
    ]
    for changes in invalid_changes:
        with pytest.raises(ValidationError):
            _request(**changes)


def test_state_snapshot_and_cancel_dtos_round_trip_required_nullable_fields() -> None:
    snapshot = StateSnapshot.model_validate(
        {
            "version": 1,
            "epoch": "epoch-1",
            "revision": 2,
            "normal_group_id": None,
            "jobs": [
                {
                    "job_id": "job-1",
                    "request_id": str(uuid4()),
                    "prompt_id": None,
                    "session_id": "session-1",
                    "scope": "normal",
                    "batch_id": "batch-1",
                    "normal_group_id": None,
                    "project_id": None,
                    "status": "queued",
                    "started_at": None,
                    "finished_at": None,
                    "node": None,
                    "outputs": [],
                    "failure": None,
                }
            ],
            "batches": [{"batch_id": "batch-1", "scope": "normal", "project_id": None}],
            "upstream": {"http_ready": True, "ws_connected": False, "failure_since": None},
        }
    )
    dumped = snapshot.model_dump(mode="json")
    assert dumped["jobs"][0]["prompt_id"] is None
    assert dumped["jobs"][0]["finished_at"] is None
    assert StateSnapshot.model_validate(dumped) == snapshot

    assert BatchAccepted.model_validate(
        {"batch_id": "b", "job_ids": ["j"], "epoch": "e", "revision": 1}
    ).revision == 1
    assert RequestLookup.model_validate({"batch_id": "b", "job_ids": ["j"]}).job_ids == ["j"]


def test_nested_views_and_error_envelope_validate_contract_literals() -> None:
    assert NodeView(id="n", name="node", value=0, max=1).value == 0
    assert ImageView(
        node_id="n", index=0, view_url="/view", thumbnail_url="/thumb", availability="unknown"
    ).availability == "unknown"
    assert FailureView(reason="lost", outcome="unconfirmed").outcome == "unconfirmed"
    assert BatchView(batch_id="b", scope="studio", project_id=1).project_id == 1
    assert UpstreamView(http_ready=False, ws_connected=False, failure_since=None).failure_since is None
    assert ErrorEnvelope.model_validate(
        {"detail": {"code": "unconfirmed", "message": "check", "outcome": "unconfirmed", "request_id": None, "job_id": None}}
    ).detail.code == "unconfirmed"

    with pytest.raises(ValidationError):
        NodeView.model_validate({"id": "n", "name": "node", "value": 0, "max": 1, "unexpected": True})


def test_cancel_modes_scope_and_skipped_outcomes_round_trip() -> None:
    assert CancelRequest(mode="all").scope == "all"
    normal = CancelRequest.model_validate(
        {"scope": "normal", "mode": "queued", "target": None}
    )
    assert normal.scope == "normal"
    assert CancelResult(
        job_id="job-1",
        prompt_id=None,
        status="queued",
        outcome="cancelled",
        message="cancelled",
    ).model_dump(mode="json")["prompt_id"] is None

    result = CancelOperation.model_validate(
        {
            "scope": "normal",
            "message": "Studio running; interrupt skipped",
            "mode": "all",
            "items": [
                {"job_id": "studio-job", "prompt_id": "p1", "status": "running", "outcome": "not_cancelled", "message": "protected"}
            ],
            "upstream_clear": "confirmed",
            "upstream_interrupt": "skipped",
            "epoch": "e1",
            "revision": 2,
        }
    )
    assert result.upstream_interrupt == "skipped"
    assert CancelOperation.model_validate(result.model_dump(mode="json")) == result

    queues = UpstreamQueueView.model_validate(
        {"running": [{"prompt_id": "r", "client_id": None}], "pending": []}
    )
    assert UpstreamQueueItem.model_validate({"prompt_id": "p", "client_id": "c"}).client_id == "c"
    assert queues.running[0].client_id is None

    single = CancelRequest.model_validate(
        {"scope": "all", "mode": "single", "target": {"job_id": "job-1"}}
    )
    assert single.target is not None
    assert single.target.job_id == "job-1"
    for invalid in (
        {"scope": "normal", "mode": "single", "target": {"job_id": "j"}},
        {"mode": "single", "target": {"job_id": "j", "prompt_id": "p"}},
        {"mode": "single"},
        {"mode": "queued", "target": {"prompt_id": "p"}},
    ):
        with pytest.raises(ValidationError):
            CancelRequest.model_validate(invalid)


def test_timestamps_require_iso_utc_and_nullable_fields_are_present() -> None:
    base: dict[str, object] = {
        "job_id": "j",
        "request_id": str(uuid4()),
        "prompt_id": None,
        "session_id": "s",
        "scope": "normal",
        "batch_id": "b",
        "normal_group_id": None,
        "project_id": None,
        "status": "queued",
        "started_at": "2026-10-10T00:00:00Z",
        "finished_at": None,
        "node": None,
        "outputs": [],
        "failure": None,
    }
    job = JobView.model_validate(base)
    assert job.model_dump(mode="json")["finished_at"] is None
    with pytest.raises(ValidationError):
        JobView.model_validate({**base, "started_at": "2026-10-10T00:00:00"})
    with pytest.raises(ValidationError):
        JobView.model_validate({key: value for key, value in base.items() if key != "prompt_id"})


@getattr(pytest.mark, "REQ-335")
@getattr(pytest.mark, "AC-3")
def test_release_contract_and_job_status_released() -> None:
    """[REQ-335/AC-3] released is a JobStatus; release DTOs enforce 1..50 unique ids; JobView.release defaults to None."""
    from typing import get_args

    from app.schemas.generation import JobStatus, ReleaseRequest, ReleaseView

    assert "released" in get_args(JobStatus)
    assert ReleaseRequest(job_ids=["a"]).job_ids == ["a"]
    assert len(ReleaseRequest(job_ids=[f"j{i}" for i in range(50)]).job_ids) == 50
    with pytest.raises(ValidationError):
        ReleaseRequest(job_ids=[])
    with pytest.raises(ValidationError):
        ReleaseRequest(job_ids=[f"j{i}" for i in range(51)])
    with pytest.raises(ValidationError):
        ReleaseRequest(job_ids=["a", "a"])
    with pytest.raises(ValidationError):
        ReleaseRequest.model_validate({"job_ids": ["a"], "unexpected": True})

    view = JobView(
        job_id="j1", request_id="r1", prompt_id=None, session_id="s1", scope="normal", batch_id="b1",
        normal_group_id=None, project_id=None, status="released", started_at=None, finished_at=None,
        node=None, outputs=[], failure=None,
    )
    assert view.release is None
    release = ReleaseView(
        released_at="2026-10-25T00:00:00Z", released_by_session=None, reason="user_release",
        upstream_check="skipped_no_identity", late_prompt_id=None,
    )
    assert JobView.model_validate({**view.model_dump(), "release": release.model_dump()}).release == release
    with pytest.raises(ValidationError):
        ReleaseView.model_validate({**release.model_dump(), "extra": 1})
