import io
import json
from typing import Optional
from pathlib import Path
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse, Response
from PIL import Image
from sqlalchemy.orm import Session

from app.database import get_db
from app import schemas
from app.services.snapshot_service import SnapshotService
from app.config import settings

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


@router.get("", response_model=list[schemas.SnapshotSummary])
def list_snapshots(
    workflow_id: Optional[int] = None,
    lora_id: Optional[int] = None,
    tag_set_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    snapshots = SnapshotService.list_snapshots(db, workflow_id, lora_id, tag_set_id)
    return [
        schemas.SnapshotSummary(
            id=s.id,
            workflow_id=s.workflow_id,
            image_path=s.image_path,
            thumbnail_path=s.thumbnail_path,
            created_at=s.created_at,
            params=json.loads(s.params) if s.params else None,
            source_snapshot_id=s.source_snapshot_id
        ) for s in snapshots
    ]


@router.get("/{snapshot_id}", response_model=schemas.SnapshotRead)
def get_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    s = SnapshotService.get_snapshot(db, snapshot_id)
    if not s:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return schemas.SnapshotRead(
        id=s.id,
        workflow_id=s.workflow_id,
        params=json.loads(s.params),
        image_path=s.image_path,
        thumbnail_path=s.thumbnail_path,
        created_at=s.created_at,
        source_snapshot_id=s.source_snapshot_id,
        loras=[
            schemas.SnapshotLoraRead(
                id=l.id,
                snapshot_id=l.snapshot_id,
                lora_id=l.lora_id,
                strength=l.strength,
                role=l.role
            ) for l in s.loras
        ],
        tag_sets=[
            schemas.SnapshotTagSetRead(
                id=t.id,
                snapshot_id=t.snapshot_id,
                tag_set_id=t.tag_set_id,
                role=t.role
            ) for t in s.tag_sets
        ]
    )


@router.post("", response_model=schemas.SnapshotSummary, status_code=status.HTTP_201_CREATED)
def create_snapshot(payload: schemas.SnapshotCreate, db: Session = Depends(get_db)):
    s = SnapshotService.create_snapshot(db, payload)
    if payload.source_snapshot_id is not None:
        s.source_snapshot_id = payload.source_snapshot_id
        db.commit()
        db.refresh(s)
    return schemas.SnapshotSummary(
        id=s.id,
        workflow_id=s.workflow_id,
        image_path=s.image_path,
        thumbnail_path=s.thumbnail_path,
        created_at=s.created_at,
        params=json.loads(s.params) if s.params else None,
        source_snapshot_id=s.source_snapshot_id
    )


@router.delete("/{snapshot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    SnapshotService.delete_snapshot(db, snapshot_id)


@router.patch("/{snapshot_id}", response_model=schemas.SnapshotRead)
def update_snapshot(snapshot_id: int, payload: schemas.SnapshotUpdate, db: Session = Depends(get_db)):
    SnapshotService.update_snapshot(db, snapshot_id, payload)
    return get_snapshot(snapshot_id, db)


@router.post("/upload")
async def upload_snapshot_image(file: UploadFile = File(...)):
    image_path, thumbnail_path = await SnapshotService.save_uploaded_image(file)
    return {"image_path": image_path, "thumbnail_path": thumbnail_path}


@router.get("/{snapshot_id}/download")
def download_snapshot(
    snapshot_id: int,
    format: Optional[str] = "webp",
    db: Session = Depends(get_db)
):
    s = SnapshotService.get_snapshot(db, snapshot_id)
    if not s or not s.image_path:
        raise HTTPException(status_code=404, detail="Snapshot or image not found")
    
    filename = s.image_path.split("/")[-1]
    file_path = Path(settings.snapshot_path) / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    fmt = (format or "webp").lower()
    if fmt not in ["webp", "png", "jpeg", "jpg"]:
        raise HTTPException(status_code=400, detail="Unsupported format. Choose from webp, png, jpeg")

    if fmt in ["jpeg", "jpg"]:
        target_ext = "jpg"
        media_type = "image/jpeg"
        pil_format = "JPEG"
    elif fmt == "png":
        target_ext = "png"
        media_type = "image/png"
        pil_format = "PNG"
    else:
        target_ext = "webp"
        media_type = "image/webp"
        pil_format = "WEBP"

    download_filename = f"snapshot_{snapshot_id}.{target_ext}"

    orig_ext = file_path.suffix.lower().lstrip(".")
    if (orig_ext in ["jpg", "jpeg"] and fmt in ["jpg", "jpeg"]) or (orig_ext == fmt):
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=download_filename
        )

    try:
        with Image.open(file_path) as img:
            out_io = io.BytesIO()
            if pil_format == "JPEG" and img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(out_io, format=pil_format)
            out_io.seek(0)
            return Response(
                content=out_io.getvalue(),
                media_type=media_type,
                headers={"Content-Disposition": f'attachment; filename="{download_filename}"'}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to convert image format: {str(e)}")


class ROIRequest(BaseModel):
    roi: dict  # {x, y, w, h}


@router.post("/{snapshot_id}/detect-bubble")
def detect_bubble_endpoint(snapshot_id: int, db: Session = Depends(get_db)):
    s = SnapshotService.get_snapshot(db, snapshot_id)
    if not s or not s.image_path:
        raise HTTPException(status_code=404, detail="Snapshot or image not found")
    from app.services.bubble_detector import detect_bubble
    from app.config import settings
    from app import models
    filename = s.image_path.split("/")[-1]
    full_path = Path(settings.snapshot_path) / filename

    min_area = 1000
    min_brightness = 150
    setting = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "bubble_detection_params").first()
    if setting and setting.content:
        try:
            params = json.loads(setting.content)
            min_area = params.get("min_area", 1000)
            min_brightness = params.get("min_brightness", 150)
        except Exception:
            pass

    result = detect_bubble(str(full_path), min_area=min_area, min_brightness=min_brightness)
    return {"bounding_box": result, "confidence": result["confidence"] if result else 0.0}


@router.post("/{snapshot_id}/detect-bubble-roi")
def detect_bubble_roi_endpoint(snapshot_id: int, payload: ROIRequest, db: Session = Depends(get_db)):
    s = SnapshotService.get_snapshot(db, snapshot_id)
    if not s or not s.image_path:
        raise HTTPException(status_code=404, detail="Snapshot or image not found")
    from app.services.bubble_detector import detect_bubble
    from app.config import settings
    from app import models
    filename = s.image_path.split("/")[-1]
    full_path = Path(settings.snapshot_path) / filename

    min_area = 1000
    min_brightness = 150
    setting = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "bubble_detection_params").first()
    if setting and setting.content:
        try:
            params = json.loads(setting.content)
            min_area = params.get("min_area", 1000)
            min_brightness = params.get("min_brightness", 150)
        except Exception:
            pass

    result = detect_bubble(str(full_path), roi=payload.roi, min_area=min_area, min_brightness=min_brightness)
    return {"bounding_box": result, "confidence": result["confidence"] if result else 0.0}


class BubbleDebugRequest(BaseModel):
    roi: Optional[dict] = None


@router.post("/{snapshot_id}/detect-bubble-debug")
def detect_bubble_debug_endpoint(snapshot_id: int, payload: BubbleDebugRequest, db: Session = Depends(get_db)):
    s = SnapshotService.get_snapshot(db, snapshot_id)
    if not s or not s.image_path:
        raise HTTPException(status_code=404, detail="Snapshot or image not found")
    from app.services.bubble_detector import detect_bubble_candidates
    from app.config import settings
    from app import models
    filename = s.image_path.split("/")[-1]
    full_path = Path(settings.snapshot_path) / filename

    min_area = 1000
    min_brightness = 150
    setting = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "bubble_detection_params").first()
    if setting and setting.content:
        try:
            params = json.loads(setting.content)
            min_area = params.get("min_area", 1000)
            min_brightness = params.get("min_brightness", 150)
        except Exception:
            pass

    candidates = detect_bubble_candidates(
        str(full_path),
        roi=payload.roi,
        min_area=min_area,
        min_brightness=min_brightness
    )
    return {"candidates": candidates}


