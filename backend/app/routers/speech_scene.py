"""Speech scene generation router (REQ-291)."""

import asyncio
import json
import logging
from typing import Any, AsyncIterator

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.schemas.speech import SceneDraftRequest, SceneDraftResponse
from app.services import speech_scene_service
from app.services.speech_scene_service import (
    ProgressStatus,
    ProgressStepKey,
    SceneDraftError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech", tags=["speech-scene"])


_VLM_ERRORS = {
    "vlm_empty": "The language model returned no scene draft.",
    "vlm_filtered": "The language model could not complete this scene draft.",
    "vlm_invalid_json": "The language model returned an invalid scene draft.",
    "vlm_schema_invalid": "The language model returned an invalid scene draft.",
    "vlm_truncated": "The language model response was incomplete.",
}
_NOT_FOUND_PREFIXES = (
    "Snapshot not found:",
    "Image path missing for snapshot:",
    "Image file not found:",
    "Invalid similar scene override:",
)


def _classify_error(exc: Exception) -> tuple[str, int, str]:
    """Map service exceptions to stable, non-sensitive API errors."""
    if isinstance(exc, SceneDraftError):
        message = _VLM_ERRORS.get(exc.code)
        if message:
            return exc.code, status.HTTP_502_BAD_GATEWAY, message
        return "vlm_error", status.HTTP_502_BAD_GATEWAY, "The language model could not generate a scene draft."
    if isinstance(exc, httpx.TimeoutException):
        return "timeout", status.HTTP_504_GATEWAY_TIMEOUT, "Scene generation timed out."
    if isinstance(exc, httpx.ConnectError):
        return "connection_refused", status.HTTP_503_SERVICE_UNAVAILABLE, "The language model service is unavailable."
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code == 400:
            return "lm_studio_400", status.HTTP_502_BAD_GATEWAY, "The language model rejected the request."
        return "lm_studio_error", status.HTTP_502_BAD_GATEWAY, "The language model request failed."
    if isinstance(exc, httpx.RequestError):
        return "lm_studio_error", status.HTTP_503_SERVICE_UNAVAILABLE, "The language model service is unavailable."
    if isinstance(exc, RuntimeError) and exc.args and isinstance(exc.args[0], str) and exc.args[0].startswith("LM_STUDIO_"):
        if exc.args[0] == "LM_STUDIO_INSTANCE_NOT_READY":
            return "lm_studio_instance_not_ready", status.HTTP_503_SERVICE_UNAVAILABLE, "The language model is still starting."
        return "lm_studio_error", status.HTTP_503_SERVICE_UNAVAILABLE, "The language model service is unavailable."
    if isinstance(exc, ValueError):
        detail = exc.args[0] if exc.args and isinstance(exc.args[0], str) else ""
        if detail.startswith(_NOT_FOUND_PREFIXES):
            return "not_found", status.HTTP_404_NOT_FOUND, "The requested scene input was not found."
    return "scene_generation_failed", status.HTTP_500_INTERNAL_SERVER_ERROR, "Scene draft generation failed."


def _log_failure(error_kind: str, http_status: int, stage: str) -> None:
    logger.warning(
        "scene_draft_error code=%s http_status=%d stage=%s",
        error_kind,
        http_status,
        stage,
    )


@router.post("/scene-draft", response_model=SceneDraftResponse)
async def generate_scene_draft(
    payload: SceneDraftRequest,
    db: Session = Depends(get_db),
):
    stage: ProgressStepKey = "reference"

    async def on_progress(step: ProgressStepKey, _progress_status: ProgressStatus) -> None:
        nonlocal stage
        stage = step

    try:
        (
            interpretation,
            bubbles,
            vram_unloaded,
            tone_samples,
            selected_similar_scene_id,
            candidate_similar_scenes,
        ) = await speech_scene_service.generate_scene_script(
            db,
            payload.snapshot_id,
            payload.target_tag_set_id,
            payload.explicit_preset_id,
            payload.scene_hint,
            override_similar_scene_snapshot_id=payload.override_similar_scene_snapshot_id,
            progress_callback=on_progress,
        )
        logger.info("scene_draft_unload success=%s stage=vram", vram_unloaded)
        return SceneDraftResponse(
            scene_interpretation=interpretation,
            vram_unloaded=vram_unloaded,
            bubbles=bubbles,
            tone_samples=tone_samples,
            selected_similar_scene_id=selected_similar_scene_id,
            candidate_similar_scenes=candidate_similar_scenes,
        )
    except Exception as exc:
        error_kind, http_status, message = _classify_error(exc)
        _log_failure(error_kind, http_status, stage)
        raise HTTPException(
            status_code=http_status,
            detail={"error_kind": error_kind, "message": message, "status_code": http_status},
        ) from None


def _stream_error(exc: Exception) -> dict[str, Any]:
    """Return a safe NDJSON error event equivalent to the JSON API response."""
    kind, http_status, message = _classify_error(exc)
    return {
        "type": "error",
        "error_kind": kind,
        "message": message,
        "status_code": http_status,
    }


@router.post("/scene-draft/stream")
async def generate_scene_draft_stream(payload: SceneDraftRequest) -> StreamingResponse:
    """Stream real service progress as NDJSON and keep the DB session stream-scoped."""
    async def event_body() -> AsyncIterator[bytes]:
        db = SessionLocal()
        events: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue(maxsize=32)
        current_stage: ProgressStepKey = "reference"
        failed_stage: ProgressStepKey | None = None

        async def on_progress(step: ProgressStepKey, progress_status: ProgressStatus) -> None:
            nonlocal current_stage, failed_stage
            current_stage = step
            if progress_status == "error":
                failed_stage = step
            await events.put({"type": "progress", "step": step, "status": progress_status})

        async def produce() -> None:
            cancelled = False
            try:
                (
                    interpretation,
                    bubbles,
                    vram_unloaded,
                    tone_samples,
                    selected_similar_scene_id,
                    candidate_similar_scenes,
                ) = await speech_scene_service.generate_scene_script(
                    db,
                    payload.snapshot_id,
                    payload.target_tag_set_id,
                    payload.explicit_preset_id,
                    payload.scene_hint,
                    override_similar_scene_snapshot_id=payload.override_similar_scene_snapshot_id,
                    progress_callback=on_progress,
                )
                logger.info("scene_draft_unload success=%s stage=vram", vram_unloaded)
                if not vram_unloaded:
                    await events.put({
                        "type": "error",
                        "error_kind": "vram_unload_failed",
                        "message": "GPU memory cleanup failed.",
                        "status_code": status.HTTP_503_SERVICE_UNAVAILABLE,
                    })
                else:
                    result = SceneDraftResponse(
                        scene_interpretation=interpretation,
                        vram_unloaded=vram_unloaded,
                        bubbles=bubbles,
                        tone_samples=tone_samples,
                        selected_similar_scene_id=selected_similar_scene_id,
                        candidate_similar_scenes=candidate_similar_scenes,
                    )
                    await events.put({"type": "result", "data": result.model_dump(mode="json")})
            except asyncio.CancelledError:
                cancelled = True
                raise
            except Exception as exc:
                error_kind, http_status, _message = _classify_error(exc)
                _log_failure(error_kind, http_status, failed_stage or current_stage)
                await events.put(_stream_error(exc))
            finally:
                # Cancellation means the consumer is gone; never block cleanup
                # trying to enqueue a sentinel into a full queue.
                if not cancelled:
                    await events.put(None)

        producer = asyncio.create_task(produce())
        try:
            while True:
                event = await events.get()
                if event is None:
                    break
                yield (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")
            await producer
        finally:
            if not producer.done():
                producer.cancel()
            try:
                await producer
            except asyncio.CancelledError:
                pass
            finally:
                db.close()

    return StreamingResponse(event_body(), media_type="application/x-ndjson")
