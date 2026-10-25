from __future__ import annotations

import logging
from collections.abc import Callable, Coroutine
from urllib.parse import parse_qs, urlsplit
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError
from starlette.exceptions import HTTPException

from app.schemas.generation import (
    BatchAccepted,
    BatchRequest,
    CancelOperation,
    CancelRequest,
    CancelResult,
    ErrorDetail,
    ErrorEnvelope,
    ImageView,
    ReleaseOperation,
    ReleaseRequest,
    RequestLookup,
    StateSnapshot,
    UpstreamQueueView,
)
from app.services.generation_service import GenerationService
from app.services.residual_history import (
    ResidualHistoryRequest,
    ResidualHistoryResponse,
    get_residual_history,
)

logger = logging.getLogger(__name__)


def _error_response(
    status_code: int,
    code: str,
    message: str,
    *,
    outcome: str | None = None,
    request_id: str | None = None,
    job_id: str | None = None,
) -> JSONResponse:
    detail = ErrorDetail(
        code=code,
        message=message,
        outcome=outcome,  # type: ignore[arg-type]
        request_id=request_id,
        job_id=job_id,
    )
    return JSONResponse(
        status_code=status_code,
        content=ErrorEnvelope(detail=detail).model_dump(mode="json"),
    )


def _http_error(exc: HTTPException, request: Request | None = None) -> JSONResponse:
    detail = exc.detail
    try:
        parsed = ErrorDetail.model_validate(detail)
    except (ValidationError, TypeError):
        parsed = ErrorDetail(
            code={404: "not_found", 409: "conflict", 422: "validation_error", 503: "unavailable"}.get(exc.status_code, "generation_error"),
            message=str(detail),
            outcome="unconfirmed" if exc.status_code == 503 else "failed",
            request_id=request.headers.get("x-request-id") if request is not None else None,
            job_id=None,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorEnvelope(detail=parsed).model_dump(mode="json"),
    )


class GenerationAPIRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            try:
                return await original(request)
            except RequestValidationError as exc:
                messages = [str(error.get("msg", "invalid request")) for error in exc.errors()]
                return _error_response(422, "validation_error", "; ".join(messages))
            except HTTPException as exc:
                return _http_error(exc, request)

        return handler


router = APIRouter(
    prefix="/api/generation",
    tags=["generation"],
    route_class=GenerationAPIRoute,
)


def _service(request: Request) -> GenerationService:
    service = getattr(request.app.state, "generation_service", None)
    if not isinstance(service, GenerationService):
        raise HTTPException(status_code=503, detail="Generation service is unavailable")
    return service


def image_identity(image: ImageView) -> tuple[str, str, str] | None:
    """Return the upstream image identity shared by availability callers."""
    query = parse_qs(urlsplit(image.view_url).query)
    filename = query.get("filename", [""])[0]
    if not filename:
        return None
    return filename, query.get("subfolder", [""])[0], query.get("type", ["output"])[0]


@router.post("/batches", response_model=BatchAccepted, status_code=202)
async def submit_batch(payload: BatchRequest, service: GenerationService = Depends(_service)) -> Response:
    try:
        accepted = BatchAccepted.model_validate(await service.accept(payload))
        return JSONResponse(status_code=202, content=accepted.model_dump(mode="json"))
    except HTTPException as exc:
        return _http_error(exc)
    except Exception:
        logger.exception("Generation batch acceptance failed")
        return _error_response(503, "generation_acceptance_failed", "Generation request was not accepted", outcome="failed", request_id=payload.request_id)


@router.get("/state", response_model=StateSnapshot)
async def get_generation_state(service: GenerationService = Depends(_service)) -> Response:
    try:
        snapshot = StateSnapshot.model_validate(service.snapshot())
        return JSONResponse(status_code=200, content=snapshot.model_dump(mode="json"))
    except Exception:
        logger.exception("Generation state read failed")
        return _error_response(503, "generation_state_unavailable", "Generation state is unavailable", outcome="unconfirmed")


@router.get("/requests/{request_id}", response_model=RequestLookup)
async def get_request_lookup(request_id: str, service: GenerationService = Depends(_service)) -> Response:
    try:
        UUID(request_id)
        result = service.repository.find_request(request_id)
        if result is None:
            return _error_response(404, "request_not_found", "Generation request was not found", request_id=request_id)
        lookup = RequestLookup.model_validate(result)
        return JSONResponse(status_code=200, content=lookup.model_dump(mode="json"))
    except ValueError:
        return _error_response(422, "validation_error", "request_id must be a UUID", request_id=request_id)
    except HTTPException as exc:
        return _http_error(exc)
    except Exception:
        logger.exception("Generation request lookup failed")
        return _error_response(503, "request_lookup_unavailable", "Generation request lookup is unavailable", outcome="unconfirmed", request_id=request_id)


