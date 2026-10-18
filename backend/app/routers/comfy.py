"""ComfyUI proxy router."""
import asyncio
import hashlib
import io
import logging
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
import httpx
from fastapi import APIRouter, HTTPException, Query, Response
from PIL import Image
from pydantic import BaseModel
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/comfy", tags=["comfy"])

# インメモリキャッシュ
_object_info_cache: Optional[Dict[str, Any]] = None
_thumbnail_cache: OrderedDict[str, bytes] = OrderedDict()
_THUMBNAIL_CACHE_MAX_SIZE = 500
_client: Optional[httpx.AsyncClient] = None

# ディスクキャッシュ上限
_DISK_CACHE_MAX_FILES = 4000
_DISK_CACHE_TARGET_FILES = 3600

# フルサイズ WebP ディスクキャッシュ上限
_FULL_CACHE_MAX_FILES = 220
_FULL_CACHE_TARGET_FILES = 200
_full_cache_lock = asyncio.Lock()


def get_comfy_client() -> httpx.AsyncClient:
    """ComfyUI通信用 httpx.AsyncClient シングルトン（コネクションプール）を取得する。"""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0))
    return _client


async def close_comfy_client():
    """ComfyUI通信用 httpx.AsyncClient をクローズする。"""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None


def _convert_to_webp_thumbnail(image_bytes: bytes, size: int, quality: int) -> bytes:
    """CPU-bound Pillow conversion executed in worker thread."""
    opened_image = Image.open(io.BytesIO(image_bytes))
    image = opened_image.convert("RGBA") if opened_image.mode not in ("RGB", "RGBA") else opened_image
    image.thumbnail((size, size))
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=quality)
    return buf.getvalue()


def _get_thumbnail_disk_path(cache_key: str) -> Path:
    """../db/thumbnails ディレクトリ内の SHA-256 キャッシュパスを返却する。"""
    disk_dir = Path(settings.snapshot_path).parent / "thumbnails"
    disk_dir.mkdir(parents=True, exist_ok=True)
    filename = hashlib.sha256(cache_key.encode("utf-8")).hexdigest() + ".webp"
    return disk_dir / filename


def _convert_to_full_webp(image_bytes: bytes, quality: int = 90) -> bytes:
    """CPU-bound Pillow conversion to full-size WebP executed in worker thread."""
    opened_image = Image.open(io.BytesIO(image_bytes))
    image = opened_image.convert("RGBA") if opened_image.mode not in ("RGB", "RGBA") else opened_image
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=quality)
    return buf.getvalue()


def _get_full_webp_disk_path(cache_key: str) -> Path:
    """../db/full_cache ディレクトリ内の SHA-256 キャッシュパスを返却する。"""
    disk_dir = Path(settings.snapshot_path).parent / "full_cache"
    disk_dir.mkdir(parents=True, exist_ok=True)
    filename = hashlib.sha256(cache_key.encode("utf-8")).hexdigest() + ".webp"
    return disk_dir / filename


async def eager_cache_full_webp(filename: str, subfolder: str = "", image_type: str = "output") -> None:
    """Pre-warm full-size WebP cache when an image generation completes."""
    try:
        cache_key = f"{image_type}:{subfolder}:{filename}"
        disk_path = _get_full_webp_disk_path(cache_key)
        if disk_path.is_file() and disk_path.stat().st_size > 0:
            return
        upstream = await get_comfy_client().get(
            f"{settings.comfy_url}/view",
            params={"filename": filename, "subfolder": subfolder, "type": image_type},
            timeout=15.0,
        )
        if upstream.status_code == 200:
            webp_bytes = await asyncio.to_thread(_convert_to_full_webp, upstream.content, 90)
            tmp_name = f".tmp_eager_{hashlib.sha256(webp_bytes[:32]).hexdigest()[:8]}.webp"
            tmp_path = disk_path.parent / tmp_name
            await asyncio.to_thread(tmp_path.write_bytes, webp_bytes)
            await asyncio.to_thread(tmp_path.replace, disk_path)
            await asyncio.to_thread(_prune_full_cache_if_needed, disk_path.parent)
    except Exception as e:
        logger.warning(f"Failed to eagerly cache full webp for {filename}: {e}")


