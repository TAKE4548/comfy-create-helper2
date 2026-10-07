import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LoraTrainingJob
from app.schemas.dataset import LoraTrainingJobCreate, LoraTrainingJobResponse
from app.services.training_manager import training_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/training", tags=["training"])


@router.post("/jobs", response_model=LoraTrainingJobResponse, status_code=status.HTTP_201_CREATED)
def create_training_job(data: LoraTrainingJobCreate, db: Session = Depends(get_db)):
    job = LoraTrainingJob(
        project_id=data.project_id,
        lora_name=data.lora_name,
        model_type=data.model_type,
        config_toml_content=data.config_toml_content,
        epochs=data.epochs,
        repeats=data.repeats,
        batch_size=data.batch_size,
        total_steps=data.total_steps,
        network_dim=data.network_dim,
        network_alpha=data.network_alpha,
        learning_rate=data.learning_rate,
        status=data.status or "IDLE",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/jobs/{job_id}", response_model=LoraTrainingJobResponse)
def get_training_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(LoraTrainingJob).filter(LoraTrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    return job


@router.post("/jobs/{job_id}/start")
async def start_training_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(LoraTrainingJob).filter(LoraTrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")

    if training_manager.is_training_active():
        raise HTTPException(status_code=409, detail="Another training process is currently active")

    try:
        pid = await training_manager.start_job(job_id, db)
        return {"status": "started", "job_id": job_id, "pid": pid}
    except Exception as e:
        logger.error(f"Failed to start training job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/stop")
async def stop_training_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(LoraTrainingJob).filter(LoraTrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")

    success = await training_manager.stop_job(job_id, db)
    return {"status": "stopped" if success else "failed", "job_id": job_id}


@router.get("/status")
def get_training_status():
    return {
        "is_training_active": training_manager.is_training_active(),
    }


@router.websocket("/ws/{job_id}")
async def training_ws_endpoint(websocket: WebSocket, job_id: int):
    await training_manager.register_ws(job_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        training_manager.unregister_ws(job_id, websocket)