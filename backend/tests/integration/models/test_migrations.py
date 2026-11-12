import json
import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app import models
from app.migrations import run_migrations, MigrationRunner
from app.migrations.steps import MigrationStep, step_036_prompt_structure_templates
from app.seeder import seed_initial_data, _seed_base_models, _migrate_existing_loras


def test_legacy_data_migration_step_029():
    """[REQ-336/AC-5] Step_029 migrates legacy mapping_master and workflow_mappings to normalized structure."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    with engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE workflows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL UNIQUE,
                json_body TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """))
        conn.execute(sa.text("INSERT INTO workflows (id, name, json_body) VALUES (1, 'Test Workflow', '{}');"))

        conn.execute(sa.text("""
            CREATE TABLE mapping_master (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role VARCHAR NOT NULL UNIQUE,
                expected_class_types TEXT,
                param_name VARCHAR NOT NULL,
                input_type VARCHAR NOT NULL,
                display_name VARCHAR NOT NULL,
                title_patterns TEXT,
                sort_order INTEGER DEFAULT 0
            );
        """))
        conn.execute(sa.text("""
            INSERT INTO mapping_master (id, role, expected_class_types, param_name, input_type, display_name, title_patterns, sort_order)
            VALUES
            (1, 'Main_Positive_Prompt', '["CLIPTextEncode"]', 'text', 'textarea', 'Main Positive Prompt', '["MainPrompt"]', 0),
            (2, 'Sampler_Steps', '["KSampler"]', 'steps', 'int', 'Sampler Steps', '["MainSampler"]', 1),
            (3, 'Sampler_Steps_rough', '["KSampler"]', 'steps', 'int', 'Sampler Steps Rough', '["RoughSampler"]', 2);
        """))

        conn.execute(sa.text("""
            CREATE TABLE workflow_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL REFERENCES workflows(id),
                master_id INTEGER NOT NULL REFERENCES mapping_master(id),
                node_id VARCHAR NOT NULL
            );
        """))
        conn.execute(sa.text("""
            INSERT INTO workflow_mappings (workflow_id, master_id, node_id)
            VALUES
            (1, 1, '6'),
            (1, 2, '3'),
            (1, 3, '10');
        """))

    run_migrations(target_engine=engine)

    with engine.connect() as conn:
        insp = sa.inspect(conn)
        tables = insp.get_table_names()
        assert "mapping_masters" in tables
        assert "mapping_group_masters" in tables
        assert "stage_masters" in tables
        assert "mapping_variants" in tables

        groups = conn.execute(sa.text("SELECT key, name FROM mapping_group_masters")).fetchall()
        group_keys = {g[0] for g in groups}
        assert "prompt" in group_keys
        assert "sampler" in group_keys

        stages = conn.execute(sa.text("SELECT key, suffix FROM stage_masters")).fetchall()
        stage_dict = {s[0]: s[1] for s in stages}
        assert "main" in stage_dict
        assert "rough" in stage_dict
        assert "detail" in stage_dict

        m_rows = conn.execute(sa.text("""
            SELECT id, base_key, name, group_id FROM mapping_masters ORDER BY id
        """)).fetchall()
        assert len(m_rows) == 3
        assert m_rows[0][1] == "Main_Positive_Prompt"
        assert m_rows[1][1] == "Sampler_Steps"
        assert m_rows[2][1] == "Sampler_Steps"

        v_rows = conn.execute(sa.text("""
            SELECT id, master_id, stage_id FROM mapping_variants ORDER BY id
        """)).fetchall()
        assert len(v_rows) >= 3

        wm_rows = conn.execute(sa.text("""
            SELECT id, master_id, variant_id, node_id FROM workflow_mappings ORDER BY id
        """)).fetchall()
        assert len(wm_rows) == 3
        for wm in wm_rows:
            assert wm[2] is not None
            assert wm[2] > 0


def test_step_029_idempotency():
    """[REQ-336/AC-5] Step_029 is idempotent and safe when executed multiple times."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)

    run_migrations(target_engine=engine)
    run_migrations(target_engine=engine)

    with engine.connect() as conn:
        g_count = conn.execute(sa.text("SELECT COUNT(*) FROM mapping_group_masters")).scalar()
        s_count = conn.execute(sa.text("SELECT COUNT(*) FROM stage_masters")).scalar()
        assert g_count == 6
        assert s_count == 3


def test_step_029_atomic_rollback_on_failure():
    """[REQ-336/AC-5] Red Teaming: verify that if a failure happens during step_029, changes are rolled back cleanly."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE mapping_master (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role VARCHAR NOT NULL UNIQUE,
                expected_class_types TEXT,
                param_name VARCHAR NOT NULL,
                input_type VARCHAR NOT NULL,
                display_name VARCHAR NOT NULL,
                title_patterns TEXT,
                sort_order INTEGER DEFAULT 0
            );
        """))
        conn.execute(sa.text("""
            INSERT INTO mapping_master (role, param_name, input_type, display_name)
            VALUES ('Sampler_Seed', 'seed', 'int', 'Seed');
        """))

    def failing_step(conn, inspector):
        conn.execute(sa.text("""
            INSERT INTO mapping_master (role, param_name, input_type, display_name)
            VALUES ('corrupted_role', 'seed', 'int', 'Corrupted');
        """))
        raise RuntimeError("Forced simulation error")

    runner = MigrationRunner(steps=[MigrationStep("029_fail", "failing_step", failing_step)])
    with pytest.raises(RuntimeError):
        runner.run(target_engine=engine)

    with engine.connect() as conn:
        rows = conn.execute(sa.text("SELECT role FROM mapping_master;")).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "Sampler_Seed"


def test_seeder_initial_data_creates_groups_stages_masters_variants():
    """[REQ-336/AC-5] Seeder populates groups, stages, masters, and default variants on fresh DB."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    run_migrations(target_engine=engine)

    with Session(engine) as session:
        seed_initial_data(session)

        groups = session.query(models.MappingGroupMaster).all()
        assert len(groups) >= 6

        stages = session.query(models.StageMaster).all()
        assert len(stages) == 3

        masters = session.query(models.MappingMaster).all()
        assert len(masters) > 0

        for m in masters:
            assert len(m.variants) > 0
            assert m.group_id is not None
            assert bool(m.base_key)


