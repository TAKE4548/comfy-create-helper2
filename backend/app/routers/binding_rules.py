"""Binding rules API router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/binding-rules", tags=["binding-rules"])


def _to_rule_set_read(rule_set: models.BindingRuleSet) -> schemas.BindingRuleSetRead:
    roles = [
        v.role or v.computed_role
        for v in (rule_set.variants or [])
        if (v.role or v.computed_role)
    ]
    entries = [
        schemas.BindingRuleEntryRead.model_validate(e)
        for e in (rule_set.entries or [])
    ]
    return schemas.BindingRuleSetRead(
        id=rule_set.id,
        name=rule_set.name,
        entries=entries,
        referenced_roles=roles,
    )


@router.get("", response_model=list[schemas.BindingRuleSetRead])
def list_binding_rule_sets(db: Session = Depends(get_db)):
    rule_sets = db.query(models.BindingRuleSet).order_by(models.BindingRuleSet.id).all()
    return [_to_rule_set_read(rs) for rs in rule_sets]


@router.post("", response_model=schemas.BindingRuleSetRead, status_code=status.HTTP_201_CREATED)
def create_binding_rule_set(payload: schemas.BindingRuleSetCreate, db: Session = Depends(get_db)):
    existing = db.query(models.BindingRuleSet).filter(models.BindingRuleSet.name == payload.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Rule set with name '{payload.name}' already exists",
        )

    rule_set = models.BindingRuleSet(name=payload.name)
    db.add(rule_set)
    db.flush()

    if payload.entries:
        for entry_in in payload.entries:
            db.add(models.BindingRuleEntry(
                rule_set_id=rule_set.id,
                class_type=entry_in.class_type,
                param_name=entry_in.param_name,
                priority=entry_in.priority,
            ))

    db.commit()
    db.refresh(rule_set)
    return _to_rule_set_read(rule_set)


@router.get("/{rule_set_id}", response_model=schemas.BindingRuleSetRead)
def get_binding_rule_set(rule_set_id: int, db: Session = Depends(get_db)):
    rule_set = db.query(models.BindingRuleSet).filter(models.BindingRuleSet.id == rule_set_id).first()
    if not rule_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BindingRuleSet not found")
    return _to_rule_set_read(rule_set)


@router.put("/{rule_set_id}", response_model=schemas.BindingRuleSetRead)
def update_binding_rule_set(
    rule_set_id: int,
    payload: schemas.BindingRuleSetUpdate,
    db: Session = Depends(get_db),
):
    rule_set = db.query(models.BindingRuleSet).filter(models.BindingRuleSet.id == rule_set_id).first()
    if not rule_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BindingRuleSet not found")

    if payload.name is not None and payload.name != rule_set.name:
        existing = db.query(models.BindingRuleSet).filter(
            models.BindingRuleSet.name == payload.name,
            models.BindingRuleSet.id != rule_set_id,
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Rule set with name '{payload.name}' already exists",
            )
        rule_set.name = payload.name

    if payload.entries is not None:
        db.query(models.BindingRuleEntry).filter(
            models.BindingRuleEntry.rule_set_id == rule_set_id
        ).delete()
        for entry_in in payload.entries:
            db.add(models.BindingRuleEntry(
                rule_set_id=rule_set_id,
                class_type=entry_in.class_type,
                param_name=entry_in.param_name,
                priority=entry_in.priority,
            ))

    db.commit()
    db.refresh(rule_set)
    return _to_rule_set_read(rule_set)


@router.delete("/{rule_set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_binding_rule_set(rule_set_id: int, db: Session = Depends(get_db)):
    rule_set = db.query(models.BindingRuleSet).filter(models.BindingRuleSet.id == rule_set_id).first()
    if not rule_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BindingRuleSet not found")

    referencing_variants = db.query(models.MappingVariant).filter(
        models.MappingVariant.binding_rule_set_id == rule_set_id
    ).all()
    if referencing_variants:
        roles = [vs.role or vs.computed_role for vs in referencing_variants if (vs.role or vs.computed_role)]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Cannot delete rule set currently in use", "referenced_roles": roles},
        )

    db.delete(rule_set)
    db.commit()
    return None


@router.post("/{rule_set_id}/entries", response_model=schemas.BindingRuleEntryRead, status_code=status.HTTP_201_CREATED)
def add_binding_rule_entry(
    rule_set_id: int,
    payload: schemas.BindingRuleEntryCreate,
    db: Session = Depends(get_db),
):
    rule_set = db.query(models.BindingRuleSet).filter(models.BindingRuleSet.id == rule_set_id).first()
    if not rule_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BindingRuleSet not found")

    entry = models.BindingRuleEntry(
        rule_set_id=rule_set_id,
        class_type=payload.class_type,
        param_name=payload.param_name,
        priority=payload.priority,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return schemas.BindingRuleEntryRead.model_validate(entry)


@router.delete("/{rule_set_id}/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_binding_rule_entry(
    rule_set_id: int,
    entry_id: int,
    db: Session = Depends(get_db),
):
    entry = db.query(models.BindingRuleEntry).filter(
        models.BindingRuleEntry.id == entry_id,
        models.BindingRuleEntry.rule_set_id == rule_set_id,
    ).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BindingRuleEntry not found")

    db.delete(entry)
    db.commit()
    return None