@router.post("/jobs/{job_id}/cancel", response_model=CancelResult)
async def cancel_job(
    job_id: str,
    request: Request,
    only_unsubmitted: bool = False,
    only_queued: bool = False,
    service: GenerationService = Depends(_service),
) -> Response:
    try:
        if only_unsubmitted and only_queued:
            raise HTTPException(status_code=422, detail="only_unsubmitted and only_queued cannot be combined")
        result = (
            await service.cancel_queued(job_id)
            if only_queued
            else await service.cancel_unsubmitted(job_id)
            if only_unsubmitted
            else await service.cancel(job_id)
        )
        if result.outcome == "rejected":
            return _error_response(404, "job_not_found", result.message, job_id=job_id)
        status_code = 202 if result.outcome == "unconfirmed" else 200
        return JSONResponse(status_code=status_code, content=result.model_dump(mode="json"))
    except HTTPException as exc:
        return _http_error(exc, request)
    except Exception:
        logger.exception("Generation cancellation failed for %s", job_id)
        return _error_response(503, "generation_cancel_unavailable", "Generation cancellation is unconfirmed", outcome="unconfirmed", job_id=job_id)


@router.post("/cancel", response_model=CancelOperation)
async def cancel_generations(payload: CancelRequest, request: Request, service: GenerationService = Depends(_service)) -> Response:
    try:
        result = await service.cancel_operation(payload)
        uncertain = (
            any(item.outcome == "unconfirmed" for item in result.items)
            or result.upstream_clear == "unconfirmed"
            or result.upstream_interrupt == "unconfirmed"
        )
        return JSONResponse(status_code=202 if uncertain else 200, content=result.model_dump(mode="json"))
    except HTTPException as exc:
        return _http_error(exc, request)
    except Exception:
        logger.exception("Generation cancellation operation failed")
        return _error_response(503, "generation_cancel_unavailable", "Generation cancellation is unconfirmed", outcome="unconfirmed")


@router.post("/release", response_model=ReleaseOperation)
async def release_generations(payload: ReleaseRequest, request: Request, service: GenerationService = Depends(_service)) -> Response:
    try:
        result = await service.release_unconfirmed(payload)
        return JSONResponse(status_code=200, content=result.model_dump(mode="json"))
    except HTTPException as exc:
        return _http_error(exc, request)
    except Exception:
        logger.exception("Generation release operation failed")
        return _error_response(503, "generation_release_unavailable", "Generation release could not be completed", outcome="unconfirmed")


@router.get("/upstream-queue", response_model=UpstreamQueueView)
async def get_upstream_queue(service: GenerationService = Depends(_service)) -> Response:
    try:
        queue = UpstreamQueueView.model_validate(await service.bridge.queue())
        return JSONResponse(status_code=200, content=queue.model_dump(mode="json"))
    except Exception:
        logger.exception("Upstream queue read failed")
        return _error_response(503, "upstream_queue_unavailable", "Upstream queue is unavailable", outcome="unconfirmed")


@router.get("/preview/{job_id}", response_class=Response)
async def get_preview(job_id: str, service: GenerationService = Depends(_service)) -> Response:
    try:
        job = service.find_job(job_id)
        if job is None:
            return _error_response(404, "job_not_found", "Generation job was not found", job_id=job_id)
        if job.prompt_id is None:
            return _error_response(404, "preview_not_found", "No preview is available for this job", job_id=job_id)
        preview = service.bridge.get_preview(job.prompt_id)
        if preview is None:
            return _error_response(404, "preview_not_found", "No preview is available for this job", job_id=job_id)
        frame, mime = preview
        return Response(content=frame, media_type=mime)
    except Exception:
        logger.exception("Generation preview read failed for %s", job_id)
        return _error_response(503, "preview_unavailable", "Generation preview is unavailable", outcome="unconfirmed", job_id=job_id)


@router.get("/images/{job_id}/availability", response_model=list[ImageView])
async def get_image_availability(job_id: str, service: GenerationService = Depends(_service)) -> Response:
    try:
        job = service.find_job(job_id)
        if job is None:
            return _error_response(404, "job_not_found", "Generation job was not found", job_id=job_id)
        from app.routers.comfy import probe_image_availability

        updated: list[ImageView] = []
        for image in job.outputs:
            identity = image_identity(image)
            if identity is None:
                updated.append(image)
                continue
            result = await probe_image_availability(
                *identity,
            )
            updated.append(image.model_copy(update={"availability": result.availability}))
        return JSONResponse(status_code=200, content=[item.model_dump(mode="json") for item in updated])
    except Exception:
        logger.exception("Image availability check failed for %s", job_id)
        return _error_response(503, "image_availability_unavailable", "Image availability is unknown", outcome="unconfirmed", job_id=job_id)


@router.post("/history/residual", response_model=ResidualHistoryResponse)
async def get_residual_generation_history(
    payload: ResidualHistoryRequest,
    service: GenerationService = Depends(_service),
) -> ResidualHistoryResponse:
    return await get_residual_history(payload, service)
