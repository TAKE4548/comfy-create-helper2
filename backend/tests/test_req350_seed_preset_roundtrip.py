import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base
from app.schemas import CascadeRenameRequest, WorkflowPresetCreate, WorkflowPresetUpdate
from app.routers.presets import create_preset, list_presets, update_preset
from app.services.mapping_service import MappingService


SEED_MODES_KEY = "__seed_modes_v1"
SLOT_KEY = "master:10:variant:20"


@pytest.fixture
def api_and_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    try:
        yield session_factory
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def test_preset_put_get_roundtrip_preserves_seed_mode_json_and_role_value(api_and_db):
    session_factory = api_and_db
    with session_factory() as db:
        workflow = models.Workflow(name="seed-roundtrip", json_body="{}")
        db.add(workflow)
        db.commit()
        workflow_id = workflow.id
        created = create_preset(WorkflowPresetCreate(
            workflow_id=workflow_id,
            name="seed contract",
            param_values={"MainSeed_rough": "1"},
            applied_assets={},
            batch_size=1,
            seed_mode="random",
            seed=42,
        ), db)

        values = {
            "MainSeed_rough": "0",
            SEED_MODES_KEY: json.dumps({"version": 1, "modes": {SLOT_KEY: "random"}}),
        }
        updated = update_preset(created.id, WorkflowPresetUpdate(param_values=values), db)
        assert updated.param_values == values
        fetched = list_presets(workflow_id, db)
        assert fetched[0].param_values == values


def test_suffix_cascade_renames_role_value_and_keeps_slot_mode_key(api_and_db):
    session_factory = api_and_db
    with session_factory() as db:
        workflow = models.Workflow(name="seed-cascade", json_body="{}")
        stage = models.StageMaster(key="rough", name="Rough", suffix="_rough")
        group = models.MappingGroupMaster(key="seed", name="Seed")
        db.add_all([workflow, stage, group])
        db.flush()
        master = models.MappingMaster(
            group_id=group.id,
            base_key="MainSeed",
            name="Main Seed",
            param_name="seed",
            input_type="int",
        )
        db.add(master)
        db.flush()
        variant = models.MappingVariant(master_id=master.id, stage_id=stage.id)
        preset = models.WorkflowPreset(
            workflow_id=workflow.id,
            name="seed cascade",
            param_values=json.dumps({
                "MainSeed_rough": "1234",
                SEED_MODES_KEY: json.dumps({"version": 1, "modes": {SLOT_KEY: "fixed"}}),
            }),
            applied_assets="{}",
            batch_size=1,
            seed_mode="random",
            seed=42,
        )
        db.add_all([variant, preset])
        db.commit()
        stage_id = stage.id
        preset_id = preset.id

        MappingService.execute_cascade_rename(
            db,
            stage_id,
            CascadeRenameRequest(new_suffix="_draft", update_presets=True, update_snapshots=False),
        )

        db.refresh(preset)
        stored = json.loads(preset.param_values)
        assert stored["MainSeed_draft"] == "1234"
        assert "MainSeed_rough" not in stored
        assert stored[SEED_MODES_KEY] == json.dumps({"version": 1, "modes": {SLOT_KEY: "fixed"}})
        assert preset.id == preset_id
