import json
import logging
import time
import httpx
import pytest
import sqlalchemy
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.main import app
from app.schemas import CascadeRenameRequest
from app.services.mapping_service import MappingService

SEED_MODES_KEY = "__seed_modes_v1"
SLOT_KEY = "master:10:variant:20"


@pytest.fixture
def client(db_session: Session, mock_external_services):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    mock_external_services.get("http://localhost:8188/queue").mock(
        return_value=httpx.Response(200, json={"queue_running": [], "queue_pending": []})
    )
    mock_external_services.get("http://127.0.0.1:8188/queue").mock(
        return_value=httpx.Response(200, json={"queue_running": [], "queue_pending": []})
    )
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def test_workflow(db_session: Session):
    wf = models.Workflow(name="test_wf_presets", json_body="{}")
    db_session.add(wf)
    db_session.flush()
    return wf

def _create_variant_helper(
    db: Session,
    role: str,
    master_name: str = "Test Master",
    display_name: str = "Test Display Name",
) -> models.MappingVariant:
    rule_set = db.query(models.BindingRuleSet).first()
    if not rule_set:
        rule_set = models.BindingRuleSet(name="Default Rule Set")
        db.add(rule_set)
        db.flush()
    stage = db.query(models.StageMaster).first()
    if not stage:
        stage = models.StageMaster(key="default_stage", name="Default Stage", suffix="")
        db.add(stage)
        db.flush()
    master = models.MappingMaster(
        base_key=role,
        name=master_name,
        display_name=display_name,
        param_name="param",
        input_type="str",
    )
    db.add(master)
    db.flush()
    variant = models.MappingVariant(
        master_id=master.id,
        stage_id=stage.id,
        role=role,
        binding_rule_set_id=rule_set.id,
    )
    db.add(variant)
    db.flush()
    return variant


