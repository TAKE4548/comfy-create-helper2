import json
import urllib.request
import urllib.parse
import uuid
import logging
import os
from pathlib import Path
from typing import Optional, Any
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app import models, schemas

logger = logging.getLogger(__name__)


class SnapshotService:
    @staticmethod
    def list_snapshots(
        db: Session,
        workflow_id: Optional[int] = None,
        lora_id: Optional[int] = None,
        tag_set_id: Optional[int] = None
    ) -> list[models.Snapshot]:
        q = db.query(models.Snapshot)
        if workflow_id is not None:
            q = q.filter(models.Snapshot.workflow_id == workflow_id)
        if lora_id is not None:
            q = q.join(models.SnapshotLora).filter(models.SnapshotLora.lora_id == lora_id)
        if tag_set_id is not None:
            q = q.join(models.SnapshotTagSet).filter(models.SnapshotTagSet.tag_set_id == tag_set_id)
        if lora_id is not None or tag_set_id is not None:
            q = q.distinct()
        return q.order_by(models.Snapshot.created_at.desc()).all()

    @staticmethod
    def get_snapshot(db: Session, snapshot_id: int) -> Optional[models.Snapshot]:
        return db.query(models.Snapshot).filter(models.Snapshot.id == snapshot_id).first()

    @staticmethod
    def create_snapshot(db: Session, payload: schemas.SnapshotCreate) -> models.Snapshot:
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
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
            target_album_id = album.id

        saved_image_path = payload.image_path
        downloaded_file_path: Optional[Path] = None

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
                
                downloaded_file_path = target_path
                saved_image_path = f"/api/snapshots/images/{filename}"
            except Exception as e:
                logger.error(f"Failed to download snapshot image from {payload.image_path}: {e}")

        try:
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
                # (lora_id, role) をキーとして重複排除 (後勝ち)
                deduped_loras = {(l.lora_id, l.role): l for l in payload.loras}
                for l in deduped_loras.values():
                    db.add(models.SnapshotLora(
                        snapshot_id=s.id,
                        lora_id=l.lora_id,
                        strength=l.strength,
                        role=l.role
                    ))

            if payload.tag_sets:
                # (tag_set_id, role) をキーとして重複排除 (後勝ち)
                deduped_tag_sets = {(t.tag_set_id, t.role): t for t in payload.tag_sets}
                for t in deduped_tag_sets.values():
                    db.add(models.SnapshotTagSet(
                        snapshot_id=s.id,
                        tag_set_id=t.tag_set_id,
                        role=t.role
                    ))

            db.commit()
            db.refresh(s)
            return s
        except Exception as db_err:
            db.rollback()
            if downloaded_file_path and downloaded_file_path.exists():
                try:
                    os.remove(downloaded_file_path)
                except OSError as os_err:
                    logger.error(f"Failed to clean up downloaded image file {downloaded_file_path}: {os_err}")
            raise db_err

    @staticmethod
    def update_snapshot(db: Session, snapshot_id: int, payload: schemas.SnapshotUpdate) -> models.Snapshot:
        s = db.query(models.Snapshot).filter(models.Snapshot.id == snapshot_id).first()
        if not s:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")

        # Validate that lora_ids and tag_set_ids exist
        for lora_id in payload.lora_ids:
            exists = db.query(models.Lora).filter(models.Lora.id == lora_id).first()
            if not exists:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Lora with ID {lora_id} does not exist")

        for tag_set_id in payload.tag_set_ids:
            exists = db.query(models.TagSet).filter(models.TagSet.id == tag_set_id).first()
            if not exists:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"TagSet with ID {tag_set_id} does not exist")

        try:
            # Delete existing lora/tag_set relations
            db.query(models.SnapshotLora).filter(models.SnapshotLora.snapshot_id == snapshot_id).delete()
            db.query(models.SnapshotTagSet).filter(models.SnapshotTagSet.snapshot_id == snapshot_id).delete()

            # Create new relations (重複排除してから登録)
            for lora_id in set(payload.lora_ids):
                db.add(models.SnapshotLora(
                    snapshot_id=snapshot_id,
                    lora_id=lora_id,
                    strength=1.0,
                    role="positive"
                ))

            for tag_set_id in set(payload.tag_set_ids):
                db.add(models.SnapshotTagSet(
                    snapshot_id=snapshot_id,
                    tag_set_id=tag_set_id,
                    role="positive"
                ))

            db.commit()
            db.refresh(s)
            return s
        except Exception as db_err:
            db.rollback()
            raise db_err

    @staticmethod
    def delete_snapshot(db: Session, snapshot_id: int) -> None:
        s = db.query(models.Snapshot).filter(models.Snapshot.id == snapshot_id).first()
        if not s:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
        try:
            db.delete(s)
            db.commit()
        except Exception as db_err:
            db.rollback()
            raise db_err

    @staticmethod
    async def save_uploaded_image(file: UploadFile) -> str:
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
            
        return f"/api/snapshots/images/{filename}"
