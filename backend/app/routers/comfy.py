"""ComfyUI proxy router."""
import logging
import httpx
from fastapi import APIRouter
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/comfy", tags=["comfy"])


@router.get("/object-info/{class_type}", response_model=dict)
async def get_comfy_object_info(class_type: str):
    """
    ComfyUI の /object_info/{class_type} をプロキシして返す。
    ComfyUI未起動時は {} を返す（エラーにしない）。
    """
    async with httpx.AsyncClient() as client:
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
