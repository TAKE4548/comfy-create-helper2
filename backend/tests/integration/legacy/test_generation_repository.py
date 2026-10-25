import json
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import sqlalchemy as sa
from fastapi import HTTPException
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import event
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models import AppSetting, GenerationJob, PromptMetadata, Snapshot, Workflow
from app.routers.prompt_metadata import PromptMetadataCreate, get_prompt_metadata, persist_prompt_metadata, save_prompt_metadata
from app.schemas.generation import BatchRequest, StateSnapshot
import app.services.generation_repository as generation_repository
from app.services.generation_repository import GenerationRepository


@pytest.fixture
def session_factory():
    engine = sa.create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    engine.dispose()


def make_request(*, request_id: str | None = None, scope: str = "normal", count: int = 2):
    return BatchRequest.model_validate({
        "request_id": request_id or str(uuid4()),
        "session_id": "session-a",
        "scope": scope,
        "project_id": 12 if scope == "studio" else None,
        "items": [
            {
                "graph": {"node": {"text": "日本語", "index": index}},
                "workflow_id": 4,
                "param_values": {"seed": index},
                "applied_assets": {"name": "衣装"},
                "set_name": "test-set",
            }
            for index in range(count)
        ],
    })


def make_request_with_frozen_metadata(*, request_id: str | None = None, marker: str | None = None):
    request = make_request(request_id=request_id, count=1)
    record = {
        "version": 1,
        "seed": 0,
        "params": {"prompt": "試行"},
        "assets": ["lora-a"],
        "custom_field": {"kept": True},
    }
    request.items[0].param_values["__prompt_surgeon_metadata_v1"] = (
        marker if marker is not None else json.dumps(record, ensure_ascii=False)
    )
    return request, record


def test_accept_batch_commits_all_rows_and_returns_batch_accepted_contract(session_factory):
    repository = GenerationRepository(session_factory)
    request = make_request()

    accepted = repository.accept_batch(request)

    assert set(accepted) == {"batch_id", "job_ids", "epoch", "revision"}
    assert len(accepted["job_ids"]) == 2
    assert accepted["revision"] == 1
    with session_factory() as db:
        rows = db.query(GenerationJob).order_by(GenerationJob.item_index).all()
        assert [row.job_id for row in rows] == accepted["job_ids"]
        assert {row.batch_id for row in rows} == {accepted["batch_id"]}
        assert {row.normal_group_id for row in rows} == {repository.snapshot()["normal_group_id"]}
        assert rows[0].graph_json == '{"node":{"text":"日本語","index":0}}'
        assert json.loads(rows[0].metadata_json) == {
            "workflow_id": 4,
            "param_values": {"seed": 0},
            "applied_assets": {"name": "衣装"},
            "set_name": "test-set",
        }


def test_request_lookup_is_independent_of_snapshot_and_same_payload_is_idempotent(session_factory, monkeypatch):
    repository = GenerationRepository(session_factory)
    request = make_request()
    first = repository.accept_batch(request)
    monkeypatch.setattr(repository, "snapshot", lambda: pytest.fail("lookup must not build snapshot"))

    second = repository.accept_batch(request)
    lookup = repository.find_request(request.request_id)

    assert second == first
    assert lookup == {"batch_id": first["batch_id"], "job_ids": first["job_ids"]}


def test_same_request_id_with_different_payload_is_conflict(session_factory):
    repository = GenerationRepository(session_factory)
    request_id = str(uuid4())
    repository.accept_batch(make_request(request_id=request_id))

    with pytest.raises(HTTPException) as raised:
        repository.accept_batch(make_request(request_id=request_id, count=1))

    assert raised.value.status_code == 409
    with session_factory() as db:
        assert db.query(GenerationJob).count() == 2


def test_snapshot_matches_wire_contract_and_is_read_only(session_factory):
    repository = GenerationRepository(session_factory)
    accepted = repository.accept_batch(make_request())
    before = repository.find_request(make_request(request_id=str(uuid4())).request_id)
    with session_factory() as db:
        revision_before = db.query(AppSetting).filter_by(key="generation_revision").one().value

    snapshot = repository.snapshot()

    assert StateSnapshot.model_validate(snapshot).model_dump(mode="json") == snapshot
    assert set(snapshot) == {
        "version", "epoch", "revision", "normal_group_id", "jobs", "batches", "upstream"
    }
    assert snapshot["revision"] == accepted["revision"]
    assert len(snapshot["jobs"]) == 2
    assert "graph" not in snapshot["jobs"][0]
    assert all(job["preview_url"] is None for job in snapshot["jobs"])
    assert snapshot["upstream"] == {"http_ready": False, "ws_connected": False, "failure_since": None}
    assert before is None
    with session_factory() as db:
        assert db.query(AppSetting).filter_by(key="generation_revision").one().value == revision_before


def test_studio_batch_has_no_normal_group(session_factory):
    repository = GenerationRepository(session_factory)
    accepted = repository.accept_batch(make_request(scope="studio", count=1))

    assert accepted["revision"] == 1
    with session_factory() as db:
        row = db.query(GenerationJob).filter_by(job_id=accepted["job_ids"][0]).one()
        assert row.scope == "studio"
        assert row.project_id == 12
        assert row.normal_group_id is None


def test_normal_acceptance_reuses_active_group_and_starts_new_group_after_terminal(session_factory):
    repository = GenerationRepository(session_factory)
    first = repository.accept_batch(make_request(count=1))
    second = repository.accept_batch(make_request(count=1))
    assert repository.snapshot()["jobs"][0]["normal_group_id"] == repository.snapshot()["jobs"][1]["normal_group_id"]

    repository.transition(first["job_ids"][0], "succeeded")
    repository.transition(second["job_ids"][0], "failed")
    third = repository.accept_batch(make_request(count=1))

    with session_factory() as db:
        old_groups = {row.normal_group_id for row in db.query(GenerationJob).filter(GenerationJob.job_id.in_(first["job_ids"] + second["job_ids"]))}
        new_group = db.query(GenerationJob).filter_by(job_id=third["job_ids"][0]).one().normal_group_id
        assert len(old_groups) == 1
        assert new_group not in old_groups


