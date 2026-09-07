import time
import uuid
import logging
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("app.middleware.request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:12]}"
        request.state.request_id = request_id

        start_time = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception as exc:
            # Let global exception handler process, but record status_code 500
            status_code = 500
            raise exc
        finally:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            # Skip noisy static images from normal INFO logging
            path = request.url.path
            is_noise = path.startswith("/api/snapshots/images") or path == "/health"
            log_level = logging.DEBUG if is_noise else logging.INFO

            extra_data = {
                "request_id": request_id,
                "http": {
                    "method": request.method,
                    "path": path,
                    "status_code": status_code,
                    "client_ip": request.client.host if request.client else None,
                    "duration_ms": duration_ms,
                },
                "source": "backend",
            }
            logger.log(
                log_level,
                f"{request.method} {path} completed with {status_code} in {duration_ms}ms",
                extra=extra_data,
            )
