"""Categories routers (LoRA + Tagset)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

lora_router = APIRouter(prefix="/api/lora-categories", tags=["lora-categories"])
tagset_router = APIRouter(prefix="/api/tagset-categories", tags=["tagset-categories"])


# ─── LoRA Categories ─────────────────────────────────────────────

@lora_router.get("", response_model=list[schemas.CategoryRead])
def list_lora_categories(db: Session = Depends(get_db)):
    return db.query(models.LoraCategory).order_by(models.LoraCategory.name).all()


@lora_router.post("", response_model=schemas.CategoryRead, status_code=status.HTTP_201_CREATED)
def create_lora_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    cat = models.LoraCategory(name=payload.name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@lora_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lora_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(models.LoraCategory).filter(models.LoraCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="LoRA category not found")
    # ON DELETE SET NULL handles loras.category_id automatically
    db.delete(cat)
    db.commit()


@lora_router.put("/{category_id}", response_model=schemas.CategoryRead)
def update_lora_category(category_id: int, payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    cat = db.query(models.LoraCategory).filter(models.LoraCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="LoRA category not found")
    cat.name = payload.name
    db.commit()
    db.refresh(cat)
    return cat


# ─── Tagset Categories ────────────────────────────────────────────

@tagset_router.get("", response_model=list[schemas.CategoryRead])
def list_tagset_categories(db: Session = Depends(get_db)):
    return db.query(models.TagsetCategory).order_by(models.TagsetCategory.name).all()


@tagset_router.post("", response_model=schemas.CategoryRead, status_code=status.HTTP_201_CREATED)
def create_tagset_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    cat = models.TagsetCategory(name=payload.name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@tagset_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tagset_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(models.TagsetCategory).filter(models.TagsetCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Tagset category not found")
    db.delete(cat)
    db.commit()


@tagset_router.put("/{category_id}", response_model=schemas.CategoryRead)
def update_tagset_category(category_id: int, payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    cat = db.query(models.TagsetCategory).filter(models.TagsetCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Tagset category not found")
    cat.name = payload.name
    db.commit()
    db.refresh(cat)
    return cat
