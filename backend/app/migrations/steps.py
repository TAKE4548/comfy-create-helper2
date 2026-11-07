import json
import logging
from typing import Callable, List, Optional
import sqlalchemy as sa
from sqlalchemy.engine import Connection
from sqlalchemy.engine.reflection import Inspector

from app.services.variant_keys import KeyKind, VariantIndex, normalize_params

logger = logging.getLogger(__name__)


class MigrationStep:
    def __init__(self, step_id: str, name: str, apply_fn: Callable[[Connection, Inspector], None]):
        self.step_id = step_id
        self.name = name
        self.apply_fn = apply_fn

    def apply(self, conn: Connection, inspector: Inspector) -> None:
        self.apply_fn(conn, inspector)


def step_001_workflows_columns(conn: Connection, inspector: Inspector) -> None:
    if "workflows" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("workflows")]
        if "default_applied_assets" not in columns:
            conn.execute(sa.text("ALTER TABLE workflows ADD COLUMN default_applied_assets TEXT"))
            logger.info("Migrated: Added 'default_applied_assets' column to 'workflows' table.")
        if "target_base_model_id" not in columns:
            conn.execute(sa.text("ALTER TABLE workflows ADD COLUMN target_base_model_id INTEGER REFERENCES base_models(id) ON DELETE SET NULL"))
            logger.info("Migrated: Added 'target_base_model_id' column to 'workflows' table.")


def step_002_snapshot_loras_and_tag_sets_roles(conn: Connection, inspector: Inspector) -> None:
    # snapshot_loras role column
    if "snapshot_loras" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("snapshot_loras")]
        if "role" not in columns:
            conn.execute(sa.text("ALTER TABLE snapshot_loras ADD COLUMN role VARCHAR NOT NULL DEFAULT 'positive'"))
            logger.info("Migrated: Added 'role' column to 'snapshot_loras' table.")

    # snapshot_tag_sets role column
    if "snapshot_tag_sets" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("snapshot_tag_sets")]
        if "role" not in columns:
            conn.execute(sa.text("ALTER TABLE snapshot_tag_sets ADD COLUMN role VARCHAR NOT NULL DEFAULT 'positive'"))
            logger.info("Migrated: Added 'role' column to 'snapshot_tag_sets' table.")

    # snapshot_loras unique constraint migration
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

    # snapshot_tag_sets unique constraint migration
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


def step_003_snapshots_source_and_thumbnail(conn: Connection, inspector: Inspector) -> None:
    if "snapshots" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("snapshots")]
        if "source_snapshot_id" not in columns:
            conn.execute(sa.text("ALTER TABLE snapshots ADD COLUMN source_snapshot_id INTEGER REFERENCES snapshots(id) ON DELETE SET NULL"))
            logger.info("Migrated: Added 'source_snapshot_id' column to 'snapshots' table.")
        if "thumbnail_path" not in columns:
            conn.execute(sa.text("ALTER TABLE snapshots ADD COLUMN thumbnail_path TEXT"))
            logger.info("Migrated: Added 'thumbnail_path' column to 'snapshots' table.")


def step_004_tag_sets_thumbnail_and_sort_order(conn: Connection, inspector: Inspector) -> None:
    if "tag_sets" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("tag_sets")]
        if "thumbnail_path" not in columns:
            conn.execute(sa.text("ALTER TABLE tag_sets ADD COLUMN thumbnail_path TEXT"))
            logger.info("Migrated: Added 'thumbnail_path' column to 'tag_sets' table.")
        if "sort_order" not in columns:
            conn.execute(sa.text("ALTER TABLE tag_sets ADD COLUMN sort_order INTEGER DEFAULT 0"))
            conn.execute(sa.text("""
                UPDATE tag_sets SET sort_order = (
                    SELECT COUNT(*) FROM tag_sets AS m2 WHERE m2.id <= tag_sets.id
                ) - 1
            """))
            logger.info("Migrated: Added 'sort_order' column to 'tag_sets' table.")


def step_005_master_tables_sort_order(conn: Connection, inspector: Inspector) -> None:
    for tbl in ("mapping_master", "mapping_masters"):
        if tbl in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns(tbl)]
            if "sort_order" not in columns:
                conn.execute(sa.text(f"ALTER TABLE {tbl} ADD COLUMN sort_order INTEGER DEFAULT 0"))
                conn.execute(sa.text(f"""
                    UPDATE {tbl} SET sort_order = (
                        SELECT COUNT(*) FROM {tbl} AS m2 WHERE m2.id <= {tbl}.id
                    ) - 1
                """))
                logger.info(f"Migrated: Added 'sort_order' column to '{tbl}' table.")

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

    if "albums" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("albums")]
        if "sort_order" not in columns:
            conn.execute(sa.text("ALTER TABLE albums ADD COLUMN sort_order INTEGER DEFAULT 0"))
            conn.execute(sa.text("""
                UPDATE albums SET sort_order = (
                    SELECT COUNT(*) FROM albums AS a2 WHERE a2.id <= albums.id
                ) - 1
            """))
            logger.info("Migrated: Added 'sort_order' column to 'albums' table.")


def step_006_create_param_type_masters(conn: Connection, inspector: Inspector) -> None:
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


def step_007_speech_bubble_presets_and_constraints(conn: Connection, inspector: Inspector) -> None:
    if "speech_bubble_presets" not in inspector.get_table_names():
        conn.execute(sa.text("""
            CREATE TABLE speech_bubble_presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL,
                shape VARCHAR NOT NULL DEFAULT 'oval',
                orientation VARCHAR NOT NULL DEFAULT 'vertical',
                font_family VARCHAR NOT NULL DEFAULT 'sans-serif',
                font_size INTEGER NOT NULL DEFAULT 0,
                text_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                background_color VARCHAR NOT NULL DEFAULT 'rgba(255, 255, 255, 0.95)',
                border_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                border_width INTEGER NOT NULL DEFAULT 2,
                sort_order INTEGER NOT NULL DEFAULT 0,
                effects_json TEXT DEFAULT '{}',
                text TEXT DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (name, orientation)
            )
        """))
        logger.info("Migrated: Created 'speech_bubble_presets' table.")

    if "speech_bubble_presets" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("speech_bubble_presets")]
        if "effects_json" not in columns:
            conn.execute(sa.text("ALTER TABLE speech_bubble_presets ADD COLUMN effects_json TEXT DEFAULT '{}'"))
            logger.info("Migrated: Added 'effects_json' column to 'speech_bubble_presets' table.")
        if "text" not in columns:
            conn.execute(sa.text("ALTER TABLE speech_bubble_presets ADD COLUMN text TEXT DEFAULT NULL"))
            logger.info("Migrated: Added 'text' column to 'speech_bubble_presets' table.")

    if "speech_bubble_presets" in inspector.get_table_names():
        refreshed_inspector = sa.inspect(conn)
        constraints = refreshed_inspector.get_unique_constraints("speech_bubble_presets")
        indexes = refreshed_inspector.get_indexes("speech_bubble_presets")
        has_old_unique_name = False
        for c in constraints:
            cols = c.get("column_names", [])
            if cols == ["name"]:
                has_old_unique_name = True
                break
        if not has_old_unique_name:
            for idx in indexes:
                if idx.get("unique") and idx.get("column_names") == ["name"]:
                    has_old_unique_name = True
                    break

        if has_old_unique_name:
            logger.info("Migrating speech_bubble_presets unique constraint to (name, orientation)...")
            conn.execute(sa.text("""
                CREATE TABLE speech_bubble_presets_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL,
                    shape VARCHAR NOT NULL DEFAULT 'oval',
                    orientation VARCHAR NOT NULL DEFAULT 'vertical',
                    font_family VARCHAR NOT NULL DEFAULT 'sans-serif',
                    font_size INTEGER NOT NULL DEFAULT 0,
                    text_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    background_color VARCHAR NOT NULL DEFAULT 'rgba(255, 255, 255, 0.95)',
                    border_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    border_width INTEGER NOT NULL DEFAULT 2,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    effects_json TEXT DEFAULT '{}',
                    text TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (name, orientation)
                );
            """))
            cols = [c["name"] for c in refreshed_inspector.get_columns("speech_bubble_presets")]
            def col_val(c_name: str, default_expr: str) -> str:
                return c_name if c_name in cols else default_expr

            conn.execute(sa.text(f"""
                INSERT INTO speech_bubble_presets_new (
                    id, name, shape, orientation, font_family, font_size,
                    text_color, background_color, border_color, border_width,
                    sort_order, effects_json, text, created_at
                )
                SELECT
                    {col_val("id", "NULL")},
                    {col_val("name", "''")},
                    {col_val("shape", "'oval'")},
                    {col_val("orientation", "'vertical'")},
                    {col_val("font_family", "'sans-serif'")},
                    {col_val("font_size", "0")},
                    {col_val("text_color", "'rgba(0, 0, 0, 1)'")},
                    {col_val("background_color", "'rgba(255, 255, 255, 0.95)'")},
                    {col_val("border_color", "'rgba(0, 0, 0, 1)'")},
                    {col_val("border_width", "2")},
                    {col_val("sort_order", "0")},
                    {col_val("effects_json", "'{}'")},
                    {col_val("text", "NULL")},
                    {col_val("created_at", "CURRENT_TIMESTAMP")}
                FROM speech_bubble_presets;
            """))
            conn.execute(sa.text("DROP TABLE speech_bubble_presets;"))
            conn.execute(sa.text("ALTER TABLE speech_bubble_presets_new RENAME TO speech_bubble_presets;"))
            logger.info("Migrated speech_bubble_presets unique constraint.")


