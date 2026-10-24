"""Database-backed repository for accepted and observed generation jobs."""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Callable
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AppSetting, GenerationJob
from app.routers.prompt_metadata import (
    PromptMetadataCreate,
    persist_prompt_metadata,
    persist_prompt_metadata_completed_at,
)
from app.schemas.generation import BatchRequest, JobStatus


_REVISION_KEY = "generation_revision"
_NORMAL_GROUP_KEY = "generation_normal_group_id"
_ACTIVE_STATUSES = ("queued", "submitting", "running")  # unconfirmed は normal group を開いたままにしない
_TERMINAL_STATUSES = ("succeeded", "failed", "cancelled", "released")
_PRUNABLE_STATUSES = ("succeeded", "failed", "cancelled")
_TERMINAL_LIMIT = 1000
_RELEASED_LIMIT = 1000


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _parse_datetime(value: datetime | str) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _iso_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _setting(db: Session, key: str) -> AppSetting | None:
    return db.get(AppSetting, key)


def _setting_value(db: Session, key: str, default: str) -> str:
    value = _setting(db, key)
    return value.value if value is not None else default


def _set_setting(db: Session, key: str, value: str) -> None:
    setting = _setting(db, key)
    if setting is None:
        db.add(AppSetting(key=key, value=value))
    else:
        setting.value = value


def _increment_revision(db: Session) -> int:
    revision = int(_setting_value(db, _REVISION_KEY, "0")) + 1
    _set_setting(db, _REVISION_KEY, str(revision))
    return revision


def _prompt_excerpt(metadata_json: str) -> str | None:
    try:
        metadata = json.loads(metadata_json)
    except (TypeError, ValueError):
        return None
    if not isinstance(metadata, dict):
        return None
    param_values = metadata.get("param_values")
    if not isinstance(param_values, dict):
        return None

    frozen_record = param_values.get("__prompt_surgeon_metadata_v1")
    if isinstance(frozen_record, str):
        try:
            frozen_record = json.loads(frozen_record)
        except (TypeError, ValueError):
            frozen_record = None

    prompts: list[str] = []
    if (
        isinstance(frozen_record, dict)
        and type(frozen_record.get("version")) is int
        and frozen_record["version"] == 1
    ):
        fields = frozen_record.get("fields")
        if isinstance(fields, list):
            for field in fields:
                if not isinstance(field, dict):
                    continue
                if (
                    field.get("input_type") != "textarea"
                    or field.get("recorded") is not True
                    or field.get("status") != "submitted"
                    or not isinstance(field.get("value"), str)
                ):
                    continue
                label = f"{field.get('role', '')} {field.get('display_name', '')}".casefold()
                if any(marker in label for marker in ("negative", "ネガティブ", "否定")):
                    continue
                value = field["value"].strip()
                if value:
                    prompts.append(value)
    else:
        for key in ("prompt", "positive_prompt", "Prompt_Positive"):
            value = param_values.get(key)
            if isinstance(value, str) and value.strip():
                prompts.append(value.strip())

    excerpt = "; ".join(prompts)
    return excerpt[:160] or None


def _load_release(raw: str | None) -> dict[str, Any] | None:
    if raw is None:
        return None
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return None
    keys = {"released_at", "released_by_session", "reason", "upstream_check", "late_prompt_id"}
    return value if isinstance(value, dict) and set(value) == keys else None


def _job_view(job: GenerationJob) -> dict[str, Any]:
    return {
        "job_id": job.job_id,
        "request_id": job.request_id,
        "prompt_id": job.prompt_id,
        "session_id": job.session_id,
        "scope": job.scope,
        "batch_id": job.batch_id,
        "normal_group_id": job.normal_group_id,
        "project_id": job.project_id,
        "status": job.status,
        "started_at": _iso_datetime(job.started_at),
        "finished_at": _iso_datetime(job.finished_at),
        "node": json.loads(job.node_json) if job.node_json is not None else None,
        "outputs": json.loads(job.outputs_json),
        "failure": json.loads(job.failure_json) if job.failure_json is not None else None,
        "preview_url": None,
        "set_name": job.set_name,
        "prompt_excerpt": _prompt_excerpt(job.metadata_json),
        "release": _load_release(job.release_json),
    }


