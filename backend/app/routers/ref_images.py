"""REST API for reference images (upload, import, original/thumbnail delivery)."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, model_validator
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.routers.comfy import _get_full_webp_disk_path, get_comfy_client
from app.services.ref_image_store import (
    MAX_REF_IMAGE_BYTES,
    REF_ID_RE,
    RefImageError,
    RefImageStore,
    StoredRefImage,
    token_for,
)
from app.services.snapshot_service import SnapshotService

router = APIRouter(prefix="/api/ref-images", tags=["ref-images"])

_CACHE_CONTROL = "public, max-age=86400"
_TOUCH_MIN_INTERVAL_S = 3600.0


class RefImageRead(BaseModel):
    token: str
    ref_id: str
    media_type: str
    width: int
    height: int
    byte_size: int
    view_url: str
    thumbnail_url: str


class RefImageImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["history", "snapshot"]
    filename: str | None = None
    subfolder: str = ""
    type: Literal["output", "temp"] = "output"
    snapshot_id: int | None = None

    @model_validator(mode="after")
    def _validate_source_fields(self) -> "RefImageImportRequest":
        if self.source == "history":
            if not self.filename:
                raise ValueError("filename is required when source is 'history'")
            if "/" in self.filename or "\\" in self.filename or ".." in self.filename:
                raise ValueError("filename must not contain path separators or '..'")
            if ".." in self.subfolder or "\\" in self.subfolder or self.subfolder.startswith("/"):
                raise ValueError("invalid subfolder")
        elif self.snapshot_id is None:
            raise ValueError("snapshot_id is required when source is 'snapshot'")
        return self


def _store() -> RefImageStore:
    return RefImageStore.default()


def _http_error(err: RefImageError) -> HTTPException:
    return HTTPException(status_code=err.status, detail={"code": err.code, "message": err.message})


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _to_read(stored: StoredRefImage) -> RefImageRead:
    return RefImageRead(
        token=token_for(stored.ref_id),
        ref_id=stored.ref_id,
        media_type=stored.media_type,
        width=stored.width,
        height=stored.height,
        byte_size=stored.byte_size,
        view_url=f"/api/ref-images/{stored.ref_id}",
        thumbnail_url=f"/api/ref-images/{stored.ref_id}/thumbnail",
    )


async def _save(data: bytes) -> RefImageRead:
    try:
        stored = await asyncio.to_thread(_store().save_bytes, data)
    except RefImageError as err:
        raise _http_error(err) from None
    return _to_read(stored)


@router.post("/upload", response_model=RefImageRead, status_code=201)
async def upload_ref_image(file: UploadFile = File(...)) -> RefImageRead:
    data = await file.read(MAX_REF_IMAGE_BYTES + 1)
    return await _save(data)


async def _import_history(req: RefImageImportRequest) -> bytes:
    assert req.filename is not None
    upstream_failed = False
    try:
        resp = await get_comfy_client().get(
            f"{settings.comfy_url}/view",
            params={"filename": req.filename, "subfolder": req.subfolder, "type": req.type},
            timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.content
        upstream_failed = resp.status_code != 404
    except httpx.HTTPError:
        upstream_failed = True
    cache_path = _get_full_webp_disk_path(f"{req.type}:{req.subfolder}:{req.filename}")
    if cache_path.is_file():
        return await asyncio.to_thread(cache_path.read_bytes)
    if upstream_failed:
        raise _error(502, "upstream_unavailable", "ComfyUI is unavailable")
    raise _error(404, "source_not_found", "source image not found")


async def _import_snapshot(req: RefImageImportRequest, db: Session) -> bytes:
    assert req.snapshot_id is not None
    snapshot = SnapshotService.get_snapshot(db, req.snapshot_id)
    if snapshot is None or not snapshot.image_path:
        raise _error(404, "source_not_found", "snapshot image not found")
    base = Path(settings.snapshot_path).resolve()
    candidate = (Path(settings.snapshot_path) / Path(snapshot.image_path).name).resolve()
    if base != candidate.parent and base not in candidate.parents:
        raise _error(404, "source_not_found", "snapshot image not found")
    if not candidate.is_file():
        raise _error(404, "source_not_found", "snapshot image not found")
    return await asyncio.to_thread(candidate.read_bytes)


@router.post("/import", response_model=RefImageRead, status_code=201)
async def import_ref_image(req: RefImageImportRequest, db: Session = Depends(get_db)) -> RefImageRead:
    if req.source == "history":
        data = await _import_history(req)
    else:
        data = await _import_snapshot(req, db)
    return await _save(data)


def _checked_ref_id(ref_id: str) -> str:
    if REF_ID_RE.fullmatch(ref_id) is None:
        raise _error(404, "not_found", "reference image not found")
    return ref_id


@router.get("/{ref_id}/thumbnail")
async def get_ref_image_thumbnail(ref_id: str) -> Response:
    _checked_ref_id(ref_id)
    store = _store()
    try:
        path = await asyncio.to_thread(store.thumbnail_path, ref_id)
        store.touch(ref_id, min_interval_s=_TOUCH_MIN_INTERVAL_S)
        payload = await asyncio.to_thread(path.read_bytes)
    except RefImageError as err:
        raise _http_error(err) from None
    except OSError:
        raise _error(404, "not_found", "reference image not found") from None
    return Response(content=payload, media_type="image/webp", headers={"Cache-Control": _CACHE_CONTROL})


@router.get("/{ref_id}")
async def get_ref_image(ref_id: str) -> Response:
    _checked_ref_id(ref_id)
    store = _store()
    try:
        data, media_type = await asyncio.to_thread(store.read, ref_id)
    except RefImageError as err:
        raise _http_error(err) from None
    store.touch(ref_id, min_interval_s=_TOUCH_MIN_INTERVAL_S)
    return Response(content=data, media_type=media_type, headers={"Cache-Control": _CACHE_CONTROL})
