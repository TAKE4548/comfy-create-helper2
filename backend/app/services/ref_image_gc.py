"""Garbage collection of unreferenced reference images.

Safety first: if reference collection is uncertain in any way, nothing is deleted.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import re
import time
from pathlib import Path
from typing import Callable, ContextManager, NamedTuple

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.services.ref_image_store import REF_ID_RE, STORE_LOCK, RefImageStore

logger = logging.getLogger(__name__)

GC_GRACE_SECONDS = 72 * 3600
GC_INITIAL_DELAY_SECONDS = 60
GC_INTERVAL_SECONDS = 6 * 3600
GC_MAX_DELETIONS_PER_RUN = 500
TMP_STALE_SECONDS = 3600
REF_SCAN_RE = re.compile(r"refimg:([0-9a-f]{64})\.(png|jpg|webp)")
_THUMB_NAME_RE = re.compile(r"^[0-9a-f]{64}\.webp$")
_FETCH_SIZE = 500


class GcReport(NamedTuple):
    aborted: bool
    reason: str | None
    tables_scanned: tuple[str, ...]
    referenced: int
    stored: int
    deleted: tuple[str, ...]
    kept_recent: int
    kept_referenced: int


def collect_db_references(conn: Connection) -> tuple[set[str], tuple[str, ...]]:
    """Scan every column of every table for refimg tokens. Exceptions propagate."""
    refs: set[str] = set()
    scanned: list[str] = []
    # Reuse an already-open transaction (e.g. caller-managed); otherwise open one read transaction.
    txn: ContextManager[object] = contextlib.nullcontext() if conn.in_transaction() else conn.begin()
    with txn:
        names = [
            str(row[0])
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            ).fetchall()
        ]
        for name in names:
            quoted = '"' + name.replace('"', '""') + '"'
            result = conn.exec_driver_sql(f"SELECT * FROM {quoted}")
            while True:
                rows = result.fetchmany(_FETCH_SIZE)
                if not rows:
                    break
                for row in rows:
                    for value in row:
                        if isinstance(value, bytes):
                            value = value.decode("utf-8", "ignore")
                        if isinstance(value, str):
                            for m in REF_SCAN_RE.finditer(value):
                                refs.add(f"{m.group(1)}.{m.group(2)}")
            scanned.append(name)
    return refs, tuple(scanned)


def _aborted(reason: str, stored: int = 0) -> GcReport:
    return GcReport(True, reason, (), 0, stored, (), 0, 0)


def _list_originals(root: Path) -> list[Path]:
    originals: list[Path] = []
    for entry in root.iterdir():
        if REF_ID_RE.fullmatch(entry.name) and not entry.is_symlink() and entry.is_file():
            originals.append(entry)
    return originals


def run_gc(
    store: RefImageStore,
    connect: Callable[[], ContextManager[Connection]],
    *,
    now: Callable[[], float] = time.time,
) -> GcReport:
    try:
        return _run_gc(store, connect, now)
    except Exception as exc:  # fail-safe: any error means no deletion guarantee is abandoned
        return _aborted(f"unexpected error: {type(exc).__name__}: {exc}")


def _run_gc(
    store: RefImageStore,
    connect: Callable[[], ContextManager[Connection]],
    now: Callable[[], float],
) -> GcReport:
    try:
        root = store.root()
        if not root.is_dir():
            return _aborted("store root missing")
        originals = _list_originals(root)
    except Exception as exc:
        return _aborted(f"store enumeration failed: {type(exc).__name__}: {exc}")
    stored = len(originals)

    try:
        with connect() as conn:
            refs1, tables = collect_db_references(conn)
    except Exception as exc:
        return _aborted(f"first reference collection failed: {type(exc).__name__}: {exc}", stored)

    kept_referenced = 0
    kept_recent = 0
    candidates: list[Path] = []
    for path in originals:
        if path.name in refs1:
            kept_referenced += 1
            continue
        try:
            age = now() - path.stat().st_mtime
        except OSError:
            continue
        if age > GC_GRACE_SECONDS:
            candidates.append(path)
        else:
            kept_recent += 1

    deleted: list[str] = []
    refs_all = refs1
    if candidates:
        try:
            with connect() as conn:
                refs2, _ = collect_db_references(conn)
        except Exception as exc:
            return GcReport(
                True, f"second reference collection failed: {type(exc).__name__}: {exc}",
                tables, len(refs1), stored, (), 0, kept_referenced,
            )
        refs_all = refs1 | refs2
        remaining = sorted((p for p in candidates if p.name not in refs2), key=lambda p: p.name)
        kept_referenced += len(candidates) - len(remaining)
        for path in remaining[:GC_MAX_DELETIONS_PER_RUN]:
            with STORE_LOCK:
                try:
                    if path.is_symlink() or not path.is_file():
                        continue
                    if now() - path.stat().st_mtime <= GC_GRACE_SECONDS:
                        kept_recent += 1
                        continue
                    digest = path.name.split(".", 1)[0]
                    path.unlink(missing_ok=True)
                    (root / "thumbs" / f"{digest}.webp").unlink(missing_ok=True)
                    deleted.append(path.name)
                except OSError as exc:
                    logger.warning("ref image gc: failed to delete %s: %s", path.name, exc)

    _cleanup_ancillary(root, now)
    return GcReport(False, None, tables, len(refs_all), stored, tuple(deleted), kept_recent, kept_referenced)


def _cleanup_ancillary(root: Path, now: Callable[[], float]) -> None:
    """Remove orphan thumbnails past grace and stale temp files. Best effort; never raises."""
    try:
        with STORE_LOCK:
            thumbs = root / "thumbs"
            if thumbs.is_dir() and not thumbs.is_symlink():
                for entry in thumbs.iterdir():
                    if not _THUMB_NAME_RE.fullmatch(entry.name) or entry.is_symlink() or not entry.is_file():
                        continue
                    digest = entry.name.split(".", 1)[0]
                    if any((root / f"{digest}.{ext}").exists() for ext in ("png", "jpg", "webp")):
                        continue
                    if now() - entry.stat().st_mtime > GC_GRACE_SECONDS:
                        entry.unlink(missing_ok=True)
            for entry in root.iterdir():
                if entry.name.startswith(".tmp_") and entry.is_file() and not entry.is_symlink():
                    if now() - entry.stat().st_mtime > TMP_STALE_SECONDS:
                        entry.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("ref image gc: ancillary cleanup failed: %s", exc)


async def gc_loop(
    store: RefImageStore,
    connect: Callable[[], ContextManager[Connection]],
    *,
    initial_delay: float = GC_INITIAL_DELAY_SECONDS,
    interval: float = GC_INTERVAL_SECONDS,
) -> None:
    await asyncio.sleep(initial_delay)
    while True:
        try:
            report = await asyncio.to_thread(run_gc, store, connect)
            if report.aborted:
                logger.warning("ref image gc aborted: %s", report.reason)
            else:
                logger.info(
                    "ref image gc done: stored=%d referenced=%d deleted=%d kept_recent=%d kept_referenced=%d",
                    report.stored, report.referenced, len(report.deleted),
                    report.kept_recent, report.kept_referenced,
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("ref image gc loop error: %s", exc)
        await asyncio.sleep(interval)
