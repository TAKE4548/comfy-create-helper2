"""Bypass profiles router."""

import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(tags=["bypass-profiles"])


def _profile_to_schema(profile: models.BypassProfile) -> schemas.BypassProfileRead:
    return schemas.BypassProfileRead(
        id=profile.id,
        workflow_id=profile.workflow_id,
        name=profile.name,
        bypassed_node_ids=json.loads(profile.bypassed_node_ids) if profile.bypassed_node_ids else [],
        is_enabled=profile.is_enabled,
        created_at=profile.created_at,
    )


@router.get("/api/workflows/{workflow_id}/bypass-profiles", response_model=list[schemas.BypassProfileRead])
def list_bypass_profiles(workflow_id: int, db: Session = Depends(get_db)):
    # Verify that workflow exists
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    profiles = db.query(models.BypassProfile).filter(models.BypassProfile.workflow_id == workflow_id).all()
    return [_profile_to_schema(p) for p in profiles]


@router.post("/api/workflows/{workflow_id}/bypass-profiles", response_model=schemas.BypassProfileRead, status_code=status.HTTP_201_CREATED)
def create_bypass_profile(workflow_id: int, payload: schemas.BypassProfileCreate, db: Session = Depends(get_db)):
    # Verify that workflow exists
    wf = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    profile = models.BypassProfile(
        workflow_id=workflow_id,
        name=payload.name,
        bypassed_node_ids=json.dumps(payload.bypassed_node_ids),
        is_enabled=True,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _profile_to_schema(profile)


@router.put("/api/bypass-profiles/{profile_id}", response_model=schemas.BypassProfileRead)
def update_bypass_profile(profile_id: int, payload: schemas.BypassProfileUpdate, db: Session = Depends(get_db)):
    profile = db.query(models.BypassProfile).filter(models.BypassProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Bypass profile not found")

    if payload.name is not None:
        profile.name = payload.name
    if payload.bypassed_node_ids is not None:
        profile.bypassed_node_ids = json.dumps(payload.bypassed_node_ids)
    if payload.is_enabled is not None:
        profile.is_enabled = payload.is_enabled

    db.commit()
    db.refresh(profile)
    return _profile_to_schema(profile)


@router.delete("/api/bypass-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bypass_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = db.query(models.BypassProfile).filter(models.BypassProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Bypass profile not found")
    db.delete(profile)
    db.commit()