def _prune_full_cache_if_needed(disk_dir: Path) -> None:
    """220件超過時に古い順に削除して200件まで間引く。"""
    try:
        files = list(disk_dir.glob("*.webp"))
        if len(files) <= _FULL_CACHE_MAX_FILES:
            return
        files.sort(key=lambda f: f.stat().st_mtime)
        delete_count = len(files) - _FULL_CACHE_TARGET_FILES
        for f in files[:delete_count]:
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass
        logger.info(f"Pruned {delete_count} old full webp disk cache files.")
    except Exception as e:
        logger.warning(f"Error pruning full webp disk cache: {e}")


def _prune_disk_cache_if_needed(disk_dir: Path) -> None:
    """4,000件（約100MB）超過時に古い順に削除して3,600件まで間引く。"""
    try:
        files = list(disk_dir.glob("*.webp"))
        if len(files) <= _DISK_CACHE_MAX_FILES:
            return
        files.sort(key=lambda f: f.stat().st_mtime)
        delete_count = len(files) - _DISK_CACHE_TARGET_FILES
        for f in files[:delete_count]:
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass
        logger.info(f"Pruned {delete_count} old thumbnail disk cache files.")
    except Exception as e:
        logger.warning(f"Error pruning thumbnail disk cache: {e}")



@router.get("/object-info/{class_type}", response_model=dict)
async def get_comfy_object_info(class_type: str):
    """
    ComfyUI の /object_info/{class_type} をプロキシして返す。
    ComfyUI未起動時は {} を返す（エラーにしない）。
    """
    client = get_comfy_client()
    try:
        response = await client.get(
            f"{settings.comfy_url}/object_info/{class_type}",
            timeout=5.0
        )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, httpx.RequestError) as e:
        logger.warning(f"Failed to fetch object_info from ComfyUI for '{class_type}': {e}")
        return {}


@router.get("/object_info", response_model=dict)
async def get_comfy_object_info_all():
    """
    ComfyUI の全ノード /object_info をプロキシしインメモリキャッシュして返す。
    """
    global _object_info_cache
    if _object_info_cache is not None:
        return _object_info_cache
    client = get_comfy_client()
    try:
        response = await client.get(f"{settings.comfy_url}/object_info", timeout=15.0)
        response.raise_for_status()
        _object_info_cache = response.json()
        return _object_info_cache
    except Exception as e:
        logger.warning(f"Failed to fetch all object_info from ComfyUI: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"ComfyUI server is unavailable or starting up: {e}",
        )


class PromptRequest(BaseModel):
    prompt: Dict[str, Any]
    client_id: Optional[str] = None


@router.post("/prompt")
async def queue_prompt(payload: PromptRequest):
    """
    ComfyUI の /prompt へジョブを投入する。
    """
    client = get_comfy_client()
    try:
        response = await client.post(
            f"{settings.comfy_url}/prompt",
            json=payload.model_dump(exclude_none=True),
            timeout=10.0
        )
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type="application/json"
        )
    except Exception as e:
        logger.error(f"Failed to proxy prompt to ComfyUI: {e}")
        raise HTTPException(status_code=502, detail=f"ComfyUI prompt error: {e}")


@router.get("/queue")
async def get_queue():
    """
    ComfyUI の /queue を取得する。
    """
    client = get_comfy_client()
    try:
        response = await client.get(f"{settings.comfy_url}/queue", timeout=5.0)
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type="application/json"
        )
    except Exception as e:
        return {"queue_running": [], "queue_pending": []}


class QueueActionRequest(BaseModel):
    delete: Optional[List[str]] = None
    clear: Optional[bool] = None


@router.post("/queue")
async def manage_queue(payload: QueueActionRequest):
    """
    ComfyUI の /queue に対する削除・クリアを実行する。
    """
    client = get_comfy_client()
    try:
        response = await client.post(
            f"{settings.comfy_url}/queue",
            json=payload.model_dump(exclude_none=True),
            timeout=5.0
        )
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type="application/json"
        )
    except Exception as e:
        logger.error(f"Failed to proxy queue action to ComfyUI: {e}")
        return {"status": "error", "detail": str(e)}


