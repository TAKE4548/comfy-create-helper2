import json
import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.schemas.mapping import CascadeRenameRequest
from app.services.mapping_service import MappingService


@pytest.fixture
def mapping_setup(db_session: Session):
    """Setup base mapping groups, masters, and workflow for cascade testing."""
    group = models.MappingGroupMaster(key="sampler", name="サンプラー系", is_builtin=True)
    db_session.add(group)
    db_session.flush()

    master_steps = models.MappingMaster(
        group_id=group.id,
        base_key="steps",
        name="Steps",
        param_name="steps",
        input_type="int",
    )
    master_cfg = models.MappingMaster(
        group_id=group.id,
        base_key="cfg",
        name="CFG",
        param_name="cfg",
        input_type="float",
    )
    db_session.add_all([master_steps, master_cfg])
    db_session.flush()

    workflow = models.Workflow(
        name="test_wf_cascade",
        json_body="{}",
    )
    db_session.add(workflow)
    db_session.flush()

    return {
        "group": group,
        "master_steps": master_steps,
        "master_cfg": master_cfg,
        "workflow": workflow,
    }


def test_preview_cascade(db_session: Session, mapping_setup):
    """[REQ-336/AC-1] MappingService.preview_cascade calculates affected variants, presets, and snapshots."""
    master_steps = mapping_setup["master_steps"]
    master_cfg = mapping_setup["master_cfg"]
    workflow = mapping_setup["workflow"]

    stage = models.StageMaster(
        key="rough",
        name="Rough",
        suffix="_rough",
        is_builtin=False,
        is_active=True,
    )
    db_session.add(stage)
    db_session.flush()

    v1 = models.MappingVariant(master_id=master_steps.id, stage_id=stage.id)
    v2 = models.MappingVariant(
        master_id=master_cfg.id,
        stage_id=stage.id,
        custom_role_override="cfg_custom_rough",
    )
    db_session.add_all([v1, v2])
    db_session.flush()

    p1 = models.WorkflowPreset(
        workflow_id=workflow.id,
        name="p1",
        param_values=json.dumps({"steps_rough": 25, "seed": 100}),
        applied_assets="{}",
        batch_size=1,
        seed_mode="random",
        seed=0,
    )
    p2 = models.WorkflowPreset(
        workflow_id=workflow.id,
        name="p2",
        param_values=json.dumps({"cfg_custom_rough": 7.5}),
        applied_assets="{}",
        batch_size=1,
        seed_mode="random",
        seed=0,
    )
    p3 = models.WorkflowPreset(
        workflow_id=workflow.id,
        name="p3",
        param_values=json.dumps({"steps": 20}),
        applied_assets="{}",
        batch_size=1,
        seed_mode="random",
        seed=0,
    )
    db_session.add_all([p1, p2, p3])

    s1 = models.Snapshot(
        workflow_id=workflow.id,
        params=json.dumps({"steps_rough": 25}),
    )
    s2 = models.Snapshot(
        workflow_id=workflow.id,
        params=json.dumps({"steps": 20}),
    )
    db_session.add_all([s1, s2])
    db_session.flush()

    preview = MappingService.preview_cascade(db_session, stage.id, "_draft")

    assert preview.stage_id == stage.id
    assert preview.old_suffix == "_rough"
    assert preview.new_suffix == "_draft"
    assert preview.affected_variants_count == 2
    assert preview.affected_presets_count == 2
    assert preview.affected_snapshots_count == 1

    diff_roles = {d["old_role"]: d["new_role"] for d in preview.role_diffs}
    assert diff_roles.get("steps_rough") == "steps_draft"
    assert diff_roles.get("cfg_custom_rough") == "cfg_custom_draft"


