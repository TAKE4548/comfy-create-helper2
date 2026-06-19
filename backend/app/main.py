"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import engine, SessionLocal
from app import models
from app.seeder import seed_initial_data
from app.routers import (
    workflows, mapping_masters, snapshots, albums,
    loras, tag_sets, categories, audit, llm_prompts,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def run_migrations():
    """Run simple migrations for SQLite database to add missing columns."""
    import sqlalchemy as sa
    with engine.begin() as conn:
        inspector = sa.inspect(conn)
        
        # Add default_applied_assets to workflows if not exists
        if "workflows" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("workflows")]
            if "default_applied_assets" not in columns:
                conn.execute(sa.text("ALTER TABLE workflows ADD COLUMN default_applied_assets TEXT"))
                logger.info("Migrated: Added 'default_applied_assets' column to 'workflows' table.")
                
        # Add role to snapshot_loras if not exists
        if "snapshot_loras" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("snapshot_loras")]
            if "role" not in columns:
                conn.execute(sa.text("ALTER TABLE snapshot_loras ADD COLUMN role VARCHAR NOT NULL DEFAULT 'positive'"))
                logger.info("Migrated: Added 'role' column to 'snapshot_loras' table.")
                
        # Add role to snapshot_tag_sets if not exists
        if "snapshot_tag_sets" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("snapshot_tag_sets")]
            if "role" not in columns:
                conn.execute(sa.text("ALTER TABLE snapshot_tag_sets ADD COLUMN role VARCHAR NOT NULL DEFAULT 'positive'"))
                logger.info("Migrated: Added 'role' column to 'snapshot_tag_sets' table.")
                
        # Add thumbnail_path to tag_sets if not exists
        if "tag_sets" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("tag_sets")]
            if "thumbnail_path" not in columns:
                conn.execute(sa.text("ALTER TABLE tag_sets ADD COLUMN thumbnail_path TEXT"))
                logger.info("Migrated: Added 'thumbnail_path' column to 'tag_sets' table.")


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
    logger.info("Prompt Surgeon API shutting down.")


app = FastAPI(
    title="Prompt Surgeon API",
    description="ComfyUI workflow management and LLM audit relay API.",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
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


app.mount("/api/snapshots/images", StaticFiles(directory=settings.snapshot_path), name="snapshots_images")


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/api/config")
def get_config():
    return {"comfy_url": settings.comfy_url}