@router.post("/interrupt")
async def interrupt_execution():
    """
    ComfyUI の /interrupt を呼び出して実行を中断する。
    """
    client = get_comfy_client()
    try:
        response = await client.post(f"{settings.comfy_url}/interrupt", timeout=5.0)
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type="application/json"
        )
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.get("/history")
async def get_history(max_items: Optional[int] = Query(default=200, ge=1, le=1000)):
    """
    ComfyUI の /history を取得する。
    """
    client = get_comfy_client()
    try:
        params = {"max_items": max_items} if max_items is not None else None
        response = await client.get(f"{settings.comfy_url}/history", params=params, timeout=15.0)
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type="application/json"
        )
    except Exception as e:
        return {}


@router.get("/history/{prompt_id}")
async def get_prompt_history(prompt_id: str):
    """
    ComfyUI の /history/{prompt_id} を取得する。
    """
    client = get_comfy_client()
    try:
        response = await client.get(f"{settings.comfy_url}/history/{prompt_id}", timeout=15.0)
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type="application/json"
        )
    except Exception as e:
        return {}


class HistoryActionRequest(BaseModel):
    delete: Optional[List[str]] = None
    clear: Optional[bool] = None


@router.post("/history")
async def manage_history(payload: HistoryActionRequest):
    """
    ComfyUI の /history 削除を実行する。
    """
    client = get_comfy_client()
    try:
        response = await client.post(
            f"{settings.comfy_url}/history",
            json=payload.model_dump(exclude_none=True),
            timeout=5.0
        )
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type="application/json"
        )
    except Exception as e:
        return {"status": "error", "detail": str(e)}


class ImageAvailability(BaseModel):
    availability: Literal["present", "missing", "unknown"]


async def probe_image_availability(filename: str, subfolder: str = "", type: str = "output") -> ImageAvailability:
    """Check the original, independently of thumbnail caches and generation IDs."""
    client = get_comfy_client()
    params = {"filename": filename, "subfolder": subfolder, "type": type}
    try:
        response = await client.head(f"{settings.comfy_url}/view", params=params, timeout=3.0)
        if response.status_code == 200:
            return ImageAvailability(availability="present")
        if response.status_code == 404:
            return ImageAvailability(availability="missing")
    except httpx.HTTPError:
        pass
    try:
        response = await client.get(f"{settings.comfy_url}/view", params=params, timeout=10.0)
        if response.status_code == 200:
            return ImageAvailability(availability="present")
        if response.status_code == 404:
            return ImageAvailability(availability="missing")
    except httpx.HTTPError:
        pass
    return ImageAvailability(availability="unknown")


@router.get("/image-availability", response_model=ImageAvailability)
async def image_availability(
    filename: str = Query(...), subfolder: str = Query(""), type: str = Query("output"),
) -> ImageAvailability:
    return await probe_image_availability(filename, subfolder, type)


@router.get("/view")
async def get_comfy_view(
    filename: str = Query(...), subfolder: str = Query(""), type: str = Query("output"),
    t: str | None = Query(None),
) -> Response:
    """Serve full-size WebP cached image (0ms on cache hit) or fetch from upstream and cache."""
    cache_key = f"{type}:{subfolder}:{filename}"
    disk_path = _get_full_webp_disk_path(cache_key)

    # 1. ローカルディスクキャッシュ確認 (プローブなし・0ms)
    if disk_path.is_file():
        try:
            if disk_path.stat().st_size > 0:
                webp_bytes = await asyncio.to_thread(disk_path.read_bytes)
                return Response(
                    content=webp_bytes,
                    media_type="image/webp",
                    headers={"Cache-Control": "public, max-age=604800, immutable"},
                )
            else:
                disk_path.unlink(missing_ok=True)
        except Exception as e:
            logger.warning(f"Failed to read full cache {disk_path}: {e}")
            disk_path.unlink(missing_ok=True)

    # 2. キャッシュミス時のみ ComfyUI (WSL) から取得
    try:
        upstream = await get_comfy_client().get(
            f"{settings.comfy_url}/view",
            params={"filename": filename, "subfolder": subfolder, "type": type}, timeout=10.0,
        )
        if upstream.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Image not found in ComfyUI: {filename}")
        upstream.raise_for_status()
    except HTTPException:
        raise
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="ComfyUI view unavailable") from error

    # 3. ワーカースレッドでフルサイズ WebP (Quality 90) へ非同期変換 & アトミック保存
    try:
        webp_bytes = await asyncio.to_thread(_convert_to_full_webp, upstream.content, 90)
        tmp_name = f".tmp_{hashlib.sha256(webp_bytes[:32]).hexdigest()[:8]}.webp"
        tmp_path = disk_path.parent / tmp_name
        await asyncio.to_thread(tmp_path.write_bytes, webp_bytes)
        await asyncio.to_thread(tmp_path.replace, disk_path)
        await asyncio.to_thread(_prune_full_cache_if_needed, disk_path.parent)
        return Response(
            content=webp_bytes,
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )
    except Exception as e:
        logger.warning(f"Failed to convert or save full webp {filename}: {e}")
        return Response(
            content=upstream.content,
            headers={
                "Content-Type": upstream.headers.get("content-type", "application/octet-stream"),
            },
        )


