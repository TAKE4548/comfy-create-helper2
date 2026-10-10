"""E2E Integration & Red Teaming tests for REQ-336 StageMaster & Cascade Lifecycle."""
import json
import threading
import unittest
import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app import models
from app.migrations import run_migrations, MigrationRunner
from app.migrations.steps import MigrationStep
from app.schemas.mapping import CascadeRenameRequest
from app.services.mapping_service import MappingService


class TestReq336E2EIntegration(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.session = self.SessionLocal()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_req336_full_lifecycle(self):
        """
        Full lifecycle test:
        1. Run migrations to ensure clean schema state.
        2. Create/query group, base master, and built-in stages (main, rough).
        3. Add a new custom stage ('upscale', suffix '_upscale').
        4. Add variant and associate workflow mapping.
        5. Create preset and snapshot with role keys.
        6. Execute cascade rename (_upscale -> _hires).
        7. Verify wiring integrity, previous_suffixes history chain, preset & snapshot updates.
        """
        # 1. Run migrations
        run_migrations(target_engine=self.engine)

        # 2. Base Group & Master
        group = self.session.query(models.MappingGroupMaster).filter_by(key="sampler").first()
        if not group:
            group = models.MappingGroupMaster(key="sampler", name="Sampler Group", is_builtin=True, is_active=True)
            self.session.add(group)
            self.session.flush()

        master_steps = models.MappingMaster(
            group_id=group.id,
            base_key="steps",
            name="Steps",
            param_name="steps",
            input_type="int",
            expected_class_types=json.dumps(["KSampler"]),
        )
        self.session.add(master_steps)
        self.session.flush()

        # Built-in stages
        stage_main = self.session.query(models.StageMaster).filter_by(key="main").first()
        if not stage_main:
            stage_main = models.StageMaster(
                key="main",
                name="Main",
                suffix="",
                search_keywords=json.dumps(["main"]),
                previous_suffixes=json.dumps([]),
                is_builtin=True,
                is_active=True,
                sort_order=1,
            )
            self.session.add(stage_main)
            self.session.flush()

        # 3. Add custom stage
        stage_upscale = models.StageMaster(
            key="upscale",
            name="Upscale Stage",
            suffix="_upscale",
            search_keywords=json.dumps(["upscale"]),
            previous_suffixes=json.dumps([]),
            is_builtin=False,
            is_active=True,
            sort_order=4,
        )
        self.session.add(stage_upscale)
        self.session.flush()

        # 4. Create variants and workflow mappings
        variant_main = models.MappingVariant(
            master_id=master_steps.id,
            stage_id=stage_main.id,
            custom_role_override=None,
        )
        variant_upscale = models.MappingVariant(
            master_id=master_steps.id,
            stage_id=stage_upscale.id,
            custom_role_override=None,
        )
        self.session.add_all([variant_main, variant_upscale])
        self.session.flush()

        self.assertEqual(variant_main.computed_role, "steps")
        self.assertEqual(variant_upscale.computed_role, "steps_upscale")

        wf = models.Workflow(
            name="Upscale Workflow",
            json_body=json.dumps({
                "1": {"class_type": "KSampler", "inputs": {"steps": 20}}
            }),
        )
        self.session.add(wf)
        self.session.flush()

        wf_map = models.WorkflowMapping(
            workflow_id=wf.id,
            master_id=master_steps.id,
            variant_id=variant_upscale.id,
            node_id="1",
        )
        self.session.add(wf_map)
        self.session.flush()

        # 5. Create preset and snapshot with steps_upscale
        preset = models.WorkflowPreset(
            workflow_id=wf.id,
            name="Default Upscale Preset",
            param_values=json.dumps({"steps_upscale": "35", "cfg": "7.0"}),
            applied_assets=json.dumps({"steps_upscale": "hires_lora"}),
            batch_size=1,
            seed_mode="fixed",
            seed=12345,
        )
        snap = models.Snapshot(
            workflow_id=wf.id,
            params=json.dumps({"steps_upscale": "35", "seed": "12345"}),
        )
        self.session.add_all([preset, snap])
        self.session.commit()

        # 6. Cascade rename: _upscale -> _hires
        req = CascadeRenameRequest(
            new_suffix="_hires",
            update_presets=True,
            update_snapshots=True,
        )
        updated_stage = MappingService.execute_cascade_rename(self.session, stage_upscale.id, req)

        # 7. Verify wiring integrity
        self.assertEqual(updated_stage.suffix, "_hires")
        self.assertIn("_upscale", updated_stage.previous_suffixes or [])

        # Refresh variant and check computed_role
        self.session.refresh(variant_upscale)
        self.assertEqual(variant_upscale.computed_role, "steps_hires")

        # Verify preset
        self.session.refresh(preset)
        p_vals = json.loads(preset.param_values)
        self.assertNotIn("steps_upscale", p_vals)
        self.assertEqual(p_vals.get("steps_hires"), "35")
        self.assertEqual(p_vals.get("cfg"), "7.0")
        p_assets = json.loads(preset.applied_assets)
        self.assertEqual(p_assets.get("steps_hires"), "hires_lora")

        # Verify snapshot
        self.session.refresh(snap)
        s_vals = json.loads(snap.params)
        self.assertNotIn("steps_upscale", s_vals)
        self.assertEqual(s_vals.get("steps_hires"), "35")
        self.assertEqual(s_vals.get("seed"), "12345")

        # Verify workflow mapping still cleanly references variant
        self.session.refresh(wf_map)
        self.assertEqual(wf_map.variant.computed_role, "steps_hires")

    def test_red_teaming_1_migration_rollback_on_failure(self):
        """Red Teaming 1: Verify complete rollback when migration fails midway."""
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with engine.begin() as conn:
            conn.execute(sa.text("""
                CREATE TABLE stage_masters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key VARCHAR NOT NULL UNIQUE,
                    name VARCHAR NOT NULL,
                    suffix VARCHAR NOT NULL,
                    previous_suffixes TEXT
                );
            """))
            conn.execute(sa.text("""
                INSERT INTO stage_masters (key, name, suffix, previous_suffixes)
                VALUES ('main', 'Main Stage', '', '[]');
            """))

        def failing_step(conn, inspector):
            conn.execute(sa.text("""
                INSERT INTO stage_masters (key, name, suffix, previous_suffixes)
                VALUES ('temp_corrupt', 'Temp Corrupt', '_corrupt', '[]');
            """))
            # Simulate unexpected failure midway through migration
            raise RuntimeError("Database IO failure during migration execution")

        runner = MigrationRunner(steps=[MigrationStep("999_fail", "failing_step", failing_step)])
        with self.assertRaises(RuntimeError):
            runner.run(target_engine=engine)

        with engine.connect() as conn:
            stages = conn.execute(sa.text("SELECT key FROM stage_masters;")).fetchall()
            self.assertEqual(len(stages), 1)
            self.assertEqual(stages[0][0], "main")

    def test_red_teaming_2_concurrent_transaction_locking(self):
        """Red Teaming 2: Verify locking and transaction safety under concurrent calls."""
        stage = models.StageMaster(
            key="concurrent_test",
            name="Concurrent Stage",
            suffix="_init",
            is_builtin=False,
            is_active=True,
            sort_order=10,
        )
        self.session.add(stage)
        self.session.commit()

        results = []
        errors = []

        def worker(new_suffix):
            with self.SessionLocal() as sess:
                try:
                    req = CascadeRenameRequest(
                        new_suffix=new_suffix,
                        update_presets=True,
                        update_snapshots=True,
                    )
                    res = MappingService.execute_cascade_rename(sess, stage.id, req)
                    results.append(res.suffix)
                except Exception as e:
                    errors.append(e)

        t1 = threading.Thread(target=worker, args=("_thread1",))
        t2 = threading.Thread(target=worker, args=("_thread2",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(len(results) + len(errors), 2)
        with self.SessionLocal() as check_sess:
            final_stage = check_sess.get(models.StageMaster, stage.id)
            self.assertIn(final_stage.suffix, ["_thread1", "_thread2"])
            history = json.loads(final_stage.previous_suffixes or "[]")
            self.assertIsInstance(history, list)
            self.assertIn("_init", history)

    def test_red_teaming_3_previous_suffixes_trim_limit_and_corrupted_json(self):
        """
        Red Teaming 3:
        1. Verify previous_suffixes max 10 trim limit.
        2. Corrupted JSON resilience (invalid string recovered cleanly).
        """
        stage = models.StageMaster(
            key="trim_stage",
            name="Trim Test Stage",
            suffix="_s0",
            previous_suffixes=json.dumps([]),
            is_builtin=False,
            is_active=True,
            sort_order=5,
        )
        self.session.add(stage)
        self.session.commit()

        # 1. Rename 15 times to exceed the 10 limit
        for i in range(1, 16):
            req = CascadeRenameRequest(
                new_suffix=f"_s{i}",
                update_presets=True,
                update_snapshots=True,
            )
            res = MappingService.execute_cascade_rename(self.session, stage.id, req)
            self.assertEqual(res.suffix, f"_s{i}")

        self.session.refresh(stage)
        history = json.loads(stage.previous_suffixes)
        self.assertEqual(len(history), 10)
        # Most recent previous suffix should be _s14
        self.assertEqual(history[0], "_s14")
        # Oldest suffix in 10-item limit should be _s5
        self.assertEqual(history[-1], "_s5")
        self.assertNotIn("_s0", history)

        # 2. Corrupted JSON resilience
        stage.previous_suffixes = "{corrupted json invalid string"
        self.session.commit()

        req_heal = CascadeRenameRequest(
            new_suffix="_healed",
            update_presets=True,
            update_snapshots=True,
        )
        res_heal = MappingService.execute_cascade_rename(self.session, stage.id, req_heal)
        self.assertEqual(res_heal.suffix, "_healed")
        self.session.refresh(stage)
        healed_history = json.loads(stage.previous_suffixes)
        self.assertIsInstance(healed_history, list)
        self.assertEqual(healed_history[0], "_s15")