def step_008_create_speech_tone_presets(conn: Connection, inspector: Inspector) -> None:
    if "speech_tone_presets" not in inspector.get_table_names():
        conn.execute(sa.text("""
            CREATE TABLE speech_tone_presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL UNIQUE,
                prompt TEXT NOT NULL,
                description TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        logger.info("Migrated: Created 'speech_tone_presets' table.")


def step_009_workflow_presets_updated_at(conn: Connection, inspector: Inspector) -> None:
    if "workflow_presets" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("workflow_presets")]
        if "updated_at" not in columns:
            conn.execute(sa.text("ALTER TABLE workflow_presets ADD COLUMN updated_at DATETIME"))
            conn.execute(sa.text("UPDATE workflow_presets SET updated_at = created_at WHERE updated_at IS NULL"))
            logger.info("Migrated: Added 'updated_at' column to 'workflow_presets' table.")


def step_010_create_prompt_metadata(conn: Connection, inspector: Inspector) -> None:
    if "prompt_metadata" not in inspector.get_table_names():
        conn.execute(sa.text("""
            CREATE TABLE prompt_metadata (
                prompt_id VARCHAR PRIMARY KEY,
                workflow_id INTEGER,
                param_values TEXT NOT NULL,
                applied_assets TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        logger.info("Migrated: Created 'prompt_metadata' table.")


def step_011_create_workflow_history(conn: Connection, inspector: Inspector) -> None:
    if "workflow_history" not in inspector.get_table_names():
        conn.execute(sa.text("""
            CREATE TABLE workflow_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
                json_body TEXT NOT NULL,
                mappings TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        logger.info("Migrated: Created 'workflow_history' table.")


def step_012_speech_bubble_presets_tag_set_id(conn: Connection, inspector: Inspector) -> None:
    if "speech_bubble_presets" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("speech_bubble_presets")]
        if "tag_set_id" not in columns:
            conn.execute(sa.text("ALTER TABLE speech_bubble_presets ADD COLUMN tag_set_id INTEGER REFERENCES tag_sets(id) ON DELETE SET NULL"))
            logger.info("Migrated: Added 'tag_set_id' column to 'speech_bubble_presets' table.")
        if "is_default" not in columns:
            conn.execute(sa.text("ALTER TABLE speech_bubble_presets ADD COLUMN is_default BOOLEAN DEFAULT 1 NOT NULL"))
            logger.info("Migrated: Added 'is_default' column to 'speech_bubble_presets' table.")
        if "tone_preset_id" not in columns:
            conn.execute(sa.text("ALTER TABLE speech_bubble_presets ADD COLUMN tone_preset_id INTEGER REFERENCES speech_tone_presets(id) ON DELETE SET NULL"))
            logger.info("Migrated: Added 'tone_preset_id' column to 'speech_bubble_presets' table.")


def step_025_lora_studio_tables(conn: Connection, inspector: Inspector) -> None:
    tables = inspector.get_table_names()
    if "dataset_projects" not in tables:
        conn.execute(sa.text("""
            CREATE TABLE dataset_projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(255) NOT NULL,
                character_trigger VARCHAR(100) NOT NULL,
                outfit_trigger VARCHAR(100) NOT NULL,
                workflow_id INTEGER NOT NULL REFERENCES workflows(id),
                prompt_meta TEXT NOT NULL,
                prompt_physical TEXT NOT NULL,
                prompt_exclusive_outfit TEXT NOT NULL,
                selected_alt_outfits TEXT NOT NULL DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        logger.info("Migrated: Created 'dataset_projects' table.")

    if "dataset_items" not in tables:
        conn.execute(sa.text("""
            CREATE TABLE dataset_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES dataset_projects(id) ON DELETE CASCADE,
                slot_index INTEGER NOT NULL,
                factors_json TEXT NOT NULL,
                raw_prompt TEXT NOT NULL,
                caption_text TEXT NOT NULL,
                image_path VARCHAR(500),
                seed INTEGER NOT NULL,
                status VARCHAR(50) DEFAULT 'APPROVED'
            )
        """))
        logger.info("Migrated: Created 'dataset_items' table.")

    if "outfit_master_presets" not in tables:
        conn.execute(sa.text("""
            CREATE TABLE outfit_master_presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50) NOT NULL,
                prompt_tags TEXT NOT NULL,
                is_builtin BOOLEAN DEFAULT 1 NOT NULL
            )
        """))
        logger.info("Migrated: Created 'outfit_master_presets' table.")

    presets = [
        ("カジュアル (Casual Street)", "casual", "casual oversized hoodie, denim jeans, sneakers", 1),
        ("シンプル部屋着 (Roomwear)", "roomwear", "plain white t-shirt, gray sweatpants, bare feet", 1),
        ("水着 (Swimsuit)", "swimsuit", "simple two-piece bikini, sandals", 1),
        ("フォーマルスーツ (Business Suit)", "formal", "formal suit, necktie, dress shirt, slacks", 1),
    ]
    for name, category, prompt_tags, is_builtin in presets:
        existing = conn.execute(
            sa.text("SELECT id FROM outfit_master_presets WHERE name = :name"),
            {"name": name}
        ).fetchone()
        if not existing:
            conn.execute(
                sa.text("""
                    INSERT INTO outfit_master_presets (name, category, prompt_tags, is_builtin)
                    VALUES (:name, :category, :prompt_tags, :is_builtin)
                """),
                {"name": name, "category": category, "prompt_tags": prompt_tags, "is_builtin": is_builtin}
            )
            logger.info("Migrated: Seeded built-in outfit preset '%s'.", name)

    if "lora_training_jobs" not in tables:
        conn.execute(sa.text("""
            CREATE TABLE lora_training_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES dataset_projects(id),
                lora_name VARCHAR(150) NOT NULL,
                model_type VARCHAR(50) DEFAULT 'anima_2b' NOT NULL,
                config_toml_content TEXT NOT NULL,
                epochs INTEGER NOT NULL,
                repeats INTEGER NOT NULL,
                batch_size INTEGER NOT NULL,
                total_steps INTEGER NOT NULL,
                network_dim INTEGER NOT NULL,
                network_alpha INTEGER NOT NULL,
                learning_rate VARCHAR(50) NOT NULL,
                status VARCHAR(50) DEFAULT 'IDLE' NOT NULL,
                final_loss FLOAT,
                pid INTEGER
            )
        """))
        logger.info("Migrated: Created 'lora_training_jobs' table.")


def step_026_dataset_projects_prompt_negative(conn: Connection, inspector: Inspector) -> None:
    if "dataset_projects" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("dataset_projects")]
        if "prompt_negative" not in columns:
            conn.execute(sa.text("ALTER TABLE dataset_projects ADD COLUMN prompt_negative TEXT NOT NULL DEFAULT ''"))
            logger.info("Migrated: Added 'prompt_negative' column to 'dataset_projects' table.")


def step_027_generation_jobs(conn: Connection, inspector: Inspector) -> None:
    if "generation_jobs" in inspector.get_table_names():
        return

    conn.execute(sa.text("""
        CREATE TABLE generation_jobs (
            job_id VARCHAR NOT NULL PRIMARY KEY,
            request_id VARCHAR NOT NULL,
            item_index INTEGER NOT NULL,
            payload_hash VARCHAR NOT NULL,
            prompt_id VARCHAR,
            session_id VARCHAR NOT NULL,
            scope VARCHAR NOT NULL CHECK (scope IN ('normal', 'studio')),
            batch_id VARCHAR NOT NULL,
            normal_group_id VARCHAR,
            project_id INTEGER,
            set_name VARCHAR,
            status VARCHAR DEFAULT 'queued' NOT NULL,
            graph_json TEXT,
            metadata_json TEXT DEFAULT '{}' NOT NULL,
            outputs_json TEXT DEFAULT '[]' NOT NULL,
            node_json TEXT,
            accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            started_at DATETIME,
            finished_at DATETIME,
            failure_json TEXT,
            cancel_requested BOOLEAN DEFAULT 0 NOT NULL,
            CONSTRAINT uq_generation_jobs_request_item UNIQUE (request_id, item_index),
            UNIQUE (prompt_id)
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX ix_generation_jobs_batch_id ON generation_jobs (batch_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX ix_generation_jobs_normal_group_id ON generation_jobs (normal_group_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX ix_generation_jobs_status ON generation_jobs (status)"
    ))
    logger.info("Migrated: Created 'generation_jobs' table and indexes.")


def step_028_tag_subsets_thumbnail_path(conn: Connection, inspector: Inspector) -> None:
    if "tag_subsets" not in inspector.get_table_names():
        return

    columns = [column["name"] for column in inspector.get_columns("tag_subsets")]
    if "thumbnail_path" not in columns:
        conn.execute(sa.text("ALTER TABLE tag_subsets ADD COLUMN thumbnail_path TEXT"))
        logger.info("Migrated: Added 'thumbnail_path' column to 'tag_subsets' table.")


def step_029_workflow_mapping_v2_normalization(conn: Connection, inspector: Inspector) -> None:
    table_names = inspector.get_table_names()

    # 1. Rename mapping_master -> mapping_masters if legacy exists
    if "mapping_master" in table_names and "mapping_masters" not in table_names:
        conn.execute(sa.text("ALTER TABLE mapping_master RENAME TO mapping_masters"))
        logger.info("Migrated: Renamed 'mapping_master' table to 'mapping_masters'.")
        table_names = [("mapping_masters" if t == "mapping_master" else t) for t in table_names]

    # 2. Create mapping_group_masters table if not exists
    if "mapping_group_masters" not in table_names:
        conn.execute(sa.text("""
            CREATE TABLE mapping_group_masters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key VARCHAR NOT NULL UNIQUE,
                name VARCHAR NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_builtin BOOLEAN NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT 1
            )
        """))
        logger.info("Migrated: Created 'mapping_group_masters' table.")

    # 3. Create stage_masters table if not exists
    if "stage_masters" not in table_names:
        conn.execute(sa.text("""
            CREATE TABLE stage_masters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key VARCHAR NOT NULL UNIQUE,
                name VARCHAR NOT NULL,
                suffix VARCHAR NOT NULL DEFAULT '',
                search_keywords TEXT,
                previous_suffixes TEXT,
                is_builtin BOOLEAN NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0
            )
        """))
        logger.info("Migrated: Created 'stage_masters' table.")

    # 4. Create mapping_masters table if not exists
    if "mapping_masters" not in table_names:
        conn.execute(sa.text("""
            CREATE TABLE mapping_masters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER REFERENCES mapping_group_masters(id) ON DELETE SET NULL,
                base_key VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                param_name VARCHAR NOT NULL,
                input_type VARCHAR NOT NULL,
                expected_class_types TEXT,
                base_title_patterns TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                role VARCHAR,
                display_name VARCHAR,
                title_patterns TEXT
            )
        """))
        logger.info("Migrated: Created 'mapping_masters' table.")
    else:
        cols = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(mapping_masters)")).fetchall()}
        if "group_id" not in cols:
            conn.execute(sa.text("ALTER TABLE mapping_masters ADD COLUMN group_id INTEGER REFERENCES mapping_group_masters(id) ON DELETE SET NULL"))
            logger.info("Migrated: Added 'group_id' column to 'mapping_masters' table.")
        if "base_key" not in cols:
            conn.execute(sa.text("ALTER TABLE mapping_masters ADD COLUMN base_key VARCHAR"))
            logger.info("Migrated: Added 'base_key' column to 'mapping_masters' table.")
        if "name" not in cols:
            conn.execute(sa.text("ALTER TABLE mapping_masters ADD COLUMN name VARCHAR"))
            logger.info("Migrated: Added 'name' column to 'mapping_masters' table.")
        if "base_title_patterns" not in cols:
            conn.execute(sa.text("ALTER TABLE mapping_masters ADD COLUMN base_title_patterns TEXT"))
            logger.info("Migrated: Added 'base_title_patterns' column to 'mapping_masters' table.")
        if "fallback_param_names" not in cols:
            conn.execute(sa.text("ALTER TABLE mapping_masters ADD COLUMN fallback_param_names TEXT"))
            logger.info("Migrated: Added 'fallback_param_names' column to 'mapping_masters' table.")

    # 5. Create mapping_variants table if not exists
    if "mapping_variants" not in table_names:
        conn.execute(sa.text("""
            CREATE TABLE mapping_variants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                master_id INTEGER NOT NULL REFERENCES mapping_masters(id) ON DELETE CASCADE,
                stage_id INTEGER NOT NULL REFERENCES stage_masters(id) ON DELETE CASCADE,
                custom_role_override VARCHAR,
                extra_title_patterns TEXT,
                is_enabled BOOLEAN NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0
            )
        """))
        logger.info("Migrated: Created 'mapping_variants' table.")

    # 6. Add variant_id to workflow_mappings if not present
    if "workflow_mappings" in table_names:
        cols = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(workflow_mappings)")).fetchall()}
        if "variant_id" not in cols:
            conn.execute(sa.text("ALTER TABLE workflow_mappings ADD COLUMN variant_id INTEGER REFERENCES mapping_variants(id) ON DELETE CASCADE"))
            logger.info("Migrated: Added 'variant_id' column to 'workflow_mappings' table.")

    # 7. Seed default groups
    default_groups = [
        ("prompt", "プロンプト系", 1, 1, 1),
        ("sampler", "サンプラー系", 2, 1, 1),
        ("model", "モデル・基盤", 3, 1, 1),
        ("latent", "Latent・画像", 4, 1, 1),
        ("controlnet", "ControlNet・補助", 5, 1, 1),
        ("etc", "その他", 6, 1, 1),
    ]
    for g_key, g_name, s_order, is_b, is_a in default_groups:
        existing_g = conn.execute(sa.text("SELECT id FROM mapping_group_masters WHERE key = :key"), {"key": g_key}).fetchone()
        if not existing_g:
            conn.execute(sa.text("""
                INSERT INTO mapping_group_masters (key, name, sort_order, is_builtin, is_active)
                VALUES (:key, :name, :sort_order, :is_builtin, :is_active)
            """), {"key": g_key, "name": g_name, "sort_order": s_order, "is_builtin": is_b, "is_active": is_a})

    # 8. Seed default stages
    default_stages = [
        ("main", "通常 / Main", "", '["main", "primary"]', 1, 1, 1),
        ("rough", "Rough", "_rough", '["rough", "draft", "1st"]', 2, 1, 1),
        ("detail", "Detail", "_detail", '["detail", "refiner", "2nd", "hires"]', 3, 1, 1),
    ]
    for s_key, s_name, s_suffix, s_kw, s_order, is_b, is_a in default_stages:
        existing_s = conn.execute(sa.text("SELECT id FROM stage_masters WHERE key = :key"), {"key": s_key}).fetchone()
        if not existing_s:
            conn.execute(sa.text("""
                INSERT INTO stage_masters (key, name, suffix, search_keywords, previous_suffixes, sort_order, is_builtin, is_active)
                VALUES (:key, :name, :suffix, :search_keywords, '[]', :sort_order, :is_builtin, :is_active)
            """), {
                "key": s_key, "name": s_name, "suffix": s_suffix,
                "search_keywords": s_kw, "sort_order": s_order,
                "is_builtin": is_b, "is_active": is_a
            })

    # 9. Data migration (DML)
    stage_rows = conn.execute(sa.text("SELECT id, key, suffix FROM stage_masters")).fetchall()
    stages_by_key = {r[1]: (r[0], r[2]) for r in stage_rows}
    main_stage_id, main_suffix = stages_by_key.get("main", (None, ""))
    rough_stage_id, rough_suffix = stages_by_key.get("rough", (None, "_rough"))
    detail_stage_id, detail_suffix = stages_by_key.get("detail", (None, "_detail"))

    group_rows = conn.execute(sa.text("SELECT id, key FROM mapping_group_masters")).fetchall()
    groups_by_key = {r[1]: r[0] for r in group_rows}

    master_rows = conn.execute(sa.text("""
        SELECT id, role, display_name, title_patterns, base_key, name, base_title_patterns, group_id
        FROM mapping_masters
    """)).fetchall()

    for row in master_rows:
        m_id, role, display_name, title_patterns, curr_base_key, curr_name, curr_base_patterns, curr_group_id = row

        base_key = curr_base_key
        target_stage_id = main_stage_id
        target_suffix = main_suffix

        role_str = role or f"master_{m_id}"
        if not base_key:
            if role_str.lower().endswith("_rough"):
                base_key = role_str[:-6]
                target_stage_id = rough_stage_id or main_stage_id
                target_suffix = rough_suffix
            elif role_str.lower().endswith("_detail"):
                base_key = role_str[:-7]
                target_stage_id = detail_stage_id or main_stage_id
                target_suffix = detail_suffix
            else:
                base_key = role_str
                target_stage_id = main_stage_id
                target_suffix = main_suffix

        name_val = curr_name or display_name or base_key
        base_patterns_val = curr_base_patterns or title_patterns or "[]"

        group_id_val = curr_group_id
        if not group_id_val:
            b_lower = (base_key or "").lower()
            r_lower = role_str.lower()
            if "prompt" in b_lower or "prompt" in r_lower:
                group_id_val = groups_by_key.get("prompt")
            elif any(k in b_lower or k in r_lower for k in ["sampler", "seed", "step", "cfg", "denoise", "fdetailer"]):
                group_id_val = groups_by_key.get("sampler")
            elif any(k in b_lower or k in r_lower for k in ["lora", "model", "checkpoint"]):
                group_id_val = groups_by_key.get("model")
            elif any(k in b_lower or k in r_lower for k in ["latent", "vae", "image"]):
                group_id_val = groups_by_key.get("latent")
            elif "controlnet" in b_lower or "controlnet" in r_lower:
                group_id_val = groups_by_key.get("controlnet")
            else:
                group_id_val = groups_by_key.get("etc")

        conn.execute(sa.text("""
            UPDATE mapping_masters
            SET base_key = :base_key,
                name = :name,
                base_title_patterns = :base_title_patterns,
                group_id = :group_id
            WHERE id = :id
        """), {
            "base_key": base_key,
            "name": name_val,
            "base_title_patterns": base_patterns_val,
            "group_id": group_id_val,
            "id": m_id
        })

        if target_stage_id:
            var_row = conn.execute(sa.text("""
                SELECT id FROM mapping_variants WHERE master_id = :master_id AND stage_id = :stage_id
            """), {"master_id": m_id, "stage_id": target_stage_id}).fetchone()

            if not var_row:
                custom_role = None
                expected_role = f"{base_key}{target_suffix}"
                if role and role != expected_role:
                    custom_role = role

                conn.execute(sa.text("""
                    INSERT INTO mapping_variants (master_id, stage_id, custom_role_override, extra_title_patterns, is_enabled, sort_order)
                    VALUES (:master_id, :stage_id, :custom_role_override, '[]', 1, 0)
                """), {
                    "master_id": m_id,
                    "stage_id": target_stage_id,
                    "custom_role_override": custom_role
                })
                var_row = conn.execute(sa.text("""
                    SELECT id FROM mapping_variants WHERE master_id = :master_id AND stage_id = :stage_id
                """), {"master_id": m_id, "stage_id": target_stage_id}).fetchone()

            if var_row and "workflow_mappings" in table_names:
                var_id = var_row[0]
                conn.execute(sa.text("""
                    UPDATE workflow_mappings
                    SET variant_id = :variant_id
                    WHERE master_id = :master_id AND (variant_id IS NULL OR variant_id = 0)
                """), {"variant_id": var_id, "master_id": m_id})

    logger.info("Migrated: Step 029 workflow mapping v2 normalization applied successfully.")


def step_030_mapping_slot_states(conn: Connection, inspector: Inspector) -> None:
    table_names = set(inspector.get_table_names())

    if "workflows" in table_names:
        columns = {column["name"] for column in inspector.get_columns("workflows")}
        if "mapping_slot_states" not in columns:
            conn.execute(sa.text("ALTER TABLE workflows ADD COLUMN mapping_slot_states TEXT NOT NULL DEFAULT '{}'"))
            logger.info("Migrated: Added 'mapping_slot_states' column to 'workflows' table.")

    if "workflow_history" in table_names:
        columns = {column["name"] for column in inspector.get_columns("workflow_history")}
        if "mapping_slot_states" not in columns:
            conn.execute(sa.text("ALTER TABLE workflow_history ADD COLUMN mapping_slot_states TEXT NOT NULL DEFAULT '{}'"))
            logger.info("Migrated: Added 'mapping_slot_states' column to 'workflow_history' table.")

    if "mapping_masters" in table_names:
        columns = {column["name"] for column in inspector.get_columns("mapping_masters")}
        if "default_enabled" not in columns:
            conn.execute(sa.text("ALTER TABLE mapping_masters ADD COLUMN default_enabled BOOLEAN NOT NULL DEFAULT 1"))
            logger.info("Migrated: Added 'default_enabled' column to 'mapping_masters' table.")


def step_031_cleanup_orphaned_workflow_mappings(conn: Connection, inspector: Inspector) -> None:
    table_names = set(inspector.get_table_names())

    if "workflow_mappings" in table_names and "mapping_masters" in table_names:
        res1 = conn.execute(sa.text("""
            DELETE FROM workflow_mappings
            WHERE master_id NOT IN (SELECT id FROM mapping_masters)
        """))
        deleted_count = res1.rowcount if hasattr(res1, "rowcount") and res1.rowcount is not None else 0

        if "mapping_variants" in table_names:
            res2 = conn.execute(sa.text("""
                DELETE FROM workflow_mappings
                WHERE variant_id IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM mapping_variants mv
                      WHERE mv.id = workflow_mappings.variant_id
                        AND mv.master_id = workflow_mappings.master_id
                  )
            """))
            if hasattr(res2, "rowcount") and res2.rowcount is not None and res2.rowcount > 0:
                deleted_count += res2.rowcount

        logger.info(f"Migrated: Step 031 cleaned up {deleted_count} orphaned workflow mappings.")


def step_032_generation_jobs_release_json(conn: Connection, inspector: Inspector) -> None:
    if "generation_jobs" not in inspector.get_table_names():
        return
    columns = [c["name"] for c in inspector.get_columns("generation_jobs")]
    if "release_json" not in columns:
        conn.execute(sa.text("ALTER TABLE generation_jobs ADD COLUMN release_json TEXT"))
        logger.info("Migrated: Added 'release_json' column to 'generation_jobs' table.")


def step_033_binding_rules_and_node_selectors(conn: Connection, inspector: Inspector) -> None:
    table_names = {row[0] for row in conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}

    # 1. Create binding_rule_sets table if not exists
    if "binding_rule_sets" not in table_names:
        conn.execute(sa.text("""
            CREATE TABLE binding_rule_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL UNIQUE
            )
        """))
        logger.info("Migrated: Created 'binding_rule_sets' table.")

    # 2. Create binding_rule_entries table if not exists
    if "binding_rule_entries" not in table_names:
        conn.execute(sa.text("""
            CREATE TABLE binding_rule_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_set_id INTEGER NOT NULL REFERENCES binding_rule_sets(id) ON DELETE CASCADE,
                class_type VARCHAR NOT NULL,
                param_name VARCHAR NOT NULL,
                priority INTEGER NOT NULL DEFAULT 1,
                CONSTRAINT uq_rule_entry UNIQUE (rule_set_id, class_type, param_name)
            )
        """))
        logger.info("Migrated: Created 'binding_rule_entries' table.")

    # 3. Create node_selectors table if not exists
    if "node_selectors" not in table_names:
        conn.execute(sa.text("""
            CREATE TABLE node_selectors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL UNIQUE
            )
        """))
        logger.info("Migrated: Created 'node_selectors' table.")

    # 4. Create node_selector_patterns table if not exists
    if "node_selector_patterns" not in table_names:
        conn.execute(sa.text("""
            CREATE TABLE node_selector_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                selector_id INTEGER NOT NULL REFERENCES node_selectors(id) ON DELETE CASCADE,
                pattern VARCHAR NOT NULL,
                match_type VARCHAR NOT NULL DEFAULT 'contains',
                priority INTEGER NOT NULL DEFAULT 1,
                CONSTRAINT uq_selector_pattern UNIQUE (selector_id, pattern)
            )
        """))
        logger.info("Migrated: Created 'node_selector_patterns' table.")

    # 5. Add columns to mapping_variants if missing
    if "mapping_variants" in table_names:
        cols = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(mapping_variants)")).fetchall()}
        if "role" not in cols:
            conn.execute(sa.text("ALTER TABLE mapping_variants ADD COLUMN role VARCHAR"))
            logger.info("Migrated: Added 'role' column to 'mapping_variants' table.")
        if "binding_rule_set_id" not in cols:
            conn.execute(sa.text("ALTER TABLE mapping_variants ADD COLUMN binding_rule_set_id INTEGER REFERENCES binding_rule_sets(id) ON DELETE RESTRICT"))
            logger.info("Migrated: Added 'binding_rule_set_id' column to 'mapping_variants' table.")
        if "node_selector_id" not in cols:
            conn.execute(sa.text("ALTER TABLE mapping_variants ADD COLUMN node_selector_id INTEGER REFERENCES node_selectors(id) ON DELETE SET NULL"))
            logger.info("Migrated: Added 'node_selector_id' column to 'mapping_variants' table.")

    # 6. Add input_name to workflow_mappings if missing
    if "workflow_mappings" in table_names:
        cols = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(workflow_mappings)")).fetchall()}
        if "input_name" not in cols:
            conn.execute(sa.text("ALTER TABLE workflow_mappings ADD COLUMN input_name VARCHAR NOT NULL DEFAULT ''"))
            logger.info("Migrated: Added 'input_name' column to 'workflow_mappings' table.")

    # 7. Convert existing mapping_masters and mapping_variants data
    if "mapping_masters" in table_names and "mapping_variants" in table_names:
        m_cols = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(mapping_masters)")).fetchall()}
        if "fallback_param_names" not in m_cols:
            conn.execute(sa.text("ALTER TABLE mapping_masters ADD COLUMN fallback_param_names TEXT"))
            logger.info("Migrated: Added 'fallback_param_names' column to 'mapping_masters' table.")

        stage_rows = conn.execute(sa.text("SELECT id, key, suffix, search_keywords FROM stage_masters")).fetchall() if "stage_masters" in table_names else []
        stages_by_id = {r[0]: {"key": r[1], "suffix": r[2] or "", "search_keywords": r[3] or "[]"} for r in stage_rows}

        master_rows = conn.execute(sa.text("""
            SELECT id, base_key, name, param_name, input_type, expected_class_types, base_title_patterns, fallback_param_names, role, display_name, title_patterns
            FROM mapping_masters
        """)).fetchall()

        for m in master_rows:
            m_id, base_key, name, param_name, input_type, expected_class_types, base_title_patterns, fallback_param_names, role, display_name, title_patterns = m

            # 7.1 BindingRuleSet for master
            rs_name = (name or base_key or role or f"master_{m_id}").strip()
            rs_row = conn.execute(sa.text("SELECT id FROM binding_rule_sets WHERE name = :name"), {"name": rs_name}).fetchone()
            if rs_row:
                rs_id = rs_row[0]
            else:
                conn.execute(sa.text("INSERT INTO binding_rule_sets (name) VALUES (:name)"), {"name": rs_name})
                new_rs = conn.execute(sa.text("SELECT id FROM binding_rule_sets WHERE name = :name"), {"name": rs_name}).fetchone()
                assert new_rs is not None
                rs_id = new_rs[0]

            # 7.2 BindingRuleEntries
            classes: List[str] = []
            if expected_class_types:
                try:
                    parsed_c = json.loads(expected_class_types)
                    if isinstance(parsed_c, list):
                        classes = [str(c).strip() for c in parsed_c if str(c).strip()]
                except Exception:
                    pass
            if not classes:
                classes = ["*"]

            params: List[str] = [p.strip() for p in (param_name or "").split(",") if p.strip()]
            fallbacks: List[str] = []
            if fallback_param_names:
                try:
                    parsed_fb = json.loads(fallback_param_names)
                    if isinstance(parsed_fb, list):
                        fallbacks = [str(fb).strip() for fb in parsed_fb if str(fb).strip()]
                    elif isinstance(parsed_fb, str):
                        fallbacks = [p.strip() for p in parsed_fb.split(",") if p.strip()]
                except Exception:
                    fallbacks = [p.strip() for p in fallback_param_names.split(",") if p.strip()]

            all_params: List[tuple[str, int]] = []
            prio = 1
            for p in params:
                if p not in [x[0] for x in all_params]:
                    all_params.append((p, prio))
                    prio += 1
            for fb in fallbacks:
                if fb not in [x[0] for x in all_params]:
                    all_params.append((fb, prio))
                    prio += 1
            if not all_params:
                all_params.append(("", 1))

            for c in classes:
                for p, p_prio in all_params:
                    entry_exists = conn.execute(sa.text("""
                        SELECT id FROM binding_rule_entries
                        WHERE rule_set_id = :rs_id AND class_type = :ct AND param_name = :pn
                    """), {"rs_id": rs_id, "ct": c, "pn": p}).fetchone()
                    if not entry_exists:
                        conn.execute(sa.text("""
                            INSERT INTO binding_rule_entries (rule_set_id, class_type, param_name, priority)
                            VALUES (:rs_id, :ct, :pn, :prio)
                        """), {"rs_id": rs_id, "ct": c, "pn": p, "prio": p_prio})

            # 7.3 Variants of this master
            variants = conn.execute(sa.text("""
                SELECT id, stage_id, custom_role_override, extra_title_patterns, role
                FROM mapping_variants
                WHERE master_id = :mid
            """), {"mid": m_id}).fetchall()

            class_types_lower = {c.lower() for c in classes}

            # Gather base title patterns
            m_patterns: List[str] = []
            for raw_pat in [base_title_patterns, title_patterns]:
                if raw_pat:
                    try:
                        parsed_p = json.loads(raw_pat)
                        if isinstance(parsed_p, list):
                            for item in parsed_p:
                                s = str(item).strip()
                                if s and s not in m_patterns:
                                    m_patterns.append(s)
                    except Exception:
                        pass

            for var in variants:
                v_id, v_stage_id, custom_override, extra_patterns_raw, curr_role = var
                stg = stages_by_id.get(v_stage_id, {"key": "main", "suffix": "", "search_keywords": "[]"})

                computed_role = custom_override or curr_role or f"{base_key or role}{stg['suffix']}"
                if not computed_role:
                    computed_role = f"role_{v_id}"

                v_patterns: List[str] = []
                if extra_patterns_raw:
                    try:
                        parsed_vp = json.loads(extra_patterns_raw)
                        if isinstance(parsed_vp, list):
                            for item in parsed_vp:
                                s = str(item).strip()
                                if s and s not in v_patterns:
                                    v_patterns.append(s)
                    except Exception:
                        pass

                # Exact patterns (excluding class types absorbed into entries)
                exact_patterns: List[str] = []
                for p in m_patterns + v_patterns:
                    if p.lower() in class_types_lower:
                        continue
                    if p not in exact_patterns:
                        exact_patterns.append(p)

                # Contains patterns from stage search_keywords
                contains_patterns: List[str] = []
                if stg.get("search_keywords"):
                    try:
                        parsed_kws = json.loads(stg["search_keywords"])
                        if isinstance(parsed_kws, list):
                            for kw in parsed_kws:
                                kw_str = str(kw).strip()
                                if kw_str and kw_str not in exact_patterns and kw_str not in contains_patterns:
                                    contains_patterns.append(kw_str)
                    except Exception:
                        pass

                selector_id: Optional[int] = None
                if exact_patterns or contains_patterns:
                    sel_name = f"{computed_role}_selector"
                    sel_row = conn.execute(sa.text("SELECT id FROM node_selectors WHERE name = :name"), {"name": sel_name}).fetchone()
                    if sel_row:
                        selector_id = sel_row[0]
                    else:
                        conn.execute(sa.text("INSERT INTO node_selectors (name) VALUES (:name)"), {"name": sel_name})
                        new_sel = conn.execute(sa.text("SELECT id FROM node_selectors WHERE name = :name"), {"name": sel_name}).fetchone()
                        assert new_sel is not None
                        selector_id = new_sel[0]

                    pat_prio = 1
                    for ep in exact_patterns:
                        exists = conn.execute(sa.text("SELECT id FROM node_selector_patterns WHERE selector_id = :sid AND pattern = :pat"), {"sid": selector_id, "pat": ep}).fetchone()
                        if not exists:
                            conn.execute(sa.text("""
                                INSERT INTO node_selector_patterns (selector_id, pattern, match_type, priority)
                                VALUES (:sid, :pat, 'exact', :prio)
                            """), {"sid": selector_id, "pat": ep, "prio": pat_prio})
                            pat_prio += 1

                    for cp in contains_patterns:
                        exists = conn.execute(sa.text("SELECT id FROM node_selector_patterns WHERE selector_id = :sid AND pattern = :pat"), {"sid": selector_id, "pat": cp}).fetchone()
                        if not exists:
                            conn.execute(sa.text("""
                                INSERT INTO node_selector_patterns (selector_id, pattern, match_type, priority)
                                VALUES (:sid, :pat, 'contains', :prio)
                            """), {"sid": selector_id, "pat": cp, "prio": pat_prio})
                            pat_prio += 1

                conn.execute(sa.text("""
                    UPDATE mapping_variants
                    SET role = :role, binding_rule_set_id = :rs_id, node_selector_id = :sel_id
                    WHERE id = :vid
                """), {"role": computed_role, "rs_id": rs_id, "sel_id": selector_id, "vid": v_id})

    # 8. Re-assign workflow_mappings.master_id and populate input_name
    if "workflow_mappings" in table_names and "mapping_masters" in table_names:
        unassigned = conn.execute(sa.text("""
            SELECT id, master_id FROM workflow_mappings WHERE variant_id IS NULL OR variant_id = 0
        """)).fetchall()
        for wm_id, wm_m_id in unassigned:
            def_var = conn.execute(sa.text("""
                SELECT id FROM mapping_variants WHERE master_id = :m_id ORDER BY stage_id ASC LIMIT 1
            """), {"m_id": wm_m_id}).fetchone()
            if def_var:
                conn.execute(sa.text("""
                    UPDATE workflow_mappings SET variant_id = :vid WHERE id = :wmid
                """), {"vid": def_var[0], "wmid": wm_id})

        all_wms = conn.execute(sa.text("""
            SELECT id, master_id, variant_id, input_name FROM workflow_mappings
        """)).fetchall()
        for wm_id, wm_m_id, wm_v_id, curr_inp in all_wms:
            if not curr_inp:
                first_param = ""
                if wm_m_id:
                    m_row = conn.execute(sa.text("SELECT param_name FROM mapping_masters WHERE id = :mid"), {"mid": wm_m_id}).fetchone()
                    if m_row and m_row[0]:
                        first_param = m_row[0].split(",")[0].strip()
                if not first_param and wm_v_id:
                    m_row = conn.execute(sa.text("""
                        SELECT m.param_name FROM mapping_masters m
                        JOIN mapping_variants v ON v.master_id = m.id
                        WHERE v.id = :vid
                    """), {"vid": wm_v_id}).fetchone()
                    if m_row and m_row[0]:
                        first_param = m_row[0].split(",")[0].strip()
                conn.execute(sa.text("UPDATE workflow_mappings SET input_name = :inp WHERE id = :id"), {"inp": first_param, "id": wm_id})

    # 9. Update mapping_slot_states in workflows and workflow_history
    for tbl in ["workflows", "workflow_history"]:
        if tbl in table_names:
            cols = {c["name"] for c in inspector.get_columns(tbl)}
            if "mapping_slot_states" in cols:
                rows = conn.execute(sa.text(f"SELECT id, mapping_slot_states FROM {tbl}")).fetchall()
                for r_id, slot_json in rows:
                    if not slot_json:
                        continue
                    try:
                        slots = json.loads(slot_json)
                        if isinstance(slots, dict):
                            updated = False
                            new_slots = {}
                            for k, val in slots.items():
                                if k.startswith("m:"):
                                    try:
                                        mid = int(k[2:])
                                        def_var = conn.execute(sa.text("SELECT id FROM mapping_variants WHERE master_id = :mid ORDER BY stage_id ASC LIMIT 1"), {"mid": mid}).fetchone()
                                        if def_var:
                                            new_slots[f"v:{def_var[0]}"] = val
                                            updated = True
                                        else:
                                            new_slots[k] = val
                                    except Exception:
                                        new_slots[k] = val
                                else:
                                    new_slots[k] = val
                            if updated:
                                conn.execute(sa.text(f"UPDATE {tbl} SET mapping_slot_states = :val WHERE id = :id"), {"val": json.dumps(new_slots), "id": r_id})
                    except Exception:
                        pass

    logger.info("Migrated: Step 033 binding rules and node selectors phase 2 migration completed.")


def step_034_mapping_variants_phase5_constraints(conn: Connection, inspector: Inspector) -> None:
    table_names = {row[0] for row in conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
    if "mapping_variants" not in table_names:
        return

    # Fail-closed integrity check: ensure no duplicate or NULL roles exist
    dup_roles = conn.execute(sa.text("""
        SELECT role, COUNT(*) as cnt FROM mapping_variants GROUP BY role HAVING cnt > 1
    """)).fetchall()
    if dup_roles:
        raise ValueError(f"Integrity check failed: duplicate roles found in mapping_variants: {dup_roles}")

    null_roles = conn.execute(sa.text("""
        SELECT COUNT(*) FROM mapping_variants WHERE role IS NULL
    """)).scalar()
    if null_roles and null_roles > 0:
        raise ValueError("Integrity check failed: NULL role found in mapping_variants")

    # Check if table already has physical UNIQUE constraint on role
    indexes = conn.execute(sa.text("PRAGMA index_list(mapping_variants)")).fetchall()
    idx_names = {r[1] for r in indexes}
    if "uq_mapping_variant_role" in idx_names:
        return

    # Recreate mapping_variants table with physical constraints
    conn.execute(sa.text("""
        CREATE TABLE mapping_variants_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            master_id INTEGER NOT NULL REFERENCES mapping_masters(id) ON DELETE CASCADE,
            stage_id INTEGER NOT NULL REFERENCES stage_masters(id) ON DELETE CASCADE,
            role VARCHAR NOT NULL,
            binding_rule_set_id INTEGER NOT NULL REFERENCES binding_rule_sets(id) ON DELETE RESTRICT,
            node_selector_id INTEGER REFERENCES node_selectors(id) ON DELETE SET NULL,
            custom_role_override VARCHAR,
            extra_title_patterns TEXT,
            is_enabled BOOLEAN NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            CONSTRAINT uq_mapping_variant_role UNIQUE (role),
            CONSTRAINT uq_mapping_variant_master_stage UNIQUE (master_id, stage_id),
            CONSTRAINT uq_mapping_variant_master_node_selector UNIQUE (master_id, node_selector_id)
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO mapping_variants_new (id, master_id, stage_id, role, binding_rule_set_id, node_selector_id, custom_role_override, extra_title_patterns, is_enabled, sort_order)
        SELECT id, master_id, stage_id, role, binding_rule_set_id, node_selector_id, custom_role_override, extra_title_patterns, is_enabled, sort_order
        FROM mapping_variants
    """))

    conn.execute(sa.text("DROP TABLE mapping_variants"))
    conn.execute(sa.text("ALTER TABLE mapping_variants_new RENAME TO mapping_variants"))
    logger.info("Migrated: Recreated 'mapping_variants' with UNIQUE(role), UNIQUE(master_id, stage_id), UNIQUE(master_id, node_selector_id) constraints.")


class MissingMappingVariantsError(ValueError, RuntimeError):
    """Raised when mapping_variants prerequisite table or role column is missing."""
    pass


def audit_role_references(
    conn: Connection, inspector: Optional[Inspector] = None
) -> list[tuple[str, int, str]]:
    """Audit role references in workflow_presets and param_sync_groups.

    Returns a list of (entity_type, entity_id, unresolved_key) tuples.
    """
    table_names = {row[0] for row in conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
    has_presets = "workflow_presets" in table_names
    has_sync_groups = "param_sync_groups" in table_names

    if not has_presets and not has_sync_groups:
        return []

    if "mapping_variants" not in table_names:
        raise MissingMappingVariantsError("mapping_variants prerequisite table is missing")

    mv_columns = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(mapping_variants)")).fetchall()}
    if "role" not in mv_columns:
        raise MissingMappingVariantsError("mapping_variants prerequisite table is missing")

    variant_rows = conn.execute(sa.text("SELECT id, role FROM mapping_variants")).fetchall()
    index = VariantIndex({row[0]: row[1] for row in variant_rows})

    unresolved: list[tuple[str, int, str]] = []

    if has_presets:
        preset_rows = conn.execute(sa.text("SELECT id, param_values FROM workflow_presets")).fetchall()
        for pid, pval_raw in preset_rows:
            try:
                data = json.loads(pval_raw) if pval_raw else {}
                if not isinstance(data, dict):
                    unresolved.append(("preset", pid, "<invalid json>"))
                else:
                    for k in sorted(data.keys()):
                        ck = index.classify(k)
                        if ck.kind == KeyKind.UNRESOLVED:
                            unresolved.append(("preset", pid, k))
            except Exception:
                unresolved.append(("preset", pid, "<invalid json>"))

    if has_sync_groups:
        sg_columns = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(param_sync_groups)")).fetchall()}
        if "master_variant_id" in sg_columns:
            sg_rows = conn.execute(sa.text(
                "SELECT id, master_role, slave_roles FROM param_sync_groups WHERE master_variant_id IS NULL"
            )).fetchall()
        else:
            sg_rows = conn.execute(sa.text(
                "SELECT id, master_role, slave_roles FROM param_sync_groups"
            )).fetchall()

        for gid, mrole, sroles_raw in sg_rows:
            ck_master = index.classify(mrole) if mrole else None
            if ck_master is None or ck_master.kind != KeyKind.ROLE:
                unresolved.append(("sync_group", gid, mrole if mrole is not None else "<none>"))

            try:
                slaves = json.loads(sroles_raw) if sroles_raw else []
                if not isinstance(slaves, list):
                    unresolved.append(("sync_group", gid, "<invalid json>"))
                else:
                    for s in slaves:
                        if not isinstance(s, str):
                            unresolved.append(("sync_group", gid, str(s)))
                        else:
                            ck_slave = index.classify(s)
                            if ck_slave.kind != KeyKind.ROLE:
                                unresolved.append(("sync_group", gid, s))
            except Exception:
                unresolved.append(("sync_group", gid, "<invalid json>"))

    return unresolved


def step_035_variant_id_references(conn: Connection, inspector: Inspector) -> None:
    table_names = {row[0] for row in conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
    has_presets = "workflow_presets" in table_names
    has_sync_groups = "param_sync_groups" in table_names

    if not has_presets and not has_sync_groups:
        return

    if "mapping_variants" not in table_names:
        raise MissingMappingVariantsError("mapping_variants prerequisite table is missing")

    mv_columns = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(mapping_variants)")).fetchall()}
    if "role" not in mv_columns:
        raise MissingMappingVariantsError("mapping_variants prerequisite table is missing")

    unresolved = audit_role_references(conn, inspector)
    if unresolved:
        unresolved_details = ", ".join(f"{item[0]} id={item[1]} key={item[2]}" for item in unresolved)
        raise ValueError(f"Unresolved role references found: {unresolved_details}")

    # Mutation phase: Create normalized reference tables
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS workflow_preset_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            preset_id INTEGER NOT NULL REFERENCES workflow_presets(id) ON DELETE CASCADE,
            variant_id INTEGER NOT NULL REFERENCES mapping_variants(id) ON DELETE CASCADE,
            sub_key VARCHAR NOT NULL DEFAULT '',
            value TEXT NOT NULL,
            CONSTRAINT uq_workflow_preset_values_preset_variant_sub_key UNIQUE (preset_id, variant_id, sub_key)
        )
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS param_sync_group_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES param_sync_groups(id) ON DELETE CASCADE,
            variant_id INTEGER NOT NULL REFERENCES mapping_variants(id) ON DELETE CASCADE,
            CONSTRAINT uq_param_sync_group_members_group_variant UNIQUE (group_id, variant_id)
        )
    """))

    if has_sync_groups:
        sg_columns = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(param_sync_groups)")).fetchall()}
        if "master_variant_id" not in sg_columns:
            conn.execute(sa.text(
                "ALTER TABLE param_sync_groups ADD COLUMN master_variant_id INTEGER REFERENCES mapping_variants(id) ON DELETE CASCADE"
            ))


    variant_rows = conn.execute(sa.text("SELECT id, role FROM mapping_variants")).fetchall()
    index = VariantIndex({row[0]: row[1] for row in variant_rows})

    if has_presets:
        preset_rows = conn.execute(sa.text("SELECT id, param_values FROM workflow_presets")).fetchall()
        for pid, pval_raw in preset_rows:
            try:
                data = json.loads(pval_raw) if pval_raw else {}
            except Exception:
                continue
            if not isinstance(data, dict):
                continue

            norm = normalize_params(index, data)
            for (vid, sub_key), val in norm.entries.items():
                conn.execute(sa.text("""
                    INSERT OR IGNORE INTO workflow_preset_values (preset_id, variant_id, sub_key, value)
                    VALUES (:preset_id, :variant_id, :sub_key, :value)
                """), {
                    "preset_id": pid,
                    "variant_id": vid,
                    "sub_key": sub_key,
                    "value": val,
                })
            new_pval = json.dumps(norm.reserved, ensure_ascii=False)
            conn.execute(sa.text(
                "UPDATE workflow_presets SET param_values = :new_pval WHERE id = :preset_id"
            ), {"new_pval": new_pval, "preset_id": pid})

    if has_sync_groups:
        sg_rows = conn.execute(sa.text(
            "SELECT id, master_role, slave_roles FROM param_sync_groups WHERE master_variant_id IS NULL"
        )).fetchall()
        for gid, mrole, sroles_raw in sg_rows:
            cls_master = index.classify(mrole)
            master_vid = cls_master.variant_id
            conn.execute(sa.text(
                "UPDATE param_sync_groups SET master_variant_id = :master_vid WHERE id = :group_id"
            ), {"master_vid": master_vid, "group_id": gid})

            try:
                slaves = json.loads(sroles_raw) if sroles_raw else []
            except Exception:
                slaves = []
            if isinstance(slaves, list):
                seen_vids = set()
                for s in slaves:
                    if isinstance(s, str):
                        cls_slave = index.classify(s)
                        if cls_slave.variant_id is not None and cls_slave.variant_id not in seen_vids:
                            seen_vids.add(cls_slave.variant_id)
                            conn.execute(sa.text("""
                                INSERT OR IGNORE INTO param_sync_group_members (group_id, variant_id)
                                VALUES (:group_id, :variant_id)
                            """), {"group_id": gid, "variant_id": cls_slave.variant_id})

    logger.info("Migrated: Step 035 variant_id references normalization applied successfully.")


