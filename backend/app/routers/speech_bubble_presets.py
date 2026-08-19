"""Speech Bubble Preset CRUD router."""
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
        .filter(models.SpeechBubblePreset.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Preset with this name already exists",
        )

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

    if payload.name is not None and payload.name != preset.name:
        existing = (
            db.query(models.SpeechBubblePreset)
            .filter(
                models.SpeechBubblePreset.name == payload.name,
                models.SpeechBubblePreset.id != preset_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Preset with this name already exists",
            )

    update_data = payload.model_dump(exclude_unset=True)
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