def test_transition_persists_terminal_fields_clears_graph_and_ignores_duplicate_terminal(session_factory):
    repository = GenerationRepository(session_factory)
    accepted = repository.accept_batch(make_request(count=1))
    started = datetime.now(timezone.utc).isoformat()

    view = repository.transition(
        accepted["job_ids"][0], "succeeded", prompt_id="upstream-1", started_at=started,
        finished_at=started, node={"id": "n1", "name": "KSampler", "value": 1, "max": 1},
        outputs=[{"node_id": "n1", "index": 0, "view_url": "/view", "thumbnail_url": "/thumb", "availability": "present"}],
    )
    revision_after_terminal = repository.snapshot()["revision"]
    repeated = repository.transition(accepted["job_ids"][0], "failed", failure={"reason": "late", "outcome": "failed"})

    assert view["status"] == "succeeded"
    assert view["prompt_id"] == "upstream-1"
    assert view["node"]["id"] == "n1"
    assert repeated == view
    assert repository.snapshot()["revision"] == revision_after_terminal
    with session_factory() as db:
        row = db.query(GenerationJob).filter_by(job_id=accepted["job_ids"][0]).one()
        assert row.graph_json is None
        assert json.loads(row.outputs_json)[0]["view_url"] == "/view"


def test_first_prompt_confirmation_persists_enriched_frozen_metadata_in_same_transaction(session_factory):
    repository = GenerationRepository(session_factory)
    request, original_record = make_request_with_frozen_metadata()
    accepted = repository.accept_batch(request)

    repository.transition(accepted["job_ids"][0], "running", prompt_id="confirmed-prompt")

    with session_factory() as db:
        job = db.query(GenerationJob).filter_by(job_id=accepted["job_ids"][0]).one()
        metadata = db.query(PromptMetadata).filter_by(prompt_id="confirmed-prompt").one()
        stored_params = json.loads(metadata.param_values)
        enriched = json.loads(stored_params["__prompt_surgeon_metadata_v1"])
        assert job.prompt_id == metadata.prompt_id == "confirmed-prompt"
        assert metadata.workflow_id == 4
        assert json.loads(metadata.applied_assets) == {"name": "衣装"}
        assert stored_params["seed"] == 0
        assert enriched == {
            **original_record,
            "queued_at": enriched["queued_at"],
            "prompt_id": "confirmed-prompt",
        }
        assert enriched["queued_at"].endswith("Z")
        assert datetime.fromisoformat(enriched["queued_at"].replace("Z", "+00:00")).utcoffset() == timezone.utc.utcoffset(None)


@pytest.mark.parametrize("marker", ["{malformed", json.dumps({"version": 2, "seed": 5}), json.dumps([1, 2])])
def test_malformed_or_unknown_frozen_metadata_persists_original_param_values(session_factory, monkeypatch, marker):
    repository = GenerationRepository(session_factory)
    request, _record = make_request_with_frozen_metadata(marker=marker)
    accepted = repository.accept_batch(request)
    original_helper = generation_repository.persist_prompt_metadata
    calls = []

    def counted_helper(db, payload):
        calls.append(payload.prompt_id)
        return original_helper(db, payload)

    monkeypatch.setattr(generation_repository, "persist_prompt_metadata", counted_helper)

    repository.transition(accepted["job_ids"][0], "running", prompt_id="confirmed-prompt")

    assert calls == ["confirmed-prompt"]
    with session_factory() as db:
        job = db.query(GenerationJob).filter_by(job_id=accepted["job_ids"][0]).one()
        metadata = db.query(PromptMetadata).filter_by(prompt_id="confirmed-prompt").one()
        assert job.prompt_id == "confirmed-prompt"
        original_params = json.loads(job.metadata_json)["param_values"]
        assert json.loads(metadata.param_values) == original_params
        assert json.loads(metadata.param_values)["__prompt_surgeon_metadata_v1"] == marker


def test_absent_frozen_metadata_marker_still_persists_original_param_values(session_factory, monkeypatch):
    repository = GenerationRepository(session_factory)
    accepted = repository.accept_batch(make_request(count=1))
    original_helper = generation_repository.persist_prompt_metadata
    calls = []

    def counted_helper(db, payload):
        calls.append(payload.prompt_id)
        return original_helper(db, payload)

    monkeypatch.setattr(generation_repository, "persist_prompt_metadata", counted_helper)

    repository.transition(accepted["job_ids"][0], "running", prompt_id="confirmed-prompt")

    assert calls == ["confirmed-prompt"]
    with session_factory() as db:
        assert db.query(GenerationJob).filter_by(job_id=accepted["job_ids"][0]).one().prompt_id == "confirmed-prompt"
        metadata = db.query(PromptMetadata).filter_by(prompt_id="confirmed-prompt").one()
        assert json.loads(metadata.param_values) == {"seed": 0}


def test_repeated_same_prompt_confirmation_does_not_duplicate_or_rewrite_metadata(session_factory, monkeypatch):
    repository = GenerationRepository(session_factory)
    request, _record = make_request_with_frozen_metadata()
    accepted = repository.accept_batch(request)
    original_helper = generation_repository.persist_prompt_metadata
    calls = []

    def counted_helper(db, payload):
        calls.append(payload.prompt_id)
        return original_helper(db, payload)

    monkeypatch.setattr(generation_repository, "persist_prompt_metadata", counted_helper)
    repository.transition(accepted["job_ids"][0], "running", prompt_id="confirmed-prompt")
    with session_factory() as db:
        before = db.query(PromptMetadata).filter_by(prompt_id="confirmed-prompt").one().param_values

    repository.transition(accepted["job_ids"][0], "running", prompt_id="confirmed-prompt")

    with session_factory() as db:
        assert calls == ["confirmed-prompt"]
        assert db.query(PromptMetadata).filter_by(prompt_id="confirmed-prompt").count() == 1
        assert db.query(PromptMetadata).filter_by(prompt_id="confirmed-prompt").one().param_values == before


