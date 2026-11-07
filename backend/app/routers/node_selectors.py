#""Node selectors API router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/node-selectors", tags=["node-selectors"])


def _to_selector_read(selector: models.NodeSelector) -> schemas.NodeSelectorRead:
    roles = [
        v.role or v.computed_role
        for v in (selector.variants or [])
        if (v.role or v.computed_role)
    ]

    patterns = [
        schemas.NodeSelectorPatternRead.model_validate(p)
        for p in (selector.patterns or [])
    ]
    return schemas.NodeSelectorRead(
        id=selector.id,
        name=selector.name,
        patterns=patterns,
        referenced_roles=roles,
    )


@router.get("", response_model=list[schemas.NodeSelectorRead])
def list_node_selectors(db: Session = Depends(get_db)):
    selectors = db.query(models.NodeSelector).order_by(models.NodeSelector.id).all()
    return [_to_selector_read(s) for s in selectors]


@router.post("", response_model=schemas.NodeSelectorRead, status_code=status.HTTP_201_CREATED)
def create_node_selector(payload: schemas.NodeSelectorCreate, db: Session = Depends(get_db)):
    existing = db.query(models.NodeSelector).filter(models.NodeSelector.name == payload.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Node selector with name '{payload.name}' already exists",
        )

    selector = models.NodeSelector(name=payload.name)
    db.add(selector)
    db.flush()

    if payload.patterns:
        for pattern_in in payload.patterns:
            db.add(models.NodeSelectorPattern(
                selector_id=selector.id,
                pattern=pattern_in.pattern,
                match_type=pattern_in.match_type,
                priority=pattern_in.priority,
            ))

    db.commit()
    db.refresh(selector)
    return _to_selector_read(selector)


@router.get("/{selector_id}", response_model=schemas.NodeSelectorRead)
def get_node_selector(selector_id: int, db: Session = Depends(get_db)):
    selector = db.query(models.NodeSelector).filter(models.NodeSelector.id == selector_id).first()
    if not selector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NodeSelector not found")
    return _to_selector_read(selector)



@router.put("/{selector_id}", response_model=schemas.NodeSelectorRead)
def update_node_selector(
    selector_id: int,
    payload: schemas.NodeSelectorUpdate,
    db: Session = Depends(get_db),
):
    selector = db.query(models.NodeSelector).filter(models.NodeSelector.id == selector_id).first()
    if not selector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NodeSelector not found")

    if payload.name is not None and payload.name != selector.name:
        existing = db.query(models.NodeSelector).filter(
            models.NodeSelector.name == payload.name,
            models.NodeSelector.id != selector_id,
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Node selector with name '{payload.name}' already exists",
            )
        selector.name = payload.name

    if payload.patterns is not None:
        db.query(models.NodeSelectorPattern).filter(
            models.NodeSelectorPattern.selector_id == selector_id
        ).delete()
        for pattern_in in payload.patterns:
            db.add(models.NodeSelectorPattern(
                selector_id=selector_id,
                pattern=pattern_in.pattern,
                match_type=pattern_in.match_type,
                priority=pattern_in.priority,
            ))

    db.commit()
    db.refresh(selector)
    return _to_selector_read(selector)


@router.delete("/{selector_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_node_selector(selector_id: int, db: Session = Depends(get_db)):
    selector = db.query(models.NodeSelector).filter(models.NodeSelector.id == selector_id).first()
    if not selector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NodeSelector not found")

    referencing_variants = db.query(models.MappingVariant).filter(
        models.MappingVariant.node_selector_id == selector_id
    ).all()
    if referencing_variants:
        roles = [vs.role or vs.computed_role for vs in referencing_variants if (vs.role or vs.computed_role)]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Cannot delete node selector currently in use", "referenced_roles": roles},
        )

    db.delete(selector)
    db.commit()
    return None



@router.post("/{selector_id}/patterns", response_model=schemas.NodeSelectorPatternRead, status_code=status.HTTP_201_CREATED)
def add_node_selector_pattern(
    selector_id: int,
    payload: schemas.NodeSelectorPatternCreate,
    db: Session = Depends(get_db),
):
    selector = db.query(models.NodeSelector).filter(models.NodeSelector.id == selector_id).first()
    if not selector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NodeSelector not found")

    pattern = models.NodeSelectorPattern(
        selector_id=selector_id,
        pattern=payload.pattern,
        match_type=payload.match_type,
        priority=payload.priority,
    )
    db.add(pattern)
    db.commit()
    db.refresh(pattern)
    return schemas.NodeSelectorPatternRead.model_validate(pattern)


@router.delete("/{selector_id}/patterns/{pattern_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_node_selector_pattern(
    selector_id: int,
    pattern_id: int,
    db: Session = Depends(get_db),
):
    pattern = db.query(models.NodeSelectorPattern).filter(
        models.NodeSelectorPattern.id == pattern_id,
        models.NodeSelectorPattern.selector_id == selector_id,
    ).first()
    if not pattern:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NodeSelectorPattern not found")

    db.delete(pattern)
    db.commit()
    return None

