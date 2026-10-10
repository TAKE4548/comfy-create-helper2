"""Unit tests for MappingService cascade operations and deletion guards (REQ-336)."""
import json
import unittest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app import models
from app.schemas.mapping import CascadeRenameRequest
from app.services.mapping_service import MappingService


class TestReq336CascadeService(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.session = Session(self.engine)

        # Setup base group & master
        self.group = models.MappingGroupMaster(key="sampler", name="??????", is_builtin=True)
        self.session.add(self.group)
        self.session.flush()

        self.master_steps = models.MappingMaster(
            group_id=self.group.id,
            base_key="steps",
            name="Steps",
            param_name="steps",
            input_type="int",
        )
        self.master_cfg = models.MappingMaster(
            group_id=self.group.id,
            base_key="cfg",
            name="CFG",
            param_name="cfg",
            input_type="float",
        )
        self.session.add_all([self.master_steps, self.master_cfg])
        self.session.flush()

        # Setup workflow
        self.workflow = models.Workflow(
            name="test_wf",
            json_body="{}",
        )
        self.session.add(self.workflow)
        self.session.flush()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_preview_cascade(self):
        """Test cascade preview calculation of affected variants, presets, and snapshots."""
        stage = models.StageMaster(
            key="rough",
            name="Rough",
            suffix="_rough",
            is_builtin=False,
            is_active=True,
        )
        self.session.add(stage)
        self.session.flush()

        v1 = models.MappingVariant(master_id=self.master_steps.id, stage_id=stage.id)
        v2 = models.MappingVariant(
            master_id=self.master_cfg.id,
            stage_id=stage.id,
            custom_role_override="cfg_custom_rough",
        )
        self.session.add_all([v1, v2])
        self.session.flush()

        # Presets: 1 matches steps_rough, 1 matches cfg_custom_rough, 1 unaffected
        p1 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="p1",
            param_values=json.dumps({"steps_rough": 25, "seed": 100}),
            applied_assets="{}",
            batch_size=1,
            seed_mode="random",
            seed=0,
        )
        p2 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="p2",
            param_values=json.dumps({"cfg_custom_rough": 7.5}),
            applied_assets="{}",
            batch_size=1,
            seed_mode="random",
            seed=0,
        )
        p3 = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="p3",
            param_values=json.dumps({"steps": 20}),
            applied_assets="{}",
            batch_size=1,
            seed_mode="random",
            seed=0,
        )
        self.session.add_all([p1, p2, p3])

        # Snapshots: 1 affected, 1 unaffected
        s1 = models.Snapshot(
            workflow_id=self.workflow.id,
            params=json.dumps({"steps_rough": 25}),
        )
        s2 = models.Snapshot(
            workflow_id=self.workflow.id,
            params=json.dumps({"steps": 20}),
        )
        self.session.add_all([s1, s2])
        self.session.commit()

        preview = MappingService.preview_cascade(self.session, stage.id, "_draft")

        self.assertEqual(preview.stage_id, stage.id)
        self.assertEqual(preview.old_suffix, "_rough")
        self.assertEqual(preview.new_suffix, "_draft")
        self.assertEqual(preview.affected_variants_count, 2)
        self.assertEqual(preview.affected_presets_count, 2)
        self.assertEqual(preview.affected_snapshots_count, 1)

        diff_roles = {d["old_role"]: d["new_role"] for d in preview.role_diffs}
        self.assertEqual(diff_roles.get("steps_rough"), "steps_draft")
        self.assertEqual(diff_roles.get("cfg_custom_rough"), "cfg_custom_draft")

    def test_execute_cascade_rename(self):
        """Test executing cascade rename updates variants, presets, snapshots, and history."""
        stage = models.StageMaster(
            key="detail",
            name="Detail",
            suffix="_detail",
            is_builtin=False,
            is_active=True,
        )
        self.session.add(stage)
        self.session.flush()

        v1 = models.MappingVariant(master_id=self.master_steps.id, stage_id=stage.id)
        self.session.add(v1)
        self.session.flush()

        preset = models.WorkflowPreset(
            workflow_id=self.workflow.id,
            name="detail_preset",
            param_values=json.dumps({"steps_detail": 40, "seed": 999}),
            applied_assets="{}",
            batch_size=1,
            seed_mode="fixed",
            seed=999,
        )
        snapshot = models.Snapshot(
            workflow_id=self.workflow.id,
            params=json.dumps({"steps_detail": 40}),
        )
        self.session.add_all([preset, snapshot])
        self.session.commit()

        req = CascadeRenameRequest(new_suffix="_refiner")
        res = MappingService.execute_cascade_rename(self.session, stage.id, req)

        self.assertEqual(res.suffix, "_refiner")
        self.assertEqual(res.previous_suffixes, ["_detail"])

        # Check DB updates
        self.session.expire_all()
        refreshed_stage = self.session.get(models.StageMaster, stage.id)
        self.assertIsNotNone(refreshed_stage)
        self.assertEqual(refreshed_stage.suffix, "_refiner")
        self.assertEqual(json.loads(refreshed_stage.previous_suffixes), ["_detail"])

        refreshed_preset = self.session.get(models.WorkflowPreset, preset.id)
        self.assertIsNotNone(refreshed_preset)
        preset_vals = json.loads(refreshed_preset.param_values)
        self.assertNotIn("steps_detail", preset_vals)
        self.assertEqual(preset_vals["steps_refiner"], 40)
        self.assertEqual(preset_vals["seed"], 999)

        refreshed_snap = self.session.get(models.Snapshot, snapshot.id)
        self.assertIsNotNone(refreshed_snap)
        snap_vals = json.loads(refreshed_snap.params)
        self.assertNotIn("steps_detail", snap_vals)
        self.assertEqual(snap_vals["steps_refiner"], 40)

        # Computed role of variant should now reflect new suffix
        refreshed_v1 = self.session.get(models.MappingVariant, v1.id)
        self.assertIsNotNone(refreshed_v1)
        self.assertEqual(refreshed_v1.computed_role, "steps_refiner")

    def test_previous_suffixes_cap_at_10(self):
        """Red Teaming 3: previous_suffixes history capped at 10 items after 15 renames."""
        stage = models.StageMaster(
            key="evolve",
            name="Evolve Stage",
            suffix="_v0",
            is_builtin=False,
            is_active=True,
        )
        self.session.add(stage)
        self.session.commit()

        for i in range(1, 16):
            req = CascadeRenameRequest(new_suffix=f"_v{i}")
            MappingService.execute_cascade_rename(self.session, stage.id, req)

        refreshed = self.session.get(models.StageMaster, stage.id)
        self.assertIsNotNone(refreshed)
        assert refreshed is not None
        history = json.loads(refreshed.previous_suffixes)
        self.assertEqual(len(history), 10)
        # Most recent previous suffix should be _v14 at index 0
        self.assertEqual(history[0], "_v14")
        self.assertEqual(refreshed.suffix, "_v15")

    def test_validate_stage_deletion_guards(self):
        """Test 3-layer deletion guards: builtin guard and usage count guard."""
        builtin_stage = models.StageMaster(
            key="main",
            name="Main",
            suffix="",
            is_builtin=True,
            is_active=True,
        )
        custom_stage = models.StageMaster(
            key="custom",
            name="Custom",
            suffix="_c",
            is_builtin=False,
            is_active=True,
        )
        self.session.add_all([builtin_stage, custom_stage])
        self.session.flush()

        # Builtin stage cannot be deleted even with usage=0
        with self.assertRaises(HTTPException) as cm:
            MappingService.validate_stage_deletion(builtin_stage, 0)
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("システム既定のステージは削除できません", cm.exception.detail)

        # Custom stage with usage > 0 cannot be deleted
        with self.assertRaises(HTTPException) as cm:
            MappingService.validate_stage_deletion(custom_stage, 3)
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("現在 3 件で使用中のため削除できません", cm.exception.detail)

        # Custom stage with usage == 0 can be deleted safely
        try:
            MappingService.validate_stage_deletion(custom_stage, 0)
        except HTTPException:
            self.fail("validate_stage_deletion unexpectedly raised HTTPException on custom stage with 0 usages")


if __name__ == "__main__":
    unittest.main()
