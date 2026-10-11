from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from typing import Literal
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config import settings
from app.routers.comfy import get_comfy_client, probe_image_availability
from app.services.generation_service import GenerationService

logger = logging.getLogger(__name__)
_PAGE_SIZE = 10
_CANDIDATE_LIMIT = 200
_PROBE_CONCURRENCY = 2


class ImageIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str = Field(min_length=1)
    subfolder: str = ""
    type: str = "output"


class ResidualHistoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    known: list[ImageIdentity] = Field(max_length=1000)
    examined: list[ImageIdentity] = Field(max_length=1000)

    @field_validator("known", "examined")
    @classmethod
    def deduplicate_identities(cls, values: list[ImageIdentity]) -> list[ImageIdentity]:
        unique: dict[tuple[str, str, str], ImageIdentity] = {}
        for value in values:
            unique.setdefault((value.filename, value.subfolder, value.type), value)
        return list(unique.values())


class ResidualHistoryItem(BaseModel):
    identity: ImageIdentity
    view_url: str
    session_id: str | None
    availability: Literal["present"] = "present"


class ResidualHistoryRejected(BaseModel):
    identity: ImageIdentity
    availability: Literal["missing", "unknown"]


class ResidualHistoryResponse(BaseModel):
    items: list[ResidualHistoryItem]
    rejected: list[ResidualHistoryRejected]
    has_more: bool


def _identity(value: object) -> tuple[str, str, str] | None:
    if isinstance(value, Mapping):
        filename = value.get("filename")
        subfolder = value.get("subfolder", "")
        image_type = value.get("type", "output")
    elif isinstance(value, str):
        query = parse_qs(urlsplit(value).query)
        filename = query.get("filename", [""])[0]
        subfolder = query.get("subfolder", [""])[0]
        image_type = query.get("type", ["output"])[0]
    else:
        return None
    if not isinstance(filename, str) or not filename:
        return None
    if not isinstance(subfolder, str) or not isinstance(image_type, str):
        return None
    return filename, subfolder, image_type


def _add_output(
    candidates: dict[tuple[str, str, str], tuple[tuple[object, ...], str | None]],
    raw: object,
    order: tuple[object, ...],
    session_id: str | None,
) -> None:
    identity = _identity(raw)
    if identity is None:
        return
    previous = candidates.get(identity)
    if previous is None:
        candidates[identity] = (order, session_id)
    elif order < previous[0]:
        candidates[identity] = (order, session_id or previous[1])
    elif previous[1] is None and session_id is not None:
        candidates[identity] = (previous[0], session_id)


def _managed_session(job: Mapping[str, object]) -> str | None:
    value = job.get("session_id")
    return value if isinstance(value, str) and value else None


def _legacy_session(record: Mapping[str, object]) -> str | None:
    prompt = record.get("prompt")
    if isinstance(prompt, list) and len(prompt) > 3 and isinstance(prompt[3], Mapping):
        client_id = prompt[3].get("client_id")
        if isinstance(client_id, str) and client_id:
            return client_id
    value = record.get("client_id")
    return value if isinstance(value, str) and value else None


def _legacy_order(record: Mapping[str, object], prompt_id: str) -> tuple[object, ...]:
    prompt = record.get("prompt")
    prompt_number: object = 0
    if isinstance(prompt, list) and prompt:
        prompt_number = prompt[0]
    return (0, _sortable_desc(prompt_number), prompt_id)


def _sortable_desc(value: object) -> tuple[int, object]:
    if isinstance(value, (int, float)):
        return (0, -value)
    return (1, str(value))


def _history_outputs(record: Mapping[str, object]) -> list[tuple[str, int, object]]:
    outputs = record.get("outputs")
    if not isinstance(outputs, Mapping):
        return []
    result: list[tuple[str, int, object]] = []
    for node_id, node_value in outputs.items():
        if not isinstance(node_value, Mapping):
            continue
        images = node_value.get("images")
        if isinstance(images, list):
            result.extend((str(node_id), index, image) for index, image in enumerate(images))
    return result


