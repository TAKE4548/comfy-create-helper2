from __future__ import annotations

import asyncio
import json
import logging
import random
import socket
import struct
import sys
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit
from uuid import uuid4

import httpx
from websockets.asyncio import client as websocket_client

logger = logging.getLogger(__name__)

OnEvent = Callable[[dict[str, Any]], Any]
OnPreview = Callable[[str, bytes, str], Any]


class UpstreamResponseError(RuntimeError):
    """ComfyUI returned a response that did not confirm the requested action."""


class ComfyGenerationBridge:
    def __init__(
        self,
        comfy_url: str,
        *,
        client_id: str | None = None,
        http_client: httpx.AsyncClient | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        jitter: Callable[[float, float], float] = random.uniform,
        clock: Callable[[], datetime | str] | None = None,
    ) -> None:
        self.comfy_url = comfy_url.rstrip("/")
        self.client_id = client_id or str(uuid4())
        self._owns_http = http_client is None
        self._http = http_client or httpx.AsyncClient(
            base_url=self.comfy_url,
            timeout=httpx.Timeout(15.0, connect=5.0),
        )
        self._sleep = sleep
        self._jitter = jitter
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._ws_task: asyncio.Task[None] | None = None
        self._stopping = False
        self._ws_connected = False
        self._http_ready = False
        self._failure_since: str | None = None
        self._on_event: OnEvent | None = None
        self._on_preview: OnPreview | None = None
        self._latest_preview: dict[str, tuple[bytes, str]] = {}

    async def start(self, on_event: OnEvent, on_preview: OnPreview) -> None:
        if self._ws_task is not None and not self._ws_task.done():
            return
        self._on_event = on_event
        self._on_preview = on_preview
        self._stopping = False
        self._ws_task = asyncio.create_task(self._run_ws(), name="comfy-generation-ws")

    async def stop(self) -> None:
        self._stopping = True
        task, self._ws_task = self._ws_task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._ws_connected = False
        self._latest_preview.clear()
        if self._owns_http:
            await self._http.aclose()

    async def submit(self, graph: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self._request(
                "POST", "/prompt", json={"prompt": graph, "client_id": self.client_id}, timeout=10.0
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {400, 422}:
                return self._submit_rejection(exc.response)
            raise

        try:
            data = response.json()
        except ValueError as exc:
            raise UpstreamResponseError("ComfyUI prompt response was not valid JSON") from exc
        if not isinstance(data, dict):
            raise UpstreamResponseError("ComfyUI prompt response did not confirm prompt_id")
        prompt_id = data.get("prompt_id")
        if isinstance(prompt_id, str) and prompt_id:
            # A confirmed upstream ID must be observed to terminal state even if
            # validation reports partial per-node errors in the same response.
            accepted = dict(data)
            accepted.pop("error", None)
            return accepted

        status = data.get("status")
        status_str = status.get("status_str") if isinstance(status, dict) else status
        if data.get("error") or status_str == "error" or data.get("node_errors"):
            return self._submit_rejection(response)
        raise UpstreamResponseError("ComfyUI prompt response did not confirm prompt_id")

    @staticmethod
    def _submit_rejection(response: httpx.Response) -> dict[str, Any]:
        node_errors: Any = None
        message: Any = None
        try:
            data = response.json()
        except ValueError:
            data = None
        if isinstance(data, dict):
            node_errors = data.get("node_errors")
            message = data.get("error") or data.get("message") or data.get("detail")
            status = data.get("status")
            if message is None and isinstance(status, dict):
                message = status.get("message") or status.get("status_str")
        elif data is not None:
            message = data
        if message is None:
            message = response.text.strip() or f"ComfyUI rejected prompt with HTTP {response.status_code}"
        if not isinstance(message, str):
            message = json.dumps(message, ensure_ascii=False, default=str)
        return {"error": message, "node_errors": node_errors}

    async def queue(self) -> dict[str, Any]:
        response = await self._request("GET", "/queue", timeout=5.0)
        data = self._response_json(response)
        if not isinstance(data, dict):
            raise UpstreamResponseError("ComfyUI queue response must be an object")
        running = self._queue_items(data, "queue_running", "running")
        pending = self._queue_items(data, "queue_pending", "pending")
        return {"running": running, "pending": pending}

    async def history(self, prompt_id: str | None = None) -> dict[str, Any]:
        path = f"/history/{quote(prompt_id, safe='')}" if prompt_id is not None else "/history"
        response = await self._request("GET", path, timeout=15.0)
        data = self._response_json(response)
        if not isinstance(data, dict):
            raise UpstreamResponseError("ComfyUI history response must be an object")
        return data

    async def interrupt(self, prompt_id: str) -> None:
        before = await self.queue()
        if len(before["running"]) != 1 or before["running"][0]["prompt_id"] != prompt_id:
            raise RuntimeError("target is no longer the uniquely observed running prompt")
        # ComfyUI's /interrupt has no target parameter. Recheck immediately before
        # sending it and refuse to interrupt if the running prompt changed.
        latest = await self.queue()
        if len(latest["running"]) != 1 or latest["running"][0]["prompt_id"] != prompt_id:
            raise RuntimeError("target is no longer the uniquely observed running prompt")
        response = await self._request("POST", "/interrupt", timeout=5.0)
        self._response_json(response)

    async def clear_queue(self) -> dict[str, Any]:
        response = await self._request("POST", "/queue", json={"clear": True}, timeout=5.0)
        data = self._response_json(response)
        return data if isinstance(data, dict) else {}

    async def delete_queue(self, prompt_ids: list[str]) -> dict[str, Any]:
        response = await self._request("POST", "/queue", json={"delete": prompt_ids}, timeout=5.0)
        data = self._response_json(response)
        return data if isinstance(data, dict) else {}

    async def interrupt_all(self) -> dict[str, Any]:
        response = await self._request("POST", "/interrupt", timeout=5.0)
        data = self._response_json(response)
        return data if isinstance(data, dict) else {}

    async def delete_history(self, prompt_ids: list[str]) -> None:
        response = await self._request("POST", "/history", json={"delete": prompt_ids}, timeout=5.0)
        self._response_json(response)

    def get_upstream_state(self) -> dict[str, bool | str | None]:
        return {
            "http_ready": self._http_ready,
            "ws_connected": self._ws_connected,
            "failure_since": self._failure_since,
        }

    def get_preview(self, prompt_id: str) -> tuple[bytes, str] | None:
        return self._latest_preview.get(prompt_id)

    async def _run_ws(self) -> None:
        retries = 0
        uri = self._websocket_uri()
        while not self._stopping:
            try:
                connect_options: dict[str, Any] = {"max_size": None}
                if sys.platform == "win32" and (urlsplit(uri).hostname or "").lower() == "localhost":
                    connect_options["family"] = socket.AF_INET
                async with websocket_client.connect(uri, **connect_options) as websocket:
                    self._ws_connected = True
                    retries = 0
                    await self._consume(websocket)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("ComfyUI generation WebSocket disconnected", exc_info=True)
            finally:
                self._ws_connected = False
            if self._stopping:
                break
            base_delay = min(15.0, float(2**retries))
            delay = base_delay + self._jitter(0.0, 0.499)
            retries += 1
            try:
                await self._sleep(delay)
            except asyncio.CancelledError:
                raise

    async def _consume(self, websocket: Any) -> None:
        async for message in websocket:
            if isinstance(message, str):
                await self._handle_json_message(message)
            elif isinstance(message, (bytes, bytearray, memoryview)):
                await self._handle_binary_message(bytes(message))

    async def _handle_json_message(self, raw: str) -> None:
        try:
            event = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            logger.debug("Ignoring invalid ComfyUI WebSocket JSON")
            return
        if not isinstance(event, dict) or not isinstance(event.get("type"), str):
            return
        data = event.get("data")
        prompt_id = event.get("prompt_id")
        if not isinstance(prompt_id, str) and isinstance(data, dict):
            prompt_id = data.get("prompt_id")
        if not isinstance(prompt_id, str):
            prompt_id = await self._verified_running_prompt()
        delivered = dict(event)
        if isinstance(prompt_id, str):
            delivered["prompt_id"] = prompt_id
        await self._invoke(self._on_event, delivered)
        if isinstance(prompt_id, str) and event["type"] in {
            "execution_success",
            "execution_error",
            "execution_interrupted",
        }:
            self._latest_preview.pop(prompt_id, None)

    async def _handle_binary_message(self, raw: bytes) -> None:
        if len(raw) < 8:
            return
        event_type, image_type = struct.unpack_from(">II", raw)
        if event_type != 1:
            return
        mime = {1: "image/jpeg", 2: "image/png"}.get(image_type)
        if mime is None:
            return
        prompt_id = await self._verified_running_prompt()
        if prompt_id is None:
            return
        frame = raw[8:]
        self._latest_preview[prompt_id] = (frame, mime)
        await self._invoke(self._on_preview, prompt_id, frame, mime)

    async def _verified_running_prompt(self) -> str | None:
        try:
            state = await self.queue()
        except Exception:
            logger.debug("Could not associate ComfyUI event with a running prompt", exc_info=True)
            return None
        running = state["running"]
        if len(running) != 1:
            return None
        return running[0]["prompt_id"]

    async def _invoke(self, callback: Callable[..., Any] | None, *args: Any) -> None:
        if callback is None:
            return
        try:
            result = callback(*args)
            if isinstance(result, Awaitable):
                await result
        except Exception:
            logger.warning("ComfyUI event callback failed", exc_info=True)

    def _websocket_uri(self) -> str:
        parsed = urlsplit(self.comfy_url)
        scheme = {"http": "ws", "https": "wss"}.get(parsed.scheme)
        if scheme is None:
            raise ValueError("comfy_url must use http or https")
        return urlunsplit((scheme, parsed.netloc, f"{parsed.path.rstrip('/')}/ws", f"clientId={quote(self.client_id, safe='')}", ""))

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            response = await self._http.request(method, path, **kwargs)
            response.raise_for_status()
        except Exception:
            self._http_ready = False
            if self._failure_since is None:
                self._failure_since = self._now()
            raise
        self._http_ready = True
        self._failure_since = None
        return response

    def _now(self) -> str:
        value = self._clock()
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        return value

    @classmethod
    def _queue_items(cls, data: dict[str, Any], raw_key: str, normalized_key: str) -> list[dict[str, str | None]]:
        if raw_key in data:
            entries = data[raw_key]
        elif normalized_key in data:
            entries = data[normalized_key]
        else:
            raise UpstreamResponseError(f"ComfyUI queue response is missing {raw_key}")
        if not isinstance(entries, list):
            raise UpstreamResponseError(f"ComfyUI queue field {raw_key} must be an array")
        result: list[dict[str, str | None]] = []
        for entry in entries:
            if isinstance(entry, dict):
                prompt_id = entry.get("prompt_id")
                extra = entry.get("extra_data")
                client_id = entry.get("client_id")
                if client_id is None and isinstance(extra, dict):
                    client_id = extra.get("client_id")
            elif isinstance(entry, (list, tuple)) and len(entry) >= 2:
                prompt_id = entry[1]
                extra = entry[3] if len(entry) >= 4 else None
                client_id = extra.get("client_id") if isinstance(extra, dict) else None
            else:
                raise UpstreamResponseError(f"Malformed ComfyUI {raw_key} entry")
            if not isinstance(prompt_id, str) or not prompt_id:
                raise UpstreamResponseError(f"ComfyUI {raw_key} entry has no prompt_id")
            if client_id is not None and not isinstance(client_id, str):
                raise UpstreamResponseError(f"ComfyUI {raw_key} entry has invalid client_id")
            result.append({"prompt_id": prompt_id, "client_id": client_id})
        return result

    @staticmethod
    def _response_json(response: httpx.Response) -> Any:
        response.raise_for_status()
        if not response.content:
            return {}
        try:
            data = response.json()
        except ValueError as exc:
            raise UpstreamResponseError("ComfyUI returned invalid JSON") from exc
        if isinstance(data, dict):
            status = data.get("status")
            status_str = status.get("status_str") if isinstance(status, dict) else status
            if status_str == "error" or data.get("error"):
                raise UpstreamResponseError(str(data.get("error") or "ComfyUI returned status:error"))
        return data