def test_success_writes_completed_at_without_mutating_frozen_input_and_duplicate_terminal_is_stable(session_factory):
    repository = GenerationRepository(session_factory)
    request, original_record = make_request_with_frozen_metadata()
    accepted = repository.accept_batch(request)
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="completed-prompt")
    finished_at = "2026-10-10T05:04:03Z"

    result = repository.transition(job_id, "succeeded", finished_at=finished_at)

    assert result["finished_at"] == finished_at
    with session_factory() as db:
        job = db.query(GenerationJob).filter_by(job_id=job_id).one()
        metadata = db.query(PromptMetadata).filter_by(prompt_id="completed-prompt").one()
        stored_params = json.loads(metadata.param_values)
        completed_record = json.loads(stored_params["__prompt_surgeon_metadata_v1"])
        frozen_params = json.loads(job.metadata_json)["param_values"]
        assert completed_record["completed_at"] == finished_at
        assert completed_record["queued_at"].endswith("Z")
        assert {key: value for key, value in completed_record.items() if key not in {"queued_at", "prompt_id", "completed_at"}} == original_record
        assert frozen_params["__prompt_surgeon_metadata_v1"] == json.dumps(original_record, ensure_ascii=False)

    repository.transition(job_id, "succeeded", finished_at="2026-10-11T00:00:00Z")
    with session_factory() as db:
        record = json.loads(db.query(PromptMetadata).filter_by(prompt_id="completed-prompt").one().param_values)["__prompt_surgeon_metadata_v1"]
        assert json.loads(record)["completed_at"] == finished_at


@pytest.mark.parametrize("terminal_status", ["failed", "cancelled"])
def test_non_success_terminal_does_not_add_completed_at(session_factory, terminal_status):
    repository = GenerationRepository(session_factory)
    request, _ = make_request_with_frozen_metadata()
    accepted = repository.accept_batch(request)
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="non-success-prompt")

    repository.transition(job_id, terminal_status, finished_at="2026-10-10T05:04:03Z")

    with session_factory() as db:
        params = json.loads(db.query(PromptMetadata).filter_by(prompt_id="non-success-prompt").one().param_values)
        record = json.loads(params["__prompt_surgeon_metadata_v1"])
        assert "completed_at" not in record


@pytest.mark.parametrize("marker", ["{broken", json.dumps({"version": 2, "seed": 1}), json.dumps([1])])
def test_success_keeps_malformed_or_unknown_version_metadata_unchanged(session_factory, marker):
    repository = GenerationRepository(session_factory)
    request, _ = make_request_with_frozen_metadata(marker=marker)
    accepted = repository.accept_batch(request)
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="unsupported-metadata")

    repository.transition(job_id, "succeeded", finished_at="2026-10-10T05:04:03Z")

    with session_factory() as db:
        metadata = db.query(PromptMetadata).filter_by(prompt_id="unsupported-metadata").one()
        assert json.loads(metadata.param_values)["__prompt_surgeon_metadata_v1"] == marker


def test_success_completion_metadata_rolls_back_with_terminal_transaction(session_factory):
    class FailingCommitSession(Session):
        def commit(self):
            raise RuntimeError("commit failed")

    repository = GenerationRepository(session_factory)
    request, _ = make_request_with_frozen_metadata()
    accepted = repository.accept_batch(request)
    job_id = accepted["job_ids"][0]
    repository.transition(job_id, "running", prompt_id="rollback-completion")
    failing_factory = sessionmaker(bind=session_factory.kw["bind"], class_=FailingCommitSession)

    with pytest.raises(RuntimeError, match="commit failed"):
        GenerationRepository(failing_factory).transition(job_id, "succeeded", finished_at="2026-10-10T05:04:03Z")

    with session_factory() as db:
        assert db.query(GenerationJob).filter_by(job_id=job_id).one().status == "running"
        params = json.loads(db.query(PromptMetadata).filter_by(prompt_id="rollback-completion").one().param_values)
        assert "completed_at" not in json.loads(params["__prompt_surgeon_metadata_v1"])


def test_prompt_metadata_get_supplements_valid_legacy_record_read_only_and_never_guesses(session_factory):
    finished_at = datetime(2026, 10, 10, 5, 4, 3, tzinfo=timezone.utc)
    legacy_record = {"version": 1, "seed": 123}
    raw = json.dumps(legacy_record)
    with session_factory() as db:
        db.add(PromptMetadata(prompt_id="legacy-completed", param_values=json.dumps({"__prompt_surgeon_metadata_v1": raw})))
        db.add(GenerationJob(
            job_id="legacy-job", request_id="legacy-request", item_index=0, payload_hash="hash",
            prompt_id="legacy-completed", session_id="session", scope="normal", batch_id="batch",
            normal_group_id=None, project_id=None, set_name=None, status="succeeded", graph_json=None,
            metadata_json="{}", outputs_json="[]", node_json=None, accepted_at=finished_at,
            started_at=None, finished_at=finished_at, failure_json=None, cancel_requested=False,
        ))
        db.commit()

        response = get_prompt_metadata("legacy-completed", db)

        assert json.loads(response["param_values"]["__prompt_surgeon_metadata_v1"])["completed_at"] == "2026-10-10T05:04:03Z"
        assert db.query(PromptMetadata).filter_by(prompt_id="legacy-completed").one().param_values == json.dumps({"__prompt_surgeon_metadata_v1": raw})

        db.add(PromptMetadata(
            prompt_id="pruned-generation-row",
            param_values=json.dumps({"__prompt_surgeon_metadata_v1": raw}),
        ))
        db.commit()
        no_generation = get_prompt_metadata("pruned-generation-row", db)
        assert json.loads(no_generation["param_values"]["__prompt_surgeon_metadata_v1"]) == legacy_record


def test_prompt_metadata_get_preserves_recorded_completed_at_and_does_not_change_storage(session_factory):
    record = {"version": 1, "completed_at": "2020-01-02T03:04:05Z", "seed": 1}
    raw = json.dumps(record)
    finished_at = datetime(2026, 10, 10, 5, 4, 3, tzinfo=timezone.utc)
    with session_factory() as db:
        db.add(PromptMetadata(prompt_id="already-completed", param_values=json.dumps({"__prompt_surgeon_metadata_v1": raw})))
        db.add(GenerationJob(
            job_id="already-completed-job", request_id="already-completed-request", item_index=0, payload_hash="hash",
            prompt_id="already-completed", session_id="session", scope="normal", batch_id="batch",
            normal_group_id=None, project_id=None, set_name=None, status="succeeded", graph_json=None,
            metadata_json="{}", outputs_json="[]", node_json=None, accepted_at=finished_at,
            started_at=None, finished_at=finished_at, failure_json=None, cancel_requested=False,
        ))
        db.commit()

        response = get_prompt_metadata("already-completed", db)

        assert json.loads(response["param_values"]["__prompt_surgeon_metadata_v1"]) == record
        assert db.query(PromptMetadata).filter_by(prompt_id="already-completed").one().param_values == json.dumps({"__prompt_surgeon_metadata_v1": raw})


