"""Router for managing prompt generation metadata."""
import json
import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app import models

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prompt-metadata", tags=["prompt-metadata"])


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


@router.post("", response_model=Dict[str, Any])
def save_prompt_metadata(payload: PromptMetadataCreate, db: Session = Depends(get_db)):
    """ジョブ投入時のパラメータおよびアセットメタデータを保存または更新する (UPSERT)"""
    try:
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
            new_item = models.PromptMetadata(
                prompt_id=payload.prompt_id,
                workflow_id=payload.workflow_id,
                param_values=param_values_str,
                applied_assets=applied_assets_str,
            )
            db.add(new_item)

        db.commit()

        # 上限1000件を超過した古いメタデータを自動削除 (LRUクリーンアップ)
        total_count = db.query(models.PromptMetadata).count()
        if total_count > 1000:
            oldest_ids = [
                row[0]
                for row in db.query(models.PromptMetadata.prompt_id)
                .order_by(models.PromptMetadata.created_at.asc())
                .limit(total_count - 1000)
                .all()
            ]
            if oldest_ids:
                db.query(models.PromptMetadata).filter(
                    models.PromptMetadata.prompt_id.in_(oldest_ids)
                ).delete(synchronize_session=False)
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