def test_execute_cascade_rename(db_session: Session, mapping_setup):
    """[REQ-336/AC-2] MappingService.execute_cascade_rename updates variants, presets, snapshots, and records previous suffixes."""
    master_steps = mapping_setup["master_steps"]
    workflow = mapping_setup["workflow"]

    stage = models.StageMaster(
        key="detail",
        name="Detail",
        suffix="_detail",
        is_builtin=False,
        is_active=True,
    )
    db_session.add(stage)
    db_session.flush()

    v1 = models.MappingVariant(master_id=master_steps.id, stage_id=stage.id)
    db_session.add(v1)
    db_session.flush()

    preset = models.WorkflowPreset(
        workflow_id=workflow.id,
        name="detail_preset",
        param_values=json.dumps({"steps_detail": 40, "seed": 999}),
        applied_assets="{}",
        batch_size=1,
        seed_mode="fixed",
        seed=999,
    )
    snapshot = models.Snapshot(
        workflow_id=workflow.id,
        params=json.dumps({"steps_detail": 40}),
    )
    db_session.add_all([preset, snapshot])
    db_session.flush()

    req = CascadeRenameRequest(new_suffix="_refiner")
    res = MappingService.execute_cascade_rename(db_session, stage.id, req)

    assert res.suffix == "_refiner"
    assert res.previous_suffixes == ["_detail"]

    db_session.expire_all()
    refreshed_stage = db_session.get(models.StageMaster, stage.id)
    assert refreshed_stage is not None
    assert refreshed_stage.suffix == "_refiner"
    assert refreshed_stage.previous_suffixes is not None
    assert json.loads(refreshed_stage.previous_suffixes) == ["_detail"]

    refreshed_preset = db_session.get(models.WorkflowPreset, preset.id)
    assert refreshed_preset is not None
    preset_vals = json.loads(refreshed_preset.param_values)
    assert "steps_detail" not in preset_vals
    assert preset_vals["steps_refiner"] == 40
    assert preset_vals["seed"] == 999

    refreshed_snap = db_session.get(models.Snapshot, snapshot.id)
    assert refreshed_snap is not None
    snap_vals = json.loads(refreshed_snap.params)
    assert "steps_detail" not in snap_vals
    assert snap_vals["steps_refiner"] == 40

    refreshed_v1 = db_session.get(models.MappingVariant, v1.id)
    assert refreshed_v1 is not None
    assert refreshed_v1.computed_role == "steps_refiner"


def test_previous_suffixes_cap_at_10(db_session: Session):
    """[REQ-336/AC-3] MappingService caps previous_suffixes history at 10 entries across multiple cascade renames."""
    stage = models.StageMaster(
        key="evolve",
        name="Evolve Stage",
        suffix="_v0",
        is_builtin=False,
        is_active=True,
    )
    db_session.add(stage)
    db_session.flush()

    for i in range(1, 16):
        req = CascadeRenameRequest(new_suffix=f"_v{i}")
        MappingService.execute_cascade_rename(db_session, stage.id, req)

    refreshed = db_session.get(models.StageMaster, stage.id)
    assert refreshed is not None
    assert refreshed.previous_suffixes is not None
    history = json.loads(refreshed.previous_suffixes)
    assert len(history) == 10
    # Most recent previous suffix should be _v14 at index 0
    assert history[0] == "_v14"
    assert refreshed.suffix == "_v15"


def test_validate_stage_deletion_guards(db_session: Session):
    """[REQ-336/AC-4] MappingService.validate_stage_deletion guards against deleting builtin stages and active stages with usages."""
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
    db_session.add_all([builtin_stage, custom_stage])
    db_session.flush()

    # Builtin stage cannot be deleted even with usage=0
    with pytest.raises(HTTPException) as exc_info:
        MappingService.validate_stage_deletion(builtin_stage, 0)
    assert exc_info.value.status_code == 400
    assert "システム既定のステージは削除できません" in exc_info.value.detail

    # Custom stage with usage > 0 cannot be deleted
    with pytest.raises(HTTPException) as exc_info:
        MappingService.validate_stage_deletion(custom_stage, 3)
    assert exc_info.value.status_code == 400
    assert "現在 3 件で使用中のため削除できません" in exc_info.value.detail

    # Custom stage with usage == 0 can be deleted safely (no exception)
    MappingService.validate_stage_deletion(custom_stage, 0)
