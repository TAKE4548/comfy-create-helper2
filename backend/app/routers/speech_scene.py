"""Speech scene generation router (REQ-291)."""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.speech import SceneDraftRequest, SceneDraftResponse
from app.services import speech_scene_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech", tags=["speech-scene"])


@router.post("/scene-draft", response_model=SceneDraftResponse)
async def generate_scene_draft(
    payload: SceneDraftRequest,
    db: Session = Depends(get_db),
):
    try:
        (
            interpretation,
            bubbles,
            vram_unloaded,
            tone_char,
            scene_prompt,
        ) = await speech_scene_service.generate_scene_script(
            db,
            payload.snapshot_id,
            payload.target_tag_set_id,
            payload.explicit_preset_id,
            payload.scene_hint,
        )
        return SceneDraftResponse(
            scene_interpretation=interpretation,
            reference_tone_char=tone_char,
            reference_scene_prompt=scene_prompt,
            vram_unloaded=vram_unloaded,
            bubbles=bubbles,
        )
    except ValueError as e:
        logger.warning(f"Bad request in generate_scene_draft: {e}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Error in generate_scene_draft: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Scene draft generation failed: {e}",
        )
