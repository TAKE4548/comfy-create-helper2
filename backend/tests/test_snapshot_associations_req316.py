import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base, get_db
from app.main import app

FACTS = "__prompt_surgeon_metadata_v1"
ASSOCIATIONS = "__metadata_associations_v1"


@pytest.fixture
def ctx():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    connection = engine.connect()
    sessions = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    old = app.dependency_overrides.get(get_db)

    def override_get_db():
        db = sessions()
        try:
            yield db
        finally:
            db.close()

    Base.metadata.create_all(bind=connection)
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    db = sessions()
    workflow = models.Workflow(name="req316", json_body="{}")
    loras = [models.Lora(model_name=f"lora-{i}.safetensors") for i in range(1, 4)]
    tags = [models.TagSet(name=f"tags-{i}", tags="[]") for i in range(1, 4)]
    db.add_all([workflow, *loras, *tags])
    db.flush()
    triggers = [models.LoraTriggerWordSet(lora_id=loras[i].id, name=f"trigger-{i}", words="[]") for i in range(3)]
    db.add_all(triggers)
    db.commit()
    facts = json.dumps({"version": 1, "workflow_name": "Recorded"})
    params = {FACTS: facts, ASSOCIATIONS: json.dumps({"version": 1, "lora_trigger_sets": []}), "ordinary": {"x": 1}}
    response = client.post("/api/snapshots", json={
        "workflow_id": workflow.id, "image_path": "test.png", "thumbnail_path": "thumb.png", "params": params,
        "loras": [{"lora_id": loras[0].id, "strength": 0, "role": "positive"}, {"lora_id": loras[1].id, "strength": 0.65, "role": "negative"}],
        "tag_sets": [{"tag_set_id": tags[0].id, "role": "positive"}],
    })
    assert response.status_code == 201
    initial = client.get(f"/api/snapshots/{response.json()['id']}").json()
    yield {"client": client, "db": db, "engine": engine, "connection": connection, "old": old,
           "workflow": workflow, "loras": loras, "tags": tags, "triggers": triggers,
           "snapshot": initial, "facts": facts, "params": params}
    db.close()
    client.close()
    Base.metadata.drop_all(bind=connection)
    if old is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = old
    connection.close()
    engine.dispose()


def get_snapshot(ctx):
    return ctx["client"].get(f"/api/snapshots/{ctx['snapshot']['id']}").json()


def test_updates_both_association_types_without_changing_generation_facts(ctx):
    client, snap, tags, triggers, loras = ctx["client"], ctx["snapshot"], ctx["tags"], ctx["triggers"], ctx["loras"]
    tag_sets = [{"tag_set_id": tags[0].id, "role": "positive"}, {"tag_set_id": tags[1].id, "role": "negative"}]
    trigger_sets = [{"lora_id": loras[0].id, "trigger_set_id": triggers[0].id, "role": "positive"},
                    {"lora_id": loras[1].id, "trigger_set_id": triggers[1].id, "role": "negative"}]
    response = client.patch(f"/api/snapshots/{snap['id']}", json={"tag_sets": tag_sets, "lora_trigger_sets": trigger_sets})
    assert response.status_code == 200
    saved = get_snapshot(ctx)
    assert {(item["tag_set_id"], item["role"]) for item in saved["tag_sets"]} == {(x["tag_set_id"], x["role"]) for x in tag_sets}
    association_record = json.loads(saved["params"][ASSOCIATIONS])
    assert association_record == {"version": 1, "lora_trigger_sets": trigger_sets}
    assert saved["params"][FACTS] == ctx["facts"] and saved["params"]["ordinary"] == ctx["params"]["ordinary"]
    assert (saved["image_path"], saved["thumbnail_path"], saved["created_at"]) == (snap["image_path"], snap["thumbnail_path"], snap["created_at"])
    assert [(x["lora_id"], x["role"], x["strength"]) for x in saved["loras"]] == [(x["lora_id"], x["role"], x["strength"]) for x in snap["loras"]]
    assert ctx["db"].query(models.Snapshot).filter_by(id=snap["id"]).first().album_items == []


def test_relations_are_independent_and_empty_clears_only_requested_type(ctx):
    client, snap, tags, triggers, loras = ctx["client"], ctx["snapshot"], ctx["tags"], ctx["triggers"], ctx["loras"]
    trigger = {"lora_id": loras[0].id, "trigger_set_id": triggers[0].id, "role": "positive"}
    client.patch(f"/api/snapshots/{snap['id']}", json={"lora_trigger_sets": [trigger]})
    original_tags = get_snapshot(ctx)["tag_sets"]
    client.patch(f"/api/snapshots/{snap['id']}", json={"tag_sets": [{"tag_set_id": tags[1].id, "role": "negative"}]})
    after_tags = get_snapshot(ctx)
    assert {(x["tag_set_id"], x["role"]) for x in after_tags["tag_sets"]} == {(tags[1].id, "negative")}
    assert json.loads(after_tags["params"][ASSOCIATIONS])["lora_trigger_sets"] == [trigger]
    client.patch(f"/api/snapshots/{snap['id']}", json={"lora_trigger_sets": []})
    saved = get_snapshot(ctx)
    assert {(x["tag_set_id"], x["role"]) for x in saved["tag_sets"]} == {(x["tag_set_id"], x["role"]) for x in after_tags["tag_sets"]}
    assert saved["tag_sets"] != original_tags
    assert json.loads(saved["params"][ASSOCIATIONS])["lora_trigger_sets"] == []
    client.patch(f"/api/snapshots/{snap['id']}", json={"tag_sets": []})
    assert get_snapshot(ctx)["tag_sets"] == []


