"""Repair script for REQ-267:
Fetch raw images for incomplete snapshots (HTTP ComfyUI URLs with NULL thumbnail_path)
from ComfyUI temp directory, convert to WebP, generate thumbnails, and update DB.
"""

import sys
import os
import argparse
import logging
import urllib.request
import urllib.parse
from pathlib import Path
import uuid

# Set up module import path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app import models
from app.config import settings
from app.services.snapshot_service import process_and_save_image, resolve_internal_comfy_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def repair_snapshots(dry_run: bool = False):
    db = SessionLocal()
    try:
        # Query target snapshots: thumbnail_path IS NULL and image_path starts with http
        targets = (
            db.query(models.Snapshot)
            .filter(models.Snapshot.thumbnail_path.is_(None))
            .filter(models.Snapshot.image_path.like("http%"))
            .order_by(models.Snapshot.id.asc())
            .all()
        )

        total_count = len(targets)
        logger.info(f"Found {total_count} candidate snapshots to repair (dry_run={dry_run}).")

        success_count = 0
        failed_count = 0

        for s in targets:
            try:
                internal_url = resolve_internal_comfy_url(s.image_path, settings.comfy_url)
                logger.info(f"Processing Snapshot ID {s.id}: URL {internal_url}")

                if dry_run:
                    # Validate URL reachability by requesting head or reading small bytes
                    req = urllib.request.Request(internal_url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=10) as response:
                        content_length = response.headers.get("Content-Length", "unknown")
                        logger.info(f"[DRY-RUN] ID {s.id}: Reachable (Status {response.status}, length: {content_length})")
                    success_count += 1
                    continue

                # Fetch image bytes
                req = urllib.request.Request(internal_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as response:
                    image_bytes = response.read()

                # Determine base filename
                parsed_url = urllib.parse.urlparse(internal_url)
                queries = urllib.parse.parse_qs(parsed_url.query)
                filename = queries.get("filename", [None])[0]
                if not filename:
                    filename = Path(parsed_url.path).name
                stem = Path(filename).stem if (filename and filename.strip()) else "snapshot"
                filename_base = f"{stem}_{uuid.uuid4().hex[:8]}"

                # Save WebP and thumbnail
                saved_image_path, saved_thumbnail_path = process_and_save_image(
                    image_bytes, settings.snapshot_path, filename_base
                )

                s.image_path = saved_image_path
                s.thumbnail_path = saved_thumbnail_path
                success_count += 1
                logger.info(f"Snapshot ID {s.id}: Successfully repaired -> {saved_image_path}, {saved_thumbnail_path}")

            except Exception as e:
                failed_count += 1
                logger.error(f"Snapshot ID {s.id}: Failed to repair from {s.image_path}: {e}")

        if not dry_run:
            db.commit()
            logger.info("Database changes committed.")

        logger.info(
            f"Repair completed summary: Total={total_count}, Succeeded={success_count}, Failed={failed_count} (dry_run={dry_run})"
        )

    except Exception as e:
        if not dry_run:
            db.rollback()
        logger.error(f"Repair process encountered critical error: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Repair incomplete snapshots (REQ-267)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate repair without modifying files or DB")
    args = parser.parse_args()

    repair_snapshots(dry_run=args.dry_run)
