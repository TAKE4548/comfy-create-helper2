import json
import os
import shutil
import tempfile
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models
from app.services.benchmark_service import BenchmarkService
from app.services.training_manager import TrainingManager

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_app_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=connection)
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=connection)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    yield db
    db.close()


def test_req319_end_to_end_backend_pipeline(client, db_session):
    workflow = models.Workflow(
        name="LoRA Studio Default",
        json_body=json.dumps({
            "6": {"inputs": {"text": ""}, "class_type": "CLIPTextEncode"},
            "3": {"inputs": {"seed": 100}, "class_type": "KSampler"},
        }),
    )
    db_session.add(workflow)

    preset_casual = models.OutfitMasterPreset(
        name="Casual Hoodie",
        category="casual",
        prompt_tags="casual hoodie, denim shorts",
        is_builtin=True,
    )
    preset_dress = models.OutfitMasterPreset(
        name="Summer Dress",
        category="casual",
        prompt_tags="summer dress, straw hat",
        is_builtin=True,
    )
    db_session.add_all([preset_casual, preset_dress])
    db_session.commit()

    project_payload = {
        "name": "E2E_Test_Heroine",
        "character_trigger": "e2e_heroine",
        "outfit_trigger": "e2e_battle_suit",
        "workflow_id": workflow.id,
        "prompt_meta": "masterpiece, best quality, 1girl, solo",
        "prompt_physical": "silver twin tails, blue eyes",
        "prompt_exclusive_outfit": "battle armor suit, shoulder pads",
        "selected_alt_outfits": json.dumps([
            {"id": preset_casual.id, "prompt_tags": preset_casual.prompt_tags},
            {"id": preset_dress.id, "prompt_tags": preset_dress.prompt_tags},
        ]),
    }
    res_proj = client.post("/api/dataset/projects", json=project_payload)
    assert res_proj.status_code == 200, res_proj.text
    project_data = res_proj.json()
    project_id = project_data["id"]
    assert project_data["name"] == "E2E_Test_Heroine"

    res_calc = client.post(f"/api/dataset/projects/{project_id}/matrix")
    assert res_calc.status_code == 200, res_calc.text
    items = res_calc.json()
    assert len(items) == 20

    alt_items = [i for i in items if json.loads(i["factors_json"]).get("outfit_type") == "alt"]
    default_items = [i for i in items if json.loads(i["factors_json"]).get("outfit_type") == "default"]
    assert len(alt_items) == 5
    assert len(default_items) == 15

    for alt_item in alt_items:
        assert "battle armor suit" not in alt_item["raw_prompt"]

    first_item_id = items[0]["id"]
    update_payload = {
        "caption_text": "e2e_heroine, e2e_battle_suit, upper body, looking at viewer",
        "status": "APPROVED",
    }
    res_update = client.patch(f"/api/dataset/items/{first_item_id}", json=update_payload)
    assert res_update.status_code == 200
    updated_item = res_update.json()
    assert updated_item["caption_text"] == update_payload["caption_text"]

    with tempfile.TemporaryDirectory() as tmp_export_dir:
        export_payload = {
            "output_dir": tmp_export_dir,
            "status_filter": "APPROVED",
        }
        res_export = client.post(f"/api/dataset/projects/{project_id}/export", json=export_payload)
        assert res_export.status_code == 200
        export_data = res_export.json()
        assert export_data["status"] == "success"
        assert export_data["item_count"] == 20
        assert len(export_data["exported_files"]) == 20

        # Verify the first item's text file matches updated caption
        first_txt = [f for f in export_data["exported_files"] if "001.txt" in f][0]
        assert os.path.exists(first_txt)
        with open(first_txt, "r", encoding="utf-8") as f:
            content_read = f.read()
            assert content_read == update_payload["caption_text"]

    schedule = TrainingManager.calculate_schedule(
        items_count=20,
        repeats=10,
        batch_size=1,
        epochs=10,
        save_interval=2,
    )
    assert schedule["total_steps"] == 2000
    assert schedule["checkpoints_count"] == 5

    config_toml = TrainingManager.generate_config_toml(
        params={
            "learning_rate": "1e-4",
            "network_dim": 32,
            "network_alpha": 16,
            "epochs": 10,
            "batch_size": 1,
            "lora_name": "e2e_heroine_lora",
        },
        dataset_dir="C:/data/datasets/e2e",
        output_dir="C:/data/output/e2e",
    )
    assert 'output_name = "e2e_heroine_lora"' in config_toml
    assert 'mixed_precision = "bf16"' in config_toml

    job_payload = {
        "project_id": project_id,
        "lora_name": "e2e_heroine_lora",
        "model_type": "sdxl",
        "config_toml_content": config_toml,
        "epochs": 10,
        "repeats": 10,
        "batch_size": 1,
        "total_steps": 2000,
        "network_dim": 32,
        "network_alpha": 16,
        "learning_rate": "1e-4",
    }
    res_job = client.post("/api/training/jobs", json=job_payload)
    assert res_job.status_code == 201
    job_data = res_job.json()
    job_id = job_data["id"]
    assert job_data["lora_name"] == "e2e_heroine_lora"

    res_status = client.get("/api/training/status")
    assert res_status.status_code == 200
    assert "is_training_active" in res_status.json()

    res_prompts = client.post(
        "/api/benchmark/generate-prompts",
        json={
            "lora_name": "e2e_heroine_lora",
            "character_trigger": "e2e_heroine",
            "outfit_trigger": "e2e_battle_suit",
        },
    )
    assert res_prompts.status_code == 200
    prompts_data = res_prompts.json()
    assert prompts_data["total"] == 12
    prompts = prompts_data["prompts"]

    assert all(p["seed"] == 12345678 for p in prompts)
    axes = {p["axis_id"] for p in prompts}
    assert axes == {"decoupling", "bake_in", "pose", "angle"}

    mock_results = [{"cell": i, "pass": True} for i in range(12)]
    res_eval = client.post("/api/benchmark/evaluate", json={"results": mock_results})
    assert res_eval.status_code == 200
    eval_data = res_eval.json()
    sweet_spot = eval_data["sweet_spot"]
    assert sweet_spot["recommended_weight_min"] == 0.75
    assert sweet_spot["recommended_weight_max"] == 0.85
    assert sweet_spot["recommended_weight_display"] == "0.75 - 0.85"

