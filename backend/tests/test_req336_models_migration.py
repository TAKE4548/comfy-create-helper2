import json
import unittest
import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app import models
from app.migrations import run_migrations, MigrationRunner
from app.migrations.steps import MigrationStep
from app.seeder import seed_initial_data


class TestReq336ModelsAndMigration(unittest.TestCase):
    def test_models_definitions_and_computed_role(self):
        """Test MappingGroupMaster, StageMaster, MappingMaster, MappingVariant model relationships and computed_role."""
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)

        with Session(engine) as session:
            group = models.MappingGroupMaster(
                key="sampler",
                name="サンプラー系",
                sort_order=1,
                is_builtin=True,
                is_active=True,
            )
            session.add(group)
            session.flush()

            stage_main = models.StageMaster(
                key="main",
                name="通常 / Main",
                suffix="",
                search_keywords=json.dumps(["main"]),
                previous_suffixes=json.dumps([]),
                is_builtin=True,
                is_active=True,
                sort_order=1,
            )
            stage_rough = models.StageMaster(
                key="rough",
                name="Rough",
                suffix="_rough",
                search_keywords=json.dumps(["rough"]),
                previous_suffixes=json.dumps([]),
                is_builtin=True,
                is_active=True,
                sort_order=2,
            )
            session.add_all([stage_main, stage_rough])
            session.flush()

            master = models.MappingMaster(
                group_id=group.id,
                base_key="steps",
                name="Steps",
                param_name="steps",
                input_type="int",
                expected_class_types=json.dumps(["KSampler"]),
                base_title_patterns=json.dumps(["KSampler"]),
                sort_order=1,
            )
            session.add(master)
            session.flush()

            variant_main = models.MappingVariant(
                master_id=master.id,
                stage_id=stage_main.id,
                custom_role_override=None,
                extra_title_patterns=json.dumps([]),
                is_enabled=True,
                sort_order=1,
            )
            variant_rough = models.MappingVariant(
                master_id=master.id,
                stage_id=stage_rough.id,
                custom_role_override=None,
                extra_title_patterns=json.dumps([]),
                is_enabled=True,
                sort_order=2,
            )
            variant_override = models.MappingVariant(
                master_id=master.id,
                stage_id=stage_rough.id,
                custom_role_override="custom_steps_rough",
                extra_title_patterns=json.dumps([]),
                is_enabled=True,
                sort_order=3,
            )
            session.add_all([variant_main, variant_rough, variant_override])
            session.flush()

            # Verify relationships and computed_role
            self.assertEqual(variant_main.computed_role, "steps")
            self.assertEqual(variant_rough.computed_role, "steps_rough")
            self.assertEqual(variant_override.computed_role, "custom_steps_rough")

            # Check relationships navigation
            self.assertEqual(len(master.variants), 3)
            self.assertEqual(group.masters[0].base_key, "steps")
            self.assertIn(variant_rough, stage_rough.variants)

            # WorkflowMapping wiring test
            workflow = models.Workflow(name="W1", json_body="{}")
            session.add(workflow)
            session.flush()

            wf_mapping = models.WorkflowMapping(
                workflow_id=workflow.id,
                master_id=master.id,
                variant_id=variant_main.id,
                node_id="3",
            )
            session.add(wf_mapping)
            session.flush()

            self.assertEqual(wf_mapping.variant_id, variant_main.id)
            self.assertEqual(wf_mapping.master_id, master.id)
            self.assertEqual(wf_mapping.variant.computed_role, "steps")

    def test_legacy_data_migration_step_029(self):
        """Test step_029 migrates legacy mapping_master and workflow_mappings to normalized structure."""
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

        # 1. Setup legacy schema without step_029
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

        # 2. Run migrations including step_029
        run_migrations(target_engine=engine)

        # 3. Verify normalized schema & data
        with engine.connect() as conn:
            insp = sa.inspect(conn)
            tables = insp.get_table_names()
            self.assertIn("mapping_masters", tables)
            self.assertIn("mapping_group_masters", tables)
            self.assertIn("stage_masters", tables)
            self.assertIn("mapping_variants", tables)

            # Check groups seeded
            groups = conn.execute(sa.text("SELECT key, name FROM mapping_group_masters")).fetchall()
            group_keys = {g[0] for g in groups}
            self.assertIn("prompt", group_keys)
            self.assertIn("sampler", group_keys)

            # Check stages seeded
            stages = conn.execute(sa.text("SELECT key, suffix FROM stage_masters")).fetchall()
            stage_dict = {s[0]: s[1] for s in stages}
            self.assertIn("main", stage_dict)
            self.assertIn("rough", stage_dict)
            self.assertIn("detail", stage_dict)

            # Check masters updated
            m_rows = conn.execute(sa.text("""
                SELECT id, base_key, name, group_id FROM mapping_masters ORDER BY id
            """)).fetchall()
            self.assertEqual(len(m_rows), 3)
            # Row 1: Main_Positive_Prompt -> base_key Main_Positive_Prompt
            self.assertEqual(m_rows[0][1], "Main_Positive_Prompt")
            # Row 2: Sampler_Steps -> base_key Sampler_Steps
            self.assertEqual(m_rows[1][1], "Sampler_Steps")
            # Row 3: Sampler_Steps_rough -> base_key Sampler_Steps
            self.assertEqual(m_rows[2][1], "Sampler_Steps")

            # Check variants created
            v_rows = conn.execute(sa.text("""
                SELECT id, master_id, stage_id FROM mapping_variants ORDER BY id
            """)).fetchall()
            self.assertGreaterEqual(len(v_rows), 3)

            # Check workflow_mappings variant_id populated
            wm_rows = conn.execute(sa.text("""
                SELECT id, master_id, variant_id, node_id FROM workflow_mappings ORDER BY id
            """)).fetchall()
            self.assertEqual(len(wm_rows), 3)
            for wm in wm_rows:
                self.assertIsNotNone(wm[2], f"workflow_mapping id {wm[0]} must have variant_id")
                self.assertGreater(wm[2], 0)

    def test_step_029_idempotency(self):
        """Test step_029 is idempotent and safe when executed multiple times."""
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)

        run_migrations(target_engine=engine)
        run_migrations(target_engine=engine)

        with engine.connect() as conn:
            g_count = conn.execute(sa.text("SELECT COUNT(*) FROM mapping_group_masters")).scalar()
            s_count = conn.execute(sa.text("SELECT COUNT(*) FROM stage_masters")).scalar()
            self.assertEqual(g_count, 6)
            self.assertEqual(s_count, 3)

    def test_step_029_atomic_rollback_on_failure(self):
        """Red Teaming: verify that if a failure happens during step_029, changes are rolled back cleanly."""
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

        # Create a failing step to verify MigrationRunner rollback
        def failing_step(conn, inspector):
            conn.execute(sa.text("""
                INSERT INTO mapping_master (role, param_name, input_type, display_name)
                VALUES ('corrupted_role', 'seed', 'int', 'Corrupted');
            """))
            raise RuntimeError("Forced simulation error")

        runner = MigrationRunner(steps=[MigrationStep("029_fail", "failing_step", failing_step)])
        with self.assertRaises(RuntimeError):
            runner.run(target_engine=engine)

        with engine.connect() as conn:
            rows = conn.execute(sa.text("SELECT role FROM mapping_master;")).fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0][0], "Sampler_Seed")

    def test_seeder_initial_data_creates_groups_stages_masters_variants(self):
        """Test seeder populates groups, stages, masters, and default variants on fresh DB."""
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        run_migrations(target_engine=engine)

        with Session(engine) as session:
            seed_initial_data(session)

            # Verify groups
            groups = session.query(models.MappingGroupMaster).all()
            self.assertGreaterEqual(len(groups), 6)

            # Verify stages
            stages = session.query(models.StageMaster).all()
            self.assertEqual(len(stages), 3)

            # Verify masters
            masters = session.query(models.MappingMaster).all()
            self.assertGreater(len(masters), 0)

            # Verify each master has at least one variant (e.g. main)
            for m in masters:
                self.assertGreater(len(m.variants), 0)
                self.assertIsNotNone(m.group_id)
                self.assertTrue(bool(m.base_key))
