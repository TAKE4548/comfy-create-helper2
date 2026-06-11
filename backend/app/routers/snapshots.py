"""Snapshots router."""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


@router.get("", response_model=list[schemas.SnapshotSummary])
def list_snapshots(workflow_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.Snapshot)
    if workflow_id is not None:
        q = q.filter(models.Snapshot.workflow_id == workflow_id)
    return q.order_by(models.Snapshot.created_at.desc()).all()


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
                strength=l.strength
            ) for l in s.loras
        ],
        tag_sets=[
            schemas.SnapshotTagSetRead(
                id=t.id,
                snapshot_id=t.snapshot_id,
                tag_set_id=t.tag_set_id
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

    s = models.Snapshot(
        workflow_id=payload.workflow_id,
        params=json.dumps(payload.params),
        image_path=payload.image_path,
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
                strength=l.strength
            ))

    if payload.tag_sets:
        for t in payload.tag_sets:
            db.add(models.SnapshotTagSet(
                snapshot_id=s.id,
                tag_set_id=t.tag_set_id
            ))

    db.commit()
    db.refresh(s)
    return s


@router.delete("/{snapshot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    s = db.query(models.Snapshot).filter(models.Snapshot.id == snapshot_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    db.delete(s)
    db.commit()
