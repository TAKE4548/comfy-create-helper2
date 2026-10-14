"""API integration tests for workflow diff analysis, auto-backup, and rollback."""

import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app import models


@pytest.fixture
def client_and_session():
    """Create in-memory SQLite database, mock get_db, and provide TestClient."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    db = TestingSessionLocal()

    yield client, db

    db.close()
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def base_workflow_data():
    return {
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "model.safetensors"},
            "_meta": {"title": "Load Checkpoint"}
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "1girl", "clip": ["4", 1]},
            "_meta": {"title": "Positive Prompt"}
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {"model": ["4", 0], "positive": ["6", 0]},
            "_meta": {"title": "KSampler"}
        }
    }


def test_diff_analyze_api(client_and_session, base_workflow_data):
    """Test POST /api/workflows/{id}/diff-analyze endpoint."""
    client, db = client_and_session

    # Setup MappingMaster and Workflow
    master = models.MappingMaster(
        role="positive",
        param_name="prompt",
        input_type="textarea",
        display_name="Positive Prompt",
    )
    db.add(master)
    db.commit()
    db.refresh(master)

    wf = models.Workflow(
        name="Diff Test Workflow",
        json_body=json.dumps(base_workflow_data),
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)

    mapping = models.WorkflowMapping(workflow_id=wf.id, master_id=master.id, node_id="6")
    db.add(mapping)
    db.commit()

    # New workflow re-indexes node 6 to 60
    new_wf_data = dict(base_workflow_data)
    node_6 = new_wf_data.pop("6")
    new_wf_data["60"] = node_6
    new_wf_data["3"] = {
        "class_type": "KSampler",
        "inputs": {"model": ["4", 0], "positive": ["60", 0]},
        "_meta": {"title": "KSampler"}
    }

    resp = client.post(
        f"/api/workflows/{wf.id}/diff-analyze",
        json={"new_json_body": new_wf_data},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert "summary" in data
    assert "role_migrations" in data
    assert "bypass_warnings" in data
    assert "unmapped_new_nodes" in data

    assert len(data["role_migrations"]) == 1
    mig = data["role_migrations"][0]
    assert mig["master_id"] == master.id
    assert mig["role"] == "positive"
    assert mig["old_node_id"] == "6"
    assert mig["new_node_id"] == "60"
    assert mig["status"] == "reindexed"
    assert mig["confidence"] >= 80.0


def test_workflow_put_auto_backup_and_rollback(client_and_session, base_workflow_data):
    """Test PUT auto backup to workflow_history and rollback restoration."""
    client, db = client_and_session

    master = models.MappingMaster(
        role="positive",
        param_name="prompt",
        input_type="textarea",
        display_name="Positive Prompt",
    )
    db.add(master)
    db.commit()
    db.refresh(master)

    wf = models.Workflow(
        name="Update Test Workflow",
        json_body=json.dumps(base_workflow_data),
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)

    mapping = models.WorkflowMapping(workflow_id=wf.id, master_id=master.id, node_id="6")
    # Also add a bypass profile to ensure it is not destroyed
    bp = models.BypassProfile(
        workflow_id=wf.id,
        name="Default Bypass",
        bypassed_node_ids=json.dumps(["99"]),
        is_enabled=True,
    )
    db.add_all([mapping, bp])
    db.commit()

    # 1. Initial history status: should have no history
    resp = client.get(f"/api/workflows/{wf.id}/history-status")
    assert resp.status_code == 200
    assert resp.json()["has_rollback"] is False
    assert resp.json()["history_count"] == 0

    # 2. Update workflow with new json_body and new mapping
    new_data = {"100": {"class_type": "NewNode"}}
    update_resp = client.put(
        f"/api/workflows/{wf.id}",
        json={
            "json_body": new_data,
            "mappings": [{"master_id": master.id, "node_id": "100"}]
        }
    )
    assert update_resp.status_code == 200

    # Verify workflow state changed
    db.expire_all()
    wf_updated = db.get(models.Workflow, wf.id)
    assert json.loads(wf_updated.json_body) == new_data
    assert wf_updated.mappings[0].node_id == "100"
    # Bypass profile preserved
    assert len(wf_updated.bypass_profiles) == 1
    assert wf_updated.bypass_profiles[0].name == "Default Bypass"

    # 3. History status: should have 1 backup
    hist_resp = client.get(f"/api/workflows/{wf.id}/history-status")
    assert hist_resp.status_code == 200
    assert hist_resp.json()["has_rollback"] is True
    assert hist_resp.json()["history_count"] == 1

    # 4. Rollback
    rb_resp = client.post(f"/api/workflows/{wf.id}/rollback")
    assert rb_resp.status_code == 200
    assert rb_resp.json()["message"] == "Rollback successful"

    # 5. Verify restored state
    db.expire_all()
    wf_restored = db.get(models.Workflow, wf.id)
    assert json.loads(wf_restored.json_body) == base_workflow_data
    assert wf_restored.mappings[0].node_id == "6"

    # History consumed
    hist_resp2 = client.get(f"/api/workflows/{wf.id}/history-status")
    assert hist_resp2.json()["has_rollback"] is False


def test_rollback_no_history_error(client_and_session):
    """Test POST /api/workflows/{id}/rollback when no history exists returns 400."""
    client, db = client_and_session

    wf = models.Workflow(
        name="No History WF",
        json_body=json.dumps({}),
    )
    db.add(wf)
    db.commit()

    resp = client.post(f"/api/workflows/{wf.id}/rollback")
    assert resp.status_code == 400
    assert "No rollback history available" in resp.json()["detail"]