@router.get("/thumbnail")
async def get_comfy_thumbnail(
    filename: str = Query(..., description="Image filename"),
    subfolder: str = Query("", description="Subfolder name"),
    type: str = Query("output", description="Image type (output/temp/input)"),
    size: int = Query(256, ge=32, le=1024, description="Thumbnail max edge size in pixels"),
    quality: int = Query(80, ge=10, le=100, description="WebP quality"),
):
    """ComfyUI 出力画像をオンデマンドで WebP サムネイルに変換して返却する。"""
    cache_key = f"{type}:{subfolder}:{filename}:{size}:{quality}"

    client = get_comfy_client()

    # L1: メモリキャッシュ確認
    if cache_key in _thumbnail_cache:
        _thumbnail_cache.move_to_end(cache_key)
        return Response(
            content=_thumbnail_cache[cache_key],
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )

    # L2: ディスクキャッシュ確認
    disk_path = _get_thumbnail_disk_path(cache_key)
    if disk_path.is_file():
        try:
            if disk_path.stat().st_size > 0:
                webp_bytes = await asyncio.to_thread(disk_path.read_bytes)
                _thumbnail_cache[cache_key] = webp_bytes
                if len(_thumbnail_cache) > _THUMBNAIL_CACHE_MAX_SIZE:
                    _thumbnail_cache.popitem(last=False)
                return Response(
                    content=webp_bytes,
                    media_type="image/webp",
                    headers={"Cache-Control": "public, max-age=604800, immutable"},
                )
            else:
                disk_path.unlink(missing_ok=True)
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Failed to read disk cache {disk_path}: {e}")
            disk_path.unlink(missing_ok=True)

    # L3: ComfyUI から取得
    try:
        resp = await client.get(
            f"{settings.comfy_url}/view",
            params={"filename": filename, "subfolder": subfolder, "type": type},
            timeout=10.0,
        )
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Image not found in ComfyUI: {filename}")
        resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Failed to fetch image from ComfyUI view: {e}")
        raise HTTPException(status_code=502, detail=f"ComfyUI view error: {e}")

    # ワーカースレッドで非同期にPillow変換 (イベントループをブロックしない)
    try:
        webp_bytes = await asyncio.to_thread(
            _convert_to_webp_thumbnail, resp.content, size, quality
        )
    except Exception as e:
        logger.error(f"Thumbnail conversion failed for {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Thumbnail conversion error: {e}")

    # ディスクおよびメモリへ保存
    try:
        await asyncio.to_thread(disk_path.write_bytes, webp_bytes)
        await asyncio.to_thread(_prune_disk_cache_if_needed, disk_path.parent)
    except Exception as e:
        logger.warning(f"Failed to write thumbnail to disk {disk_path}: {e}")

    _thumbnail_cache[cache_key] = webp_bytes
    if len(_thumbnail_cache) > _THUMBNAIL_CACHE_MAX_SIZE:
        _thumbnail_cache.popitem(last=False)

    return Response(
        content=webp_bytes,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )
