import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pathlib import Path
import logging
from app.config import settings
from app.database import get_db, SessionLocal
from app import models, schemas
from app.services.llm_request import call_llm, load_image_as_base64

from app.services.speech_parser import (
    get_effective_speech_rewrite_system_prompt,
    call_llm_with_structured_dialogue,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech-batch", tags=["speech-batch"])

_batch_jobs: dict[str, schemas.SpeechBatchJobRead] = {}
_job_tasks: dict[str, asyncio.Task] = {}


async def _process_single_item(item: schemas.SpeechBatchJobItemRead, tone_prompt: str, model: Optional[str], llm_params: Optional[dict]):
    db = SessionLocal()
    try:
        system_prompt = get_effective_speech_rewrite_system_prompt(db)
    finally:
        db.close()

    user_prompt_parts = [
        f"【口調・キャラクター設定】\n{tone_prompt}",
        f"【元のセリフ】\n{item.original_text}"
    ]

    if item.scene_hint and item.scene_hint.strip():
        user_prompt_parts.append(f"【場面の状況・ヒント】\n{item.scene_hint.strip()}")

    if item.revision_instruction and item.revision_instruction.strip():
        user_prompt_parts.append(
            "【前回の変換結果に対する修正指示・ダメ出し】\n"
            + (f"直前の変換結果: {item.previous_rewritten_text}\n" if item.previous_rewritten_text else "")
            + f"修正指示・不満点: {item.revision_instruction.strip()}\n"
            + "※直前の変換結果で指摘された不満点・修正指示を忠実に反映し、同じ不満点が生じないよう改善したセリフに書き換えてください。"
        )

    image_b64 = None
    if item.include_image:
        db = SessionLocal()
        image_file_path = None
        try:
            if item.image_path:
                filename = item.image_path.split("/")[-1]
                candidate = Path(settings.snapshot_path) / filename
                if candidate.exists():
                    image_file_path = candidate
                elif Path(item.image_path).exists():
                    image_file_path = Path(item.image_path)
            elif item.snapshot_id:
                s = db.query(models.Snapshot).filter(models.Snapshot.id == item.snapshot_id).first()
                if s and s.image_path:
                    filename = s.image_path.split("/")[-1]
                    candidate = Path(settings.snapshot_path) / filename
                    if candidate.exists():
                        image_file_path = candidate
        finally:
            db.close()

        if image_file_path:
            try:
                image_b64 = load_image_as_base64(image_file_path)
                user_prompt_parts.append(
                    "※画像が添付されています。画像内のキャラクターの表情、視線、シチュエーション、場面の雰囲気を読み取って、その状況に最も適した感情・トーン・ニュアンスをセリフに反映してください。"
                )
            except Exception as e:
                logger.warning(f"Failed to load image for item {item.id}: {e}")

    user_prompt = "\n\n".join(user_prompt_parts)

    dialogue, interp, reasoning = await call_llm_with_structured_dialogue(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=model,
        llm_params=llm_params,
        image_data=image_b64,
    )
    item.rewritten_text = dialogue
    item.scene_interpretation = interp
    item.reasoning = reasoning


async def run_batch_job(job_id: str):
    job = _batch_jobs.get(job_id)
    if not job:
        return
    job.status = "processing"
    
    tone_prompt = job.tone_prompt
    if not tone_prompt and job.preset_id:
        db = SessionLocal()
        try:
            preset = db.query(models.SpeechTonePreset).filter(models.SpeechTonePreset.id == job.preset_id).first()
            if preset:
                tone_prompt = preset.prompt
        finally:
            db.close()
    
    if not tone_prompt:
        job.status = "failed"
        return

    try:
        for item in job.items:
            if item.status != "pending":
                continue
            item.status = "processing"
            try:
                await _process_single_item(item, tone_prompt, job.model, None)
                item.status = "completed"
                item.error = None
                job.completed_count += 1
            except asyncio.CancelledError:
                item.status = "cancelled"
                raise
            except Exception as e:
                item.status = "failed"
                item.error = str(e)
                job.failed_count += 1
        
        remaining = [i for i in job.items if i.status in ("pending", "processing")]
        if not remaining:
            if all(i.status == "cancelled" for i in job.items):
                job.status = "cancelled"
            else:
                job.status = "completed"
    except asyncio.CancelledError:
        job.status = "cancelled"
        for item in job.items:
            if item.status in ("pending", "processing"):
                item.status = "cancelled"
    finally:
        _job_tasks.pop(job_id, None)

@router.post("/jobs", response_model=schemas.SpeechBatchJobRead, status_code=status.HTTP_201_CREATED)
async def create_batch_job(payload: schemas.SpeechBatchJobCreate):
    job_id = uuid.uuid4().hex[:12]
    items = [
        schemas.SpeechBatchJobItemRead(
            id=item.id,
            snapshot_id=item.snapshot_id,
            bubble_id=item.bubble_id,
            bubble_index=item.bubble_index,
            original_text=item.text,
            status="pending",
            scene_hint=item.scene_hint,
            include_image=item.include_image,
            image_path=item.image_path,
        )
        for item in payload.items
    ]
    job = schemas.SpeechBatchJobRead(
        job_id=job_id,
        preset_id=payload.preset_id,
        tone_prompt=payload.tone_prompt,
        model=payload.model,
        status="pending",
        total_count=len(items),
        completed_count=0,
        failed_count=0,
        created_at=datetime.now(timezone.utc),
        items=items,
    )
    _batch_jobs[job_id] = job
    _job_tasks[job_id] = asyncio.create_task(run_batch_job(job_id))
    return job

@router.get("/jobs/active", response_model=Optional[schemas.SpeechBatchJobRead])
async def get_active_job():
    for job in reversed(list(_batch_jobs.values())):
        if job.status in ("processing", "pending"):
            return job
    if _batch_jobs:
        return list(_batch_jobs.values())[-1]
    return None

@router.get("/jobs/{job_id}", response_model=schemas.SpeechBatchJobRead)
async def get_batch_job(job_id: str):
    job = _batch_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    return job

@router.post("/jobs/{job_id}/cancel", response_model=schemas.SpeechBatchJobRead)
async def cancel_batch_job(job_id: str):
    job = _batch_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    task = _job_tasks.get(job_id)
    if task and not task.done():
        task.cancel()
    job.status = "cancelled"
    for item in job.items:
        if item.status in ("pending", "processing"):
            item.status = "cancelled"
    return job

@router.post("/jobs/{job_id}/items/{item_id}/cancel", response_model=schemas.SpeechBatchJobRead)
async def cancel_batch_item(job_id: str, item_id: str):
    job = _batch_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    for item in job.items:
        if item.id == item_id:
            item.status = "cancelled"
            break
    return job

@router.post("/jobs/{job_id}/items/{item_id}/retry", response_model=schemas.SpeechBatchJobRead)
async def retry_batch_item(
    job_id: str,
    item_id: str,
    payload: Optional[schemas.SpeechBatchItemRetryRequest] = None,
):
    job = _batch_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    found = False
    for item in job.items:
        if item.id == item_id:
            if payload:
                if payload.revision_instruction is not None:
                    item.previous_rewritten_text = item.rewritten_text
                    item.revision_instruction = payload.revision_instruction
                if payload.scene_hint is not None:
                    item.scene_hint = payload.scene_hint
                if payload.include_image is not None:
                    item.include_image = payload.include_image
            item.status = "pending"
            item.error = None
            found = True
            break
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found in job")
    
    if job.status in ("completed", "cancelled", "failed"):
        job.status = "processing"
    
    task = _job_tasks.get(job_id)
    if not task or task.done():
        _job_tasks[job_id] = asyncio.create_task(run_batch_job(job_id))
    return job