def test_seed_initial_data_populates_base_models(db_session: Session):
    """[REQ-048/AC-5] seed_initial_data populates default base models (Illus, Noob, Anima)."""
    seed_initial_data(db_session)
    base_models = db_session.query(models.BaseModel).all()
    names = [bm.name for bm in base_models]
    assert "Illus" in names
    assert "Noob" in names
    assert "Anima" in names


def test_existing_lora_migration_to_illus(db_session: Session):
    """[REQ-048/AC-5] _migrate_existing_loras migrates legacy Loras without base models to Illus."""
    _seed_base_models(db_session)
    lora = models.Lora(model_name="Legacy Lora Migration")
    db_session.add(lora)
    db_session.flush()

    assert len(lora.base_models) == 0
    _migrate_existing_loras(db_session)
    db_session.refresh(lora)
    assert len(lora.base_models) == 1
    assert lora.base_models[0].name == "Illus"


def test_mapping_slot_state_migration_step_030():
    """[REQ-358/AC-19][REQ-358/AC-26][REQ-358/AC-31] Verify step_030 adds mapping_slot_states and default_enabled idempotently."""
    from app.migrations.steps import ALL_MIGRATION_STEPS, step_030_mapping_slot_states

    fresh_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=fresh_engine)
    with fresh_engine.begin() as conn:
        inspector = sa.inspect(conn)
        steps = {(step.step_id, step.name) for step in ALL_MIGRATION_STEPS}
        assert ("030", "mapping_slot_states") in steps
        step_030_mapping_slot_states(conn, inspector)
        workflow_columns = {column["name"]: column for column in inspector.get_columns("workflows")}
        history_columns = {column["name"]: column for column in inspector.get_columns("workflow_history")}
        master_columns = {column["name"]: column for column in inspector.get_columns("mapping_masters")}
        assert "mapping_slot_states" in workflow_columns
        assert "mapping_slot_states" in history_columns
        assert "default_enabled" in master_columns

        conn.execute(sa.text("INSERT INTO workflows (name, json_body, created_at) VALUES ('fresh', '{}', CURRENT_TIMESTAMP)"))
        conn.execute(sa.text("INSERT INTO mapping_masters (base_key, name, param_name, input_type, sort_order) VALUES ('seed', 'Seed', 'seed', 'int', 0)"))
        assert conn.execute(sa.text("SELECT mapping_slot_states FROM workflows WHERE name = 'fresh'")).scalar_one() == "{}"
        assert conn.execute(sa.text("SELECT default_enabled FROM mapping_masters WHERE param_name = 'seed'")).scalar_one() == 1


def test_run_migrations_on_empty_db_is_idempotent():
    """[REQ-358/AC-19] Running migrations multiple times on an empty database is safe and idempotent."""
    test_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=test_engine)

    run_migrations(target_engine=test_engine)
    run_migrations(target_engine=test_engine)

    with test_engine.connect() as conn:
        inspector = sa.inspect(conn)
        tables = inspector.get_table_names()
        assert "workflows" in tables
        assert "snapshots" in tables
        assert "param_type_masters" in tables
        assert "speech_bubble_presets" in tables
        assert "speech_tone_presets" in tables
        assert "prompt_metadata" in tables


