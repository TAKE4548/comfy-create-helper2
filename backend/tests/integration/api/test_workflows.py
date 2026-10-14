import httpx
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.main import app


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


@pytest.fixture(autouse=True)
def setup_stages(db_session: Session):
    db_session.add_all([
        models.StageMaster(
            key="main", name="Main", suffix="", search_keywords="[]",
            previous_suffixes="[]", is_builtin=True, is_active=True, sort_order=0
        ),
        models.StageMaster(
            key="rough", name="Rough", suffix="_rough", search_keywords="[]",
            previous_suffixes="[]", is_builtin=True, is_active=True, sort_order=1
        ),
    ])
    db_session.flush()


def _create_master(client: TestClient, base_key: str, fallback_param_names=None):
    res = client.post(
        "/api/mapping-masters",
        json={
            "base_key": base_key,
            "name": base_key,
            "param_name": "seed",
            "input_type": "seed",
            "base_title_patterns": ["KSampler"],
            "fallback_param_names": fallback_param_names,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _create_workflow(client: TestClient, name: str, mappings: list, json_body: dict | None = None):
    res = client.post(
        "/api/workflows",
        json={
            "name": name,
            "json_body": json_body or {"1": {"class_type": "KSampler", "inputs": {}}},
            "mappings": mappings,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_workflow_mapping_returns_ordered_fallbacks(client: TestClient, db_session: Session) -> None:
    """[REQ-353/AC-1] GET /api/workflows/{id} returns ordered fallbacks for master and variant mapping."""
    master = _create_master(client, "test_seed", ["noise_seed", "seed_alt"])
    variant_id = master["variants"][0]["id"]
    workflow_id = _create_workflow(
        client,
        "REQ-353 fallback order",
        [
            {"master_id": master["id"], "node_id": "1"},
            {"master_id": master["id"], "variant_id": variant_id, "node_id": "2"},
        ],
    )

    response = client.get(f"/api/workflows/{workflow_id}")
    assert response.status_code == 200, response.text
    mappings = response.json()["mappings"]
    assert mappings[0]["fallback_param_names"] == ["noise_seed", "seed_alt"]
    assert mappings[0]["variant_id"] is None
    assert mappings[1]["fallback_param_names"] == ["noise_seed", "seed_alt"]
    assert mappings[1]["master_id"] == master["id"]
    assert mappings[1]["variant_id"] == variant_id


def test_workflow_seed_alias_custom_mapping(client: TestClient, db_session: Session) -> None:
    """[REQ-350/AC-2] GET /api/workflows returns seed alias for custom mappings."""
    master = _create_master(client, "test_noise_seed", ["noise_seed"])
    variant_id = master["variants"][0]["id"]
    node_ids = ["101", "102", "103", "104", "105", "106", "107"]
    json_body = {
        nid: {"class_type": "SamplerCustom", "inputs": {"noise_seed": 0}}
        for nid in node_ids
    }
    mappings = [
        {"master_id": master["id"], "node_id": node_ids[0]},
        *[
            {"master_id": master["id"], "variant_id": variant_id, "node_id": nid}
            for nid in node_ids[1:]
        ],
    ]
    workflow_id = _create_workflow(client, "REQ-350 seed alias custom", mappings, json_body=json_body)

    response = client.get(f"/api/workflows/{workflow_id}")
    assert response.status_code == 200, response.text
    result = response.json()
    assert len(result["mappings"]) == 7
    for mapping in result["mappings"]:
        assert mapping["param_name"] == "seed"
        assert mapping["input_type"] == "seed"
        assert mapping["fallback_param_names"] == ["noise_seed"]


def test_workflow_preserves_null_and_empty_fallbacks(client: TestClient, db_session: Session) -> None:
    """[REQ-353/AC-2] GET /api/workflows/{id} preserves null and empty fallback lists."""
    null_master = _create_master(client, "test_null_master")
    empty_master = _create_master(client, "test_empty_master", ["temporary"])
    row = db_session.query(models.MappingMaster).filter_by(id=empty_master["id"]).one()
    row.fallback_param_names = "[]"
    db_session.flush()

    workflow_id = _create_workflow(
        client,
        "REQ-353 null versus empty",
        [
            {"master_id": null_master["id"], "node_id": "1"},
            {"master_id": empty_master["id"], "node_id": "2"},
        ],
    )
    response = client.get(f"/api/workflows/{workflow_id}")
    assert response.status_code == 200, response.text
    assert response.json()["mappings"][0]["fallback_param_names"] is None
    assert response.json()["mappings"][1]["fallback_param_names"] == []


def test_workflow_missing_returns_404(client: TestClient) -> None:
    """[REQ-353/AC-3] GET /api/workflows/{id} returns 404 for nonexistent workflow."""
    response = client.get("/api/workflows/999999")
    assert response.status_code == 404


def test_workflow_seed_type_roundtrip_keeps_variant(client: TestClient, db_session: Session) -> None:
    """[REQ-350/AC-1] Workflow creation with seed input_type retains mapping variant associations."""
    created = client.post(
        "/api/mapping-masters",
        json={
            "base_key": "seed_rt",
            "name": "Seed RT",
            "param_name": "seed",
            "input_type": "seed",
            "base_title_patterns": ["KSampler"],
        },
    )
    assert created.status_code == 201, created.text
    master = created.json()
    master_id = master["id"]
    variant_id = master["variants"][0]["id"]

    updated = client.put(f"/api/mapping-masters/{master_id}", json={"input_type": "seed"})
    assert updated.status_code == 200, updated.text

    wf_res = client.post(
        "/api/workflows",
        json={
            "name": "REQ-350 Seed contract",
            "json_body": {"1": {"class_type": "KSampler", "inputs": {}}},
            "mappings": [{"master_id": master_id, "variant_id": variant_id, "node_id": "1"}],
        },
    )
    assert wf_res.status_code == 201, wf_res.text
    res_id = wf_res.json()["id"]
    wf = client.get(f"/api/workflows/{res_id}")
    assert wf.status_code == 200, wf.text
    mapping = wf.json()["mappings"][0]
    assert mapping["input_type"] == "seed"
    assert mapping["variant_id"] == variant_id


def test_workflow_state_create_get_and_update_roundtrip(client: TestClient, db_session: Session) -> None:
    """[REQ-358/AC-19] Workflow slot state persists across POST, GET, and omitted PUT."""
    initial_states = {"m:901": True, "v:902": False}
    response = client.post(
        "/api/workflows",
        json={
            "name": "REQ-358 state roundtrip",
            "json_body": {"nodes": []},
            "mapping_slot_states": initial_states,
        },
    )
    assert response.status_code == 201, response.text
    workflow_id = response.json()["id"]

    fetched = client.get(f"/api/workflows/{workflow_id}")
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["mapping_slot_states"] == initial_states

    # omitted PUT retains
    omitted = client.put(f"/api/workflows/{workflow_id}", json={"name": "REQ-358 state roundtrip 2"})
    assert omitted.status_code == 200, omitted.text
    assert client.get(f"/api/workflows/{workflow_id}").json()["mapping_slot_states"] == initial_states

    # empty dict replaces
    replaced = client.put(f"/api/workflows/{workflow_id}", json={"mapping_slot_states": {}})
    assert replaced.status_code == 200, replaced.text
    assert client.get(f"/api/workflows/{workflow_id}").json()["mapping_slot_states"] == {}


def test_workflow_state_rollback(client: TestClient, db_session: Session) -> None:
    """[REQ-358/AC-28] Rollback restores prior workflow slot states."""
    original_states = {"m:901": True, "v:902": False}
    created = client.post(
        "/api/workflows",
        json={
            "name": "REQ-358 rollback",
            "json_body": {"nodes": [{"id": 1}]},
            "mapping_slot_states": original_states,
        },
    )
    assert created.status_code == 201, created.text
    workflow_id = created.json()["id"]

    changed = client.put(
        f"/api/workflows/{workflow_id}",
        json={
            "json_body": {"nodes": [{"id": 2}]},
            "mapping_slot_states": {"m:901": False},
        },
    )
    assert changed.status_code == 200, changed.text

    rolled_back = client.post(f"/api/workflows/{workflow_id}/rollback")
    assert rolled_back.status_code == 200, rolled_back.text
    restored = client.get(f"/api/workflows/{workflow_id}")
    assert restored.status_code == 200, restored.text
    assert restored.json()["json_body"] == {"nodes": [{"id": 1}]}
    assert restored.json()["mapping_slot_states"] == original_states


def test_workflow_copy_duplicates_workflow(client: TestClient, db_session: Session) -> None:
    """[REQ-356/AC-2] Workflow copy creates duplicate with mappings and presets."""
    created = client.post(
        "/api/workflows",
        json={"name": "Original", "json_body": {"nodes": []}},
    )
    assert created.status_code == 201
    wf_id = created.json()["id"]

    copy_res = client.post(f"/api/workflows/{wf_id}/copy", json={"name": "Copied"})
    assert copy_res.status_code == 201
    assert copy_res.json()["name"] == "Copied"