def test_create_and_get_preset(client: TestClient, db_session: Session, test_workflow: models.Workflow) -> None:
    """[REQ-356/AC-2] POST /api/workflow-presets creates preset and GET /api/workflow-presets retrieves it."""
    _create_variant_helper(db_session, "positive_prompt")
    payload = {
        "workflow_id": test_workflow.id,
        "name": "Preset A",
        "param_values": {"positive_prompt": "cute cat"},
        "applied_assets": {"loras": [1, 2]},
        "batch_size": 1,
        "seed_mode": "random",
        "seed": -1,
    }
    response = client.post("/api/workflow-presets", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["name"] == "Preset A"
    assert data["param_values"] == {"positive_prompt": "cute cat"}

    list_res = client.get(f"/api/workflow-presets?workflow_id={test_workflow.id}")
    assert list_res.status_code == 200, list_res.text
    presets = list_res.json()
    assert len(presets) == 1
    assert presets[0]["name"] == "Preset A"


def test_preset_put_get_roundtrip_preserves_seed_mode_json_and_role_value(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-350/AC-3] PUT and GET on presets preserves seed mode JSON and role value."""
    _create_variant_helper(db_session, "MainSeed_rough")
    created = client.post(
        "/api/workflow-presets",
        json={
            "workflow_id": test_workflow.id,
            "name": "seed contract",
            "param_values": {"MainSeed_rough": "1"},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": 42,
        },
    )
    assert created.status_code == 201
    preset_id = created.json()["id"]

    values = {
        "MainSeed_rough": "0",
        SEED_MODES_KEY: json.dumps({"version": 1, "modes": {SLOT_KEY: "random"}}),
    }
    updated = client.put(f"/api/workflow-presets/{preset_id}", json={"param_values": values})
    assert updated.status_code == 200, updated.text
    assert updated.json()["param_values"] == values

    fetched = client.get(f"/api/workflow-presets?workflow_id={test_workflow.id}").json()
    assert fetched[0]["param_values"] == values


def test_preset_applied_assets_roundtrip(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-334/AC-1] Preset applied assets persist across PUT and GET."""
    created = client.post(
        "/api/workflow-presets",
        json={
            "workflow_id": test_workflow.id,
            "name": "assets preset",
            "param_values": {},
            "applied_assets": {"loras": [1, 2]},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": -1,
        },
    )
    assert created.status_code == 201
    preset_id = created.json()["id"]

    new_assets = {"loras": [3, 4], "tags": ["art"]}
    updated = client.put(f"/api/workflow-presets/{preset_id}", json={"applied_assets": new_assets})
    assert updated.status_code == 200
    assert updated.json()["applied_assets"] == new_assets

    fetched = client.get(f"/api/workflow-presets?workflow_id={test_workflow.id}").json()
    assert fetched[0]["applied_assets"] == new_assets


def test_preset_reorder_endpoint(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-356/AC-2] PUT /api/workflow-presets/reorder updates preset sort order."""
    p1 = client.post(
        "/api/workflow-presets",
        json={"workflow_id": test_workflow.id, "name": "First", "param_values": {}, "applied_assets": {}, "batch_size": 1, "seed_mode": "random", "seed": -1},
    ).json()
    p2 = client.post(
        "/api/workflow-presets",
        json={"workflow_id": test_workflow.id, "name": "Second", "param_values": {}, "applied_assets": {}, "batch_size": 1, "seed_mode": "random", "seed": -1},
    ).json()

    reorder_res = client.put(
        "/api/workflow-presets/reorder",
        json={"ordered_ids": [p2["id"], p1["id"]]},
    )
    assert reorder_res.status_code == 204

    fetched = client.get(f"/api/workflow-presets?workflow_id={test_workflow.id}").json()
    assert [p["id"] for p in fetched] == [p2["id"], p1["id"]]


def test_preset_delete_and_bulk_delete(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-356/AC-2] DELETE endpoints remove individual and multiple presets."""
    p1 = client.post(
        "/api/workflow-presets",
        json={"workflow_id": test_workflow.id, "name": "P1", "param_values": {}, "applied_assets": {}, "batch_size": 1, "seed_mode": "random", "seed": -1},
    ).json()
    p2 = client.post(
        "/api/workflow-presets",
        json={"workflow_id": test_workflow.id, "name": "P2", "param_values": {}, "applied_assets": {}, "batch_size": 1, "seed_mode": "random", "seed": -1},
    ).json()

    del_res = client.delete(f"/api/workflow-presets/{p1['id']}")
    assert del_res.status_code == 204

    bulk_res = client.request("DELETE", "/api/workflow-presets/bulk", json={"ids": [p2["id"]]})
    assert bulk_res.status_code == 204

    fetched = client.get(f"/api/workflow-presets?workflow_id={test_workflow.id}").json()
    assert len(fetched) == 0


def test_preset_suffix_cascade_renames_role_value_and_keeps_slot_mode_key(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-350/AC-4] Suffix cascade renames role value while keeping slot mode key."""
    stage = models.StageMaster(key="rough", name="Rough", suffix="_rough")
    group = models.MappingGroupMaster(key="seed", name="Seed")
    rule_set = models.BindingRuleSet(name="Test Preset Seed Rule Set")
    db_session.add_all([stage, group, rule_set])
    db_session.flush()

    master = models.MappingMaster(
        group_id=group.id,
        base_key="MainSeed",
        name="Main Seed",
        param_name="seed",
        input_type="int",
    )
    db_session.add(master)
    db_session.flush()

    variant = models.MappingVariant(
        master_id=master.id,
        stage_id=stage.id,
        role="MainSeed_rough",
        binding_rule_set_id=rule_set.id,
    )
    preset = models.WorkflowPreset(
        workflow_id=test_workflow.id,
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
    db_session.add_all([variant, preset])
    db_session.flush()

    stage_id = stage.id
    preset_id = preset.id

    MappingService.execute_cascade_rename(
        db_session,
        stage_id,
        CascadeRenameRequest(new_suffix="_draft", update_presets=True, update_snapshots=False),
    )

    fetched = client.get(f"/api/workflow-presets?workflow_id={test_workflow.id}").json()
    target_preset = next(p for p in fetched if p["id"] == preset_id)
    stored = target_preset["param_values"]
    assert stored["MainSeed_draft"] == "1234"
    assert "MainSeed_rough" not in stored
    assert stored[SEED_MODES_KEY] == json.dumps({"version": 1, "modes": {SLOT_KEY: "fixed"}})


def test_variant_ref_ac4_list_reflects_renamed_variant_role(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-418/AC-4] GET preset list reflects updated variant role."""
    variant = _create_variant_helper(db_session, "RoleA_orig")
    created = client.post(
        "/api/workflow-presets",
        json={
            "workflow_id": test_workflow.id,
            "name": "Rename Role Test",
            "param_values": {"RoleA_orig": "test_val_1"},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": 1,
        },
    )
    assert created.status_code == 201, created.text
    preset_id = created.json()["id"]

    # Update variant.role directly in DB
    variant.role = "RoleA_renamed"
    db_session.commit()

    list_res = client.get(f"/api/workflow-presets?workflow_id={test_workflow.id}")
    assert list_res.status_code == 200, list_res.text
    presets = list_res.json()
    target = next(p for p in presets if p["id"] == preset_id)
    assert target["param_values"].get("RoleA_renamed") == "test_val_1"
    assert "RoleA_orig" not in target["param_values"]


def test_variant_ref_ac4_list_includes_latest_variant_refs(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-418/AC-4] GET preset list includes latest variant refs and variant_param_values."""
    variant = _create_variant_helper(
        db_session,
        "v_role_start",
        master_name="Master Start",
        display_name="Master Display 1",
    )
    created = client.post(
        "/api/workflow-presets",
        json={
            "workflow_id": test_workflow.id,
            "name": "Variant Ref Test",
            "param_values": {"v_role_start": "hello_var"},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": 1,
        },
    )
    assert created.status_code == 201, created.text
    preset_id = created.json()["id"]
    preset_data = created.json()
    assert "variants" in preset_data
    assert len(preset_data["variants"]) == 1
    assert preset_data["variants"][0]["id"] == variant.id
    assert preset_data["variants"][0]["role"] == "v_role_start"
    assert preset_data["variants"][0]["display_name"] == "Master Display 1"
    assert preset_data["variant_param_values"] == {f"v:{variant.id}": "hello_var"}

    # Update role and master display_name
    variant.role = "v_role_updated"
    master = db_session.query(models.MappingMaster).filter(models.MappingMaster.id == variant.master_id).first()
    assert master is not None
    master.display_name = "Master Display Renamed"
    db_session.commit()

    list_res = client.get(f"/api/workflow-presets?workflow_id={test_workflow.id}")
    assert list_res.status_code == 200
    target = next(p for p in list_res.json() if p["id"] == preset_id)
    assert target["variants"] == [
        {"id": variant.id, "role": "v_role_updated", "display_name": "Master Display Renamed"}
    ]
    assert target["variant_param_values"] == {f"v:{variant.id}": "hello_var"}
    assert target["param_values"] == {"v_role_updated": "hello_var"}


def test_variant_ref_ac4_post_put_role_and_v_keys_roundtrip(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-418/AC-4] Role key and v: key roundtrip with derived and reserved keys."""
    variant = _create_variant_helper(db_session, "ModelKey")
    post_payload = {
        "workflow_id": test_workflow.id,
        "name": "Roundtrip Test",
        "param_values": {
            "ModelKey": "checkpoint_a",
            "ModelKey_lora_count": "2",
            "__seed_modes_v1": "reserved_val",
        },
        "applied_assets": {},
        "batch_size": 1,
        "seed_mode": "random",
        "seed": 10,
    }
    created = client.post("/api/workflow-presets", json=post_payload)
    assert created.status_code == 201, created.text
    preset_id = created.json()["id"]

    data = created.json()
    assert data["param_values"] == {
        "ModelKey": "checkpoint_a",
        "ModelKey_lora_count": "2",
        "__seed_modes_v1": "reserved_val",
    }
    assert data["variant_param_values"] == {
        f"v:{variant.id}": "checkpoint_a",
        f"v:{variant.id}:lora_count": "2",
    }

    # PUT using v: keys and updated reserved key
    put_payload = {
        "param_values": {
            f"v:{variant.id}": "checkpoint_b",
            f"v:{variant.id}:lora_count": "5",
            "__seed_modes_v1": "reserved_val_updated",
        }
    }
    updated = client.put(f"/api/workflow-presets/{preset_id}", json=put_payload)
    assert updated.status_code == 200, updated.text
    up_data = updated.json()
    assert up_data["param_values"] == {
        "ModelKey": "checkpoint_b",
        "ModelKey_lora_count": "5",
        "__seed_modes_v1": "reserved_val_updated",
    }
    assert up_data["variant_param_values"] == {
        f"v:{variant.id}": "checkpoint_b",
        f"v:{variant.id}:lora_count": "5",
    }


def test_variant_ref_ac4_write_drops_unresolved_key_with_warning(
    client: TestClient, db_session: Session, test_workflow: models.Workflow, caplog: pytest.LogCaptureFixture
) -> None:
    """[REQ-418/AC-4] Unresolved parameter keys are dropped with warning log."""
    variant = _create_variant_helper(db_session, "ValidRole")
    with caplog.at_level(logging.WARNING):
        created = client.post(
            "/api/workflow-presets",
            json={
                "workflow_id": test_workflow.id,
                "name": "Warning Test",
                "param_values": {
                    "ValidRole": "valid_val",
                    "GhostRole_unknown": "drop_me",
                },
                "applied_assets": {},
                "batch_size": 1,
                "seed_mode": "random",
                "seed": 1,
            },
        )
    assert created.status_code == 201, created.text
    assert created.json()["param_values"] == {"ValidRole": "valid_val"}
    assert any("GhostRole_unknown" in record.message for record in caplog.records)


def test_variant_ref_ac4_put_bumps_updated_at_and_keeps_conflict_detection(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-418/AC-4] Value-only PUT bumps updated_at and detects concurrency conflict."""
    variant = _create_variant_helper(db_session, "ConflictRole")
    created = client.post(
        "/api/workflow-presets",
        json={
            "workflow_id": test_workflow.id,
            "name": "Conflict Test",
            "param_values": {"ConflictRole": "val1"},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": 1,
        },
    )
    assert created.status_code == 201
    preset_id = created.json()["id"]
    t1_str = created.json()["updated_at"]

    time.sleep(0.05)

    updated = client.put(
        f"/api/workflow-presets/{preset_id}",
        json={"param_values": {"ConflictRole": "val2"}},
    )
    assert updated.status_code == 200
    t2_str = updated.json()["updated_at"]
    assert t2_str > t1_str

    # PUT with stale base_updated_at yields 409
    stale_put = client.put(
        f"/api/workflow-presets/{preset_id}",
        json={"param_values": {"ConflictRole": "val3"}, "base_updated_at": t1_str},
    )
    assert stale_put.status_code == 409


def test_variant_ref_ac4_read_skips_orphan_value_row(
    client: TestClient, db_session: Session, test_workflow: models.Workflow, caplog: pytest.LogCaptureFixture
) -> None:
    """[REQ-418/AC-4] GET endpoint skips orphan preset value row and returns 200."""
    variant = _create_variant_helper(db_session, "OrphanCandidate")
    created = client.post(
        "/api/workflow-presets",
        json={
            "workflow_id": test_workflow.id,
            "name": "Orphan Test",
            "param_values": {"OrphanCandidate": "orphan_val"},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": 1,
        },
    )
    assert created.status_code == 201
    preset_id = created.json()["id"]

    # Delete variant directly bypassing foreign keys to create orphan row
    vid = variant.id
    db_session.execute(sqlalchemy.text("PRAGMA foreign_keys = OFF"))
    db_session.execute(sqlalchemy.text(f"DELETE FROM mapping_variants WHERE id = {vid}"))
    db_session.execute(sqlalchemy.text("PRAGMA foreign_keys = ON"))
    db_session.commit()

    with caplog.at_level(logging.WARNING):
        res = client.get(f"/api/workflow-presets?workflow_id={test_workflow.id}")
    assert res.status_code == 200
    target = next(p for p in res.json() if p["id"] == preset_id)
    assert "OrphanCandidate" not in target["param_values"]
    assert not any(v["id"] == vid for v in target["variants"])


def test_variant_ref_ac4_workflow_copy_duplicates_values_and_sync_groups(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-418/AC-4] copy_workflow duplicates WorkflowPresetValue and sync groups."""
    v1 = _create_variant_helper(db_session, "CopyRole1")
    v2 = _create_variant_helper(db_session, "CopyRole2")

    # Create preset via API
    preset_res = client.post(
        "/api/workflow-presets",
        json={
            "workflow_id": test_workflow.id,
            "name": "Preset To Copy",
            "param_values": {"CopyRole1": "c1", "CopyRole2": "c2"},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": 1,
        },
    )
    assert preset_res.status_code == 201

    # Create a ParamSyncGroup with master_variant_id and member
    sg = models.ParamSyncGroup(
        workflow_id=test_workflow.id,
        name="Sync 1",
        master_role="CopyRole1",
        slave_roles=json.dumps(["CopyRole2"]),
        master_variant_id=v1.id,
        is_enabled=True,
    )
    db_session.add(sg)
    db_session.flush()
    sg.members.append(models.ParamSyncGroupMember(variant_id=v2.id))
    db_session.commit()

    copy_res = client.post(f"/api/workflows/{test_workflow.id}/copy", json={"name": "Copied WF"})
    assert copy_res.status_code == 201, copy_res.text
    new_wf_id = copy_res.json()["id"]

    new_wf = db_session.query(models.Workflow).filter(models.Workflow.id == new_wf_id).first()
    assert new_wf is not None
    assert len(new_wf.presets) == 1
    copied_preset = new_wf.presets[0]
    assert len(copied_preset.values) == 2
    copied_values = {(val.variant_id, val.sub_key): val.value for val in copied_preset.values}
    assert copied_values[(v1.id, "")] == "c1"
    assert copied_values[(v2.id, "")] == "c2"

    assert len(new_wf.param_sync_groups) == 1
    copied_sg = new_wf.param_sync_groups[0]
    assert copied_sg.master_variant_id == v1.id
    assert copied_sg.master_role == "CopyRole1"
    assert copied_sg.is_enabled is True
    assert len(copied_sg.members) == 1
    assert copied_sg.members[0].variant_id == v2.id


def test_preset_create_and_get_populates_variant_values_and_variants_list(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-418/AC-4] Preset create populates WorkflowPresetValue records and variants list."""
    v = _create_variant_helper(db_session, "PromptA", display_name="Prompt Display")
    res = client.post(
        "/api/workflow-presets",
        json={
            "workflow_id": test_workflow.id,
            "name": "Populate Test",
            "param_values": {"PromptA": "val_prompt"},
            "applied_assets": {},
            "batch_size": 1,
            "seed_mode": "random",
            "seed": 1,
        },
    )
    assert res.status_code == 201
    preset_id = res.json()["id"]

    # Check WorkflowPresetValue in DB
    pv_rows = db_session.query(models.WorkflowPresetValue).filter(
        models.WorkflowPresetValue.preset_id == preset_id
    ).all()
    assert len(pv_rows) == 1
    assert pv_rows[0].variant_id == v.id
    assert pv_rows[0].value == "val_prompt"

    # Check variants list in response
    data = res.json()
    assert len(data["variants"]) == 1
    assert data["variants"][0]["id"] == v.id
    assert data["variants"][0]["role"] == "PromptA"
    assert data["variants"][0]["display_name"] == "Prompt Display"


def test_preset_get_reflects_updated_variant_role_and_master_display_name(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-418/AC-4] Preset GET reflects updated variant role and master display_name."""
    test_variant_ref_ac4_list_includes_latest_variant_refs(client, db_session, test_workflow)


def test_copy_workflow_duplicates_preset_values(
    client: TestClient, db_session: Session, test_workflow: models.Workflow
) -> None:
    """[REQ-418/AC-4] copy_workflow duplicates preset values."""
    test_variant_ref_ac4_workflow_copy_duplicates_values_and_sync_groups(client, db_session, test_workflow)