def _persist_frozen_prompt_metadata(db: Session, job: GenerationJob, prompt_id: str) -> None:
    try:
        metadata = json.loads(job.metadata_json)
    except (TypeError, ValueError):
        return
    if not isinstance(metadata, dict):
        return
    param_values = metadata.get("param_values")
    if not isinstance(param_values, dict):
        return
    frozen_json = param_values.get("__prompt_surgeon_metadata_v1")
    workflow_id = metadata.get("workflow_id")
    applied_assets = metadata.get("applied_assets")
    if workflow_id is not None and type(workflow_id) is not int:
        return
    if applied_assets is not None and not isinstance(applied_assets, dict):
        return

    enriched_params = dict(param_values)
    if isinstance(frozen_json, str):
        try:
            frozen_record = json.loads(frozen_json)
        except (TypeError, ValueError):
            frozen_record = None
        if (
            isinstance(frozen_record, dict)
            and type(frozen_record.get("version")) is int
            and frozen_record["version"] == 1
        ):
            enriched_record = dict(frozen_record)
            enriched_record["queued_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            enriched_record["prompt_id"] = prompt_id
            enriched_params["__prompt_surgeon_metadata_v1"] = _json_dump(enriched_record)
    persist_prompt_metadata(db, PromptMetadataCreate(
        prompt_id=prompt_id,
        workflow_id=workflow_id,
        param_values=enriched_params,
        applied_assets=applied_assets,
    ))


class GenerationRepository:
    def __init__(self, session_factory: Callable[[], Session], epoch: str | None = None):
        self._session_factory = session_factory
        self.epoch = epoch or str(uuid4())

    def accept_batch(self, payload: BatchRequest) -> dict[str, Any]:
        canonical_payload = payload.model_dump(mode="json")
        canonical_json = json.dumps(
            canonical_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        payload_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
        db = self._session_factory()
        try:
            existing = (
                db.query(GenerationJob)
                .filter(GenerationJob.request_id == payload.request_id)
                .order_by(GenerationJob.item_index.asc())
                .all()
            )
            if existing:
                if any(job.payload_hash != payload_hash for job in existing):
                    raise HTTPException(status_code=409, detail="request_id was already accepted with a different payload")
                result = {
                    "batch_id": existing[0].batch_id,
                    "job_ids": [job.job_id for job in existing],
                    "epoch": self.epoch,
                    "revision": int(_setting_value(db, _REVISION_KEY, "0")),
                }
                db.rollback()
                return result

            batch_id = str(uuid4())
            normal_group_id: str | None = None
            if payload.scope == "normal":
                active_normal = (
                    db.query(GenerationJob)
                    .filter(
                        GenerationJob.scope == "normal",
                        GenerationJob.status.in_(_ACTIVE_STATUSES),
                    )
                    .first()
                )
                current_group = _setting_value(db, _NORMAL_GROUP_KEY, "")
                if active_normal is not None:
                    normal_group_id = active_normal.normal_group_id or current_group or str(uuid4())
                else:
                    normal_group_id = str(uuid4())
                _set_setting(db, _NORMAL_GROUP_KEY, normal_group_id)

            job_ids: list[str] = []
            for index, item in enumerate(payload.items):
                job_id = str(uuid4())
                job_ids.append(job_id)
                db.add(GenerationJob(
                    job_id=job_id,
                    request_id=payload.request_id,
                    item_index=index,
                    payload_hash=payload_hash,
                    session_id=payload.session_id,
                    scope=payload.scope,
                    batch_id=batch_id,
                    normal_group_id=normal_group_id,
                    project_id=payload.project_id,
                    set_name=item.set_name,
                    status="queued",
                    graph_json=_json_dump(item.graph),
                    metadata_json=_json_dump({
                        "workflow_id": item.workflow_id,
                        "param_values": item.param_values,
                        "applied_assets": item.applied_assets,
                        "set_name": item.set_name,
                    }),
                    outputs_json="[]",
                ))
            revision = _increment_revision(db)
            db.commit()
            return {
                "batch_id": batch_id,
                "job_ids": job_ids,
                "epoch": self.epoch,
                "revision": revision,
            }
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def snapshot(self) -> dict[str, Any]:
        db = self._session_factory()
        try:
            jobs = db.query(GenerationJob).order_by(
                GenerationJob.accepted_at.asc(), GenerationJob.item_index.asc()
            ).all()
            revision = int(_setting_value(db, _REVISION_KEY, "0"))
            normal_group_id = _setting_value(db, _NORMAL_GROUP_KEY, "") or None
            batches_by_id: dict[str, dict[str, Any]] = {}
            job_views = [_job_view(job) for job in jobs]
            for job in jobs:
                batches_by_id.setdefault(job.batch_id, {
                    "batch_id": job.batch_id,
                    "scope": job.scope,
                    "project_id": job.project_id,
                })
            return {
                "version": 1,
                "epoch": self.epoch,
                "revision": revision,
                "normal_group_id": normal_group_id,
                "jobs": job_views,
                "batches": list(batches_by_id.values()),
                "upstream": {
                    "http_ready": False,
                    "ws_connected": False,
                    "failure_since": None,
                },
            }
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=503, detail="Generation state is unavailable") from exc
        finally:
            db.close()

    def find_request(self, request_id: str) -> dict[str, Any] | None:
        db = self._session_factory()
        try:
            jobs = (
                db.query(GenerationJob)
                .filter(GenerationJob.request_id == request_id)
                .order_by(GenerationJob.item_index.asc())
                .all()
            )
            if not jobs:
                return None
            return {"batch_id": jobs[0].batch_id, "job_ids": [job.job_id for job in jobs]}
        finally:
            db.close()

    def transition(self, job_id: str, status: JobStatus, **fields: Any) -> dict[str, Any]:
        db = self._session_factory()
        try:
            job = db.get(GenerationJob, job_id)
            if job is None:
                raise HTTPException(status_code=404, detail="Generation job not found")
            if job.status in _TERMINAL_STATUSES:
                result = _job_view(job)
                db.rollback()
                return result

            job.status = status
            first_prompt_confirmation = job.prompt_id is None and isinstance(fields.get("prompt_id"), str)
            simple_fields = ("prompt_id", "cancel_requested")
            for field in simple_fields:
                if field in fields:
                    setattr(job, field, fields[field])
            if first_prompt_confirmation:
                _persist_frozen_prompt_metadata(db, job, fields["prompt_id"])
            for field in ("started_at", "finished_at"):
                if field in fields:
                    value = fields[field]
                    setattr(job, field, _parse_datetime(value) if value is not None else None)
            json_fields = {
                "node": "node_json",
                "outputs": "outputs_json",
                "failure": "failure_json",
            }
            for source, target in json_fields.items():
                if source in fields:
                    setattr(job, target, _json_dump(fields[source]) if fields[source] is not None else None)
            if status == "succeeded" and job.prompt_id is not None:
                persist_prompt_metadata_completed_at(db, job.prompt_id, job.finished_at)
            if status in _TERMINAL_STATUSES:
                job.graph_json = None
            _increment_revision(db)
            db.flush()
            result = _job_view(job)
            db.commit()
            return result
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def release_unconfirmed(self, job_id: str, release: dict[str, Any]) -> dict[str, Any] | None:
        """Compare-and-set unconfirmed -> released. Returns the view, or None when the row is not unconfirmed."""
        db = self._session_factory()
        try:
            updated = (
                db.query(GenerationJob)
                .filter(GenerationJob.job_id == job_id, GenerationJob.status == "unconfirmed")
                .update(
                    {"status": "released", "release_json": _json_dump(release), "graph_json": None},
                    synchronize_session=False,
                )
            )
            if updated != 1:
                db.rollback()
                return None
            _increment_revision(db)
            db.flush()
            db.expire_all()
            job = db.get(GenerationJob, job_id)
            assert job is not None
            view = _job_view(job)
            db.commit()
            return view
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def annotate_late_identity(self, job_id: str, prompt_id: str) -> dict[str, Any] | None:
        """Attach a late upstream prompt_id to a released row without changing its status."""
        db = self._session_factory()
        try:
            job = db.get(GenerationJob, job_id)
            if job is None or job.status != "released" or job.prompt_id is not None:
                db.rollback()
                return None
            release = _load_release(job.release_json)
            if release is None:
                db.rollback()
                return None
            release["late_prompt_id"] = prompt_id
            job.prompt_id = prompt_id
            job.release_json = _json_dump(release)
            _persist_frozen_prompt_metadata(db, job, prompt_id)
            _increment_revision(db)
            db.flush()
            view = _job_view(job)
            db.commit()
            return view
        except IntegrityError:  # prompt_id が別行で使用済み: 状態を変えない
            db.rollback()
            return None
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def prune_terminal(self) -> None:
        db = self._session_factory()
        try:
            terminal_jobs = (
                db.query(GenerationJob)
                .filter(GenerationJob.status.in_(_PRUNABLE_STATUSES))
                .order_by(GenerationJob.finished_at.asc(), GenerationJob.accepted_at.asc(), GenerationJob.job_id.asc())
                .all()
            )
            stale_jobs = terminal_jobs[:-_TERMINAL_LIMIT]
            released = db.query(GenerationJob).filter(GenerationJob.status == "released").all()
            released.sort(key=lambda j: ((_load_release(j.release_json) or {}).get("released_at", ""), j.job_id))
            stale_jobs += released[:-_RELEASED_LIMIT] if len(released) > _RELEASED_LIMIT else []
            if not stale_jobs:
                db.rollback()
                return
            for job in stale_jobs:
                db.delete(job)
            _increment_revision(db)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