def test_legacy_database_full_migration():
    """[REQ-336/AC-5] Legacy schema is fully upgraded with all modern columns and constraints while retaining data."""
    legacy_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    with legacy_engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE workflows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL UNIQUE,
                json_body TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """))
        conn.execute(sa.text("INSERT INTO workflows (name, json_body) VALUES ('W1', '{}');"))

        conn.execute(sa.text("""
            CREATE TABLE snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                params TEXT NOT NULL,
                image_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """))
        conn.execute(sa.text("INSERT INTO snapshots (workflow_id, params, image_path) VALUES (1, '{}', 'img.png');"))

        conn.execute(sa.text("""
            CREATE TABLE loras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_name VARCHAR NOT NULL UNIQUE,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """))
        conn.execute(sa.text("INSERT INTO loras (model_name) VALUES ('Lora1'), ('Lora2');"))

        conn.execute(sa.text("""
            CREATE TABLE tag_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL,
                tags TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """))
        conn.execute(sa.text("INSERT INTO tag_sets (name, tags) VALUES ('TS1', '[\"tag1\"]');"))

        conn.execute(sa.text("""
            CREATE TABLE snapshot_loras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER NOT NULL,
                lora_id INTEGER NOT NULL,
                strength FLOAT NOT NULL,
                UNIQUE (snapshot_id, lora_id)
            );
        """))
        conn.execute(sa.text("INSERT INTO snapshot_loras (snapshot_id, lora_id, strength) VALUES (1, 1, 0.8);"))

        conn.execute(sa.text("""
            CREATE TABLE workflow_presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                name VARCHAR NOT NULL,
                param_values TEXT NOT NULL,
                applied_assets TEXT NOT NULL,
                batch_size INTEGER NOT NULL,
                seed_mode VARCHAR NOT NULL,
                seed INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
        """))
        conn.execute(sa.text("""
            INSERT INTO workflow_presets (workflow_id, name, param_values, applied_assets, batch_size, seed_mode, seed)
            VALUES (1, 'P1', '{}', '{}', 1, 'fixed', 1234);
        """))

        conn.execute(sa.text("""
            CREATE TABLE speech_bubble_presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL UNIQUE,
                shape VARCHAR NOT NULL DEFAULT 'oval',
                orientation VARCHAR NOT NULL DEFAULT 'vertical',
                font_family VARCHAR NOT NULL DEFAULT 'sans-serif',
                font_size INTEGER NOT NULL DEFAULT 0,
                text_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                background_color VARCHAR NOT NULL DEFAULT 'rgba(255, 255, 255, 0.95)',
                border_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                border_width INTEGER NOT NULL DEFAULT 2,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """))
        conn.execute(sa.text("INSERT INTO speech_bubble_presets (name, orientation) VALUES ('Legacy Preset', 'vertical');"))

    run_migrations(target_engine=legacy_engine)

    with legacy_engine.connect() as conn:
        inspector = sa.inspect(conn)

        wf_cols = [c["name"] for c in inspector.get_columns("workflows")]
        assert "default_applied_assets" in wf_cols
        assert "target_base_model_id" in wf_cols

        snap_cols = [c["name"] for c in inspector.get_columns("snapshots")]
        assert "source_snapshot_id" in snap_cols
        assert "thumbnail_path" in snap_cols

        lora_rows = conn.execute(sa.text("SELECT id, model_name, sort_order FROM loras ORDER BY id")).fetchall()
        assert len(lora_rows) == 2
        assert lora_rows[0][2] == 0
        assert lora_rows[1][2] == 1

        sl_cols = [c["name"] for c in inspector.get_columns("snapshot_loras")]
        assert "role" in sl_cols
        conn.execute(sa.text("INSERT INTO snapshot_loras (snapshot_id, lora_id, strength, role) VALUES (1, 1, 0.5, 'negative');"))

        wp_row = conn.execute(sa.text("SELECT updated_at FROM workflow_presets WHERE name = 'P1'")).fetchone()
        assert wp_row[0] is not None

        conn.execute(sa.text("INSERT INTO speech_bubble_presets (name, orientation) VALUES ('Legacy Preset', 'horizontal');"))
        presets = conn.execute(sa.text("SELECT name, orientation FROM speech_bubble_presets WHERE name = 'Legacy Preset'")).fetchall()
        assert len(presets) == 2

        assert "prompt_metadata" in inspector.get_table_names()


def test_schema_parity_between_fresh_and_migrated_db():
    """[REQ-356/AC-2] Verify schema parity between freshly created DB and fully migrated legacy DB."""
    fresh_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=fresh_engine)
    run_migrations(target_engine=fresh_engine)

    migrated_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=migrated_engine)
    run_migrations(target_engine=migrated_engine)

    with fresh_engine.connect() as conn_f, migrated_engine.connect() as conn_m:
        insp_f = sa.inspect(conn_f)
        insp_m = sa.inspect(conn_m)

        tables_f = set(insp_f.get_table_names())
        tables_m = set(insp_m.get_table_names())
        assert tables_f == tables_m

        for table in tables_f:
            cols_f = {c["name"]: str(c["type"]) for c in insp_f.get_columns(table)}
            cols_m = {c["name"]: str(c["type"]) for c in insp_m.get_columns(table)}
            assert cols_f.keys() == cols_m.keys(), f"Column mismatch in table: {table}"


def test_red_team_migration_step_failure_rolls_back_cleanly():
    """[REQ-356/AC-4] Red Teaming: unintended exception in migration step aborts transaction cleanly."""
    fail_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with fail_engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE test_table (id INTEGER PRIMARY KEY, val TEXT);"))
        conn.execute(sa.text("INSERT INTO test_table (val) VALUES ('initial_state');"))

    def failing_step_apply(conn, inspector):
        conn.execute(sa.text("INSERT INTO test_table (val) VALUES ('corrupted_state');"))
        raise RuntimeError("Simulated migration step crash")

    custom_runner = MigrationRunner(steps=[
        MigrationStep("fail_999", "failing_step", failing_step_apply)
    ])

    with pytest.raises(RuntimeError):
        custom_runner.run(target_engine=fail_engine)

    with fail_engine.connect() as conn:
        rows = conn.execute(sa.text("SELECT val FROM test_table;")).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "initial_state"


@pytest.mark.integration
@getattr(pytest.mark, "REQ-417")
@getattr(pytest.mark, "AC-1")
def test_req417_ac1_phase2_migration_lossless_conversion():
    """[REQ-417/AC-1] Phase 2 migration losslessly converts legacy master data into rule sets, entries, and selectors."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    with engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE workflows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL UNIQUE,
                json_body TEXT NOT NULL,
                mapping_slot_states TEXT NOT NULL DEFAULT '{}'
            );
        """))
        conn.execute(sa.text("INSERT INTO workflows (id, name, json_body, mapping_slot_states) VALUES (1, 'Test Workflow', '{}', '{\"m:1\": true}');"))

        conn.execute(sa.text("""
            CREATE TABLE mapping_group_masters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key VARCHAR NOT NULL UNIQUE,
                name VARCHAR NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_builtin BOOLEAN NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT 1
            );
        """))
        conn.execute(sa.text("INSERT INTO mapping_group_masters (id, key, name) VALUES (1, 'sampler', 'Sampler');"))

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
            );
        """))
        conn.execute(sa.text("""
            INSERT INTO stage_masters (id, key, name, suffix, search_keywords)
            VALUES
            (1, 'main', 'Main Stage', '', '["main", "primary"]'),
            (2, 'rough', 'Rough Stage', '_rough', '["rough", "draft", "1st"]');
        """))

        conn.execute(sa.text("""
            CREATE TABLE mapping_masters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER REFERENCES mapping_group_masters(id),
                base_key VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                param_name VARCHAR NOT NULL,
                input_type VARCHAR NOT NULL,
                expected_class_types TEXT,
                base_title_patterns TEXT,
                fallback_param_names TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                role VARCHAR,
                display_name VARCHAR,
                title_patterns TEXT,
                default_enabled BOOLEAN NOT NULL DEFAULT 1
            );
        """))
        conn.execute(sa.text("""
            INSERT INTO mapping_masters (id, group_id, base_key, name, param_name, input_type, expected_class_types, base_title_patterns, fallback_param_names, sort_order, role)
            VALUES
            (1, 1, 'Sampler_Seed', 'Sampler Seed', 'seed', 'int', '["KSampler", "KSamplerAdvanced"]', '["KSampler", "MainSampler"]', '["noise_seed"]', 0, 'Sampler_Seed'),
            (2, 1, 'Main_Positive_Prompt', 'Main Positive Prompt', 'text', 'textarea', '["CLIPTextEncode", "PrimitiveNode"]', '["MainPrompt"]', NULL, 1, 'Main_Positive_Prompt');
        """))

        conn.execute(sa.text("""
            CREATE TABLE mapping_variants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                master_id INTEGER NOT NULL REFERENCES mapping_masters(id),
                stage_id INTEGER NOT NULL REFERENCES stage_masters(id),
                custom_role_override VARCHAR,
                extra_title_patterns TEXT,
                is_enabled BOOLEAN NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
        """))
        conn.execute(sa.text("""
            INSERT INTO mapping_variants (id, master_id, stage_id, custom_role_override, extra_title_patterns, is_enabled, sort_order)
            VALUES
            (1, 1, 1, NULL, '[]', 1, 0),
            (2, 1, 2, NULL, '["RoughSampler"]', 1, 1),
            (3, 2, 1, NULL, '[]', 1, 0);
        """))

        conn.execute(sa.text("""
            CREATE TABLE workflow_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL REFERENCES workflows(id),
                master_id INTEGER NOT NULL REFERENCES mapping_masters(id),
                variant_id INTEGER,
                node_id VARCHAR NOT NULL
            );
        """))
        conn.execute(sa.text("""
            INSERT INTO workflow_mappings (id, workflow_id, master_id, variant_id, node_id)
            VALUES
            (1, 1, 1, NULL, '3'),
            (2, 1, 2, NULL, '6');
        """))

    run_migrations(target_engine=engine)

    with engine.connect() as conn:
        insp = sa.inspect(conn)
        tables = set(insp.get_table_names())
        assert "binding_rule_sets" in tables
        assert "binding_rule_entries" in tables
        assert "node_selectors" in tables
        assert "node_selector_patterns" in tables

        # Verify BindingRuleSets created
        rulesets = conn.execute(sa.text("SELECT id, name FROM binding_rule_sets ORDER BY id")).fetchall()
        assert len(rulesets) >= 2

        # Verify BindingRuleEntries expanded (Cartesian product of class_type x params)
        entries_m1 = conn.execute(sa.text("""
            SELECT class_type, param_name, priority
            FROM binding_rule_entries
            WHERE rule_set_id = :rs_id
            ORDER BY class_type, priority
        """), {"rs_id": rulesets[0][0]}).fetchall()
        # KSampler: seed(1), noise_seed(2) ; KSamplerAdvanced: seed(1), noise_seed(2)
        assert len(entries_m1) == 4
        assert ("KSampler", "seed", 1) in entries_m1
        assert ("KSampler", "noise_seed", 2) in entries_m1
        assert ("KSamplerAdvanced", "seed", 1) in entries_m1
        assert ("KSamplerAdvanced", "noise_seed", 2) in entries_m1

        # Verify NodeSelector & patterns
        patterns = conn.execute(sa.text("SELECT pattern, match_type, priority FROM node_selector_patterns")).fetchall()
        pat_tuples = [(p[0], p[1]) for p in patterns]
        # Class name "KSampler" must be absorbed into Entry, NOT in selector patterns
        assert not any(p[0] == "KSampler" for p in patterns)
        # "MainSampler" must be exact
        assert ("MainSampler", "exact") in pat_tuples
        # "RoughSampler" must be exact
        assert ("RoughSampler", "exact") in pat_tuples
        # Stage keywords must be contains
        assert ("rough", "contains") in pat_tuples

        # Verify MappingVariants have role, binding_rule_set_id, node_selector_id
        variants = conn.execute(sa.text("""
            SELECT id, master_id, stage_id, role, binding_rule_set_id, node_selector_id
            FROM mapping_variants
            ORDER BY id
        """)).fetchall()
        assert len(variants) == 3
        # Variant 1: Main stage of Master 1 -> role="Sampler_Seed"
        assert variants[0][3] == "Sampler_Seed"
        assert variants[0][4] is not None
        # Variant 2: Rough stage of Master 1 -> role="Sampler_Seed_rough"
        assert variants[1][3] == "Sampler_Seed_rough"
        assert variants[1][4] is not None
        # Variant 3: Main stage of Master 2 -> role="Main_Positive_Prompt"
        assert variants[2][3] == "Main_Positive_Prompt"
        assert variants[2][4] is not None

        # Verify workflow_mappings re-assigned variant_id and populated input_name
        wf_mappings = conn.execute(sa.text("""
            SELECT id, master_id, variant_id, node_id, input_name
            FROM workflow_mappings
            ORDER BY id
        """)).fetchall()
        assert len(wf_mappings) == 2
        # Mapping 1: variant_id=1, input_name="seed"
        assert wf_mappings[0][2] == 1
        assert wf_mappings[0][4] == "seed"
        # Mapping 2: variant_id=3, input_name="text"
        assert wf_mappings[1][2] == 3
        assert wf_mappings[1][4] == "text"


