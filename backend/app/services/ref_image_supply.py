from __future__ import annotations

import asyncio
import copy
from typing import Any, Protocol, runtime_checkable

from app.services.ref_image_store import RefImageError, RefImageStore, parse_ref_token


@runtime_checkable
class RefImageUploadPort(Protocol):
    async def upload_image(
        self, data: bytes, filename: str, media_type: str, *, subfolder: str = ...
    ) -> dict[str, str]: ...


class RefImageSupplyError(Exception):
    """Raised when a reference image cannot be supplied to ComfyUI; str(e) is a Japanese reason."""


def _node_inputs(graph: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for node in graph.values():
        if isinstance(node, dict) and isinstance(node.get("inputs"), dict):
            result.append(node["inputs"])
    return result


def collect_ref_ids(graph: dict[str, Any]) -> list[str]:
    found: list[str] = []
    for inputs in _node_inputs(graph):
        for value in inputs.values():
            if not isinstance(value, str):
                continue
            ref_id = parse_ref_token(value)
            if ref_id is not None and ref_id not in found:
                found.append(ref_id)
    return found


def replace_ref_tokens(graph: dict[str, Any], resolved: dict[str, str]) -> dict[str, Any]:
    replaced = copy.deepcopy(graph)
    for inputs in _node_inputs(replaced):
        for key, value in list(inputs.items()):
            if not isinstance(value, str):
                continue
            ref_id = parse_ref_token(value)
            if ref_id is not None and ref_id in resolved:
                inputs[key] = resolved[ref_id]
    return replaced


class RefImageSupplier:
    def __init__(self, store: RefImageStore, uploader: RefImageUploadPort) -> None:
        self.store = store
        self.uploader = uploader

    def claim_refs(self, graph: dict[str, Any]) -> list[str]:
        return self.store.claim(collect_ref_ids(graph))

    async def resolve(self, graph: dict[str, Any]) -> dict[str, Any]:
        resolved: dict[str, str] = {}
        for ref_id in collect_ref_ids(graph):
            try:
                data, media_type = self.store.read(ref_id)
            except RefImageError as exc:
                raise RefImageSupplyError(f"参照画像が見つかりません: {ref_id}") from exc
            try:
                result = await self.uploader.upload_image(data, filename=ref_id, media_type=media_type)
                name = result["name"]
                subfolder = result.get("subfolder")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                raise RefImageSupplyError(
                    f"参照画像を ComfyUI へ供給できませんでした: {ref_id} ({type(exc).__name__})"
                ) from exc
            resolved[ref_id] = f"{subfolder}/{name}" if subfolder else name
        return replace_ref_tokens(graph, resolved)
