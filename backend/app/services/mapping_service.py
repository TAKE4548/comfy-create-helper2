"""Service for StageMaster cascade operations and mapping role derivations."""
import json
import logging
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app import models
from app.schemas.mapping import (
    CascadePreviewResponse,
    CascadeRenameRequest,
    StageMasterRead,
)

logger = logging.getLogger(__name__)


class MappingService:
    @staticmethod
    def preview_cascade(db: Session, stage_id: int, new_suffix: str) -> CascadePreviewResponse:
        """Preview affected variants, presets, and snapshots before cascade rename."""
        stage = db.query(models.StageMaster).filter(models.StageMaster.id == stage_id).first()
        if not stage:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ステージが見つかりません")

        role_diffs: list[dict] = []
        seen_diffs: set[tuple[str, str]] = set()
        old_roles_set: set[str] = set()
        affected_variants = 0

        for variant in stage.variants:
            old_role = variant.computed_role
            if variant.custom_role_override:
                if stage.suffix and stage.suffix in variant.custom_role_override:
                    new_role = variant.custom_role_override.replace(stage.suffix, new_suffix)
                else:
                    new_role = variant.custom_role_override
            else:
                base = variant.master.base_key if variant.master else ""
                new_role = f"{base}{new_suffix}"

            if old_role != new_role:
                affected_variants += 1
                old_roles_set.add(old_role)
                diff_pair = (old_role, new_role)
                if diff_pair not in seen_diffs:
                    seen_diffs.add(diff_pair)
                    role_diffs.append({"old_role": old_role, "new_role": new_role})

        affected_presets = 0
        if old_roles_set:
            presets = db.query(models.WorkflowPreset).all()
            for p in presets:
                if not p.param_values:
                    continue
                try:
                    val_dict = json.loads(p.param_values)
                    if any(r in val_dict for r in old_roles_set):
                        affected_presets += 1
                except Exception:
                    pass

        affected_snapshots = 0
        if old_roles_set:
            snapshots = db.query(models.Snapshot).all()
            for s in snapshots:
                if not s.params:
                    continue
                try:
                    val_dict = json.loads(s.params)
                    if any(r in val_dict for r in old_roles_set):
                        affected_snapshots += 1
                except Exception:
                    pass

        return CascadePreviewResponse(
            stage_id=stage.id,
            old_suffix=stage.suffix,
            new_suffix=new_suffix,
            affected_variants_count=affected_variants,
            affected_presets_count=affected_presets,
            affected_snapshots_count=affected_snapshots,
            role_diffs=role_diffs,
        )

    @staticmethod
    def execute_cascade_rename(db: Session, stage_id: int, req: CascadeRenameRequest) -> StageMasterRead:
        """Execute atomic cascade rename under row lock within a single transaction."""
        stage = (
            db.query(models.StageMaster)
            .with_for_update()
            .filter(models.StageMaster.id == stage_id)
            .first()
        )
        if not stage:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ステージが見つかりません")

        role_map: dict[str, str] = {}
        for variant in stage.variants:
            old_role = variant.computed_role
            if variant.custom_role_override:
                if stage.suffix and stage.suffix in variant.custom_role_override:
                    new_role = variant.custom_role_override.replace(stage.suffix, req.new_suffix)
                    variant.custom_role_override = new_role
                else:
                    new_role = variant.custom_role_override
            else:
                base = variant.master.base_key if variant.master else ""
                new_role = f"{base}{req.new_suffix}"

            if old_role != new_role:
                role_map[old_role] = new_role

        if req.update_presets and role_map:
            presets = db.query(models.WorkflowPreset).all()
            for preset in presets:
                if not preset.param_values:
                    continue
                try:
                    val_dict = json.loads(preset.param_values)
                    changed = False
                    for old_r, new_r in role_map.items():
                        if old_r in val_dict:
                            val_dict[new_r] = val_dict.pop(old_r)
                            changed = True
                    if changed:
                        preset.param_values = json.dumps(val_dict, ensure_ascii=False)
                except Exception:
                    pass

                if preset.applied_assets:
                    try:
                        asset_dict = json.loads(preset.applied_assets)
                        asset_changed = False
                        for old_r, new_r in role_map.items():
                            if old_r in asset_dict:
                                asset_dict[new_r] = asset_dict.pop(old_r)
                                asset_changed = True
                        if asset_changed:
                            preset.applied_assets = json.dumps(asset_dict, ensure_ascii=False)
                    except Exception:
                        pass

        if req.update_snapshots and role_map:
            snapshots = db.query(models.Snapshot).all()
            for snap in snapshots:
                if not snap.params:
                    continue
                try:
                    val_dict = json.loads(snap.params)
                    changed = False
                    for old_r, new_r in role_map.items():
                        if old_r in val_dict:
                            val_dict[new_r] = val_dict.pop(old_r)
                            changed = True
                    if changed:
                        snap.params = json.dumps(val_dict, ensure_ascii=False)
                except Exception:
                    pass

        old_suffix = stage.suffix
        prev_list: list[str] = []
        if stage.previous_suffixes:
            try:
                prev_list = json.loads(stage.previous_suffixes)
                if not isinstance(prev_list, list):
                    prev_list = []
            except Exception:
                prev_list = []

        if old_suffix != req.new_suffix:
            if old_suffix in prev_list:
                prev_list.remove(old_suffix)
            prev_list.insert(0, old_suffix)
            prev_list = prev_list[:10]
            stage.previous_suffixes = json.dumps(prev_list, ensure_ascii=False)

        stage.suffix = req.new_suffix

        try:
            db.commit()
            db.refresh(stage)
        except Exception as exc:
            db.rollback()
            logger.error("Failed to execute cascade rename: %s", exc)
            raise exc

        return StageMasterRead.model_validate(stage)

    @staticmethod
    def get_stage_usage_count(db: Session, stage_id: int) -> int:
        """Count active workflow mappings attached to this stage's variants."""
        return (
            db.query(models.WorkflowMapping)
            .join(models.MappingVariant, models.WorkflowMapping.variant_id == models.MappingVariant.id)
            .filter(models.MappingVariant.stage_id == stage_id)
            .count()
        )

    @staticmethod
    def validate_stage_deletion(stage: models.StageMaster, usage_count: int) -> None:
        """Validate 3-layer deletion guards (is_builtin and usage_count > 0)."""
        if stage.is_builtin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="システム既定のステージは削除できません",
            )
        if usage_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"現在 {usage_count} 件で使用中のため削除できません",
            )

    # Aliases
    preview_cascade_rename = preview_cascade
    validate_deletion = validate_stage_deletion


# Module-level exports
preview_cascade_rename = MappingService.preview_cascade
execute_cascade_rename = MappingService.execute_cascade_rename
validate_stage_deletion = MappingService.validate_stage_deletion