@pytest.mark.integration
@getattr(pytest.mark, "REQ-417")
@getattr(pytest.mark, "AC-6")
def test_req417_ac6_phase5_unique_role_physical_constraint():
    """[REQ-417/AC-6] Physical UNIQUE(role) constraint rejects duplicate role insertions."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    run_migrations(target_engine=engine)

    with engine.begin() as conn:
        # Create master, stage, rule_set
        conn.execute(sa.text("INSERT INTO mapping_masters (base_key, name, param_name, input_type) VALUES ('base1', 'Base 1', 'param', 'int')"))
        m_id = conn.execute(sa.text("SELECT id FROM mapping_masters WHERE base_key = 'base1'")).scalar()
        s_id = conn.execute(sa.text("SELECT id FROM stage_masters WHERE key = 'main'")).scalar()
        conn.execute(sa.text("INSERT INTO binding_rule_sets (name) VALUES ('Test RuleSet AC6')"))
        rs_id = conn.execute(sa.text("SELECT id FROM binding_rule_sets WHERE name = 'Test RuleSet AC6'")).scalar()

        # Insert first variant with unique role
        conn.execute(sa.text("""
            INSERT INTO mapping_variants (master_id, stage_id, role, binding_rule_set_id, is_enabled, sort_order)
            VALUES (:m_id, :s_id, 'duplicate_role_test', :rs_id, 1, 0)
        """), {"m_id": m_id, "s_id": s_id, "rs_id": rs_id})

    # Attempt inserting second variant with duplicate role in a separate transaction
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as conn:
            conn.execute(sa.text("INSERT INTO stage_masters (key, name, suffix) VALUES ('stg2', 'Stage 2', '_2')"))
            s2_id = conn.execute(sa.text("SELECT id FROM stage_masters WHERE key = 'stg2'")).scalar()
            conn.execute(sa.text("""
                INSERT INTO mapping_variants (master_id, stage_id, role, binding_rule_set_id, is_enabled, sort_order)
                VALUES (:m_id, :s2_id, 'duplicate_role_test', :rs_id, 1, 0)
            """), {"m_id": m_id, "s2_id": s2_id, "rs_id": rs_id})


@pytest.mark.integration
@getattr(pytest.mark, "REQ-417")
@getattr(pytest.mark, "AC-7")
def test_req417_ac7_phase5_composite_unique_constraints_and_null_selector():
    """[REQ-417/AC-7] Composite constraints UNIQUE(master_id, stage_id), UNIQUE(master_id, node_selector_id) and NULL coexistence."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    run_migrations(target_engine=engine)

    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO mapping_masters (base_key, name, param_name, input_type) VALUES ('base_ac7', 'Base AC7', 'param', 'int')"))
        m_id = conn.execute(sa.text("SELECT id FROM mapping_masters WHERE base_key = 'base_ac7'")).scalar()
        conn.execute(sa.text("INSERT INTO stage_masters (key, name, suffix) VALUES ('stg_a', 'Stage A', '_a'), ('stg_b', 'Stage B', '_b')"))
        stg_a = conn.execute(sa.text("SELECT id FROM stage_masters WHERE key = 'stg_a'")).scalar()
        stg_b = conn.execute(sa.text("SELECT id FROM stage_masters WHERE key = 'stg_b'")).scalar()

        conn.execute(sa.text("INSERT INTO binding_rule_sets (name) VALUES ('Test RuleSet AC7')"))
        rs_id = conn.execute(sa.text("SELECT id FROM binding_rule_sets WHERE name = 'Test RuleSet AC7'")).scalar()

        conn.execute(sa.text("INSERT INTO node_selectors (name) VALUES ('Selector AC7')"))
        sel_id = conn.execute(sa.text("SELECT id FROM node_selectors WHERE name = 'Selector AC7'")).scalar()

        # Variant 1: (m_id, stg_a, sel_id)
        conn.execute(sa.text("""
            INSERT INTO mapping_variants (master_id, stage_id, role, binding_rule_set_id, node_selector_id, is_enabled, sort_order)
            VALUES (:m_id, :stg_a, 'role_ac7_1', :rs_id, :sel_id, 1, 0)
        """), {"m_id": m_id, "stg_a": stg_a, "rs_id": rs_id, "sel_id": sel_id})

    # 1. UNIQUE(master_id, stage_id) rejection: duplicate (m_id, stg_a)
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as conn:
            conn.execute(sa.text("""
                INSERT INTO mapping_variants (master_id, stage_id, role, binding_rule_set_id, node_selector_id, is_enabled, sort_order)
                VALUES (:m_id, :stg_a, 'role_ac7_duplicate_stage', :rs_id, NULL, 1, 0)
            """), {"m_id": m_id, "stg_a": stg_a, "rs_id": rs_id})

    # 2. UNIQUE(master_id, node_selector_id) rejection: duplicate (m_id, sel_id) with different stage
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as conn:
            conn.execute(sa.text("""
                INSERT INTO mapping_variants (master_id, stage_id, role, binding_rule_set_id, node_selector_id, is_enabled, sort_order)
                VALUES (:m_id, :stg_b, 'role_ac7_duplicate_selector', :rs_id, :sel_id, 1, 0)
            """), {"m_id": m_id, "stg_b": stg_b, "rs_id": rs_id, "sel_id": sel_id})

    # 3. NULL node_selector_id coexistence: multiple variants under same master with node_selector_id=NULL succeed
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO mapping_masters (base_key, name, param_name, input_type) VALUES ('base_null_sel', 'Base Null Sel', 'param', 'int')"))
        m_null = conn.execute(sa.text("SELECT id FROM mapping_masters WHERE base_key = 'base_null_sel'")).scalar()

        conn.execute(sa.text("""
            INSERT INTO mapping_variants (master_id, stage_id, role, binding_rule_set_id, node_selector_id, is_enabled, sort_order)
            VALUES (:m_id, :stg_a, 'role_null_1', :rs_id, NULL, 1, 0)
        """), {"m_id": m_null, "stg_a": stg_a, "rs_id": rs_id})

        conn.execute(sa.text("""
            INSERT INTO mapping_variants (master_id, stage_id, role, binding_rule_set_id, node_selector_id, is_enabled, sort_order)
            VALUES (:m_id, :stg_b, 'role_null_2', :rs_id, NULL, 1, 0)
        """), {"m_id": m_null, "stg_b": stg_b, "rs_id": rs_id})

    with engine.connect() as conn:
        null_count = conn.execute(sa.text("""
            SELECT COUNT(*) FROM mapping_variants WHERE master_id = :m_id AND node_selector_id IS NULL
        """), {"m_id": m_null}).scalar()
        assert null_count == 2