@pytest.mark.parametrize("existing_completed_at", [None, "not-a-time", 42])
def test_prompt_metadata_get_replaces_unusable_completed_at_with_actual_job_time(session_factory, existing_completed_at):
    record = {"version": 1, "completed_at": existing_completed_at, "seed": 1}
    finished_at = datetime(2026, 10, 10, 5, 4, 3, tzinfo=timezone.utc)
    with session_factory() as db:
        db.add(PromptMetadata(
            prompt_id="invalid-completed-at",
            param_values=json.dumps({"__prompt_surgeon_metadata_v1": json.dumps(record)}),
        ))
        db.add(GenerationJob(
            job_id="invalid-completed-at-job", request_id="invalid-completed-at-request", item_index=0, payload_hash="hash",
            prompt_id="invalid-completed-at", session_id="session", scope="normal", batch_id="batch",
            normal_group_id=None, project_id=None, set_name=None, status="succeeded", graph_json=None,
            metadata_json="{}", outputs_json="[]", node_json=None, accepted_at=finished_at,
            started_at=None, finished_at=finished_at, failure_json=None, cancel_requested=False,
        ))
        db.commit()

        response = get_prompt_metadata("invalid-completed-at", db)

        enriched = json.loads(response["param_values"]["__prompt_surgeon_metadata_v1"])
        assert enriched["completed_at"] == "2026-10-10T05:04:03Z"
        assert enriched["seed"] == 1


def test_metadata_commit_failure_rolls_back_prompt_id_status_and_metadata(session_factory):
    class FailingCommitSession(Session):
        def commit(self):
            raise RuntimeError("commit failed")

    repository = GenerationRepository(session_factory)
    request, _record = make_request_with_frozen_metadata()
    accepted = repository.accept_batch(request)
    before_revision = repository.snapshot()["revision"]
    failing_factory = sessionmaker(bind=session_factory.kw["bind"], class_=FailingCommitSession)

    with pytest.raises(RuntimeError, match="commit failed"):
        GenerationRepository(failing_factory).transition(
            accepted["job_ids"][0], "running", prompt_id="confirmed-prompt"
        )

    with session_factory() as db:
        job = db.query(GenerationJob).filter_by(job_id=accepted["job_ids"][0]).one()
        assert job.prompt_id is None
        assert job.status == "queued"
        assert db.query(PromptMetadata).count() == 0
    assert repository.snapshot()["revision"] == before_revision


def test_failed_commit_rolls_back_all_accepted_rows(session_factory):
    class FailingCommitSession(Session):
        def commit(self):
            raise RuntimeError("commit failed")

    failing_factory = sessionmaker(bind=session_factory.kw["bind"], class_=FailingCommitSession)
    repository = GenerationRepository(failing_factory)

    with pytest.raises(RuntimeError, match="commit failed"):
        repository.accept_batch(make_request())

    with session_factory() as db:
        assert db.query(GenerationJob).count() == 0
        assert db.query(AppSetting).count() == 0


def test_prune_keeps_latest_1000_terminal_and_all_active_and_increments_revision_only_when_needed(session_factory):
    repository = GenerationRepository(session_factory)
    now = datetime.now(timezone.utc)
    with session_factory() as db:
        db.add_all([
            GenerationJob(
                job_id=f"terminal-{index}", request_id=f"request-{index}", item_index=0,
                payload_hash="hash", session_id="session", scope="normal", batch_id=f"batch-{index}",
                status="succeeded", graph_json=None, metadata_json="{}", outputs_json="[]",
                accepted_at=now - timedelta(seconds=1001 - index), finished_at=now,
            )
            for index in range(1001)
        ])
        db.add(GenerationJob(
            job_id="active", request_id="active-request", item_index=0, payload_hash="hash",
            session_id="session", scope="normal", batch_id="active-batch", status="running",
            graph_json="{}", metadata_json="{}", outputs_json="[]",
        ))
        db.commit()

    repository.prune_terminal()
    revision_after_prune = repository.snapshot()["revision"]
    repository.prune_terminal()

    with session_factory() as db:
        assert db.query(GenerationJob).filter(GenerationJob.status.in_(["succeeded", "failed", "cancelled"])).count() == 1000
        assert db.query(GenerationJob).filter_by(job_id="active").count() == 1
        assert db.query(GenerationJob).filter_by(job_id="terminal-0").count() == 0
    assert repository.snapshot()["revision"] == revision_after_prune


def test_prompt_metadata_helper_flushes_unicode_without_committing_and_api_keeps_200_cap(session_factory):
    with session_factory() as db:
        payload = PromptMetadataCreate(
            prompt_id="helper-row", workflow_id=3, param_values={"text": "日本語"}, applied_assets={"asset": "衣装"}
        )
        persist_prompt_metadata(db, payload)
        assert db.query(PromptMetadata).filter_by(prompt_id="helper-row").one().param_values == '{"text": "日本語"}'
        db.rollback()

    with session_factory() as db:
        assert db.query(PromptMetadata).count() == 0
        now = datetime.now(timezone.utc)
        db.add_all([
            PromptMetadata(prompt_id=f"meta-{index}", param_values="{}", created_at=now - timedelta(seconds=300 - index))
            for index in range(300)
        ])
        db.commit()
        save_prompt_metadata(
            PromptMetadataCreate(prompt_id="meta-new", param_values={"word": "新規"}), db
        )
        assert db.query(PromptMetadata).count() == 200
        assert db.query(PromptMetadata).filter_by(prompt_id="meta-new").count() == 1


