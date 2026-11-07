import json
import pytest
from sqlalchemy.orm import Session

from app import models


def test_mapping_models_definitions_and_computed_role(db_session: Session):
    """[REQ-336/AC-1] MappingGroupMaster, StageMaster, MappingMaster, MappingVariant model relationships and computed_role."""
    group = models.MappingGroupMaster(
        key="sampler",
        name="サンプラー系",
        sort_order=1,
        is_builtin=True,
        is_active=True,
    )
    db_session.add(group)
    db_session.flush()

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
    stage_refiner = models.StageMaster(
        key="refiner",
        name="Refiner",
        suffix="_refiner",
        search_keywords=json.dumps(["refiner"]),
        previous_suffixes=json.dumps([]),
        is_builtin=True,
        is_active=True,
        sort_order=3,
    )
    rule_set = models.BindingRuleSet(name="Default Steps Rule Set")
    db_session.add_all([stage_main, stage_rough, stage_refiner, rule_set])
    db_session.flush()

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
    db_session.add(master)
    db_session.flush()

    variant_main = models.MappingVariant(
        master_id=master.id,
        stage_id=stage_main.id,
        role="steps",
        binding_rule_set_id=rule_set.id,
        custom_role_override=None,
        extra_title_patterns=json.dumps([]),
        is_enabled=True,
        sort_order=1,
    )
    variant_rough = models.MappingVariant(
        master_id=master.id,
        stage_id=stage_rough.id,
        role="steps_rough",
        binding_rule_set_id=rule_set.id,
        custom_role_override=None,
        extra_title_patterns=json.dumps([]),
        is_enabled=True,
        sort_order=2,
    )
    variant_override = models.MappingVariant(
        master_id=master.id,
        stage_id=stage_refiner.id,
        role="custom_steps_rough",
        binding_rule_set_id=rule_set.id,
        custom_role_override="custom_steps_rough",
        extra_title_patterns=json.dumps([]),
        is_enabled=True,
        sort_order=3,
    )
    db_session.add_all([variant_main, variant_rough, variant_override])
    db_session.flush()

    # Verify computed_role calculation
    assert variant_main.computed_role == "steps"
    assert variant_rough.computed_role == "steps_rough"
    assert variant_override.computed_role == "custom_steps_rough"

    # Verify relationships navigation
    assert len(master.variants) == 3
    assert group.masters[0].base_key == "steps"
    assert variant_rough in stage_rough.variants

    # WorkflowMapping wiring test
    workflow = models.Workflow(name="W1_relations", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    wf_mapping = models.WorkflowMapping(
        workflow_id=workflow.id,
        master_id=master.id,
        variant_id=variant_main.id,
        node_id="3",
    )
    db_session.add(wf_mapping)
    db_session.flush()

    assert wf_mapping.variant_id == variant_main.id
    assert wf_mapping.master_id == master.id
    assert wf_mapping.variant is not None
    assert wf_mapping.variant.computed_role == "steps"


def test_base_model_crud_and_checkpoint_mappings(db_session: Session):
    """[REQ-048/AC-1][REQ-048/AC-2] BaseModel and CheckpointMapping relationships and cascade."""
    bm = models.BaseModel(name="TestModel", description="Test Desc")
    db_session.add(bm)
    db_session.flush()

    assert bm.id is not None
    assert bm.name == "TestModel"
    assert bm.description == "Test Desc"

    retrieved = db_session.query(models.BaseModel).filter(models.BaseModel.id == bm.id).first()
    assert retrieved is not None
    assert retrieved.name == "TestModel"

    mapping = models.CheckpointMapping(checkpoint_name="test_checkpoint.safetensors", base_model_id=bm.id)
    db_session.add(mapping)
    db_session.flush()

    assert mapping.id is not None
    assert mapping.checkpoint_name == "test_checkpoint.safetensors"
    assert mapping.base_model.name == "TestModel"


def test_lora_many_to_many_base_models(db_session: Session):
    """[REQ-048/AC-3] Lora many-to-many relationship with BaseModel through association table."""
    illus = models.BaseModel(name="Illus_M2M")
    noob = models.BaseModel(name="Noob_M2M")
    db_session.add_all([illus, noob])
    db_session.flush()

    lora = models.Lora(model_name="Test Lora M2M")
    lora.base_models.append(illus)
    lora.base_models.append(noob)
    db_session.add(lora)
    db_session.flush()

    assert len(lora.base_models) == 2
    model_names = [bm.name for bm in lora.base_models]
    assert "Illus_M2M" in model_names
    assert "Noob_M2M" in model_names

    # Reverse navigation
    assert len(illus.loras) == 1
    assert illus.loras[0].model_name == "Test Lora M2M"


def test_workflow_target_base_model_relation(db_session: Session):
    """[REQ-048/AC-4] Workflow target_base_model relation."""
    bm = models.BaseModel(name="TargetBaseModel")
    db_session.add(bm)
    db_session.flush()

    workflow = models.Workflow(name="test_wf_base_model", json_body="{}", target_base_model_id=bm.id)
    db_session.add(workflow)
    db_session.flush()

    assert workflow.target_base_model_id == bm.id
    assert workflow.target_base_model is not None
    assert workflow.target_base_model.name == "TargetBaseModel"


def test_workflow_preset_relationships(db_session: Session):
    """[REQ-163/AC-1] Workflow and WorkflowPreset foreign key relationship and ordering."""
    workflow = models.Workflow(name="test_wf_presets", json_body="{}")
    db_session.add(workflow)
    db_session.flush()

    p1 = models.WorkflowPreset(
        workflow_id=workflow.id,
        name="Preset Alpha",
        param_values="{}",
        applied_assets="{}",
        batch_size=1,
        seed_mode="random",
        seed=0,
        sort_order=1,
    )
    p2 = models.WorkflowPreset(
        workflow_id=workflow.id,
        name="Preset Beta",
        param_values="{}",
        applied_assets="{}",
        batch_size=2,
        seed_mode="fixed",
        seed=123,
        sort_order=2,
    )
    db_session.add_all([p1, p2])
    db_session.flush()

    assert len(workflow.presets) == 2
    preset_names = [p.name for p in workflow.presets]
    assert "Preset Alpha" in preset_names
    assert "Preset Beta" in preset_names


def test_snapshot_album_and_association_relations(db_session: Session):
    """[REQ-267/AC-1][REQ-316/AC-1] Snapshot, Album, AlbumItem, SnapshotLora, and SnapshotTagSet relationships."""
    workflow = models.Workflow(name="test_wf_snap_rel", json_body="{}")
    lora = models.Lora(model_name="snap_lora.safetensors")
    tag_set = models.TagSet(name="snap_tag_set", tags="[]")
    album = models.Album(name="Favorite Renders")
    db_session.add_all([workflow, lora, tag_set, album])
    db_session.flush()

    snapshot = models.Snapshot(
        workflow_id=workflow.id,
        params="{}",
        image_path="/api/snapshots/images/snap_rel.webp",
        thumbnail_path="/api/snapshots/images/thumb_snap_rel.webp",
    )
    db_session.add(snapshot)
    db_session.flush()

    album_item = models.AlbumItem(
        album_id=album.id,
        snapshot_id=snapshot.id,
        sequence_order=0,
    )
    snap_lora = models.SnapshotLora(
        snapshot_id=snapshot.id,
        lora_id=lora.id,
        strength=0.75,
        role="positive",
    )
    snap_tag = models.SnapshotTagSet(
        snapshot_id=snapshot.id,
        tag_set_id=tag_set.id,
        role="positive",
    )
    db_session.add_all([album_item, snap_lora, snap_tag])
    db_session.flush()

    assert snapshot.workflow.name == "test_wf_snap_rel"
    assert len(album.items) == 1
    assert album.items[0].snapshot_id == snapshot.id
    assert len(snapshot.loras) == 1
    assert snapshot.loras[0].lora.model_name == "snap_lora.safetensors"
    assert len(snapshot.tag_sets) == 1
    assert snapshot.tag_sets[0].tag_set.name == "snap_tag_set"


def test_speech_preset_relations(db_session: Session):
    """[REQ-180/AC-1] SpeechBubblePreset and SpeechTonePreset model persistence and constraints."""
    bubble = models.SpeechBubblePreset(
        name="Action Speech",
        shape="shout",
        orientation="vertical",
        font_family="Comic Sans",
        font_size=18,
    )
    tone = models.SpeechTonePreset(
        name="Energetic Tone",
        prompt="energetic shout style",
    )
    db_session.add_all([bubble, tone])
    db_session.flush()

    assert bubble.id is not None
    assert bubble.shape == "shout"
    assert tone.id is not None
    assert tone.prompt == "energetic shout style"
