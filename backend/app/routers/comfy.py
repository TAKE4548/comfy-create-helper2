"""ComfyUI proxy router."""
import logging
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/comfy", tags=["comfy"])

# インメモリキャッシュ
_object_info_cache: Optional[Dict[str, Any]] = None
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
        return {}


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
async def get_history(max_items: Optional[int] = Query(default=100, ge=1, le=1000)):
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

