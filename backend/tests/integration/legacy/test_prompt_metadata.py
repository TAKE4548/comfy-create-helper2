import httpx
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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


def test_save_and_get_prompt_metadata(client: TestClient) -> None:
    """[REQ-316/AC-2] POST /api/prompt-metadata saves metadata and GET /api/prompt-metadata/{prompt_id} retrieves it."""
    payload = {
        "prompt_id": "p-12345",
        "workflow_id": 1,
        "param_values": {"prompt": "a beautiful landscape", "steps": 20},
        "applied_assets": {"loras": [{"name": "detailer", "strength": 0.8}]},
    }
    res = client.post("/api/prompt-metadata", json=payload)
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "prompt_id": "p-12345"}

    res_get = client.get("/api/prompt-metadata/p-12345")
    assert res_get.status_code == 200
    data = res_get.json()
    assert data["prompt_id"] == "p-12345"
    assert data["workflow_id"] == 1
    assert data["param_values"]["prompt"] == "a beautiful landscape"
    assert data["applied_assets"]["loras"][0]["name"] == "detailer"


def test_upsert_prompt_metadata(client: TestClient) -> None:
    """[REQ-316/AC-3] POST /api/prompt-metadata updates existing prompt metadata (upsert)."""
    client.post("/api/prompt-metadata", json={
        "prompt_id": "p-upsert",
        "workflow_id": 1,
        "param_values": {"seed": 111},
    })
    res = client.post("/api/prompt-metadata", json={
        "prompt_id": "p-upsert",
        "workflow_id": 2,
        "param_values": {"seed": 999},
        "applied_assets": {"test": True},
    })
    assert res.status_code == 200

    res_get = client.get("/api/prompt-metadata/p-upsert")
    assert res_get.status_code == 200
    data = res_get.json()
    assert data["workflow_id"] == 2
    assert data["param_values"]["seed"] == 999


def test_get_not_found(client: TestClient) -> None:
    """[REQ-316/AC-4] GET /api/prompt-metadata/{prompt_id} returns 404 when not found."""
    res = client.get("/api/prompt-metadata/non-existent")
    assert res.status_code == 404


def test_req316_full_unicode_record_and_json_roundtrip(client: TestClient) -> None:
    """[REQ-316/AC-1] Full unicode prompt record and JSON roundtrip."""
    text = "日本語(重み:1.2)\r\n" * 200 + "末尾-REQ316"
    record = {
        "version": 1, "workflow_id": 1, "workflow_name": "生成時名称",
        "completeness": "complete", "queued_at": "2026-10-03T17:00:00Z",
        "fields": [{
            "mapping_id": i, "node_id": str(i), "role": role,
            "param_name": "text", "input_type": "textarea", "display_name": role,
            "class_type": "CLIPTextEncode", "recorded": True, "value": value,
            "status": "submitted", "value_kind": "literal",
        } for i, (role, value) in enumerate([
            ("Quality", text), ("Character", "人物"), ("Negative", "低品質"), ("Scene", ""),
        ], 1)],
        "parameters": [{
            "mapping_id": i, "node_id": str(i), "role": role, "param_name": "value",
            "input_type": "lora_stack" if role == "LoRA" else "number", "display_name": role,
            "class_type": None, "recorded": True, "value": value, "status": "submitted", "value_kind": "literal",
        } for i, (role, value) in enumerate([
            ("Sampler_Seed", 123456), ("Enabled", False), ("Zero", 0), ("Null", None),
            ("Array", [0, False, None]), ("LoRA", {"lora_count": 1, "lora_name_1": "model", "model_str_1": 0.4, "clip_str_1": 0.8}),
        ], 5)],
        "assets": [{
            "type": "lora", "asset_id": 4, "name": "名前", "role": "Quality", "tags": [],
            "lora_prompt": None, "origin": "unknown", "trigger_set_id": None, "trigger_set_name": None,
        }],
    }
    raw = json.dumps(record, ensure_ascii=False)
    params = {
        "Quality": text, "seed": 123456, "json": [False, 0, None, {"x": "日本語"}],
        "__prompt_surgeon_metadata_v1": raw,
        "__metadata_associations_v1": json.dumps({"version": 1, "lora_trigger_sets": []}),
    }
    assets = {"Quality": [{"assetId": 4, "tags": ["日本語"], "enabled": True}]}
    response = client.post("/api/prompt-metadata", json={
        "prompt_id": "req316", "workflow_id": 1, "param_values": params, "applied_assets": assets,
    })
    assert response.status_code == 200
    saved = client.get("/api/prompt-metadata/req316").json()
    assert saved["param_values"] == params
    assert saved["applied_assets"] == assets
    assert saved["param_values"]["__prompt_surgeon_metadata_v1"] == raw
    assert json.loads(saved["param_values"]["__prompt_surgeon_metadata_v1"]) == record


def test_prompt_metadata_200_limit_pruning_req362_ac6(client: TestClient, db_session: Session, mock_external_services) -> None:
    """[REQ-362/AC-6] prompt_metadata が 200件を超過した際、アクティブジョブを除外した古いレコードからパージされること。"""
    from app import models

    mock_external_services.get("http://localhost:8188/queue").respond(200, json={"queue_running": [], "queue_pending": []})
    mock_external_services.get("http://127.0.0.1:8188/queue").respond(200, json={"queue_running": [], "queue_pending": []})

    # 既存のレコードをクリア
    db_session.query(models.PromptMetadata).delete()
    db_session.commit()

    # 1件アクティブジョブ (running) を作成 (prompt_id="p-active-001")
    job = models.GenerationJob(
        job_id="job-active-1",
        request_id="req-1",
        item_index=0,
        payload_hash="hash",
        session_id="session-1",
        scope="normal",
        batch_id="batch-1",
        prompt_id="p-active-001",
        status="running",
    )
    db_session.add(job)
    db_session.commit()

    # 205 件のメタデータを登録
    for i in range(205):
        pid = "p-active-001" if i == 0 else f"p-{i:04d}"
        res = client.post("/api/prompt-metadata", json={
            "prompt_id": pid,
            "workflow_id": 1,
            "param_values": {"step": i},
        })
        assert res.status_code == 200

    # 登録後の総件数を確認: 200件以下であること
    total_count = db_session.query(models.PromptMetadata).count()
    assert total_count == 200

    # アクティブジョブの prompt_metadata (p-active-001) が保護されて残っていること
    active_meta = db_session.query(models.PromptMetadata).filter(
        models.PromptMetadata.prompt_id == "p-active-001"
    ).first()
    assert active_meta is not None
