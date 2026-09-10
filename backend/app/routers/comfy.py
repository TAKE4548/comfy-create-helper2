"""ComfyUI proxy router."""
import io
import logging
from collections import OrderedDict
from typing import Any, Dict, List, Optional
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
    if cache_key in _thumbnail_cache:
        _thumbnail_cache.move_to_end(cache_key)
        return Response(
            content=_thumbnail_cache[cache_key],
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )

    client = get_comfy_client()
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

    try:
        image = Image.open(io.BytesIO(resp.content))
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        image.thumbnail((size, size))
        buf = io.BytesIO()
        image.save(buf, format="WEBP", quality=quality)
        webp_bytes = buf.getvalue()
    except Exception as e:
        logger.error(f"Thumbnail conversion failed for {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Thumbnail conversion error: {e}")

    _thumbnail_cache[cache_key] = webp_bytes
    if len(_thumbnail_cache) > _THUMBNAIL_CACHE_MAX_SIZE:
        _thumbnail_cache.popitem(last=False)

    return Response(
        content=webp_bytes,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


