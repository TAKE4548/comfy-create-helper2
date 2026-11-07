import json
import re
import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.main import app

FACTS = "__prompt_surgeon_metadata_v1"
ASSOCIATIONS = "__metadata_associations_v1"


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
def snapshot_fixtures(db_session: Session):
    workflow = models.Workflow(name="test_wf", json_body="{}")
    loras = [models.Lora(model_name=f"lora-{i}.safetensors") for i in range(1, 4)]
    tags = [models.TagSet(name=f"tags-{i}", tags="[]") for i in range(1, 4)]
    db_session.add_all([workflow, *loras, *tags])
    db_session.flush()

    triggers = [models.LoraTriggerWordSet(lora_id=loras[i].id, name=f"trigger-{i}", words="[]") for i in range(3)]
    db_session.add_all(triggers)
    db_session.flush()

    return {
        "workflow": workflow,
        "loras": loras,
        "tags": tags,
        "triggers": triggers,
    }


def test_create_and_get_snapshot(client: TestClient, db_session: Session, snapshot_fixtures: dict) -> None:
    """[REQ-267/AC-2] POST /api/snapshots creates a snapshot and GET /api/snapshots/{id} retrieves it."""
    wf = snapshot_fixtures["workflow"]
    lora = snapshot_fixtures["loras"][0]
    tag_set = snapshot_fixtures["tags"][0]

    payload = {
        "workflow_id": wf.id,
        "image_path": "test.png",
        "params": {"prompt": "1girl"},
        "loras": [{"lora_id": lora.id, "strength": 0.8}],
        "tag_sets": [{"tag_set_id": tag_set.id}],
    }
    response = client.post("/api/snapshots", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    snapshot_id = data["id"]

    get_res = client.get(f"/api/snapshots/{snapshot_id}")
    assert get_res.status_code == 200, get_res.text
    get_data = get_res.json()
    assert len(get_data["loras"]) == 1
    assert get_data["loras"][0]["lora_id"] == lora.id
    assert get_data["loras"][0]["strength"] == 0.8
    assert len(get_data["tag_sets"]) == 1
    assert get_data["tag_sets"][0]["tag_set_id"] == tag_set.id


def test_snapshot_association_types_update(client: TestClient, db_session: Session, snapshot_fixtures: dict) -> None:
    """[REQ-316/AC-2] PATCH /api/snapshots/{id} updates associations without changing generation facts."""
    wf = snapshot_fixtures["workflow"]
    loras = snapshot_fixtures["loras"]
    tags = snapshot_fixtures["tags"]
    triggers = snapshot_fixtures["triggers"]

    facts = json.dumps({"version": 1, "workflow_name": "Recorded"})
    params = {FACTS: facts, ASSOCIATIONS: json.dumps({"version": 1, "lora_trigger_sets": []}), "ordinary": {"x": 1}}
    created = client.post("/api/snapshots", json={
        "workflow_id": wf.id, "image_path": "test.png", "thumbnail_path": "thumb.png", "params": params,
        "loras": [{"lora_id": loras[0].id, "strength": 0, "role": "positive"}, {"lora_id": loras[1].id, "strength": 0.65, "role": "negative"}],
        "tag_sets": [{"tag_set_id": tags[0].id, "role": "positive"}],
    })
    assert created.status_code == 201
    snap = created.json()

    tag_sets = [{"tag_set_id": tags[0].id, "role": "positive"}, {"tag_set_id": tags[1].id, "role": "negative"}]
    trigger_sets = [{"lora_id": loras[0].id, "trigger_set_id": triggers[0].id, "role": "positive"},
                    {"lora_id": loras[1].id, "trigger_set_id": triggers[1].id, "role": "negative"}]
    patch_res = client.patch(f"/api/snapshots/{snap['id']}", json={"tag_sets": tag_sets, "lora_trigger_sets": trigger_sets})
    assert patch_res.status_code == 200

    saved = client.get(f"/api/snapshots/{snap['id']}").json()
    assert {(item["tag_set_id"], item["role"]) for item in saved["tag_sets"]} == {(x["tag_set_id"], x["role"]) for x in tag_sets}
    assert json.loads(saved["params"][ASSOCIATIONS]) == {"version": 1, "lora_trigger_sets": trigger_sets}
    assert saved["params"][FACTS] == facts


def test_snapshot_association_empty_clears_independently(client: TestClient, db_session: Session, snapshot_fixtures: dict) -> None:
    """[REQ-316/AC-3] Empty list clears only requested association type independently."""
    wf = snapshot_fixtures["workflow"]
    loras = snapshot_fixtures["loras"]
    tags = snapshot_fixtures["tags"]
    triggers = snapshot_fixtures["triggers"]

    params = {FACTS: "{}", ASSOCIATIONS: json.dumps({"version": 1, "lora_trigger_sets": []})}
    created = client.post("/api/snapshots", json={
        "workflow_id": wf.id, "image_path": "test.png", "params": params,
        "tag_sets": [{"tag_set_id": tags[0].id, "role": "positive"}],
    })
    snap_id = created.json()["id"]

    trigger = {"lora_id": loras[0].id, "trigger_set_id": triggers[0].id, "role": "positive"}
    client.patch(f"/api/snapshots/{snap_id}", json={"lora_trigger_sets": [trigger]})
    client.patch(f"/api/snapshots/{snap_id}", json={"tag_sets": [{"tag_set_id": tags[1].id, "role": "negative"}]})

    # Clear only lora_trigger_sets
    client.patch(f"/api/snapshots/{snap_id}", json={"lora_trigger_sets": []})
    saved = client.get(f"/api/snapshots/{snap_id}").json()
    assert {(x["tag_set_id"], x["role"]) for x in saved["tag_sets"]} == {(tags[1].id, "negative")}
    assert json.loads(saved["params"][ASSOCIATIONS])["lora_trigger_sets"] == []

    # Clear tag_sets
    client.patch(f"/api/snapshots/{snap_id}", json={"tag_sets": []})
    assert client.get(f"/api/snapshots/{snap_id}").json()["tag_sets"] == []


def test_snapshot_association_only_role_isolation(client: TestClient, db_session: Session, snapshot_fixtures: dict) -> None:
    """[REQ-316/AC-4] Association-only role does not alter snapshot lora role or strength."""
    wf = snapshot_fixtures["workflow"]
    loras = snapshot_fixtures["loras"]
    triggers = snapshot_fixtures["triggers"]

    created = client.post("/api/snapshots", json={
        "workflow_id": wf.id, "image_path": "test.png", "params": {},
        "loras": [{"lora_id": loras[0].id, "strength": 0.75, "role": "positive"}],
    })
    snap_id = created.json()["id"]

    association = {"lora_id": loras[0].id, "trigger_set_id": triggers[0].id, "role": "association-only"}
    res = client.patch(f"/api/snapshots/{snap_id}", json={"lora_trigger_sets": [association]})
    assert res.status_code == 200

    saved = client.get(f"/api/snapshots/{snap_id}").json()
    assert saved["loras"][0]["strength"] == 0.75
    assert saved["loras"][0]["role"] == "positive"


def _seed_variant(
    db: Session,
    role: str,
    master_display_name: str | None = None,
) -> models.MappingVariant:
    rule_set = db.query(models.BindingRuleSet).first()
    if not rule_set:
        rule_set = models.BindingRuleSet(name="Default")
        db.add(rule_set)
        db.flush()
    stage = db.query(models.StageMaster).first()
    if not stage:
        stage = models.StageMaster(key="main", name="Main", suffix="", is_builtin=True, is_active=True)
        db.add(stage)
        db.flush()
    master = models.MappingMaster(
        base_key=f"m_{role}",
        name=role,
        param_name=role,
        input_type="textarea",
        display_name=master_display_name or role,
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


def test_snapshot_record_remains_independent_after_prompt_metadata_deletion(client: TestClient, db_session: Session, snapshot_fixtures: dict) -> None:
    """[REQ-316/AC-1] Snapshot recorded metadata remains independent after prompt metadata deletion."""
    wf = snapshot_fixtures["workflow"]
    _seed_variant(db_session, "Quality")
    _seed_variant(db_session, "seed")
    text = "???(??:1.2)\n" * 10 + "??-REQ316"
    record = {
        "version": 1,
        "workflow_id": wf.id,
        "workflow_name": "?????",
        "completeness": "complete",
        "queued_at": "2026-10-03T17:00:00Z",
    }
    raw = json.dumps(record, ensure_ascii=False)
    params = {
        "Quality": text,
        "seed": 123456,
        FACTS: raw,
        ASSOCIATIONS: json.dumps({"version": 1, "lora_trigger_sets": []}),
    }
    response = client.post("/api/prompt-metadata", json={
        "prompt_id": "test_prompt_pbi316",
        "workflow_id": wf.id,
        "param_values": params,
        "applied_assets": {},
    })
    assert response.status_code == 200

    source = client.get("/api/prompt-metadata/test_prompt_pbi316").json()["param_values"]
    created = client.post("/api/snapshots", json={"workflow_id": wf.id, "params": source})
    assert created.status_code == 201
    snapshot_id = created.json()["id"]

    # Delete prompt metadata
    db_session.query(models.PromptMetadata).filter_by(prompt_id="test_prompt_pbi316").delete()
    db_session.flush()

    assert client.get("/api/prompt-metadata/test_prompt_pbi316").status_code == 404
    saved = client.get(f"/api/snapshots/{snapshot_id}").json()
    assert saved["params"] == params
    assert saved["params"][FACTS] == raw


def test_snapshot_delete(client: TestClient, db_session: Session, snapshot_fixtures: dict) -> None:
    """[REQ-267/AC-3] DELETE /api/snapshots/{id} removes the snapshot and returns 204."""
    wf = snapshot_fixtures["workflow"]
    created = client.post("/api/snapshots", json={"workflow_id": wf.id, "params": {}})
    assert created.status_code == 201
    snap_id = created.json()["id"]

    del_res = client.delete(f"/api/snapshots/{snap_id}")
    assert del_res.status_code == 204

    assert client.get(f"/api/snapshots/{snap_id}").status_code == 404


# --- AC-2: VariantRef and Role Resolution Tests (REQ-418) ---

def test_variant_ref_ac2_get_missing_variant_key_warns_and_leaves_field_unset(
    client: TestClient, db_session: Session, snapshot_fixtures: dict, caplog: pytest.LogCaptureFixture
) -> None:
    """[REQ-418/AC-2] GET /api/snapshots/{id} resolves mapped keys, warns for unmapped keys, and omits them."""
    wf = snapshot_fixtures["workflow"]
    v = _seed_variant(db_session, "Prompt_pos", "Positive Prompt")

    # Raw snapshot in DB with legacy role, unknown role, and deleted variant v:999
    stored_params = {
        "Prompt_pos": "cat",
        "ghost_role": "dog",
        "v:999": "deleted_variant_value",
    }
    s = models.Snapshot(
        workflow_id=wf.id,
        params=json.dumps(stored_params),
    )
    db_session.add(s)
    db_session.flush()

    with caplog.at_level("WARNING"):
        res = client.get(f"/api/snapshots/{s.id}")
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["params"] == {"Prompt_pos": "cat"}
    assert f"v:{v.id}" in data["variant_params"]
    assert data["variant_params"][f"v:{v.id}"] == "cat"
    assert "ghost_role" not in data["params"]
    assert "v:999" not in data["params"]
    assert str(s.id) in caplog.text
    assert "ghost_role" in caplog.text
    assert "v:999" in caplog.text


def test_variant_ref_ac2_stored_variant_snapshot_follows_role_rename(
    client: TestClient, db_session: Session, snapshot_fixtures: dict
) -> None:
    """[REQ-418/AC-2] Stored variant snapshot returns updated role and display_name after rename."""
    wf = snapshot_fixtures["workflow"]
    v = _seed_variant(db_session, "old_prompt_role", "Old Master Display")

    s = models.Snapshot(
        workflow_id=wf.id,
        params=json.dumps({f"v:{v.id}": "hello world"}),
    )
    db_session.add(s)
    db_session.flush()

    # Rename variant role and master display_name in DB
    v.role = "new_prompt_role"
    v.master.display_name = "New Master Display"
    db_session.flush()

    res = client.get(f"/api/snapshots/{s.id}")
    assert res.status_code == 200
    data = res.json()

    assert data["params"] == {"new_prompt_role": "hello world"}
    assert data["variant_params"] == {f"v:{v.id}": "hello world"}
    assert len(data["variants"]) == 1
    assert data["variants"][0]["id"] == v.id
    assert data["variants"][0]["role"] == "new_prompt_role"
    assert data["variants"][0]["display_name"] == "New Master Display"


def test_variant_ref_ac2_list_uses_same_resolver(
    client: TestClient, db_session: Session, snapshot_fixtures: dict
) -> None:
    """[REQ-418/AC-2] GET /api/snapshots populates params, variant_params, and variants using the same resolver."""
    wf = snapshot_fixtures["workflow"]
    v = _seed_variant(db_session, "Prompt_pos", "Positive Prompt")

    s = models.Snapshot(
        workflow_id=wf.id,
        params=json.dumps({f"v:{v.id}": "scenery"}),
    )
    db_session.add(s)
    db_session.flush()

    res = client.get(f"/api/snapshots?workflow_id={wf.id}")
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    matched = next(item for item in items if item["id"] == s.id)
    assert matched["params"] == {"Prompt_pos": "scenery"}
    assert matched["variant_params"] == {f"v:{v.id}": "scenery"}
    assert len(matched["variants"]) == 1
    assert matched["variants"][0]["id"] == v.id
    assert matched["variants"][0]["role"] == "Prompt_pos"
    assert matched["variants"][0]["display_name"] == "Positive Prompt"


def test_variant_ref_ac2_patch_params_normalized(
    client: TestClient, db_session: Session, snapshot_fixtures: dict, caplog: pytest.LogCaptureFixture
) -> None:
    """[REQ-418/AC-2] PATCH /api/snapshots/{id} stores v: keys and returns resolved role keys."""
    wf = snapshot_fixtures["workflow"]
    v = _seed_variant(db_session, "Prompt_pos", "Positive Prompt")

    created = client.post("/api/snapshots", json={
        "workflow_id": wf.id,
        "params": {"Prompt_pos": "initial"},
    })
    assert created.status_code == 201
    snap_id = created.json()["id"]

    with caplog.at_level("WARNING"):
        res = client.patch(f"/api/snapshots/{snap_id}", json={
            "params": {"Prompt_pos": "updated", "unmapped_key": "val"},
        })
    assert res.status_code == 200
    data = res.json()

    assert data["params"] == {"Prompt_pos": "updated"}
    assert data["variant_params"] == {f"v:{v.id}": "updated"}
    assert len(data["variants"]) == 1
    assert data["variants"][0]["id"] == v.id

    # Verify raw DB record stores v: keys and omits unmapped_key
    raw_s = db_session.query(models.Snapshot).filter(models.Snapshot.id == snap_id).first()
    assert raw_s is not None
    assert json.loads(raw_s.params) == {f"v:{v.id}": "updated"}
    assert "unmapped_key" in caplog.text
    assert str(snap_id) in caplog.text

