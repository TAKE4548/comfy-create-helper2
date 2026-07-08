import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import httpx

from app.database import get_db
from app import models, schemas
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["base-models"])

# ─── BaseModel Endpoints ───────────────────────────────────────────

@router.get("/api/base-models", response_model=list[schemas.BaseModelRead])
def list_base_models(db: Session = Depends(get_db)):
    return db.query(models.BaseModel).all()

@router.post("/api/base-models", response_model=schemas.BaseModelRead, status_code=status.HTTP_201_CREATED)
def create_base_model(payload: schemas.BaseModelCreate, db: Session = Depends(get_db)):
    existing = db.query(models.BaseModel).filter(models.BaseModel.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"BaseModel name '{payload.name}' already exists.")
    
    bm = models.BaseModel(
        name=payload.name,
        description=payload.description
    )
    db.add(bm)
    db.commit()
    db.refresh(bm)
    return bm

@router.put("/api/base-models/{id}", response_model=schemas.BaseModelRead)
def update_base_model(id: int, payload: schemas.BaseModelCreate, db: Session = Depends(get_db)):
    bm = db.query(models.BaseModel).filter(models.BaseModel.id == id).first()
    if not bm:
        raise HTTPException(status_code=404, detail="BaseModel not found.")
        
    existing = db.query(models.BaseModel).filter(
        models.BaseModel.name == payload.name,
        models.BaseModel.id != id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"BaseModel name '{payload.name}' already exists.")
        
    bm.name = payload.name
    bm.description = payload.description
    db.commit()
    db.refresh(bm)
    return bm

@router.delete("/api/base-models/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_base_model(id: int, db: Session = Depends(get_db)):
    bm = db.query(models.BaseModel).filter(models.BaseModel.id == id).first()
    if not bm:
        raise HTTPException(status_code=404, detail="BaseModel not found.")
    db.delete(bm)
    db.commit()

# ─── CheckpointMapping Endpoints ───────────────────────────────────

@router.get("/api/checkpoint-mappings", response_model=list[schemas.CheckpointMappingRead])
def list_checkpoint_mappings(db: Session = Depends(get_db)):
    return db.query(models.CheckpointMapping).all()

@router.post("/api/checkpoint-mappings", response_model=schemas.CheckpointMappingRead)
def create_or_update_checkpoint_mapping(payload: schemas.CheckpointMappingCreate, db: Session = Depends(get_db)):
    bm = db.query(models.BaseModel).filter(models.BaseModel.id == payload.base_model_id).first()
    if not bm:
        raise HTTPException(status_code=404, detail="BaseModel not found.")
        
    mapping = db.query(models.CheckpointMapping).filter(
        models.CheckpointMapping.checkpoint_name == payload.checkpoint_name
    ).first()
    
    if mapping:
        mapping.base_model_id = payload.base_model_id
    else:
        mapping = models.CheckpointMapping(
            checkpoint_name=payload.checkpoint_name,
            base_model_id=payload.base_model_id
        )
        db.add(mapping)
        
    db.commit()
    db.refresh(mapping)
    return mapping

@router.delete("/api/checkpoint-mappings/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkpoint_mapping(id: int, db: Session = Depends(get_db)):
    mapping = db.query(models.CheckpointMapping).filter(models.CheckpointMapping.id == id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="CheckpointMapping not found.")
    db.delete(mapping)
    db.commit()

# ─── ComfyUI Checkpoints Endpoints ─────────────────────────────────

@router.get("/api/comfy/checkpoints", response_model=list[str])
async def get_comfy_checkpoints():
    checkpoints = []
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{settings.comfy_url}/api/models/checkpoints", timeout=5.0)
            if response.status_code == 404:
                response = await client.get(f"{settings.comfy_url}/api/experiment/models/checkpoints", timeout=5.0)
                response.raise_for_status()
            else:
                response.raise_for_status()
            checkpoints = response.json()
        except (httpx.HTTPError, httpx.RequestError) as e:
            logger.warning(f"Failed to fetch checkpoints from ComfyUI: {e}. Returning empty list.")
            checkpoints = []
            
    if not isinstance(checkpoints, list):
        checkpoints = []
    return checkpoints