def test_association_only_role_does_not_change_snapshot_lora_role_or_strength(ctx):
    client, snap, loras, triggers = ctx["client"], ctx["snapshot"], ctx["loras"], ctx["triggers"]
    before = get_snapshot(ctx)
    association = {"lora_id": loras[0].id, "trigger_set_id": triggers[0].id, "role": "association-only"}
    response = client.patch(f"/api/snapshots/{snap['id']}", json={"lora_trigger_sets": [association]})
    assert response.status_code == 200
    saved = get_snapshot(ctx)
    assert json.loads(saved["params"][ASSOCIATIONS])["lora_trigger_sets"] == [association]
    assert [(x["lora_id"], x["role"], x["strength"]) for x in saved["loras"]] == [(x["lora_id"], x["role"], x["strength"]) for x in before["loras"]]


@pytest.mark.parametrize("payload", [
    {"tag_sets": [{"tag_set_id": 999, "role": "positive"}]},
    {"lora_trigger_sets": [{"lora_id": 1, "trigger_set_id": 999, "role": "positive"}]},
    {"lora_trigger_sets": [{"lora_id": 1, "trigger_set_id": 2, "role": "positive"}]},
    {"lora_trigger_sets": [{"lora_id": 3, "trigger_set_id": 3, "role": "positive"}]},
    {"tag_sets": [{"tag_set_id": 1, "role": "positive"}, {"tag_set_id": 1, "role": "positive"}]},
    {"lora_trigger_sets": [{"lora_id": 1, "trigger_set_id": 1, "role": "positive"}, {"lora_id": 1, "trigger_set_id": 1, "role": "positive"}]},
    {"tag_sets": [{"tag_set_id": 1, "role": "  "}]},
    {"lora_trigger_sets": [{"lora_id": 1, "trigger_set_id": 1, "role": ""}]},
    {"tag_sets": [], "tag_set_ids": []},
])
def test_invalid_updates_return_400_without_partial_changes(ctx, payload):
    client, snap = ctx["client"], ctx["snapshot"]
    before = get_snapshot(ctx)
    response = client.patch(f"/api/snapshots/{snap['id']}", json=payload)
    assert response.status_code == 400
    assert get_snapshot(ctx) == before


def test_missing_existing_trigger_can_be_kept_or_removed_but_not_recreated(ctx):
    client, snap, db, loras, triggers = ctx["client"], ctx["snapshot"], ctx["db"], ctx["loras"], ctx["triggers"]
    existing = {"lora_id": loras[0].id, "trigger_set_id": triggers[0].id, "role": "positive"}
    client.patch(f"/api/snapshots/{snap['id']}", json={"lora_trigger_sets": [existing]})
    db.delete(db.query(models.LoraTriggerWordSet).filter_by(id=triggers[0].id).one())
    db.commit()
    hold = client.patch(f"/api/snapshots/{snap['id']}", json={"lora_trigger_sets": [existing]})
    assert hold.status_code == 200
    changed = {**existing, "role": "negative"}
    assert client.patch(f"/api/snapshots/{snap['id']}", json={"lora_trigger_sets": [changed]}).status_code == 400
    assert json.loads(get_snapshot(ctx)["params"][ASSOCIATIONS])["lora_trigger_sets"] == [existing]
    assert client.patch(f"/api/snapshots/{snap['id']}", json={"lora_trigger_sets": []}).status_code == 200
    assert json.loads(get_snapshot(ctx)["params"][ASSOCIATIONS])["lora_trigger_sets"] == []


def test_unknown_association_version_is_not_silently_cleared(ctx):
    client, snap, db = ctx["client"], ctx["snapshot"], ctx["db"]
    record = {"version": 9, "lora_trigger_sets": []}
    row = db.query(models.Snapshot).filter_by(id=snap["id"]).one()
    params = json.loads(row.params)
    params[ASSOCIATIONS] = json.dumps(record)
    row.params = json.dumps(params)
    db.commit()
    before = get_snapshot(ctx)
    response = client.patch(f"/api/snapshots/{snap['id']}", json={"lora_trigger_sets": []})
    assert response.status_code == 400
    assert get_snapshot(ctx) == before