def test_prompt_metadata_retention_protects_active_jobs_without_changing_snapshot_rows(session_factory):
    now = datetime.now(timezone.utc)
    with session_factory() as db:
        workflow = Workflow(name="retention-test", json_body="{}")
        db.add(workflow)
        db.flush()
        db.add(Snapshot(workflow_id=workflow.id, params="{}", image_path="snapshot.png"))
        db.add(PromptMetadata(
            prompt_id="active-prompt", param_values="{}", created_at=now - timedelta(days=2)
        ))
        db.add_all([
            PromptMetadata(
                prompt_id=f"old-{index}", param_values="{}", created_at=now + timedelta(seconds=index)
            )
            for index in range(300)
        ])
        db.add(GenerationJob(
            job_id="active-job", request_id="active-request", item_index=0, payload_hash="hash",
            prompt_id="active-prompt", session_id="session", scope="normal", batch_id="batch",
            status="running", graph_json="{}", metadata_json="{}", outputs_json="[]",
        ))
        db.commit()

    with session_factory() as db:
        persist_prompt_metadata(db, PromptMetadataCreate(
            prompt_id="new-meta", param_values={"new": True}
        ))
        assert db.query(PromptMetadata).count() == 200
        assert db.query(PromptMetadata).filter_by(prompt_id="active-prompt").count() == 1
        assert db.query(GenerationJob).filter_by(job_id="active-job").count() == 1
        assert db.query(Snapshot).filter_by(image_path="snapshot.png").count() == 1
        db.rollback()


RELEASE_AT = "2026-10-25T00:00:00Z"


def _release_payload(**overrides):
    payload = {
        "released_at": RELEASE_AT,
        "released_by_session": "session-a",
        "reason": "user_release",
        "upstream_check": "not_found",
        "late_prompt_id": None,
    }
    payload.update(overrides)
    return payload


@getattr(pytest.mark, "REQ-335")
@getattr(pytest.mark, "AC-4")
def test_unconfirmed_does_not_hold_normal_group_open(session_factory):
    """[REQ-335/AC-4] An unconfirmed normal job must not keep the normal group open for new acceptance."""
    repository = GenerationRepository(session_factory)
    first = repository.accept_batch(make_request(count=1))
    repository.transition(first["job_ids"][0], "unconfirmed", failure={"reason": "lost", "outcome": "unconfirmed"})
    second = repository.accept_batch(make_request(count=1))

    with session_factory() as db:
        old_group = db.query(GenerationJob).filter_by(job_id=first["job_ids"][0]).one().normal_group_id
        new_group = db.query(GenerationJob).filter_by(job_id=second["job_ids"][0]).one().normal_group_id
    assert new_group != old_group


@getattr(pytest.mark, "REQ-335")
@getattr(pytest.mark, "AC-3")
def test_release_unconfirmed_is_compare_and_set_and_idempotent(session_factory):
    """[REQ-335/AC-3] release_unconfirmed is a CAS unconfirmed -> released, bumps revision once, keeps failure."""
    repository = GenerationRepository(session_factory)
    unconfirmed = repository.accept_batch(make_request(count=1))["job_ids"][0]
    succeeded = repository.accept_batch(make_request(count=1))["job_ids"][0]
    failure = {"reason": "lost", "outcome": "unconfirmed"}
    repository.transition(unconfirmed, "unconfirmed", failure=failure)
    repository.transition(succeeded, "succeeded")
    revision_before = repository.snapshot()["revision"]

    view = repository.release_unconfirmed(unconfirmed, _release_payload())
    assert view is not None
    assert view["status"] == "released"
    assert view["failure"] == failure
    assert view["release"] == _release_payload()
    assert repository.snapshot()["revision"] == revision_before + 1

    assert repository.release_unconfirmed(unconfirmed, _release_payload()) is None
    assert repository.snapshot()["revision"] == revision_before + 1
    succeeded_view = repository.transition(succeeded, "failed")
    assert succeeded_view["status"] == "succeeded"
    with session_factory() as db:
        assert db.query(GenerationJob).filter_by(job_id=succeeded).one().release_json is None


@getattr(pytest.mark, "REQ-335")
@getattr(pytest.mark, "AC-3")
def test_released_is_terminal_and_survives_prune_with_independent_cap(session_factory, monkeypatch):
    """[REQ-335/AC-3] released rows are terminal and pruned only by their own cap, never by the normal terminal cap."""
    monkeypatch.setattr(generation_repository, "_RELEASED_LIMIT", 3)
    repository = GenerationRepository(session_factory)
    job_ids = []
    for _ in range(5):
        job_id = repository.accept_batch(make_request(count=1))["job_ids"][0]
        repository.transition(job_id, "unconfirmed", failure={"reason": "lost", "outcome": "unconfirmed"})
        job_ids.append(job_id)
    for index, job_id in enumerate(job_ids):
        repository.release_unconfirmed(job_id, _release_payload(released_at=f"2026-10-25T00:00:0{index}Z"))
    assert repository.transition(job_ids[-1], "failed")["status"] == "released"

    repository.prune_terminal()

    with session_factory() as db:
        remaining = {row.job_id for row in db.query(GenerationJob).filter_by(status="released")}
    assert remaining == set(job_ids[-3:])


@getattr(pytest.mark, "REQ-335")
@getattr(pytest.mark, "AC-5")
def test_annotate_late_identity_keeps_released_status(session_factory):
    """[REQ-335/AC-5] A late prompt_id is attached to a released row without changing its status."""
    repository = GenerationRepository(session_factory)
    target = repository.accept_batch(make_request(count=1))["job_ids"][0]
    other = repository.accept_batch(make_request(count=1))["job_ids"][0]
    repository.transition(other, "running", prompt_id="prompt-other")
    repository.transition(target, "unconfirmed", failure={"reason": "lost", "outcome": "unconfirmed"})
    repository.release_unconfirmed(target, _release_payload())

    assert repository.annotate_late_identity(target, "prompt-other") is None
    with session_factory() as db:
        assert db.query(GenerationJob).filter_by(job_id=target).one().prompt_id is None

    view = repository.annotate_late_identity(target, "prompt-late")
    assert view is not None
    assert view["status"] == "released"
    assert view["prompt_id"] == "prompt-late"
    assert view["release"]["late_prompt_id"] == "prompt-late"
    assert repository.annotate_late_identity(other, "prompt-late-2") is None


