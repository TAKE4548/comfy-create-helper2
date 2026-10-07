import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.training_manager import TrainingManager, training_manager
from app.database import Base, engine, SessionLocal
from app.models import LoraTrainingJob, DatasetProject, Workflow

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()

def test_calculate_schedule():
    res = TrainingManager.calculate_schedule(
        items_count=20,
        repeats=10,
        batch_size=1,
        epochs=10,
        save_interval=1,
    )
    assert res["total_steps"] == 2000
    assert res["checkpoints_count"] == 10

    res2 = TrainingManager.calculate_schedule(
        items_count=15,
        repeats=5,
        batch_size=2,
        epochs=8,
        save_interval=2,
    )
    assert res2["total_steps"] == 296
    assert res2["checkpoints_count"] == 4

def test_generate_config_toml():
    params = {
        "learning_rate": "1e-4",
        "network_dim": 32,
        "network_alpha": 16,
        "epochs": 10,
        "batch_size": 1,
        "lora_name": "chara_test",
        "optimizer_type": "AdamW",
        "lr_scheduler": "cosine",
    }
    toml_str = TrainingManager.generate_config_toml(
        params=params,
        dataset_dir="C:\\data\\train",
        output_dir="C:\\data\\output",
    )
    assert 'mixed_precision = "bf16"' in toml_str
    assert 'gradient_checkpointing = true' in toml_str
    assert 'text_encoder_lr = 0.0' in toml_str
    assert 'output_name = "chara_test"' in toml_str
    assert 'network_dim = 32' in toml_str
    assert 'network_alpha = 16' in toml_str
    assert 'learning_rate = 1e-4' in toml_str
    assert 'dataset_dir = "C:/data/train"' in toml_str

def test_verify_artifacts(tmp_path):
    fake_file = tmp_path / "model.safetensors"
    fake_file.write_bytes(b"0" * int(1.5 * 1024 * 1024))
    assert TrainingManager.verify_artifacts(str(fake_file), min_size_mb=1.0) is True

    small_file = tmp_path / "small.safetensors"
    small_file.write_bytes(b"0" * int(0.5 * 1024 * 1024))
    assert TrainingManager.verify_artifacts(str(small_file), min_size_mb=1.0) is False

    assert TrainingManager.verify_artifacts(str(tmp_path / "not_found.safetensors")) is False

    wrong_ext = tmp_path / "model.bin"
    wrong_ext.write_bytes(b"0" * int(2 * 1024 * 1024))
    assert TrainingManager.verify_artifacts(str(wrong_ext)) is False

@pytest.mark.asyncio
async def test_start_and_stop_job(db, tmp_path):
    import uuid
    unique_name = f"TrainWF_{uuid.uuid4().hex[:8]}"
    wf = Workflow(name=unique_name, json_body="{}")
    db.add(wf)
    db.commit()
    db.refresh(wf)

    project = DatasetProject(
        name=f"TestProj_{uuid.uuid4().hex[:8]}",
        character_trigger="hero",
        outfit_trigger="hero_outfit",
        workflow_id=wf.id,
        prompt_meta="masterpiece",
        prompt_physical="blonde hair",
        prompt_exclusive_outfit="blue armor",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    job = LoraTrainingJob(
        project_id=project.id,
        lora_name="hero_lora",
        config_toml_content="# toml",
        epochs=10,
        repeats=10,
        batch_size=1,
        total_steps=2000,
        network_dim=16,
        network_alpha=16,
        learning_rate="1e-4",
        status="IDLE",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    import sys
    cmd = [sys.executable, "-c", "import time; time.sleep(10)"]
    pid = await training_manager.start_job(job.id, db, command=cmd)
    assert pid > 0
    assert training_manager.is_training_active() is True

    stopped = await training_manager.stop_job(job.id, db)
    assert stopped is True
    assert training_manager.is_training_active() is False

    db.refresh(job)
    assert job.status == "STOPPED"

def test_training_router_endpoints(client, db):
    import uuid
    wf = Workflow(name=f"RouterWF_{uuid.uuid4().hex[:8]}", json_body="{}")
    db.add(wf)
    db.commit()
    db.refresh(wf)

    project = DatasetProject(
        name=f"RouterProj_{uuid.uuid4().hex[:8]}",
        character_trigger="testchar",
        outfit_trigger="testoutfit",
        workflow_id=wf.id,
        prompt_meta="q",
        prompt_physical="p",
        prompt_exclusive_outfit="o",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # 1. Create job
    create_payload = {
        "project_id": project.id,
        "lora_name": "test_lora_job",
        "model_type": "anima_2b",
        "config_toml_content": "[args]",
        "epochs": 10,
        "repeats": 10,
        "batch_size": 1,
        "total_steps": 2000,
        "network_dim": 16,
        "network_alpha": 16,
        "learning_rate": "1e-4",
    }
    resp = client.post("/api/training/jobs", json=create_payload)
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    # 2. Get status
    resp_status = client.get("/api/training/status")
    assert resp_status.status_code == 200
    assert "is_training_active" in resp_status.json()

    # 3. Get job details
    resp_get = client.get(f"/api/training/jobs/{job_id}")
    assert resp_get.status_code == 200
    assert resp_get.json()["lora_name"] == "test_lora_job"

    # 4. Stop job (when idle or running)
    resp_stop = client.post(f"/api/training/jobs/{job_id}/stop")
    assert resp_stop.status_code == 200
    assert resp_stop.json()["status"] == "stopped"