"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

import os
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import engine, SessionLocal
from app import models
from app.seeder import seed_initial_data
from app.routers import (
    workflows, mapping_masters, snapshots, albums,
    loras, tag_sets, categories, audit, llm_prompts,
    presets, bypass_profiles, base_models, fonts,
    param_type_masters, comfy, param_sync_groups,
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
                
        # Add target_base_model_id to workflows if not exists
        if "workflows" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("workflows")]
            if "target_base_model_id" not in columns:
                conn.execute(sa.text("ALTER TABLE workflows ADD COLUMN target_base_model_id INTEGER REFERENCES base_models(id) ON DELETE SET NULL"))
                logger.info("Migrated: Added 'target_base_model_id' column to 'workflows' table.")
                
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

        # Add source_snapshot_id to snapshots if not exists
        if "snapshots" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("snapshots")]
            if "source_snapshot_id" not in columns:
                conn.execute(sa.text("ALTER TABLE snapshots ADD COLUMN source_snapshot_id INTEGER REFERENCES snapshots(id) ON DELETE SET NULL"))
                logger.info("Migrated: Added 'source_snapshot_id' column to 'snapshots' table.")

        # Migrate unique constraint for snapshot_loras if old exists
        if "snapshot_loras" in inspector.get_table_names():
            constraints = inspector.get_unique_constraints("snapshot_loras")
            has_old_constraint = False
            for c in constraints:
                cols = c.get("column_names", [])
                if len(cols) == 2 and "snapshot_id" in cols and "lora_id" in cols:
                    has_old_constraint = True
                    break
            if has_old_constraint:
                logger.info("Migrating snapshot_loras unique constraint to include role...")
                conn.execute(sa.text("""
                    CREATE TABLE snapshot_loras_new (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        snapshot_id INTEGER NOT NULL,
                        lora_id INTEGER NOT NULL,
                        strength FLOAT NOT NULL,
                        role VARCHAR NOT NULL DEFAULT 'positive',
                        UNIQUE (snapshot_id, lora_id, role),
                        FOREIGN KEY(snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE,
                        FOREIGN KEY(lora_id) REFERENCES loras (id) ON DELETE CASCADE
                    );
                """))
                conn.execute(sa.text("""
                    INSERT INTO snapshot_loras_new (id, snapshot_id, lora_id, strength, role)
                    SELECT id, snapshot_id, lora_id, strength, role FROM snapshot_loras;
                """))
                conn.execute(sa.text("DROP TABLE snapshot_loras;"))
                conn.execute(sa.text("ALTER TABLE snapshot_loras_new RENAME TO snapshot_loras;"))
                logger.info("Migrated snapshot_loras unique constraint.")

        # Migrate unique constraint for snapshot_tag_sets if old exists
        if "snapshot_tag_sets" in inspector.get_table_names():
            constraints = inspector.get_unique_constraints("snapshot_tag_sets")
            has_old_constraint = False
            for c in constraints:
                cols = c.get("column_names", [])
                if len(cols) == 2 and "snapshot_id" in cols and "tag_set_id" in cols:
                    has_old_constraint = True
                    break
            if has_old_constraint:
                logger.info("Migrating snapshot_tag_sets unique constraint to include role...")
                conn.execute(sa.text("""
                    CREATE TABLE snapshot_tag_sets_new (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        snapshot_id INTEGER NOT NULL,
                        tag_set_id INTEGER NOT NULL,
                        role VARCHAR NOT NULL DEFAULT 'positive',
                        UNIQUE (snapshot_id, tag_set_id, role),
                        FOREIGN KEY(snapshot_id) REFERENCES snapshots (id) ON DELETE CASCADE,
                        FOREIGN KEY(tag_set_id) REFERENCES tag_sets (id) ON DELETE CASCADE
                    );
                """))
                conn.execute(sa.text("""
                    INSERT INTO snapshot_tag_sets_new (id, snapshot_id, tag_set_id, role)
                    SELECT id, snapshot_id, tag_set_id, role FROM snapshot_tag_sets;
                """))
                conn.execute(sa.text("DROP TABLE snapshot_tag_sets;"))
                conn.execute(sa.text("ALTER TABLE snapshot_tag_sets_new RENAME TO snapshot_tag_sets;"))
                logger.info("Migrated snapshot_tag_sets unique constraint.")
                
        # Add thumbnail_path to tag_sets if not exists
        if "tag_sets" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("tag_sets")]
            if "thumbnail_path" not in columns:
                conn.execute(sa.text("ALTER TABLE tag_sets ADD COLUMN thumbnail_path TEXT"))
                logger.info("Migrated: Added 'thumbnail_path' column to 'tag_sets' table.")

        # Add sort_order to mapping_master if not exists
        if "mapping_master" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("mapping_master")]
            if "sort_order" not in columns:
                conn.execute(sa.text("ALTER TABLE mapping_master ADD COLUMN sort_order INTEGER DEFAULT 0"))
                # Initialize existing rows: sort_order = row number based on id order
                conn.execute(sa.text("""
                    UPDATE mapping_master SET sort_order = (
                        SELECT COUNT(*) FROM mapping_master AS m2 WHERE m2.id <= mapping_master.id
                    ) - 1
                """))
                logger.info("Migrated: Added 'sort_order' column to 'mapping_master' table.")

        # Add sort_order to loras if not exists
        if "loras" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("loras")]
            if "sort_order" not in columns:
                conn.execute(sa.text("ALTER TABLE loras ADD COLUMN sort_order INTEGER DEFAULT 0"))
                conn.execute(sa.text("""
                    UPDATE loras SET sort_order = (
                        SELECT COUNT(*) FROM loras AS m2 WHERE m2.id <= loras.id
                    ) - 1
                """))
                logger.info("Migrated: Added 'sort_order' column to 'loras' table.")

        # Add sort_order to tag_sets if not exists
        if "tag_sets" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("tag_sets")]
            if "sort_order" not in columns:
                conn.execute(sa.text("ALTER TABLE tag_sets ADD COLUMN sort_order INTEGER DEFAULT 0"))
                conn.execute(sa.text("""
                    UPDATE tag_sets SET sort_order = (
                        SELECT COUNT(*) FROM tag_sets AS m2 WHERE m2.id <= tag_sets.id
                    ) - 1
                """))
                logger.info("Migrated: Added 'sort_order' column to 'tag_sets' table.")

        # Add sort_order to lora_categories if not exists
        if "lora_categories" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("lora_categories")]
            if "sort_order" not in columns:
                conn.execute(sa.text("ALTER TABLE lora_categories ADD COLUMN sort_order INTEGER DEFAULT 0"))
                conn.execute(sa.text("""
                    UPDATE lora_categories SET sort_order = (
                        SELECT COUNT(*) FROM lora_categories AS m2 WHERE m2.name <= lora_categories.name
                    ) - 1
                """))
                logger.info("Migrated: Added 'sort_order' column to 'lora_categories' table.")

        # Add sort_order to tagset_categories if not exists
        if "tagset_categories" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("tagset_categories")]
            if "sort_order" not in columns:
                conn.execute(sa.text("ALTER TABLE tagset_categories ADD COLUMN sort_order INTEGER DEFAULT 0"))
                conn.execute(sa.text("""
                    UPDATE tagset_categories SET sort_order = (
                        SELECT COUNT(*) FROM tagset_categories AS m2 WHERE m2.name <= tagset_categories.name
                    ) - 1
                """))
                logger.info("Migrated: Added 'sort_order' column to 'tagset_categories' table.")

        # Create param_type_masters table if not exists
        if "param_type_masters" not in inspector.get_table_names():
            conn.execute(sa.text("""
                CREATE TABLE param_type_masters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL UNIQUE,
                    widget_type VARCHAR NOT NULL DEFAULT 'select',
                    combo_options TEXT,
                    min_value FLOAT,
                    max_value FLOAT,
                    step FLOAT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("Migrated: Created 'param_type_masters' table.")


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
app.include_router(presets.router)
app.include_router(bypass_profiles.router)
app.include_router(base_models.router)
app.include_router(fonts.router)
app.include_router(param_type_masters.router)
app.include_router(comfy.router)
app.include_router(param_sync_groups.router)


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