async def get_residual_history(
    payload: ResidualHistoryRequest,
    service: GenerationService,
) -> ResidualHistoryResponse:
    try:
        snapshot = service.snapshot()
        jobs = snapshot.get("jobs", []) if isinstance(snapshot, Mapping) else []
        candidates: dict[tuple[str, str, str], tuple[tuple[object, ...], str | None]] = {}
        if isinstance(jobs, list):
            managed_jobs = [
                job for job in jobs
                if isinstance(job, Mapping) and job.get("status") == "succeeded"
            ]
            # Stable passes keep job_id ascending within equal timestamps and nulls last.
            managed_jobs.sort(key=lambda job: str(job.get("job_id", "")))
            managed_jobs.sort(key=lambda job: str(job.get("finished_at") or ""), reverse=True)
            managed_jobs.sort(key=lambda job: job.get("finished_at") is None)
            for managed_rank, job in enumerate(managed_jobs):
                job_id = str(job.get("job_id", ""))
                finished_at = job.get("finished_at")
                outputs = job.get("outputs")
                if not isinstance(outputs, list):
                    continue
                for image in sorted(
                    (value for value in outputs if isinstance(value, Mapping)),
                    key=lambda value: (str(value.get("node_id", "")), int(value.get("index", 0) or 0)),
                ):
                    _add_output(
                        candidates,
                        image.get("view_url"),
                        (0, managed_rank, str(image.get("node_id", "")), int(image.get("index", 0) or 0)),
                        _managed_session(job),
                    )

        response = await get_comfy_client().get(
            f"{settings.comfy_url}/history", params={"max_items": 200}, timeout=15.0
        )
        response.raise_for_status()
        history = response.json()
        if not isinstance(history, Mapping):
            raise ValueError("Comfy history response must be an object")
        legacy: list[tuple[str, Mapping[str, object]]] = [
            (str(prompt_id), record)
            for prompt_id, record in history.items()
            if isinstance(record, Mapping)
        ]
        legacy.sort(key=lambda item: _legacy_order(item[1], item[0]))
        for prompt_id, record in legacy:
            session_id = _legacy_session(record)
            for node_id, index, legacy_image in sorted(_history_outputs(record), key=lambda item: (item[0], item[1])):
                _add_output(
                    candidates,
                    legacy_image,
                    (1, *_legacy_order(record, prompt_id), node_id, index),
                    session_id,
                )

        ordered = sorted(candidates.items(), key=lambda item: item[1][0])[:_CANDIDATE_LIMIT]
        excluded = {(item.filename, item.subfolder, item.type) for item in (*payload.known, *payload.examined)}
        pending = [(identity, data) for identity, data in ordered if identity not in excluded]
        page = pending[:_PAGE_SIZE]
        semaphore = asyncio.Semaphore(_PROBE_CONCURRENCY)

        async def probe(identity: tuple[str, str, str]):
            async with semaphore:
                return await probe_image_availability(*identity)

        results = await asyncio.gather(*(probe(identity) for identity, _ in page))
        items: list[ResidualHistoryItem] = []
        rejected: list[ResidualHistoryRejected] = []
        for ((filename, subfolder, image_type), (_, session_id)), result in zip(page, results, strict=True):
            image_identity = ImageIdentity(filename=filename, subfolder=subfolder, type=image_type)
            if result.availability == "present":
                query = urlencode({"filename": filename, "subfolder": subfolder, "type": image_type})
                items.append(ResidualHistoryItem(identity=image_identity, view_url=f"/api/comfy/view?{query}", session_id=session_id))
            else:
                rejected.append(ResidualHistoryRejected(identity=image_identity, availability=result.availability))
        return ResidualHistoryResponse(items=items, rejected=rejected, has_more=len(pending) > len(page))
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Residual history upstream read failed: %s", exc)
        raise HTTPException(status_code=503, detail="Residual history is unavailable") from exc
    except Exception as exc:
        logger.exception("Residual history read failed")
        raise HTTPException(status_code=503, detail="Residual history is unavailable") from exc
