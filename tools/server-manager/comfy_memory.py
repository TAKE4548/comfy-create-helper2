"""Bounded loopback transport for the native ComfyUI queue and free APIs."""

import json
import socket
import urllib.error
import urllib.request

MAX_QUEUE_BYTES = 2 * 1024 * 1024


class ComfyHTTPError(Exception):
    """An HTTP response with a non-success status from ComfyUI."""

    def __init__(self, status: int):
        self.status = status
        super().__init__(f"ComfyUI returned HTTP {status}")


class ComfyTransportError(Exception):
    """A timeout, malformed response, or transport failure."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _validate_port(port: int) -> int:
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("port must be an integer from 1 to 65535")
    return port


def _open(path: str, port: int, timeout: float, data: bytes | None = None):
    request = urllib.request.Request(
        f"http://127.0.0.1:{_validate_port(port)}{path}",
        data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method="POST" if data is not None else "GET",
    )
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        return opener.open(request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        raise ComfyHTTPError(exc.code) from exc
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as exc:
        raise ComfyTransportError(str(exc)) from exc


def get_comfy_execution_state(port: int, timeout: float = 2.0) -> dict[str, object]:
    """Return queue state and counts; invalid or unavailable queues fail closed."""
    try:
        with _open("/queue", port, timeout) as response:
            raw = response.read(MAX_QUEUE_BYTES + 1)
        if len(raw) > MAX_QUEUE_BYTES:
            raise ValueError("queue response exceeds 2 MiB")
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("queue response must be an object")
        running = payload.get("queue_running")
        pending = payload.get("queue_pending")
        if not isinstance(running, list) or not isinstance(pending, list):
            raise ValueError("queue_running and queue_pending must be arrays")
        state = "executing" if running else "queued" if pending else "idle"
        return {"execution_state": state, "queue_running": len(running), "queue_pending": len(pending)}
    except (ComfyHTTPError, ComfyTransportError, UnicodeDecodeError, json.JSONDecodeError,
            ValueError, RecursionError) as exc:
        return {
            "execution_state": "unknown",
            "queue_running": None,
            "queue_pending": None,
            "execution_error": str(exc),
        }


def request_comfy_memory_free(port: int, timeout: float = 5.0) -> None:
    """Send one native memory-free POST; an empty HTTP 200 is successful."""
    data = json.dumps({"unload_models": True, "free_memory": True}).encode("utf-8")
    try:
        with _open("/free", port, timeout, data=data) as response:
            if response.status != 200:
                raise ComfyHTTPError(response.status)
            return
    except (ComfyHTTPError, ComfyTransportError):
        raise
