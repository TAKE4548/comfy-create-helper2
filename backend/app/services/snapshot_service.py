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


import io
from PIL import Image

def process_and_save_image(image_bytes: bytes, target_dir: Path, filename_base: str) -> tuple[str, str]:
    try:
        opened_image = Image.open(io.BytesIO(image_bytes))
        img = opened_image.convert("RGBA") if opened_image.mode not in ("RGB", "RGBA") else opened_image
        
        img_filename = f"{filename_base}.webp"
        img_path = target_dir / img_filename
        img.save(img_path, format="WEBP", quality=90)
        
        thumb_img = img.copy()
        thumb_img.thumbnail((300, 300))
        thumb_filename = f"thumb_{filename_base}.webp"
        thumb_path = target_dir / thumb_filename
        thumb_img.save(thumb_path, format="WEBP", quality=80)
        
        return f"/api/snapshots/images/{img_filename}", f"/api/snapshots/images/{thumb_filename}"
    except Exception as e:
        logger.warning(f"Image processing failed, saving raw file: {e}")
        filename = f"{filename_base}.png"
        file_path = target_dir / filename
        with open(file_path, "wb") as f:
            f.write(image_bytes)
        path_str = f"/api/snapshots/images/{filename}"
        return path_str, path_str


def resolve_internal_comfy_url(url: Optional[str], base_url: str) -> str:
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlparse(url)
        # Check if path corresponds to ComfyUI /view endpoint
        if parsed.path.startswith("/view") or "/view" in parsed.path:
            base_parsed = urllib.parse.urlparse(base_url.rstrip("/"))
            # Reconstruct with base_url's scheme and netloc while preserving path, query, fragment
            resolved = urllib.parse.urlunparse((
                base_parsed.scheme,
                base_parsed.netloc,
                parsed.path,
                parsed.params,
                parsed.query,
                parsed.fragment
            ))
            return resolved
        return url
    except Exception:
        return url


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
        saved_thumbnail_path = payload.thumbnail_path
        downloaded_file_path: Optional[Path] = None

        if payload.image_path and (payload.image_path.startswith("http://") or payload.image_path.startswith("https://")):
            target_download_url = resolve_internal_comfy_url(payload.image_path, settings.comfy_url)
            try:
                parsed_url = urllib.parse.urlparse(target_download_url)
                queries = urllib.parse.parse_qs(parsed_url.query)
                filename = queries.get("filename", [None])[0]
                
                if not filename:
                    filename = Path(parsed_url.path).name
                stem = Path(filename).stem if (filename and filename.strip()) else "snapshot"
                filename_base = f"{stem}_{uuid.uuid4().hex[:8]}"
                
                req = urllib.request.Request(
                    target_download_url, 
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    image_bytes = response.read()

                saved_image_path, saved_thumbnail_path = process_and_save_image(
                    image_bytes, settings.snapshot_path, filename_base
                )
                downloaded_file_path = settings.snapshot_path / Path(saved_image_path).name
            except Exception as e:
                logger.error(f"Failed to download snapshot image from {target_download_url} (original: {payload.image_path}): {e}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to download snapshot image from ComfyUI: {e}"
                )

        elif payload.image_path and payload.image_path.startswith("/api/snapshots/images/") and not saved_thumbnail_path:
            filename = payload.image_path.split("/")[-1]
            target_dir = settings.snapshot_path
            orig_file = target_dir / filename
            if orig_file.exists():
                thumb_filename = f"thumb_{filename}"
                thumb_file = target_dir / thumb_filename
                if not thumb_file.exists():
                    try:
                        with open(orig_file, "rb") as f:
                            img_bytes = f.read()
                        stem = Path(filename).stem
                        if stem.startswith("thumb_"):
                            stem = stem[6:]
                        _, saved_thumbnail_path = process_and_save_image(img_bytes, target_dir, stem)
                    except Exception as e:
                        logger.error(f"Failed to generate thumbnail for local file {filename}: {e}")
                else:
                    saved_thumbnail_path = f"/api/snapshots/images/{thumb_filename}"

        try:
            s = models.Snapshot(
                workflow_id=payload.workflow_id,
                params=json.dumps(payload.params),
                image_path=saved_image_path,
                thumbnail_path=saved_thumbnail_path,
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

        if payload.lora_ids is not None:
            for lora_id in payload.lora_ids:
                existing_lora = db.query(models.Lora).filter(models.Lora.id == lora_id).first()
                if not existing_lora:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Lora with ID {lora_id} does not exist")
            db.query(models.SnapshotLora).filter(models.SnapshotLora.snapshot_id == snapshot_id).delete()
            for lora_id in set(payload.lora_ids):
                db.add(models.SnapshotLora(
                    snapshot_id=snapshot_id,
                    lora_id=lora_id,
                    strength=1.0,
                    role="positive"
                ))

        if payload.tag_set_ids is not None:
            for tag_set_id in payload.tag_set_ids:
                existing_tag_set = db.query(models.TagSet).filter(models.TagSet.id == tag_set_id).first()
                if not existing_tag_set:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"TagSet with ID {tag_set_id} does not exist")
            db.query(models.SnapshotTagSet).filter(models.SnapshotTagSet.snapshot_id == snapshot_id).delete()
            for tag_set_id in set(payload.tag_set_ids):
                db.add(models.SnapshotTagSet(
                    snapshot_id=snapshot_id,
                    tag_set_id=tag_set_id,
                    role="positive"
                ))

        if payload.image_path is not None:
            s.image_path = payload.image_path
        if payload.thumbnail_path is not None:
            s.thumbnail_path = payload.thumbnail_path
        if payload.params is not None:
            s.params = json.dumps(payload.params)

        try:
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
    async def save_uploaded_image(file: UploadFile) -> tuple[str, str]:
        filename_base = f"upload_{uuid.uuid4().hex}"
        target_dir = settings.snapshot_path
        
        try:
            content = await file.read()
            image_path, thumbnail_path = process_and_save_image(content, target_dir, filename_base)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save uploaded file: {str(e)}"
            )
            
        return image_path, thumbnail_path