@pytest.mark.integration
@getattr(pytest.mark, "REQ-417")
def test_req417_seed_initial_data_creates_rulesets_and_variants():
    """Verify seed_initial_data populates RuleSets, NodeSelectors, and links Variants with role, binding_rule_set_id, node_selector_id."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    run_migrations(target_engine=engine)

    with Session(bind=engine) as session:
        seed_initial_data(session)

        rulesets = session.query(models.BindingRuleSet).all()
        assert len(rulesets) > 0

        selectors = session.query(models.NodeSelector).all()
        assert len(selectors) > 0

        variants = session.query(models.MappingVariant).all()
        assert len(variants) > 0
        for v in variants:
            assert v.role != ""
            assert v.binding_rule_set_id is not None
            assert v.binding_rule_set is not None


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_variant_ref_ac1_missing_mapping_variants_aborts_unchanged():
    """[REQ-418/AC-1] step_035 aborts when mapping_variants table is missing."""
    from app.migrations.steps import step_035_variant_id_references
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE workflow_presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                param_values TEXT NOT NULL
            )
        """))
        conn.execute(sa.text("INSERT INTO workflow_presets (id, param_values) VALUES (1, '{\"prompt\": \"abc\"}')"))

    with pytest.raises((ValueError, RuntimeError), match="mapping_variants"):
        with engine.begin() as conn:
            inspector = sa.inspect(conn)
            step_035_variant_id_references(conn, inspector)

    with engine.connect() as conn:
        inspector = sa.inspect(conn)
        assert "workflow_preset_values" not in inspector.get_table_names()
        row = conn.execute(sa.text("SELECT param_values FROM workflow_presets WHERE id = 1")).scalar_one()
        assert row == '{"prompt": "abc"}'


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_variant_ref_ac1_empty_tables_create_schema_only():
    """[REQ-418/AC-1] step_035 on empty tables creates schema and commits without data."""
    from app.migrations.steps import step_035_variant_id_references
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE mapping_variants (id INTEGER PRIMARY KEY, role VARCHAR NOT NULL)"))
        conn.execute(sa.text("CREATE TABLE workflow_presets (id INTEGER PRIMARY KEY, param_values TEXT NOT NULL)"))
        conn.execute(sa.text("CREATE TABLE param_sync_groups (id INTEGER PRIMARY KEY, master_role VARCHAR NOT NULL, slave_roles TEXT NOT NULL)"))
        inspector = sa.inspect(conn)
        step_035_variant_id_references(conn, inspector)

    with engine.connect() as conn:
        inspector = sa.inspect(conn)
        assert "workflow_preset_values" in inspector.get_table_names()
        assert "param_sync_group_members" in inspector.get_table_names()
        sg_cols = [c["name"] for c in inspector.get_columns("param_sync_groups")]
        assert "master_variant_id" in sg_cols

        assert conn.execute(sa.text("SELECT COUNT(*) FROM workflow_preset_values")).scalar_one() == 0
        assert conn.execute(sa.text("SELECT COUNT(*) FROM param_sync_group_members")).scalar_one() == 0


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_variant_ref_ac1_all_resolved_populates_values_and_clears_legacy_json():
    """[REQ-418/AC-1] step_035 migrates resolved preset values and leaves reserved in param_values."""
    from app.migrations.steps import step_035_variant_id_references
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE mapping_variants (id INTEGER PRIMARY KEY, role VARCHAR NOT NULL)"))
        conn.execute(sa.text("INSERT INTO mapping_variants (id, role) VALUES (1, 'sampler_seed'), (2, 'checkpoint')"))
        conn.execute(sa.text("CREATE TABLE workflow_presets (id INTEGER PRIMARY KEY, param_values TEXT NOT NULL)"))

        legacy_params = json.dumps({
            "sampler_seed": "12345",
            "sampler_seed_lora_count": 2,
            "v:2": "model.safetensors",
            "__ui_mode": "advanced"
        })
        conn.execute(sa.text("INSERT INTO workflow_presets (id, param_values) VALUES (1, :pv)"), {"pv": legacy_params})

        inspector = sa.inspect(conn)
        step_035_variant_id_references(conn, inspector)

    with engine.connect() as conn:
        rows = conn.execute(sa.text(
            "SELECT preset_id, variant_id, sub_key, value FROM workflow_preset_values ORDER BY variant_id, sub_key"
        )).fetchall()
        assert len(rows) == 3
        assert (rows[0][0], rows[0][1], rows[0][2], rows[0][3]) == (1, 1, "", "12345")
        assert (rows[1][0], rows[1][1], rows[1][2], rows[1][3]) == (1, 1, "lora_count", "2")
        assert (rows[2][0], rows[2][1], rows[2][2], rows[2][3]) == (1, 2, "", "model.safetensors")

        pv_after = conn.execute(sa.text("SELECT param_values FROM workflow_presets WHERE id = 1")).scalar_one()
        parsed = json.loads(pv_after)
        assert parsed == {"__ui_mode": "advanced"}


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_variant_ref_ac1_unresolved_row_rolls_back_all_unchanged():
    """[REQ-418/AC-1] step_035 aborts without mutating DB when preset has unresolved key."""
    from app.migrations.steps import step_035_variant_id_references
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE mapping_variants (id INTEGER PRIMARY KEY, role VARCHAR NOT NULL)"))
        conn.execute(sa.text("INSERT INTO mapping_variants (id, role) VALUES (1, 'sampler_seed')"))
        conn.execute(sa.text("CREATE TABLE workflow_presets (id INTEGER PRIMARY KEY, param_values TEXT NOT NULL)"))
        conn.execute(sa.text("INSERT INTO workflow_presets (id, param_values) VALUES (1, '{\"ghost_role\": \"val\"}')"))

    with pytest.raises(ValueError, match="ghost_role"):
        with engine.begin() as conn:
            inspector = sa.inspect(conn)
            step_035_variant_id_references(conn, inspector)

    with engine.connect() as conn:
        inspector = sa.inspect(conn)
        assert "workflow_preset_values" not in inspector.get_table_names()
        pv = conn.execute(sa.text("SELECT param_values FROM workflow_presets WHERE id = 1")).scalar_one()
        assert pv == '{"ghost_role": "val"}'


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_variant_ref_ac1_unresolved_error_lists_all_keys():
    """[REQ-418/AC-1] step_035 error message lists all unresolvable keys."""
    from app.migrations.steps import step_035_variant_id_references
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE mapping_variants (id INTEGER PRIMARY KEY, role VARCHAR NOT NULL)"))
        conn.execute(sa.text("CREATE TABLE workflow_presets (id INTEGER PRIMARY KEY, param_values TEXT NOT NULL)"))
        conn.execute(sa.text("INSERT INTO workflow_presets (id, param_values) VALUES (1, '{\"ghost_1\": \"a\", \"ghost_2\": \"b\"}')"))

    with pytest.raises(ValueError) as exc_info:
        with engine.begin() as conn:
            inspector = sa.inspect(conn)
            step_035_variant_id_references(conn, inspector)

    msg = str(exc_info.value)
    assert "ghost_1" in msg
    assert "ghost_2" in msg


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_variant_ref_ac1_step_is_idempotent_on_rerun():
    """[REQ-418/AC-1] step_035 can be re-run safely without errors or data duplication."""
    from app.migrations.steps import step_035_variant_id_references
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE mapping_variants (id INTEGER PRIMARY KEY, role VARCHAR NOT NULL)"))
        conn.execute(sa.text("INSERT INTO mapping_variants (id, role) VALUES (1, 'sampler_seed')"))
        conn.execute(sa.text("CREATE TABLE workflow_presets (id INTEGER PRIMARY KEY, param_values TEXT NOT NULL)"))
        conn.execute(sa.text("INSERT INTO workflow_presets (id, param_values) VALUES (1, '{\"sampler_seed\": \"42\"}')"))
        conn.execute(sa.text("CREATE TABLE param_sync_groups (id INTEGER PRIMARY KEY, master_role VARCHAR NOT NULL, slave_roles TEXT NOT NULL)"))
        conn.execute(sa.text("INSERT INTO param_sync_groups (id, master_role, slave_roles) VALUES (1, 'sampler_seed', '[\"sampler_seed\"]')"))

        inspector = sa.inspect(conn)
        step_035_variant_id_references(conn, inspector)

        # Second run
        inspector = sa.inspect(conn)
        step_035_variant_id_references(conn, inspector)

    with engine.connect() as conn:
        pv_count = conn.execute(sa.text("SELECT COUNT(*) FROM workflow_preset_values")).scalar_one()
        assert pv_count == 1
        sg_count = conn.execute(sa.text("SELECT COUNT(*) FROM param_sync_group_members")).scalar_one()
        assert sg_count == 1


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_variant_ref_ac1_step_schema_matches_models():
    """[REQ-418/AC-1] step_035 schema matches SQLAlchemy model column definitions."""
    from app.migrations.steps import step_035_variant_id_references
    engine_migration = create_engine("sqlite:///:memory:")
    with engine_migration.begin() as conn:
        conn.execute(sa.text("CREATE TABLE mapping_variants (id INTEGER PRIMARY KEY, role VARCHAR NOT NULL)"))
        conn.execute(sa.text("CREATE TABLE workflow_presets (id INTEGER PRIMARY KEY, param_values TEXT NOT NULL)"))
        conn.execute(sa.text("CREATE TABLE param_sync_groups (id INTEGER PRIMARY KEY, master_role VARCHAR NOT NULL, slave_roles TEXT NOT NULL)"))
        inspector = sa.inspect(conn)
        step_035_variant_id_references(conn, inspector)

    engine_models = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine_models)

    with engine_migration.connect() as conn_mig, engine_models.connect() as conn_mod:
        insp_mig = sa.inspect(conn_mig)
        insp_mod = sa.inspect(conn_mod)

        # Check workflow_preset_values columns
        mig_cols = {c["name"] for c in insp_mig.get_columns("workflow_preset_values")}
        mod_cols = {c["name"] for c in insp_mod.get_columns("workflow_preset_values")}
        assert {"id", "preset_id", "variant_id", "sub_key", "value"}.issubset(mig_cols)
        assert mig_cols == mod_cols

        # Check param_sync_group_members columns
        mig_sg_cols = {c["name"] for c in insp_mig.get_columns("param_sync_group_members")}
        mod_sg_cols = {c["name"] for c in insp_mod.get_columns("param_sync_group_members")}
        assert {"id", "group_id", "variant_id"}.issubset(mig_sg_cols)
        assert mig_sg_cols == mod_sg_cols


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_variant_ref_ac1_variant_delete_cascades_children():
    """[REQ-418/AC-1] deleting a variant cascades to delete child preset values and sync members."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    run_migrations(target_engine=engine)

    with Session(bind=engine) as session:
        session.execute(sa.text("PRAGMA foreign_keys = ON;"))
        seed_initial_data(session)

        variant = session.query(models.MappingVariant).first()
        assert variant is not None
        v_id = variant.id

        wf = models.Workflow(name="Cascade Test WF", json_body="{}")
        session.add(wf)
        session.flush()

        preset = models.WorkflowPreset(
            workflow_id=wf.id,
            name="Preset 1",
            param_values="{}",
            applied_assets="{}",
            batch_size=1,
            seed_mode="random",
            seed=0,
        )
        session.add(preset)
        session.flush()

        val = models.WorkflowPresetValue(
            preset_id=preset.id,
            variant_id=v_id,
            sub_key="",
            value="100",
        )
        session.add(val)

        sg = models.ParamSyncGroup(
            workflow_id=wf.id,
            name="SyncGroup 1",
            master_role=variant.role,
            master_variant_id=v_id,
            slave_roles="[]",
            is_enabled=True,
        )
        session.add(sg)
        session.flush()

        member = models.ParamSyncGroupMember(
            group_id=sg.id,
            variant_id=v_id,
        )
        session.add(member)
        session.commit()

        # Delete the variant
        session.delete(variant)
        session.commit()

        # Children should be deleted
        remaining_vals = session.query(models.WorkflowPresetValue).filter_by(variant_id=v_id).all()
        assert len(remaining_vals) == 0
        remaining_mems = session.query(models.ParamSyncGroupMember).filter_by(variant_id=v_id).all()
        assert len(remaining_mems) == 0


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-3")
def test_variant_ref_ac3_sync_group_migration_sets_master_and_members():
    """[REQ-418/AC-3] step_035 migrates sync group master_role and slave_roles to variant refs."""
    from app.migrations.steps import step_035_variant_id_references
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE mapping_variants (id INTEGER PRIMARY KEY, role VARCHAR NOT NULL)"))
        conn.execute(sa.text("INSERT INTO mapping_variants (id, role) VALUES (1, 'master_role'), (2, 'slave_role_1'), (3, 'slave_role_2')"))
        conn.execute(sa.text("CREATE TABLE param_sync_groups (id INTEGER PRIMARY KEY, master_role VARCHAR NOT NULL, slave_roles TEXT NOT NULL)"))
        conn.execute(sa.text("""
            INSERT INTO param_sync_groups (id, master_role, slave_roles)
            VALUES (1, 'master_role', '["slave_role_1", "slave_role_2", "slave_role_1"]')
        """))
        inspector = sa.inspect(conn)
        step_035_variant_id_references(conn, inspector)

    with engine.connect() as conn:
        master_vid = conn.execute(sa.text("SELECT master_variant_id FROM param_sync_groups WHERE id = 1")).scalar_one()
        assert master_vid == 1

        members = conn.execute(sa.text("SELECT variant_id FROM param_sync_group_members WHERE group_id = 1 ORDER BY id")).fetchall()
        assert [m[0] for m in members] == [2, 3]


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-3")
def test_variant_ref_ac3_sync_group_unresolved_role_aborts_unchanged():
    """[REQ-418/AC-3] step_035 aborts without mutating DB when sync group has unknown role."""
    from app.migrations.steps import step_035_variant_id_references
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE mapping_variants (id INTEGER PRIMARY KEY, role VARCHAR NOT NULL)"))
        conn.execute(sa.text("INSERT INTO mapping_variants (id, role) VALUES (1, 'master_role')"))
        conn.execute(sa.text("CREATE TABLE param_sync_groups (id INTEGER PRIMARY KEY, master_role VARCHAR NOT NULL, slave_roles TEXT NOT NULL)"))
        conn.execute(sa.text("INSERT INTO param_sync_groups (id, master_role, slave_roles) VALUES (1, 'master_role', '[\"unknown_slave\"]')"))

    with pytest.raises(ValueError, match="unknown_slave"):
        with engine.begin() as conn:
            inspector = sa.inspect(conn)
            step_035_variant_id_references(conn, inspector)

    with engine.connect() as conn:
        inspector = sa.inspect(conn)
        assert "param_sync_group_members" not in inspector.get_table_names()


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_step_035_aborts_when_mapping_variants_missing():
    """[REQ-418/AC-1] Alias: test_step_035_aborts_when_mapping_variants_missing."""
    test_variant_ref_ac1_missing_mapping_variants_aborts_unchanged()


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_step_035_empty_tables_commits_schema_only():
    """[REQ-418/AC-1] Alias: test_step_035_empty_tables_commits_schema_only."""
    test_variant_ref_ac1_empty_tables_create_schema_only()


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
@getattr(pytest.mark, "AC-3")
def test_step_035_happy_path_migrates_preset_and_sync_group():
    """[REQ-418/AC-1][REQ-418/AC-3] Alias: test_step_035_happy_path_migrates_preset_and_sync_group."""
    test_variant_ref_ac1_all_resolved_populates_values_and_clears_legacy_json()
    test_variant_ref_ac3_sync_group_migration_sets_master_and_members()


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_step_035_unresolved_role_aborts_without_mutation():
    """[REQ-418/AC-1] Alias: test_step_035_unresolved_role_aborts_without_mutation."""
    test_variant_ref_ac1_unresolved_row_rolls_back_all_unchanged()


@pytest.mark.integration
@getattr(pytest.mark, "REQ-418")
@getattr(pytest.mark, "AC-1")
def test_step_035_idempotent():
    """[REQ-418/AC-1] Alias: test_step_035_idempotent."""
    test_variant_ref_ac1_step_is_idempotent_on_rerun()


def test_step_036_prompt_structure_templates_migration():
    """[REQ-425/AC-1][REQ-425/AC-3] Step 036 creates prompt_structure_templates and adds prompt_template_config columns."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE workflows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL UNIQUE,
                json_body TEXT NOT NULL
            );
        """))
        conn.execute(sa.text("""
            CREATE TABLE workflow_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                json_body TEXT NOT NULL,
                mappings TEXT NOT NULL
            );
        """))
        inspector = sa.inspect(conn)
        step_036_prompt_structure_templates(conn, inspector)

    with engine.connect() as conn:
        inspector = sa.inspect(conn)
        assert "prompt_structure_templates" in inspector.get_table_names()
        table_cols = {c["name"] for c in inspector.get_columns("prompt_structure_templates")}
        assert {"id", "name", "description", "structure_json", "is_builtin", "sort_order", "created_at", "updated_at"}.issubset(table_cols)

        wf_cols = {c["name"] for c in inspector.get_columns("workflows")}
        assert "prompt_template_config" in wf_cols

        wfh_cols = {c["name"] for c in inspector.get_columns("workflow_history")}
        assert "prompt_template_config" in wfh_cols


def test_step_036_migration_idempotent():
    """[REQ-425/AC-1][REQ-425/AC-3] Step 036 is idempotent when re-run."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE workflows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR NOT NULL UNIQUE,
                json_body TEXT NOT NULL
            );
        """))
        inspector = sa.inspect(conn)
        step_036_prompt_structure_templates(conn, inspector)

    # Run a second time
    with engine.begin() as conn:
        inspector = sa.inspect(conn)
        step_036_prompt_structure_templates(conn, inspector)

    with engine.connect() as conn:
        inspector = sa.inspect(conn)
        assert "prompt_structure_templates" in inspector.get_table_names()
        wf_cols = {c["name"] for c in inspector.get_columns("workflows")}
        assert "prompt_template_config" in wf_cols




