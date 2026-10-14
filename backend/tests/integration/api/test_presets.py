import json
import httpx
import pytest
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


def test_create_and_get_preset(client: TestClient, db_session: Session, test_workflow: models.Workflow) -> None:
    """[REQ-356/AC-2] POST /api/workflow-presets creates preset and GET /api/workflow-presets retrieves it."""
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
    db_session.add_all([stage, group])
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

    variant = models.MappingVariant(master_id=master.id, stage_id=stage.id)
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