ALL_MIGRATION_STEPS: List[MigrationStep] = [
    MigrationStep("001", "workflows_columns", step_001_workflows_columns),
    MigrationStep("002", "snapshot_loras_and_tag_sets_roles", step_002_snapshot_loras_and_tag_sets_roles),
    MigrationStep("003", "snapshots_source_and_thumbnail", step_003_snapshots_source_and_thumbnail),
    MigrationStep("004", "tag_sets_thumbnail_and_sort_order", step_004_tag_sets_thumbnail_and_sort_order),
    MigrationStep("005", "master_tables_sort_order", step_005_master_tables_sort_order),
    MigrationStep("006", "create_param_type_masters", step_006_create_param_type_masters),
    MigrationStep("007", "speech_bubble_presets_and_constraints", step_007_speech_bubble_presets_and_constraints),
    MigrationStep("008", "create_speech_tone_presets", step_008_create_speech_tone_presets),
    MigrationStep("009", "workflow_presets_updated_at", step_009_workflow_presets_updated_at),
    MigrationStep("010", "create_prompt_metadata", step_010_create_prompt_metadata),
    MigrationStep("011", "create_workflow_history", step_011_create_workflow_history),
    MigrationStep("012", "speech_bubble_presets_tag_set_id", step_012_speech_bubble_presets_tag_set_id),
    MigrationStep("025", "lora_studio_tables", step_025_lora_studio_tables),
    MigrationStep("026", "dataset_projects_prompt_negative", step_026_dataset_projects_prompt_negative),
    MigrationStep("027", "generation_jobs", step_027_generation_jobs),
    MigrationStep("028", "tag_subsets_thumbnail_path", step_028_tag_subsets_thumbnail_path),
    MigrationStep("029", "workflow_mapping_v2_normalization", step_029_workflow_mapping_v2_normalization),
    MigrationStep("030", "mapping_slot_states", step_030_mapping_slot_states),
    MigrationStep("031", "cleanup_orphaned_workflow_mappings", step_031_cleanup_orphaned_workflow_mappings),
    MigrationStep("032", "generation_jobs_release_json", step_032_generation_jobs_release_json),
    MigrationStep("033", "binding_rules_and_node_selectors", step_033_binding_rules_and_node_selectors),
    MigrationStep("034", "mapping_variants_phase5_constraints", step_034_mapping_variants_phase5_constraints),
    MigrationStep("035", "variant_id_references", step_035_variant_id_references),
]


