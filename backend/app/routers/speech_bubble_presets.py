"""Speech Bubble Preset CRUD router."""
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/speech-bubble-presets", tags=["speech-bubble-presets"])


@router.get("", response_model=list[schemas.SpeechBubblePresetRead])
def list_speech_bubble_presets(db: Session = Depends(get_db)):
    """List all speech bubble presets ordered by sort_order asc and id asc."""
    return (
        db.query(models.SpeechBubblePreset)
        .order_by(models.SpeechBubblePreset.sort_order.asc(), models.SpeechBubblePreset.id.asc())
        .all()
    )


@router.post("", response_model=schemas.SpeechBubblePresetRead, status_code=status.HTTP_201_CREATED)
def create_speech_bubble_preset(
    payload: schemas.SpeechBubblePresetCreate,
    db: Session = Depends(get_db),
):
    """Create a new speech bubble preset."""
    existing = (
        db.query(models.SpeechBubblePreset)
        .filter(
            models.SpeechBubblePreset.name == payload.name,
            models.SpeechBubblePreset.orientation == payload.orientation,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Preset with this name and orientation already exists",
        )

    effects_json = "{}"
    if payload.effects is not None:
        effects_json = json.dumps(payload.effects)

    preset = models.SpeechBubblePreset(
        name=payload.name,
        shape=payload.shape,
        orientation=payload.orientation,
        font_family=payload.font_family,
        font_size=payload.font_size,
        text_color=payload.text_color,
        background_color=payload.background_color,
        border_color=payload.border_color,
        border_width=payload.border_width,
        sort_order=payload.sort_order,
        effects_json=effects_json,
        text=payload.text,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


@router.put("/{preset_id}", response_model=schemas.SpeechBubblePresetRead)
def update_speech_bubble_preset(
    preset_id: int,
    payload: schemas.SpeechBubblePresetUpdate,
    db: Session = Depends(get_db),
):
    """Update an existing speech bubble preset."""
    preset = (
        db.query(models.SpeechBubblePreset)
        .filter(models.SpeechBubblePreset.id == preset_id)
        .first()
    )
    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preset not found",
        )

    target_name = payload.name if payload.name is not None else preset.name
    target_orientation = payload.orientation if payload.orientation is not None else preset.orientation
    if target_name != preset.name or target_orientation != preset.orientation:
        existing = (
            db.query(models.SpeechBubblePreset)
            .filter(
                models.SpeechBubblePreset.name == target_name,
                models.SpeechBubblePreset.orientation == target_orientation,
                models.SpeechBubblePreset.id != preset_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Preset with this name and orientation already exists",
            )

    update_data = payload.model_dump(exclude_unset=True)
    if "effects" in update_data:
        effects_val = update_data.pop("effects")
        preset.effects_json = json.dumps(effects_val) if effects_val is not None else "{}"

    for field, val in update_data.items():
        setattr(preset, field, val)

    db.commit()
    db.refresh(preset)
    return preset


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_speech_bubble_preset(
    preset_id: int,
    db: Session = Depends(get_db),
):
    """Delete a speech bubble preset."""
    preset = (
        db.query(models.SpeechBubblePreset)
        .filter(models.SpeechBubblePreset.id == preset_id)
        .first()
    )
    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preset not found",
        )

    db.delete(preset)
    db.commit()
    return None
