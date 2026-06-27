"""Snapshots router."""

import json
import urllib.request
import urllib.parse
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


@router.get("", response_model=list[schemas.SnapshotSummary])
def list_snapshots(
    workflow_id: Optional[int] = None,
    lora_id: Optional[int] = None,
    tag_set_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Snapshot)
    if workflow_id is not None:
        q = q.filter(models.Snapshot.workflow_id == workflow_id)
    if lora_id is not None:
        q = q.join(models.SnapshotLora).filter(models.SnapshotLora.lora_id == lora_id)
    if tag_set_id is not None:
        q = q.join(models.SnapshotTagSet).filter(models.SnapshotTagSet.tag_set_id == tag_set_id)
    if lora_id is not None or tag_set_id is not None:
        q = q.distinct()
    snapshots = q.order_by(models.Snapshot.created_at.desc()).all()
    return [
        schemas.SnapshotSummary(
            id=s.id,
            workflow_id=s.workflow_id,
            image_path=s.image_path,
            created_at=s.created_at,
            params=json.loads(s.params) if s.params else None
        ) for s in snapshots
    ]


@router.get("/{snapshot_id}", response_model=schemas.SnapshotRead)
def get_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    s = db.query(models.Snapshot).filter(models.Snapshot.id == snapshot_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return schemas.SnapshotRead(
        id=s.id,
        workflow_id=s.workflow_id,
        params=json.loads(s.params),
        image_path=s.image_path,
        created_at=s.created_at,
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
    target_album_id = None
    if payload.new_album_name:
        album = db.query(models.Album).filter(models.Album.name == payload.new_album_name).first()
        if not album:
            album = models.Album(name=payload.new_album_name)
            db.add(album)
            db.flush()
        target_album_id = album.id
    elif payload.album_id is not None:
        album = db.query(models.Album).filter(models.Album.id == payload.album_id).first()
        if not album:
            raise HTTPException(status_code=404, detail="Album not found")
        target_album_id = album.id

    saved_image_path = payload.image_path
    if payload.image_path and (payload.image_path.startswith("http://") or payload.image_path.startswith("https://")):
        try:
            parsed_url = urllib.parse.urlparse(payload.image_path)
            queries = urllib.parse.parse_qs(parsed_url.query)
            filename = queries.get("filename", [None])[0]
            
            if not filename:
                filename = Path(parsed_url.path).name
            if not filename or filename.strip() == "":
                filename = f"snapshot_{uuid.uuid4().hex}.png"
            else:
                ext = Path(filename).suffix or ".png"
                stem = Path(filename).stem
                filename = f"{stem}_{uuid.uuid4().hex[:8]}{ext}"
            
            target_dir = settings.snapshot_path
            target_path = target_dir / filename
            
            req = urllib.request.Request(
                payload.image_path, 
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                with open(target_path, 'wb') as f:
                    f.write(response.read())
            
            saved_image_path = f"/api/snapshots/images/{filename}"
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to download snapshot image from {payload.image_path}: {e}")

    s = models.Snapshot(
        workflow_id=payload.workflow_id,
        params=json.dumps(payload.params),
        image_path=saved_image_path,
    )
    db.add(s)
    db.flush()

    if target_album_id is not None:
        max_order = db.query(func.max(models.AlbumItem.sequence_order)).filter(
            models.AlbumItem.album_id == target_album_id
        ).scalar()
        next_order = (max_order + 1) if max_order is not None else 0
        
        album_item = models.AlbumItem(
            album_id=target_album_id,
            snapshot_id=s.id,
            sequence_order=next_order
        )
        db.add(album_item)

    if payload.loras:
        for l in payload.loras:
            db.add(models.SnapshotLora(
                snapshot_id=s.id,
                lora_id=l.lora_id,
                strength=l.strength,
                role=l.role
            ))

    if payload.tag_sets:
        for t in payload.tag_sets:
            db.add(models.SnapshotTagSet(
                snapshot_id=s.id,
                tag_set_id=t.tag_set_id,
                role=t.role
            ))

    db.commit()
    db.refresh(s)
    return schemas.SnapshotSummary(
        id=s.id,
        workflow_id=s.workflow_id,
        image_path=s.image_path,
        created_at=s.created_at,
        params=json.loads(s.params) if s.params else None
    )


@router.delete("/{snapshot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    s = db.query(models.Snapshot).filter(models.Snapshot.id == snapshot_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    db.delete(s)
    db.commit()


@router.patch("/{snapshot_id}", response_model=schemas.SnapshotRead)
def update_snapshot(snapshot_id: int, payload: schemas.SnapshotUpdate, db: Session = Depends(get_db)):
    s = db.query(models.Snapshot).filter(models.Snapshot.id == snapshot_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    # Validate that lora_ids and tag_set_ids exist
    for lora_id in payload.lora_ids:
        exists = db.query(models.Lora).filter(models.Lora.id == lora_id).first()
        if not exists:
            raise HTTPException(status_code=400, detail=f"Lora with ID {lora_id} does not exist")

    for tag_set_id in payload.tag_set_ids:
        exists = db.query(models.TagSet).filter(models.TagSet.id == tag_set_id).first()
        if not exists:
            raise HTTPException(status_code=400, detail=f"TagSet with ID {tag_set_id} does not exist")

    # Delete existing lora/tag_set relations
    db.query(models.SnapshotLora).filter(models.SnapshotLora.snapshot_id == snapshot_id).delete()
    db.query(models.SnapshotTagSet).filter(models.SnapshotTagSet.snapshot_id == snapshot_id).delete()

    # Create new relations
    for lora_id in payload.lora_ids:
        db.add(models.SnapshotLora(
            snapshot_id=snapshot_id,
            lora_id=lora_id,
            strength=1.0,
            role="positive"
        ))

    for tag_set_id in payload.tag_set_ids:
        db.add(models.SnapshotTagSet(
            snapshot_id=snapshot_id,
            tag_set_id=tag_set_id,
            role="positive"
        ))

    db.commit()
    db.refresh(s)
    return get_snapshot(snapshot_id, db)


@router.post("/upload")
async def upload_snapshot_image(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix or ".png"
    if ext.lower() not in [".png", ".jpg", ".jpeg", ".webp"]:
        ext = ".png"
    filename = f"upload_{uuid.uuid4().hex}{ext}"
    
    target_dir = settings.snapshot_path
    target_path = target_dir / filename
    
    try:
        content = await file.read()
        with open(target_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded file: {str(e)}"
        )
        
    return {"image_path": f"/api/snapshots/images/{filename}"}

