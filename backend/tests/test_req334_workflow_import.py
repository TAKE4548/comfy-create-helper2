import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app import models, schemas
from app.database import Base, get_db
from app.main import app
from app.routers.workflows import update_workflow


@pytest.fixture
def workflow_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        workflow = models.Workflow(
            name="Roundtrip",
            json_body='{"nodes": []}',
            default_applied_assets="saved-default",
        )
        session.add(workflow)
        session.commit()
        yield session, workflow.id
    engine.dispose()


@pytest.mark.parametrize(
    ("fields", "expected_default"),
    [
        ({}, "saved-default"),
        ({"default_applied_assets": None}, None),
        ({"default_applied_assets": '{"lora": ["one"]}'}, '{"lora": ["one"]}'),
    ],
)
def test_workflow_default_applied_assets_presence_roundtrip(workflow_session, fields, expected_default):
    session, workflow_id = workflow_session
    original_json = '{"nodes": []}'

    updated = update_workflow(workflow_id, schemas.WorkflowUpdate(**fields), session)

    assert updated.default_applied_assets == expected_default
    assert updated.name == "Roundtrip"
    assert updated.json_body == original_json


@pytest.fixture
def req358_workflow_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)

    def override_get_db():
        with factory() as session:
            yield session

    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client, factory
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous
        engine.dispose()


def test_req358_workflow_state_create_get_and_update_presence_roundtrip(req358_workflow_client):
    """[REQ-358/AC-19, AC-20] Persist on create/read; omitted PUT retains and {} replaces."""
    client, factory = req358_workflow_client
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

    with factory() as reopened_session:
        reopened = reopened_session.get(models.Workflow, workflow_id)
        assert json.loads(reopened.mapping_slot_states) == initial_states

    omitted = client.put(f"/api/workflows/{workflow_id}", json={"name": "REQ-358 state roundtrip 2"})
    assert omitted.status_code == 200, omitted.text
    assert client.get(f"/api/workflows/{workflow_id}").json()["mapping_slot_states"] == initial_states

    null_state = client.put(f"/api/workflows/{workflow_id}", json={"mapping_slot_states": None})
    assert null_state.status_code == 422

    replaced = client.put(f"/api/workflows/{workflow_id}", json={"mapping_slot_states": {}})
    assert replaced.status_code == 200, replaced.text
    assert client.get(f"/api/workflows/{workflow_id}").json()["mapping_slot_states"] == {}


def test_req358_workflow_state_is_saved_in_history_and_restored_by_rollback(req358_workflow_client):
    """[REQ-358/AC-28] Rollback restores the prior slot states with workflow content."""
    client, _factory = req358_workflow_client
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
    assert client.get(f"/api/workflows/{workflow_id}").json()["mapping_slot_states"] == {"m:901": False}

    rolled_back = client.post(f"/api/workflows/{workflow_id}/rollback")
    assert rolled_back.status_code == 200, rolled_back.text
    restored = client.get(f"/api/workflows/{workflow_id}")
    assert restored.status_code == 200, restored.text
    assert restored.json()["json_body"] == {"nodes": [{"id": 1}]}
    assert restored.json()["mapping_slot_states"] == original_states
