from typing import Callable, List
import logging
import sqlalchemy as sa
from sqlalchemy.engine import Connection
from sqlalchemy.engine.reflection import Inspector

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
    if "mapping_master" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("mapping_master")]
        if "sort_order" not in columns:
            conn.execute(sa.text("ALTER TABLE mapping_master ADD COLUMN sort_order INTEGER DEFAULT 0"))
            conn.execute(sa.text("""
                UPDATE mapping_master SET sort_order = (
                    SELECT COUNT(*) FROM mapping_master AS m2 WHERE m2.id <= mapping_master.id
                ) - 1
            """))
            logger.info("Migrated: Added 'sort_order' column to 'mapping_master' table.")

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
]


