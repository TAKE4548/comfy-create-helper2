"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

import os
from pathlib import Path
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.types import Scope

from app.config import settings
from app.logging_config import setup_logging
from app.middleware.request_logging import RequestLoggingMiddleware
from app.database import engine, SessionLocal
from app import models
from app.migrations import run_migrations
from app.seeder import seed_initial_data
from app.routers import (
    workflows, mapping_masters, snapshots, albums,
    loras, tag_sets, categories, audit, llm_prompts,
    presets, bypass_profiles, base_models, fonts,
    param_type_masters, comfy, param_sync_groups,
    speech_bubble_presets, speech_tone_presets,
    translate, speech_batch,
    prompt_metadata, system_logs,
)
from fastapi.responses import JSONResponse
from fastapi.requests import Request
import traceback

setup_logging(log_dir=settings.log_path, log_level=settings.log_level, retention_days=settings.log_retention_days)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    try:
        run_migrations()
    except Exception as e:
        logger.error(f"Failed to run migration: {e}")
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    logger.info("Prompt Surgeon API started.")
    yield
    try:
        await comfy.close_comfy_client()
    except Exception as e:
        logger.error(f"Failed to close Comfy client: {e}")
    logger.info("Prompt Surgeon API shutting down.")


app = FastAPI(
    title="Prompt Surgeon API",
    description="ComfyUI workflow management and LLM audit relay API.",
    version="2.0.0",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {str(exc)}",
        exc_info=True,
        extra={
            "request_id": request_id,
            "source": "backend",
            "http": {
                "method": request.method,
                "path": request.url.path,
                "status_code": 500,
                "client_ip": request.client.host if request.client else None,
            },
            "error": {
                "type": type(exc).__name__,
                "message": str(exc),
                "stack_trace": traceback.format_exc(),
            },
        },
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "request_id": request_id},
    )


# Middlewares
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(system_logs.router)
app.include_router(workflows.router)
app.include_router(mapping_masters.router)
app.include_router(snapshots.router)
app.include_router(albums.router)
app.include_router(loras.router)
app.include_router(tag_sets.router)
app.include_router(categories.lora_router)
app.include_router(categories.tagset_router)
app.include_router(audit.router)
app.include_router(llm_prompts.router)
app.include_router(presets.router)
app.include_router(bypass_profiles.router)
app.include_router(base_models.router)
app.include_router(fonts.router)
app.include_router(param_type_masters.router)
app.include_router(comfy.router)
app.include_router(param_sync_groups.router)
app.include_router(speech_bubble_presets.router)
app.include_router(speech_tone_presets.router)
app.include_router(translate.router)
app.include_router(speech_batch.router)
app.include_router(prompt_metadata.router)





class CachedStaticFiles(StaticFiles):
    def file_response(
        self,
        path: str,
        stat_result: os.stat_result,
        scope: dict,
        status_code: int = 200,
    ) -> Response:
        response = super().file_response(path, stat_result, scope, status_code)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


app.mount("/api/snapshots/images", CachedStaticFiles(directory=settings.snapshot_path), name="snapshots_images")


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/api/config")
def get_config():
    return {"comfy_url": settings.comfy_url}


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        norm_path = path.replace("\\", "/")
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code == 404:
                if norm_path.startswith("api/") or norm_path == "api":
                    return JSONResponse(status_code=404, content={"detail": "Not Found"})
                if not Path(norm_path).suffix:
                    return await super().get_response("index.html", scope)
            raise exc


frontend_dist = settings.frontend_dist_path
if (frontend_dist / "index.html").exists():
    app.mount("/", SPAStaticFiles(directory=str(frontend_dist), html=True), name="frontend")
else:
    @app.get("/")
    def frontend_fallback():
        return JSONResponse(
            status_code=200,
            content={
                "message": "Prompt Surgeon Backend is running.",
                "frontend": "Frontend build not found. Run 'npm run build' in frontend/ to generate dist files.",
                "docs": "/docs",
                "health": "/health",
            },
        )
