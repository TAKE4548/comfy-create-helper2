import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.schemas.dataset import (
    DatasetProjectCreate,
    DatasetProjectUpdate,
    DatasetProjectResponse,
    DatasetItemCreate,
    DatasetItemUpdate,
    DatasetItemResponse,
    OutfitMasterPresetResponse,
)
from app.services.matrix_service import MatrixService

router = APIRouter(prefix="/api/dataset", tags=["dataset"])


class DatasetExportRequest(BaseModel):
    export_dir: Optional[str] = None
    output_dir: Optional[str] = None
    status_filter: Optional[str] = "APPROVED"


@router.post("/projects", response_model=DatasetProjectResponse)
def create_dataset_project(payload: DatasetProjectCreate, db: Session = Depends(get_db)):
    project = models.DatasetProject(
        name=payload.name,
        character_trigger=payload.character_trigger,
        outfit_trigger=payload.outfit_trigger,
        workflow_id=payload.workflow_id,
        prompt_meta=payload.prompt_meta,
        prompt_physical=payload.prompt_physical,
        prompt_exclusive_outfit=payload.prompt_exclusive_outfit,
        selected_alt_outfits=payload.selected_alt_outfits,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects", response_model=List[DatasetProjectResponse])
def list_dataset_projects(db: Session = Depends(get_db)):
    return db.query(models.DatasetProject).order_by(models.DatasetProject.id.desc()).all()


@router.get("/projects/{project_id}", response_model=DatasetProjectResponse)
def get_dataset_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.DatasetProject, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Dataset project not found")
    return project


@router.put("/projects/{project_id}", response_model=DatasetProjectResponse)
def update_dataset_project(project_id: int, payload: DatasetProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(models.DatasetProject, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Dataset project not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}")
def delete_dataset_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.DatasetProject, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Dataset project not found")
    db.delete(project)
    db.commit()
    return {"message": "Dataset project deleted successfully", "id": project_id}


@router.get("/outfits", response_model=List[OutfitMasterPresetResponse])
def list_outfit_presets(category: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.OutfitMasterPreset)
    if category:
        query = query.filter(models.OutfitMasterPreset.category == category)
    return query.all()


@router.post("/projects/{project_id}/matrix", response_model=List[DatasetItemResponse])
def generate_project_matrix(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.DatasetProject, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Dataset project not found")

    alt_outfits: List[Dict[str, Any]] = []
    if project.selected_alt_outfits:
        try:
            raw_alts = json.loads(project.selected_alt_outfits)
            if isinstance(raw_alts, list):
                for item in raw_alts:
                    if isinstance(item, int):
                        preset = db.get(models.OutfitMasterPreset, item)
                        if preset:
                            alt_outfits.append({
                                "id": preset.id,
                                "name": preset.name,
                                "prompt_tags": preset.prompt_tags,
                            })
                    elif isinstance(item, dict):
                        alt_outfits.append(item)
                    elif isinstance(item, str):
                        alt_outfits.append({"prompt_tags": item})
        except Exception:
            pass

    db.query(models.DatasetItem).filter(models.DatasetItem.project_id == project_id).delete()

    slots = MatrixService.generate_orthogonal_matrix(
        meta_prompt=project.prompt_meta,
        physical_prompt=project.prompt_physical,
        default_outfit_prompt=project.prompt_exclusive_outfit,
        alt_outfits=alt_outfits,
        total_slots=20,
    )

    created_items = []
    for slot in slots:
        item = models.DatasetItem(
            project_id=project.id,
            slot_index=slot["slot_index"],
            factors_json=json.dumps(slot["factors"], ensure_ascii=False),
            raw_prompt=slot["raw_prompt"],
            caption_text=slot.get("caption_text", slot["raw_prompt"]),
            seed=slot["seed"],
            status=slot.get("status", "APPROVED"),
        )
        db.add(item)
        created_items.append(item)

    db.commit()
    for item in created_items:
        db.refresh(item)
    return created_items


@router.patch("/items/{item_id}", response_model=DatasetItemResponse)
def update_dataset_item(item_id: int, payload: DatasetItemUpdate, db: Session = Depends(get_db)):
    item = db.get(models.DatasetItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Dataset item not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.post("/projects/{project_id}/export")
def export_dataset_project(
    project_id: int,
    payload: Optional[DatasetExportRequest] = None,
    export_dir: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    project = db.get(models.DatasetProject, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Dataset project not found")

    target_dir_str = export_dir
    if payload:
        if payload.export_dir:
            target_dir_str = payload.export_dir
        elif payload.output_dir:
            target_dir_str = payload.output_dir

    if not target_dir_str:
        target_dir_str = f"data/datasets/{project.id}_{project.name}"

    out_path = Path(target_dir_str)
    out_path.mkdir(parents=True, exist_ok=True)

    items = (
        db.query(models.DatasetItem)
        .filter(models.DatasetItem.project_id == project_id)
        .order_by(models.DatasetItem.slot_index.asc())
        .all()
    )

    status_filter = payload.status_filter if payload and payload.status_filter else "APPROVED"

    exported_files = []
    for item in items:
        if status_filter and item.status != status_filter:
            continue
        caption = item.caption_text or item.raw_prompt or ""

        if item.image_path and os.path.exists(item.image_path):
            img_p = Path(item.image_path)
            dest_img = out_path / img_p.name
            if str(dest_img.resolve()) != str(img_p.resolve()):
                shutil.copy2(img_p, dest_img)
            txt_path = out_path / f"{img_p.stem}.txt"
            txt_path.write_text(caption, encoding="utf-8")
            exported_files.append(str(dest_img))
            exported_files.append(str(txt_path))
        else:
            base_name = f"{item.slot_index:03d}"
            txt_path = out_path / f"{base_name}.txt"
            txt_path.write_text(caption, encoding="utf-8")
            exported_files.append(str(txt_path))

    return {
        "status": "success",
        "project_id": project.id,
        "export_dir": str(out_path.resolve()),
        "item_count": len([i for i in items if not status_filter or i.status == status_filter]),
        "exported_files": exported_files,
    }
