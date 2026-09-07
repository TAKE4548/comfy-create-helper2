import logging
from typing import Optional, Any
from fastapi import APIRouter, Response, status
from pydantic import BaseModel

router = APIRouter(prefix="/api/system", tags=["system"])
client_logger = logging.getLogger("app.client")


class ClientLogPayload(BaseModel):
    level: str = "error"
    message: str
    stack: Optional[str] = None
    url: Optional[str] = None
    component: Optional[str] = None
    context: Optional[dict[str, Any]] = None


@router.post("/client-logs", status_code=status.HTTP_204_NO_CONTENT)
async def ingest_client_logs(payload: ClientLogPayload):
    level_num = getattr(logging, payload.level.upper(), logging.ERROR)
    error_dict = None
    if payload.stack or payload.message:
        error_dict = {
            "type": "ClientError",
            "message": payload.message,
            "stack_trace": payload.stack,
        }

    extra_data = {
        "source": "frontend",
        "error": error_dict,
        "extra": {
            "url": payload.url,
            "component": payload.component,
            "context": payload.context,
        },
    }

    client_logger.log(
        level_num,
        f"[FE] {payload.component or 'Global'}: {payload.message}",
        extra=extra_data,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
