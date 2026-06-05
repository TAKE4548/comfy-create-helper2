"""TagSets router."""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/tag-sets", tags=["tag-sets"])


def _tagset_to_schema(ts: models.TagSet) -> schemas.TagSetRead:
    return schemas.TagSetRead(
        id=ts.id,
        name=ts.name,
        description=ts.description,
        category_id=ts.category_id,
        tags=json.loads(ts.tags) if ts.tags else [],
        created_at=ts.created_at,
    )


@router.get("", response_model=list[schemas.TagSetRead])
def list_tag_sets(category_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.TagSet)
    if category_id is not None:
        q = q.filter(models.TagSet.category_id == category_id)
    return [_tagset_to_schema(ts) for ts in q.order_by(models.TagSet.id.desc()).all()]


@router.post("", response_model=schemas.TagSetRead, status_code=status.HTTP_201_CREATED)
def create_tag_set(payload: schemas.TagSetCreate, db: Session = Depends(get_db)):
    ts = models.TagSet(
        name=payload.name,
        description=payload.description,
        category_id=payload.category_id,
        tags=json.dumps(payload.tags),
    )
    db.add(ts)
    db.commit()
    db.refresh(ts)
    return _tagset_to_schema(ts)


@router.put("/{tag_set_id}", response_model=schemas.TagSetRead)
def update_tag_set(tag_set_id: int, payload: schemas.TagSetCreate, db: Session = Depends(get_db)):
    ts = db.query(models.TagSet).filter(models.TagSet.id == tag_set_id).first()
    if not ts:
        raise HTTPException(status_code=404, detail="TagSet not found")
    ts.name = payload.name
    ts.description = payload.description
    ts.category_id = payload.category_id
    ts.tags = json.dumps(payload.tags)
    db.commit()
    db.refresh(ts)
    return _tagset_to_schema(ts)


@router.delete("/{tag_set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag_set(tag_set_id: int, db: Session = Depends(get_db)):
    ts = db.query(models.TagSet).filter(models.TagSet.id == tag_set_id).first()
    if not ts:
        raise HTTPException(status_code=404, detail="TagSet not found")
    db.delete(ts)
    db.commit()
