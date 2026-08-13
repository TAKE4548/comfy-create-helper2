"""Script to migrate existing snapshot images to WebP and generate thumbnails."""

import sys
import os
import logging
from pathlib import Path
from PIL import Image

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app import models
from app.config import settings
from app.main import run_migrations

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _update_path_to_webp(path_str: str | None) -> str | None:
    if not path_str:
        return path_str
    lower_path = path_str.lower()
    for old_ext in [".png", ".jpg", ".jpeg"]:
        if lower_path.endswith(old_ext):
            return path_str[:-len(old_ext)] + ".webp"
    return path_str


def migrate_images():
    run_migrations()
    db = SessionLocal()
    try:
        snapshots = db.query(models.Snapshot).all()
        logger.info(f"Found {len(snapshots)} snapshots to inspect.")
        migrated_count = 0

        for s in snapshots:
            if not s.image_path:
                continue

            filename = s.image_path.split("/")[-1]
            orig_file = settings.snapshot_path / filename

            if not orig_file.exists():
                logger.warning(f"Snapshot ID {s.id}: File {orig_file} does not exist. Skipping.")
                continue

            try:
                with Image.open(orig_file) as img:
                    stem = orig_file.stem
                    if stem.startswith("thumb_"):
                        stem = stem[6:]

                    # 1. Full-size WebP
                    new_img_filename = f"{stem}.webp"
                    new_img_path = settings.snapshot_path / new_img_filename

                    # 2. Thumbnail WebP
                    thumb_filename = f"thumb_{stem}.webp"
                    thumb_path = settings.snapshot_path / thumb_filename

                    # Process and save if needed
                    need_save_full = not new_img_path.exists() or orig_file.suffix.lower() != ".webp"
                    need_save_thumb = not thumb_path.exists()

                    if need_save_full or need_save_thumb:
                        if img.mode not in ("RGB", "RGBA"):
                            img_converted = img.convert("RGBA")
                        else:
                            img_converted = img

                        if need_save_full:
                            img_converted.save(new_img_path, format="WEBP", quality=90)
                            logger.info(f"Snapshot ID {s.id}: Saved WebP image {new_img_filename}")

                        if need_save_thumb:
                            thumb_img = img_converted.copy()
                            thumb_img.thumbnail((300, 300))
                            thumb_img.save(thumb_path, format="WEBP", quality=80)
                            logger.info(f"Snapshot ID {s.id}: Saved thumbnail WebP {thumb_filename}")

                        # Clean up old file if converted from PNG/JPG to WebP
                        if orig_file.suffix.lower() != ".webp" and orig_file != new_img_path and orig_file.exists():
                            try:
                                orig_file.unlink()
                                logger.info(f"Snapshot ID {s.id}: Removed old image file {orig_file.name}")
                            except Exception as unlink_err:
                                logger.error(f"Failed to remove old image file {orig_file}: {unlink_err}")

                    new_image_path_uri = f"/api/snapshots/images/{new_img_filename}"
                    new_thumb_path_uri = f"/api/snapshots/images/{thumb_filename}"

                    if s.image_path != new_image_path_uri or s.thumbnail_path != new_thumb_path_uri:
                        s.image_path = new_image_path_uri
                        s.thumbnail_path = new_thumb_path_uri
                        migrated_count += 1

            except Exception as e:
                logger.error(f"Snapshot ID {s.id}: Error migrating image {orig_file}: {e}")

        # Update LoRA thumbnail_path
        loras = db.query(models.Lora).all()
        lora_migrated_count = 0
        for lora in loras:
            updated = _update_path_to_webp(lora.thumbnail_path)
            if updated != lora.thumbnail_path:
                lora.thumbnail_path = updated
                lora_migrated_count += 1
        logger.info(f"Updated {lora_migrated_count} LoRA thumbnail paths.")

        # Update TagSet thumbnail_path
        tag_sets = db.query(models.TagSet).all()
        tagset_migrated_count = 0
        for ts in tag_sets:
            updated = _update_path_to_webp(ts.thumbnail_path)
            if updated != ts.thumbnail_path:
                ts.thumbnail_path = updated
                tagset_migrated_count += 1
        logger.info(f"Updated {tagset_migrated_count} TagSet thumbnail paths.")

        db.commit()
        logger.info(f"Migration completed successfully. Updated {migrated_count} snapshots.")
    except Exception as e:
        db.rollback()
        logger.error(f"Migration failed: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    migrate_images()