@getattr(pytest.mark, "REQ-335")
@getattr(pytest.mark, "AC-3")
def test_job_view_tolerates_malformed_release_json(session_factory):
    """[REQ-335/AC-3] A malformed release_json is read as release=None instead of failing the snapshot."""
    repository = GenerationRepository(session_factory)
    job_id = repository.accept_batch(make_request(count=1))["job_ids"][0]
    with session_factory() as db:
        job = db.get(GenerationJob, job_id)
        job.status = "released"
        job.release_json = "{not-json"
        db.commit()

    job_view = next(job for job in repository.snapshot()["jobs"] if job["job_id"] == job_id)
    assert job_view["status"] == "released"
    assert job_view["release"] is None




@getattr(pytest.mark, "REQ-335")
@getattr(pytest.mark, "AC-3")
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture], max_examples=40, deadline=None)
@given(
    actions=st.lists(
        st.tuples(st.integers(min_value=0, max_value=2), st.sampled_from(["unconfirmed", "release", "succeeded", "running"])),
        max_size=12,
    ),
)
def test_property_release_and_transitions_preserve_non_unconfirmed_rows(session_factory, actions):
    """[REQ-335/AC-3] Random transitions keep terminal rows unchanged, release idempotently, and keep revision monotonic."""
    repository = GenerationRepository(session_factory)
    job_ids = repository.accept_batch(make_request(count=3))["job_ids"]
    last_revision = repository.snapshot()["revision"]

    def row_state():
        with session_factory() as db:
            return {
                row.job_id: (row.status, row.release_json, row.graph_json)
                for row in db.query(GenerationJob).filter(GenerationJob.job_id.in_(job_ids))
            }

    for index, action in actions:
        job_id = job_ids[index]
        before = row_state()
        if action == "release":
            result = repository.release_unconfirmed(job_id, _release_payload())
            assert (result is not None) == (before[job_id][0] == "unconfirmed")
        elif action == "unconfirmed":
            repository.transition(job_id, "unconfirmed", failure={"reason": "lost", "outcome": "unconfirmed"})
        else:
            repository.transition(job_id, action)
        after = row_state()
        for other_id, (status, release_json, _graph) in before.items():
            if status in ("succeeded", "failed", "cancelled", "released"):
                assert after[other_id][0] == status
                assert after[other_id][1] == release_json
        revision = repository.snapshot()["revision"]
        assert revision >= last_revision
        last_revision = revision


_REQ387_BASE = datetime(2026, 10, 25, 0, 0, 0)
_REQ387_TERMINAL = ("succeeded", "failed", "cancelled", "released")


def _req387_insert(db, job_id, batch_id, index, *, status="succeeded", session_id="session-a",
                   group=None, release=None, metadata_json="{}", prompt_id=None):
    db.add(GenerationJob(
        job_id=job_id, request_id=f"request-{job_id}", item_index=0, payload_hash="hash",
        prompt_id=prompt_id, session_id=session_id, scope="normal", batch_id=batch_id,
        normal_group_id=group, status=status,
        graph_json=None if status in _REQ387_TERMINAL else "{}",
        metadata_json=metadata_json, outputs_json="[]", release_json=release,
        accepted_at=_REQ387_BASE + timedelta(seconds=index),
    ))


def _req387_reference(rows, current_group):
    """Window definition computed over every row (test oracle)."""
    terminal = set(_REQ387_TERMINAL)
    nonterminal_batches = {r.batch_id for r in rows if r.status not in terminal}
    batch_max: dict[str, datetime] = {}
    for r in rows:
        batch_max[r.batch_id] = max(batch_max.get(r.batch_id, r.accepted_at), r.accepted_at)
    recent_batches = set(sorted(batch_max, key=lambda b: batch_max[b], reverse=True)[:20])
    released_top: set[str] = set()
    per_session: dict[str, list] = defaultdict(list)
    for r in rows:
        if r.status == "released":
            per_session[r.session_id].append(r)
    for items in per_session.values():
        def rank(r):
            released_at = (json.loads(r.release_json) or {}).get("released_at") if r.release_json else None
            return (released_at is not None, released_at or "", r.job_id)
        items.sort(key=rank, reverse=True)
        released_top |= {r.job_id for r in items[:10]}
    expected = {
        r.job_id for r in rows
        if r.status not in terminal
        or r.batch_id in nonterminal_batches
        or (current_group is not None and r.normal_group_id == current_group)
        or r.batch_id in recent_batches
        or r.job_id in released_top
    }
    return expected, nonterminal_batches, recent_batches


@getattr(pytest.mark, "REQ-387")
@getattr(pytest.mark, "AC-1")
def test_req387_ac1_snapshot_window_contains_active_group_recent_batches_and_released_top10(session_factory):
    """[REQ-387/AC-1] The snapshot window keeps the active group, non-terminal batches, latest 20 batches and released top 10 per session."""
    index_of: dict[str, int] = {}
    with session_factory() as db:
        db.add(AppSetting(key="generation_normal_group_id", value="group-now"))
        jobs_spec = [
            ("job-old-active", "batch-old-active", -10, "running", None),
            ("job-group-old", "batch-group-old", -5, "succeeded", "group-now"),
            ("job-unc", "batch-unc", -30, "unconfirmed", None),
        ]
        for i in range(25):
            jobs_spec.append((f"job-{i:02d}", f"batch-{i:02d}", i, "succeeded", None))
        for job_id, batch_id, index, status, group in jobs_spec:
            index_of[job_id] = index
            _req387_insert(db, job_id, batch_id, index, status=status, group=group)
        offset = 0
        for session_id in ("session-a", "session-b"):
            for r in range(12):
                job_id = f"rel-{session_id[-1]}-{r:02d}"
                index = -100 + offset
                offset += 1
                index_of[job_id] = index
                if session_id == "session-a" and r == 0:
                    release = json.dumps({k: v for k, v in _release_payload().items() if k != "released_at"})
                else:
                    release = json.dumps(_release_payload(
                        released_at=f"2026-10-25T00:00:{r:02d}Z", released_by_session=session_id,
                    ))
                _req387_insert(db, job_id, f"batch-{job_id}", index, status="released",
                               session_id=session_id, release=release)
        db.commit()

    repository = GenerationRepository(session_factory)
    snapshot = repository.snapshot()

    expected_jobs = {"job-old-active", "job-group-old", "job-unc"}
    expected_jobs |= {f"job-{i:02d}" for i in range(5, 25)}
    expected_jobs |= {f"rel-{s}-{r:02d}" for s in ("a", "b") for r in range(2, 12)}
    assert {job["job_id"] for job in snapshot["jobs"]} == expected_jobs
    assert [job["job_id"] for job in snapshot["jobs"]] == sorted(expected_jobs, key=index_of.get)
    expected_batches = {f"batch-{i:02d}" for i in range(5, 25)} | {"batch-old-active", "batch-group-old", "batch-unc"}
    expected_batches |= {f"batch-rel-{s}-{r:02d}" for s in ("a", "b") for r in range(2, 12)}
    assert {batch["batch_id"] for batch in snapshot["batches"]} == expected_batches
    assert snapshot["normal_group_id"] == "group-now"
    assert StateSnapshot.model_validate(snapshot).model_dump(mode="json") == snapshot


