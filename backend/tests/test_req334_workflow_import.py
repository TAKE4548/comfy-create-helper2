import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.database import Base
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
