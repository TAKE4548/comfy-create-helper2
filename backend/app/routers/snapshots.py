"""Snapshots router."""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
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
    )


@router.post("", response_model=schemas.SnapshotSummary, status_code=status.HTTP_201_CREATED)
def create_snapshot(payload: schemas.SnapshotCreate, db: Session = Depends(get_db)):
    s = models.Snapshot(
        workflow_id=payload.workflow_id,
        params=json.dumps(payload.params),
        image_path=payload.image_path,
    )
    db.add(s)
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