@getattr(pytest.mark, "REQ-387")
@getattr(pytest.mark, "AC-8")
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture], max_examples=50, deadline=None)
@given(
    batch_groups=st.lists(st.sampled_from([None, "G1", "G2"]), min_size=25, max_size=25),
    current_group=st.sampled_from([None, "G1", "G2"]),
    jobs=st.lists(
        st.tuples(
            st.integers(min_value=0, max_value=24),
            st.sampled_from(["queued", "submitting", "running", "unconfirmed", "succeeded", "failed", "cancelled", "released"]),
            st.sampled_from(["s1", "s2"]),
            st.one_of(st.none(), st.integers(min_value=0, max_value=20)),
        ),
        max_size=60,
    ),
)
def test_req387_ac8_window_progress_matches_full_snapshot(session_factory, batch_groups, current_group, jobs):
    """[REQ-387/AC-8] Window results match the full-table definition for group, batch, unconfirmed and released top-10 sets."""
    with session_factory() as db:
        db.query(GenerationJob).delete()
        db.query(AppSetting).delete()
        if current_group is not None:
            db.add(AppSetting(key="generation_normal_group_id", value=current_group))
        for index, (batch, status, session_id, released_index) in enumerate(jobs):
            release = None
            if status == "released":
                if released_index is None:
                    release = json.dumps({k: v for k, v in _release_payload().items() if k != "released_at"})
                else:
                    release = json.dumps(_release_payload(
                        released_at=f"2026-10-25T00:00:{released_index:02d}Z", released_by_session=session_id,
                    ))
            _req387_insert(
                db, f"job-{index:03d}", f"b-{batch:02d}", index, status=status,
                session_id=session_id, group=batch_groups[batch], release=release,
            )
        db.commit()

    repository = GenerationRepository(session_factory)
    snapshot = repository.snapshot()
    with session_factory() as db:
        rows = db.query(GenerationJob).all()
        full_batch_jobs: dict[str, set[str]] = defaultdict(set)
        for r in rows:
            full_batch_jobs[r.batch_id].add(r.job_id)
    expected, nonterminal_batches, recent_batches = _req387_reference(rows, current_group)

    window = snapshot["jobs"]
    assert {job["job_id"] for job in window} == expected
    if current_group is not None:
        assert {j["job_id"] for j in window if j["normal_group_id"] == current_group} == {
            r.job_id for r in rows if r.normal_group_id == current_group
        }
    window_batch_jobs: dict[str, set[str]] = defaultdict(set)
    for job in window:
        window_batch_jobs[job["batch_id"]].add(job["job_id"])
    for batch_id in set(window_batch_jobs) & (nonterminal_batches | recent_batches):
        assert window_batch_jobs[batch_id] == full_batch_jobs[batch_id]
    assert {j["job_id"] for j in window if j["status"] == "unconfirmed"} == {
        r.job_id for r in rows if r.status == "unconfirmed"
    }
    for session_id in ("s1", "s2"):
        expected_session = {r.job_id for r in rows if r.status == "released" and r.session_id == session_id and r.job_id in expected}
        window_session = {j["job_id"] for j in window if j["status"] == "released" and j["session_id"] == session_id}
        assert window_session == expected_session


@getattr(pytest.mark, "REQ-387")
@getattr(pytest.mark, "AC-1")
def test_req387_ac1_snapshot_cache_hit_skips_job_rows_and_every_write_invalidates(session_factory):
    """[REQ-387/AC-1] A cache hit issues no generation_jobs SELECT, and every write path invalidates the cached snapshot."""
    engine = session_factory.kw["bind"]
    repository = GenerationRepository(session_factory)

    def assert_matches_fresh():
        fresh = GenerationRepository(session_factory, epoch=repository.epoch).snapshot()
        assert repository.snapshot() == fresh

    seen: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        seen.append(statement)

    # Old terminal rows so that prune_terminal actually deletes (more than the 1000 cap).
    with session_factory() as db:
        for index in range(1001):
            _req387_insert(db, f"old-{index:04d}", f"old-batch-{index:04d}", index - 2000)
        db.commit()
    unconfirmed_id, running_id = repository.accept_batch(make_request(count=2))["job_ids"]
    repository.transition(running_id, "running")
    repository.snapshot()

    event.listen(engine, "before_cursor_execute", record)
    try:
        first = repository.snapshot()
        seen.clear()
        second = repository.snapshot()
        assert first == second
        assert not [s for s in seen if s.lstrip().upper().startswith("SELECT") and "generation_jobs" in s]
    finally:
        event.remove(engine, "before_cursor_execute", record)

    revision = repository.snapshot()["revision"]
    repository.transition(unconfirmed_id, "unconfirmed", failure={"reason": "lost", "outcome": "unconfirmed"})
    assert repository.snapshot()["revision"] > revision
    assert_matches_fresh()

    repository.release_unconfirmed(unconfirmed_id, _release_payload())
    assert_matches_fresh()
    assert next(j for j in repository.snapshot()["jobs"] if j["job_id"] == unconfirmed_id)["status"] == "released"

    repository.annotate_late_identity(unconfirmed_id, "prompt-late")
    assert_matches_fresh()
    assert next(j for j in repository.snapshot()["jobs"] if j["job_id"] == unconfirmed_id)["prompt_id"] == "prompt-late"

    repository.accept_batch(make_request(count=1))
    assert_matches_fresh()

    repository.prune_terminal()
    assert_matches_fresh()

    other = GenerationRepository(session_factory, epoch=repository.epoch)
    other.transition(running_id, "succeeded", finished_at=datetime.now(timezone.utc))
    assert_matches_fresh()
    assert next(j for j in repository.snapshot()["jobs"] if j["job_id"] == running_id)["status"] == "succeeded"


