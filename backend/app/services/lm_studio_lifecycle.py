"""Safe model-instance lifecycle operations for LM Studio's REST API."""

from __future__ import annotations

import asyncio
import logging
from urllib.parse import urlsplit, urlunsplit
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)
_TIMEOUT_SECONDS = 4.0
_LOAD_TIMEOUT_SECONDS = 120.0
_LOAD_RECOVERY_SECONDS = 20.0
_LOAD_RECOVERY_POLL_SECONDS = 1.0


def _rest_base_url() -> str | None:
    """Convert a configured OpenAI `/v1` URL to its matching REST API root."""
    parts = urlsplit(settings.llm_base_url)
    if not parts.scheme or not parts.netloc or parts.query or parts.fragment:
        return None
    if parts.path.rstrip("/").endswith("/v1"):
        path = parts.path.rstrip("/")[:-len("/v1")] + "/api/v1"
    elif parts.path == "/v1":
        path = "/api/v1"
    else:
        return None
    return urlunsplit((parts.scheme, parts.netloc, path, "", ""))


def _loaded_instances(model: Any) -> list[dict[str, Any]] | None:
    instances = model.get("loaded_instances") if isinstance(model, dict) else None
    if not isinstance(instances, list) or any(not isinstance(i, dict) for i in instances):
        return None
    return instances


def _contains_instance(models: Any, instance_id: str) -> bool | None:
    """Return None when model-state data is incomplete and cannot be trusted."""
    if not isinstance(models, list):
        return None
    for model in models:
        instances = _loaded_instances(model)
        if instances is None:
            return None
        if any(instance.get("id") == instance_id for instance in instances):
            return True
    return False


async def _verified_absent(
    client: httpx.AsyncClient, base_url: str, instance_id: str
) -> bool | None:
    """Return True only when a valid model list proves the target ID is absent."""
    response = await client.get(f"{base_url}/models")
    if response.status_code < 200 or response.status_code >= 300:
        return None
    payload = response.json()
    models = payload.get("models") if isinstance(payload, dict) else None
    present = _contains_instance(models, instance_id)
    return None if present is None else not present


async def _find_loaded_instance(
    client: httpx.AsyncClient, base_url: str, model_key: str
) -> str | None:
    """Find the sole loaded instance for an exact key; reject ambiguous state."""
    response = await client.get(f"{base_url}/models")
    if response.status_code < 200 or response.status_code >= 300:
        raise ValueError("LM_STUDIO_LIST_FAILED")
    payload = response.json()
    models = payload.get("models") if isinstance(payload, dict) else None
    if not isinstance(models, list):
        raise ValueError("LM_STUDIO_LIST_INVALID")
    matches = [m for m in models if isinstance(m, dict) and m.get("key") == model_key]
    if len(matches) != 1:
        raise ValueError("LM_STUDIO_MODEL_AMBIGUOUS")
    instances = _loaded_instances(matches[0])
    if instances is None:
        raise ValueError("LM_STUDIO_INSTANCE_LIST_INVALID")
    if len(instances) > 1:
        raise ValueError("LM_STUDIO_INSTANCE_AMBIGUOUS")
    if not instances:
        return None
    instance_id = instances[0].get("id")
    if not isinstance(instance_id, str) or not instance_id:
        raise ValueError("LM_STUDIO_INSTANCE_ID_MISSING")
    return instance_id


async def acquire_model_instance(model_key: str) -> str:
    """Return the unique loaded instance for an exact model key, loading if needed."""
    base_url = _rest_base_url()
    if not base_url:
        logger.warning("LM_STUDIO_CONFIG_INVALID")
        raise RuntimeError("LM_STUDIO_CONFIG_INVALID")
    if not model_key:
        logger.warning("LM_STUDIO_MODEL_KEY_INVALID")
        raise RuntimeError("LM_STUDIO_MODEL_KEY_INVALID")

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            instance_id = await _find_loaded_instance(client, base_url, model_key)
            if instance_id:
                return instance_id

            try:
                async with asyncio.timeout(_LOAD_TIMEOUT_SECONDS):
                    response = await client.post(
                        f"{base_url}/models/load",
                        json={"model": model_key},
                        timeout=_LOAD_TIMEOUT_SECONDS,
                    )
            except (httpx.TimeoutException, TimeoutError):
                logger.warning("LM_STUDIO_LOAD_TIMEOUT_RECOVERING_INSTANCE")
                # The model may finish loading after the client stopped waiting for its
                # response. Poll briefly for its exact ID so the caller can unload it.
                try:
                    async with asyncio.timeout(_LOAD_RECOVERY_SECONDS):
                        while True:
                            instance_id = await _find_loaded_instance(client, base_url, model_key)
                            if instance_id:
                                return instance_id
                            await asyncio.sleep(_LOAD_RECOVERY_POLL_SECONDS)
                except TimeoutError:
                    pass
                raise ValueError("LM_STUDIO_LOAD_TIMEOUT_NO_INSTANCE")
            if response.status_code < 200 or response.status_code >= 300:
                raise ValueError("LM_STUDIO_LOAD_FAILED")
            payload = response.json()
            instance_id = payload.get("instance_id") if isinstance(payload, dict) else None
            if not isinstance(instance_id, str) or not instance_id:
                raise ValueError("LM_STUDIO_INSTANCE_ID_MISSING")
            return instance_id
    except Exception as exc:
        # Keep response bodies, model keys, URLs, and exception text out of logs.
        code = str(exc) if isinstance(exc, ValueError) else "LM_STUDIO_REQUEST_FAILED"
        logger.warning("%s", code)
        raise RuntimeError(code) from None


async def unload_model_instance_with_retry(instance_id: str, max_retries: int = 1) -> bool:
    """Unload exactly one instance and verify its ID is absent from the model list."""
    base_url = _rest_base_url()
    if not base_url:
        logger.warning("LM_STUDIO_CONFIG_INVALID")
        return False
    if not isinstance(instance_id, str) or not instance_id:
        logger.warning("LM_STUDIO_INSTANCE_ID_INVALID")
        return False

    for _attempt in range(max(0, max_retries) + 1):
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    f"{base_url}/models/unload", json={"instance_id": instance_id}
                )
                if response.status_code < 200 or response.status_code >= 300:
                    logger.warning("LM_STUDIO_UNLOAD_HTTP_FAILED")
                    # LM Studio can complete the unload and still fail its HTTP
                    # response. The observed state, not that response, decides.
                    if await _verified_absent(client, base_url, instance_id) is True:
                        return True
                    continue
                payload = response.json()
                if not isinstance(payload, dict) or payload.get("instance_id") != instance_id:
                    logger.warning("LM_STUDIO_UNLOAD_RESPONSE_ID_MISMATCH")
                    continue

                absent = await _verified_absent(client, base_url, instance_id)
                if absent is None:
                    logger.warning("LM_STUDIO_STATE_INVALID")
                    continue
                if not absent:
                    logger.warning("LM_STUDIO_INSTANCE_STILL_LOADED")
                    continue
                return True
        except Exception:
            logger.warning("LM_STUDIO_UNLOAD_VERIFICATION_FAILED")
    return False
