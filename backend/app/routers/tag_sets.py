"""TagSets router."""

import json
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/tag-sets", tags=["tag-sets"])


def _tagset_to_schema(ts: models.TagSet, db: Session) -> schemas.TagSetRead:
    snapshot_paths = [
        r[0] for r in (
            db.query(models.Snapshot.image_path)
            .join(models.SnapshotTagSet, models.SnapshotTagSet.snapshot_id == models.Snapshot.id)
            .filter(models.SnapshotTagSet.tag_set_id == ts.id)
            .filter(models.Snapshot.image_path.isnot(None))
            .filter(models.Snapshot.image_path != "")
            .order_by(models.Snapshot.created_at.desc(), models.Snapshot.id.desc())
            .all()
        )
    ]
    subsets = [
        schemas.tag_set.TagSubsetRead(
            id=s.id,
            tag_set_id=s.tag_set_id,
            name=s.name,
            tags=json.loads(s.tags) if s.tags else []
        )
        for s in ts.subsets
    ]
    return schemas.TagSetRead(
        id=ts.id,
        name=ts.name,
        description=ts.description,
        category_id=ts.category_id,
        tags=json.loads(ts.tags) if ts.tags else [],
        thumbnail_path=ts.thumbnail_path,
        snapshot_paths=snapshot_paths,
        sort_order=ts.sort_order,
        created_at=ts.created_at,
        subsets=subsets,
        target_base_model_ids=[bm.id for bm in ts.base_models],
    )


@router.get("", response_model=list[schemas.TagSetRead])
def list_tag_sets(category_id: Optional[int] = None, base_model_ids: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.TagSet)
    if category_id is not None:
        q = q.filter(models.TagSet.category_id == category_id)
        
    ids = []
    if base_model_ids:
        try:
            ids = [int(x) for x in base_model_ids.split(",") if x.strip()]
        except ValueError:
            pass
            
    if ids:
        q = q.join(models.TagSet.base_models).filter(models.BaseModel.id.in_(ids)).distinct()
        
    return [_tagset_to_schema(ts, db) for ts in q.order_by(models.TagSet.sort_order, models.TagSet.id).all()]


@router.post("", response_model=schemas.TagSetRead, status_code=status.HTTP_201_CREATED)
def create_tag_set(payload: schemas.TagSetCreate, db: Session = Depends(get_db)):
    subsets = []
    if payload.subsets:
        for s in payload.subsets:
            subsets.append(
                models.TagSubset(
                    name=s.name,
                    tags=json.dumps(s.tags)
                )
            )
    ts = models.TagSet(
        name=payload.name,
        description=payload.description,
        category_id=payload.category_id,
        tags=json.dumps(payload.tags),
        thumbnail_path=payload.thumbnail_path,
        subsets=subsets,
    )
    if payload.target_base_model_ids:
        base_models = db.query(models.BaseModel).filter(models.BaseModel.id.in_(payload.target_base_model_ids)).all()
        ts.base_models = base_models
        
    db.add(ts)
    db.commit()
    db.refresh(ts)
    return _tagset_to_schema(ts, db)


@router.put("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_tag_sets(payload: schemas.TagSetReorder, db: Session = Depends(get_db)):
    is_category_scoped = "category_id" in payload.model_fields_set
    for idx, tag_set_id in enumerate(payload.ordered_ids):
        update_dict: dict[str, Any] = {"sort_order": idx}
        if is_category_scoped:
            update_dict["category_id"] = payload.category_id
        db.query(models.TagSet).filter(models.TagSet.id == tag_set_id).update(update_dict)
    db.commit()


@router.put("/{tag_set_id}", response_model=schemas.TagSetRead)
def update_tag_set(tag_set_id: int, payload: schemas.TagSetCreate, db: Session = Depends(get_db)):
    ts = db.query(models.TagSet).filter(models.TagSet.id == tag_set_id).first()
    if not ts:
        raise HTTPException(status_code=404, detail="TagSet not found")
    ts.name = payload.name
    ts.description = payload.description
    ts.category_id = payload.category_id
    ts.tags = json.dumps(payload.tags)
    ts.thumbnail_path = payload.thumbnail_path
    
    # Replace subsets
    ts.subsets = [
        models.TagSubset(
            name=s.name,
            tags=json.dumps(s.tags)
        )
        for s in payload.subsets
    ]
    
    if payload.target_base_model_ids is not None:
        base_models = db.query(models.BaseModel).filter(models.BaseModel.id.in_(payload.target_base_model_ids)).all()
        ts.base_models = base_models
        
    db.commit()
    db.refresh(ts)
    return _tagset_to_schema(ts, db)


@router.delete("/{tag_set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag_set(tag_set_id: int, db: Session = Depends(get_db)):
    ts = db.query(models.TagSet).filter(models.TagSet.id == tag_set_id).first()
    if not ts:
        raise HTTPException(status_code=404, detail="TagSet not found")
    db.delete(ts)
    db.commit()