@getattr(pytest.mark, "REQ-387")
@getattr(pytest.mark, "AC-8")
def test_req387_ac8_snapshot_time_budget_with_1000_terminal_jobs(session_factory):
    """[REQ-387/AC-8] With 1000 terminal jobs of ~27KB metadata, a cache miss is <= 150ms, a hit <= 10ms, and the window stays bounded."""
    prompt_record = {
        "version": 1,
        "fields": [{
            "input_type": "textarea", "recorded": True, "status": "submitted",
            "role": "positive", "display_name": "prompt", "value": "masterpiece",
        }],
        "padding": "p" * 26_000,
    }
    metadata_json = json.dumps({
        "workflow_id": 4,
        "param_values": {"__prompt_surgeon_metadata_v1": json.dumps(prompt_record)},
        "applied_assets": None,
        "set_name": "bench",
    }, ensure_ascii=False)
    assert 26_000 < len(metadata_json) < 30_000
    with session_factory() as db:
        for index in range(1000):
            _req387_insert(db, f"term-{index:04d}", f"batch-{index:04d}", index,
                           metadata_json=metadata_json, prompt_id=f"prompt-{index:04d}")
        db.add(AppSetting(key="generation_normal_group_id", value="group-run"))
        _req387_insert(db, "job-running", "batch-running", 5000, status="running", group="group-run")
        db.commit()

    repository = GenerationRepository(session_factory)
    repository.snapshot()
    repository.transition("job-running", "running")  # write bumps revision, so the next call is a miss

    start = time.perf_counter()
    miss = repository.snapshot()
    miss_ms = (time.perf_counter() - start) * 1000

    hit_times = []
    for _ in range(3):
        start = time.perf_counter()
        repository.snapshot()
        hit_times.append((time.perf_counter() - start) * 1000)

    assert miss_ms <= 150, f"cache miss took {miss_ms:.1f}ms"
    assert min(hit_times) <= 10, f"cache hit took {min(hit_times):.1f}ms"
    assert len(miss["jobs"]) <= 1 + 20
    assert any(j["job_id"] == "job-running" for j in miss["jobs"])


@getattr(pytest.mark, "REQ-387")
@getattr(pytest.mark, "AC-1")
def test_req387_ac1_get_job_and_find_job_by_prompt_read_out_of_window_rows(session_factory):
    """[REQ-387/AC-1] get_job and find_job_by_prompt return terminal rows outside the window and None for unknown IDs."""
    repository = GenerationRepository(session_factory)
    old = repository.accept_batch(make_request(count=1))["job_ids"][0]
    repository.transition(old, "running", prompt_id="prompt-old")
    repository.transition(old, "succeeded", finished_at=datetime.now(timezone.utc))
    for _ in range(21):
        repository.accept_batch(make_request(count=1))

    assert old not in {job["job_id"] for job in repository.snapshot()["jobs"]}
    by_id = repository.get_job(old)
    by_prompt = repository.find_job_by_prompt("prompt-old")
    assert by_id is not None and by_id["job_id"] == old and by_id["status"] == "succeeded"
    assert by_prompt == by_id
    assert repository.get_job("missing-job") is None
    assert repository.find_job_by_prompt("missing-prompt") is None


@getattr(pytest.mark, "REQ-387")
@getattr(pytest.mark, "AC-1")
@pytest.mark.parametrize("stored_group", [None, ""], ids=["setting-absent", "setting-empty"])
def test_req387_ac1_snapshot_with_empty_normal_group_id_has_no_group_condition(session_factory, stored_group):
    """[REQ-387/AC-1] An absent or empty normal_group_id adds no group condition and snapshot() does not raise."""
    with session_factory() as db:
        if stored_group is not None:
            db.add(AppSetting(key="generation_normal_group_id", value=stored_group))
        _req387_insert(db, "job-running", "batch-running", -50, status="running")
        _req387_insert(db, "job-empty-group", "batch-empty-group", -1, group="")
        for i in range(22):
            _req387_insert(db, f"job-{i:02d}", f"batch-{i:02d}", i)
        db.commit()

    snapshot = GenerationRepository(session_factory).snapshot()

    assert snapshot["normal_group_id"] is None
    assert [job["job_id"] for job in snapshot["jobs"]] == ["job-running"] + [f"job-{i:02d}" for i in range(2, 22)]
    assert StateSnapshot.model_validate(snapshot).model_dump(mode="json") == snapshot


@getattr(pytest.mark, "REQ-387")
@getattr(pytest.mark, "AC-1")
def test_req387_ac1_released_ranking_survives_invalid_release_json_and_falls_back_to_job_id_desc(session_factory):
    """[REQ-387/AC-1] Invalid or non-object release_json ranks last (job_id DESC) without failing the snapshot query."""
    invalid_forms = [
        "{not-json", "not json at all", "", "[1, 2]", "null", '{"released_at": null}',
        "{", "[]", '"text"', "123",
    ]
    with session_factory() as db:
        for i in range(4):
            release = json.dumps(_release_payload(released_at=f"2026-10-25T00:00:{i:02d}Z"))
            _req387_insert(db, f"rel-a{i}", f"batch-rel-a{i}", -100 + i, status="released", release=release)
        for i, form in enumerate(invalid_forms):
            _req387_insert(db, f"rel-i{i:02d}", f"batch-rel-i{i:02d}", -50 + i, status="released", release=form)
        for i in range(20):
            _req387_insert(db, f"fill-{i:02d}", f"batch-fill-{i:02d}", i)
        db.commit()

    snapshot = GenerationRepository(session_factory).snapshot()

    released_ids = {job["job_id"] for job in snapshot["jobs"] if job["status"] == "released"}
    expected = {f"rel-a{i}" for i in range(4)} | {f"rel-i{i:02d}" for i in range(4, 10)}
    assert released_ids == expected
    assert StateSnapshot.model_validate(snapshot).model_dump(mode="json") == snapshot
