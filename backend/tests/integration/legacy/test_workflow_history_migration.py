"""Unit tests for workflow history table migration and model cascading."""

import json
import pytest
from sqlalchemy import create_engine, select, inspect, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, Workflow, WorkflowHistory
from app.migrations.runner import run_migrations


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database and session with migrations applied."""
    engine = create_engine("sqlite:///:memory:")
    # Enable foreign keys for SQLite cascade support
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON"))

    # Create tables
    Base.metadata.create_all(engine)

    Session = sessionmaker(bind=engine)
    session = Session()

    yield session

    session.close()
    engine.dispose()


def test_migration_creates_workflow_history_table():
    """Test that runner executes step_011 and creates workflow_history table."""
    engine = create_engine("sqlite:///:memory:")
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON"))

    # Run all migrations
    run_migrations(engine)

    insp = inspect(engine)
    tables = insp.get_table_names()
    assert "workflow_history" in tables

    cols = {c["name"]: c for c in insp.get_columns("workflow_history")}
    assert "id" in cols
    assert "workflow_id" in cols
    assert "json_body" in cols
    assert "mappings" in cols
    assert "created_at" in cols


def test_workflow_history_crud_and_cascade(db_session):
    """Test CRUD operations and cascade delete on workflow_history."""
    # 1. Create a Workflow
    wf = Workflow(
        name="Test Workflow",
        json_body=json.dumps({"3": {"class_type": "KSampler"}}),
    )
    db_session.add(wf)
    db_session.commit()
    db_session.refresh(wf)

    assert wf.id is not None
    assert len(wf.history_entries) == 0

    # 2. Add history entries
    h1 = WorkflowHistory(
        workflow_id=wf.id,
        json_body=json.dumps({"3": {"class_type": "KSampler", "v": 1}}),
        mappings=json.dumps([{"master_id": 1, "node_id": "6"}]),
    )
    h2 = WorkflowHistory(
        workflow_id=wf.id,
        json_body=json.dumps({"3": {"class_type": "KSampler", "v": 2}}),
        mappings=json.dumps([{"master_id": 1, "node_id": "60"}]),
    )
    db_session.add_all([h1, h2])
    db_session.commit()

    # 3. Read history entries via relationship
    db_session.refresh(wf)
    assert len(wf.history_entries) == 2

    # Query directly
    entries = db_session.scalars(
        select(WorkflowHistory).where(WorkflowHistory.workflow_id == wf.id)
    ).all()
    assert len(entries) == 2
    assert entries[0].workflow.name == "Test Workflow"

    # 4. Cascade delete: deleting Workflow deletes its history entries
    db_session.delete(wf)
    db_session.commit()

    remaining_history = db_session.scalars(select(WorkflowHistory)).all()
    assert len(remaining_history) == 0
