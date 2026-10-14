"""Router for managing prompt generation metadata."""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app import models

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prompt-metadata", tags=["prompt-metadata"])
_GENERATION_METADATA_KEY = "__prompt_surgeon_metadata_v1"


class PromptMetadataCreate(BaseModel):
    prompt_id: str
    workflow_id: Optional[int] = None
    param_values: Dict[str, Any]
    applied_assets: Optional[Dict[str, Any]] = None


class PromptMetadataResponse(BaseModel):
    prompt_id: str
    workflow_id: Optional[int] = None
    param_values: Dict[str, Any]
    applied_assets: Optional[Dict[str, Any]] = None
    created_at: str


def persist_prompt_metadata(db: Session, payload: PromptMetadataCreate) -> None:
    """Upsert prompt metadata in the caller's transaction without committing it."""
    existing = db.query(models.PromptMetadata).filter(
        models.PromptMetadata.prompt_id == payload.prompt_id
    ).first()

    param_values_str = json.dumps(payload.param_values, ensure_ascii=False)
    applied_assets_str = (
        json.dumps(payload.applied_assets, ensure_ascii=False)
        if payload.applied_assets is not None
        else None
    )

    if existing:
        existing.workflow_id = payload.workflow_id
        existing.param_values = param_values_str
        existing.applied_assets = applied_assets_str
    else:
        db.add(models.PromptMetadata(
            prompt_id=payload.prompt_id,
            workflow_id=payload.workflow_id,
            param_values=param_values_str,
            applied_assets=applied_assets_str,
        ))
    db.flush()

    total_count = db.query(models.PromptMetadata).count()
    if total_count > 200:
        active_prompt_ids = {
            row[0]
            for row in db.query(models.GenerationJob.prompt_id)
            .filter(
                models.GenerationJob.prompt_id.isnot(None),
                models.GenerationJob.status.in_(("queued", "submitting", "running", "unconfirmed")),
            )
            .all()
        }
        candidates = db.query(models.PromptMetadata.prompt_id).order_by(
            models.PromptMetadata.created_at.asc(), models.PromptMetadata.prompt_id.asc()
        )
        if active_prompt_ids:
            candidates = candidates.filter(~models.PromptMetadata.prompt_id.in_(active_prompt_ids))
        oldest_ids = [row[0] for row in candidates.limit(total_count - 200).all()]
        if oldest_ids:
            db.query(models.PromptMetadata).filter(
                models.PromptMetadata.prompt_id.in_(oldest_ids)
            ).delete(synchronize_session=False)
            db.flush()


def with_completed_at(param_values: dict[str, Any], finished_at: datetime | None) -> dict[str, Any]:
    """Return a response copy with a completion time for a valid legacy v1 record."""
    result = dict(param_values)
    raw_record = result.get(_GENERATION_METADATA_KEY)
    if finished_at is None or not isinstance(raw_record, str):
        return result
    try:
        record = json.loads(raw_record)
    except (TypeError, ValueError):
        return result
    if not isinstance(record, dict) or type(record.get("version")) is not int or record["version"] != 1:
        return result
    existing_completed_at = record.get("completed_at")
    if isinstance(existing_completed_at, str):
        try:
            existing_timestamp = datetime.fromisoformat(existing_completed_at.replace("Z", "+00:00"))
            if existing_timestamp.tzinfo is not None and existing_timestamp.utcoffset() is not None:
                return result
        except ValueError:
            pass
    normalized = finished_at.replace(tzinfo=timezone.utc) if finished_at.tzinfo is None else finished_at.astimezone(timezone.utc)
    record = dict(record)
    record["completed_at"] = normalized.isoformat().replace("+00:00", "Z")
    result[_GENERATION_METADATA_KEY] = json.dumps(record, ensure_ascii=False)
    return result


def persist_prompt_metadata_completed_at(db: Session, prompt_id: str, finished_at: datetime | None) -> None:
    """Persist a valid v1 record's actual terminal time in the caller's transaction."""
    if finished_at is None:
        return
    item = db.query(models.PromptMetadata).filter(
        models.PromptMetadata.prompt_id == prompt_id
    ).first()
    if item is None:
        return
    try:
        param_values = json.loads(item.param_values)
    except (TypeError, ValueError):
        return
    if not isinstance(param_values, dict):
        return
    updated = with_completed_at(param_values, finished_at)
    if updated != param_values:
        item.param_values = json.dumps(updated, ensure_ascii=False)
        db.flush()


@router.post("", response_model=Dict[str, Any])
def save_prompt_metadata(payload: PromptMetadataCreate, db: Session = Depends(get_db)):
    """ジョブ投入時のパラメータおよびアセットメタデータを保存または更新する (UPSERT)"""
    try:
        persist_prompt_metadata(db, payload)
        db.commit()
        return {"status": "ok", "prompt_id": payload.prompt_id}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save prompt metadata: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save prompt metadata: {e}",
        )


@router.get("/{prompt_id}", response_model=PromptMetadataResponse)
def get_prompt_metadata(prompt_id: str, db: Session = Depends(get_db)):
    """指定された prompt_id のメタデータを取得する"""
    item = db.query(models.PromptMetadata).filter(
        models.PromptMetadata.prompt_id == prompt_id
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt metadata not found",
        )

    try:
        param_values = json.loads(item.param_values)
    except Exception:
        param_values = {}
    if isinstance(param_values, dict):
        completed_job = db.query(models.GenerationJob).filter(
            models.GenerationJob.prompt_id == prompt_id,
            models.GenerationJob.status == "succeeded",
            models.GenerationJob.finished_at.isnot(None),
        ).first()
        param_values = with_completed_at(
            param_values,
            completed_job.finished_at if completed_job is not None else None,
        )

    applied_assets = None
    if item.applied_assets:
        try:
            applied_assets = json.loads(item.applied_assets)
        except Exception:
            applied_assets = None

    return {
        "prompt_id": item.prompt_id,
        "workflow_id": item.workflow_id,
        "param_values": param_values,
        "applied_assets": applied_assets,
        "created_at": item.created_at.isoformat() if item.created_at else "",
    }
