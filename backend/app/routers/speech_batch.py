import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple
from fastapi import APIRouter, HTTPException, status
from pathlib import Path
import logging
from app.config import settings
from app.database import get_db_context
from app import models, schemas
from app.services.llm_request import load_image_as_base64
from app.services.speech_parser import (
    get_effective_speech_rewrite_system_prompt,
    call_llm_with_structured_dialogue,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech-batch", tags=["speech-batch"])


def _sync_fetch_batch_prerequisites(preset_id: Optional[int]) -> Tuple[str, Optional[str]]:
    """DBからシステムプロンプトとトーンプリセットを一括取得（同期実行・スレッドプール用）"""
    with get_db_context() as db:
        system_prompt = get_effective_speech_rewrite_system_prompt(db)
        tone_prompt = None
        if preset_id:
            preset = db.query(models.SpeechTonePreset).filter(models.SpeechTonePreset.id == preset_id).first()
            if preset:
                tone_prompt = preset.prompt
        return system_prompt, tone_prompt


def _sync_load_item_image(image_path: Optional[str], snapshot_id: Optional[int]) -> Optional[str]:
    """ディスクおよびDBから画像ファイルを探索しBase64文字列化（同期実行・スレッドプール用）"""
    image_file_path = None
    if image_path:
        filename = image_path.split("/")[-1]
        candidate = Path(settings.snapshot_path) / filename
        if candidate.exists():
            image_file_path = candidate
        elif Path(image_path).exists():
            image_file_path = Path(image_path)
    elif snapshot_id:
        with get_db_context() as db:
            s = db.query(models.Snapshot).filter(models.Snapshot.id == snapshot_id).first()
            if s and s.image_path:
                filename = s.image_path.split("/")[-1]
                candidate = Path(settings.snapshot_path) / filename
                if candidate.exists():
                    image_file_path = candidate

    if image_file_path:
        try:
            return load_image_as_base64(image_file_path)
        except Exception as e:
            logger.warning(f"Failed to load image at {image_file_path}: {e}")
    return None


async def _process_single_item(
    item: schemas.SpeechBatchJobItemRead,
    system_prompt: str,
    tone_prompt: str,
    model: Optional[str],
    llm_params: Optional[dict],
):
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
        image_b64 = await asyncio.to_thread(_sync_load_item_image, item.image_path, item.snapshot_id)
        if image_b64:
            user_prompt_parts.append(
                "※画像が添付されています。画像内のキャラクターの表情、視線、シチュエーション、場面の雰囲気を読み取って、その状況に最も適した感情・トーン・ニュアンスをセリフに反映してください。"
            )

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


class SpeechBatchManager:
    """スレッドセーフなバッチジョブ・ライフサイクル管理者"""

    def __init__(self, max_history: int = 100):
        self._jobs: dict[str, schemas.SpeechBatchJobRead] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()
        self._max_history = max_history

    def _prune_old_jobs_locked(self) -> None:
        """保持件数が max_history を超過した場合、完了・キャンセル・失敗済みの最古ジョブから順に安全削除"""
        if len(self._jobs) >= self._max_history:
            finished_keys = [
                k for k, v in self._jobs.items()
                if v.status in ("completed", "cancelled", "failed")
            ]
            excess = len(self._jobs) - self._max_history + 1
            for k in finished_keys[:excess]:
                self._jobs.pop(k, None)

    async def create_job(self, payload: schemas.SpeechBatchJobCreate) -> schemas.SpeechBatchJobRead:
        async with self._lock:
            self._prune_old_jobs_locked()
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
            self._jobs[job_id] = job
            task = asyncio.create_task(run_batch_job(job_id))
            self._tasks[job_id] = task
            task.add_done_callback(lambda t, jid=job_id: self._tasks.pop(jid, None))
            return job

    async def get_job(self, job_id: str) -> Optional[schemas.SpeechBatchJobRead]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def get_active_job(self) -> Optional[schemas.SpeechBatchJobRead]:
        async with self._lock:
            for job in reversed(list(self._jobs.values())):
                if job.status in ("processing", "pending"):
                    return job
            if self._jobs:
                return list(self._jobs.values())[-1]
            return None

    async def cancel_job(self, job_id: str) -> Optional[schemas.SpeechBatchJobRead]:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            task = self._tasks.get(job_id)
            if task and not task.done():
                task.cancel()
            job.status = "cancelled"
            for item in job.items:
                if item.status in ("pending", "processing"):
                    item.status = "cancelled"
            return job

    async def cancel_item(self, job_id: str, item_id: str) -> Optional[schemas.SpeechBatchJobRead]:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            for item in job.items:
                if item.id == item_id:
                    item.status = "cancelled"
                    break
            return job

    async def retry_item(
        self,
        job_id: str,
        item_id: str,
        payload: Optional[schemas.SpeechBatchItemRetryRequest] = None,
    ) -> Optional[schemas.SpeechBatchJobRead]:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
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
                return None

            if job.status in ("completed", "cancelled", "failed"):
                job.status = "processing"

            task = self._tasks.get(job_id)
            if not task or task.done():
                new_task = asyncio.create_task(run_batch_job(job_id))
                self._tasks[job_id] = new_task
                new_task.add_done_callback(lambda t, jid=job_id: self._tasks.pop(jid, None))
            return job


batch_manager = SpeechBatchManager()


async def run_batch_job(job_id: str):
    try:
        job = await batch_manager.get_job(job_id)
        if not job:
            return
        job.status = "processing"

        system_prompt, preset_tone = await asyncio.to_thread(_sync_fetch_batch_prerequisites, job.preset_id)
        tone_prompt = job.tone_prompt or preset_tone

        if not tone_prompt:
            job.status = "failed"
            return

        try:
            for item in job.items:
                if item.status != "pending":
                    continue
                item.status = "processing"
                try:
                    await _process_single_item(item, system_prompt, tone_prompt, job.model, None)
                    item.status = "completed"
                    item.error = None
                    job.completed_count += 1
                except asyncio.CancelledError:
                    item.status = "cancelled"
                    raise
                except Exception as e:
                    logger.exception(f"Item processing failed for {item.id}: {e}")
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
    except Exception as e:
        logger.exception(f"Unhandled error in run_batch_job for {job_id}: {e}")


@router.post("/jobs", response_model=schemas.SpeechBatchJobRead, status_code=status.HTTP_201_CREATED)
async def create_batch_job(payload: schemas.SpeechBatchJobCreate):
    return await batch_manager.create_job(payload)


@router.get("/jobs/active", response_model=Optional[schemas.SpeechBatchJobRead])
async def get_active_job():
    return await batch_manager.get_active_job()


@router.get("/jobs/{job_id}", response_model=schemas.SpeechBatchJobRead)
async def get_batch_job(job_id: str):
    job = await batch_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    return job


@router.post("/jobs/{job_id}/cancel", response_model=schemas.SpeechBatchJobRead)
async def cancel_batch_job(job_id: str):
    job = await batch_manager.cancel_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    return job


@router.post("/jobs/{job_id}/items/{item_id}/cancel", response_model=schemas.SpeechBatchJobRead)
async def cancel_batch_item(job_id: str, item_id: str):
    job = await batch_manager.cancel_item(job_id, item_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job not found")
    return job


@router.post("/jobs/{job_id}/items/{item_id}/retry", response_model=schemas.SpeechBatchJobRead)
async def retry_batch_item(
    job_id: str,
    item_id: str,
    payload: Optional[schemas.SpeechBatchItemRetryRequest] = None,
):
    job = await batch_manager.retry_item(job_id, item_id, payload)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch job or item not found")
    return job


