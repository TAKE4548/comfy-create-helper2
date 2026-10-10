"""Database seeder — populates initial data on first startup."""

import json
import logging
from datetime import datetime, timezone

from app import models
from app.seed_data import (
    LORA_CATEGORY_SEEDS,
    LLM_PROMPT_SEEDS,
    MAPPING_MASTER_SEEDS,
    TAGSET_CATEGORY_SEEDS,
    WORKFLOW_1_MAPPING_CORRECTIONS,
)

logger = logging.getLogger(__name__)


def seed_initial_data(db) -> None:
    """Insert initial data if tables are empty."""
    _seed_mapping_masters(db)
    _seed_llm_prompts(db)
    _seed_categories(db)
    _seed_base_models(db)
    _migrate_existing_loras(db)
    _apply_workflow_1_corrections(db)
    db.commit()


# ─── Private helpers ──────────────────────────────────────────────

DEFAULT_GROUP_SEEDS = [
    {"key": "prompt", "name": "プロンプト系", "sort_order": 1, "is_builtin": True, "is_active": True},
    {"key": "sampler", "name": "サンプラー系", "sort_order": 2, "is_builtin": True, "is_active": True},
    {"key": "model", "name": "モデル・基盤", "sort_order": 3, "is_builtin": True, "is_active": True},
    {"key": "latent", "name": "Latent・画像", "sort_order": 4, "is_builtin": True, "is_active": True},
    {"key": "controlnet", "name": "ControlNet・補助", "sort_order": 5, "is_builtin": True, "is_active": True},
    {"key": "etc", "name": "その他", "sort_order": 6, "is_builtin": True, "is_active": True},
]

DEFAULT_STAGE_SEEDS = [
    {"key": "main", "name": "通常 / Main", "suffix": "", "search_keywords": json.dumps(["main", "primary"]), "previous_suffixes": "[]", "sort_order": 1, "is_builtin": True, "is_active": True},
    {"key": "rough", "name": "Rough", "suffix": "_rough", "search_keywords": json.dumps(["rough", "draft", "1st"]), "previous_suffixes": "[]", "sort_order": 2, "is_builtin": True, "is_active": True},
    {"key": "detail", "name": "Detail", "suffix": "_detail", "search_keywords": json.dumps(["detail", "refiner", "2nd", "hires"]), "previous_suffixes": "[]", "sort_order": 3, "is_builtin": True, "is_active": True},
]


def _seed_mapping_groups(db) -> None:
    for g in DEFAULT_GROUP_SEEDS:
        existing = db.query(models.MappingGroupMaster).filter(
            models.MappingGroupMaster.key == g["key"]
        ).first()
        if not existing:
            db.add(models.MappingGroupMaster(**g))
            logger.info(f"Added mapping group: {g['key']}")


def _seed_stage_masters(db) -> None:
    for s in DEFAULT_STAGE_SEEDS:
        existing = db.query(models.StageMaster).filter(
            models.StageMaster.key == s["key"]
        ).first()
        if not existing:
            db.add(models.StageMaster(**s))
            logger.info(f"Added stage master: {s['key']}")


def _seed_mapping_masters(db) -> None:
    _seed_mapping_groups(db)
    _seed_stage_masters(db)
    db.flush()

    groups_map = {g.key: g.id for g in db.query(models.MappingGroupMaster).all()}
    main_stage = db.query(models.StageMaster).filter(models.StageMaster.key == "main").first()

    for idx, m in enumerate(MAPPING_MASTER_SEEDS):
        role = str(m["role"])
        existing = db.query(models.MappingMaster).filter(
            (models.MappingMaster.base_key == role) | (models.MappingMaster.role == role)
        ).first()

        r_lower = role.lower()
        if "prompt" in r_lower:
            group_id = groups_map.get("prompt")
        elif any(k in r_lower for k in ["sampler", "seed", "step", "cfg", "denoise", "fdetailer"]):
            group_id = groups_map.get("sampler")
        elif any(k in r_lower for k in ["lora", "model", "checkpoint"]):
            group_id = groups_map.get("model")
        elif any(k in r_lower for k in ["latent", "vae", "image"]):
            group_id = groups_map.get("latent")
        elif "controlnet" in r_lower:
            group_id = groups_map.get("controlnet")
        else:
            group_id = groups_map.get("etc")

        if not existing:
            master = models.MappingMaster(
                group_id=group_id,
                base_key=role,
                name=m["display_name"],
                role=role,
                expected_class_types=json.dumps(m["expected_class_types"]),
                param_name=m["param_name"],
                input_type=m["input_type"],
                display_name=m["display_name"],
                base_title_patterns=json.dumps(m["title_patterns"]),
                title_patterns=json.dumps(m["title_patterns"]),
                sort_order=idx,
            )
            db.add(master)
            db.flush()
            logger.info(f"Added mapping master: {role}")
        else:
            master = existing
            if not master.base_key:
                master.base_key = role
            if not master.name:
                master.name = m["display_name"]
            if not master.group_id:
                master.group_id = group_id
            if not master.base_title_patterns:
                master.base_title_patterns = json.dumps(m["title_patterns"])

        if main_stage:
            variant = db.query(models.MappingVariant).filter(
                models.MappingVariant.master_id == master.id,
                models.MappingVariant.stage_id == main_stage.id,
            ).first()
            if not variant:
                db.add(models.MappingVariant(
                    master_id=master.id,
                    stage_id=main_stage.id,
                    custom_role_override=None,
                    extra_title_patterns=json.dumps([]),
                    is_enabled=True,
                    sort_order=0,
                ))
                logger.info(f"Added default main variant for master: {master.base_key}")


def _seed_llm_prompts(db) -> None:
    for seed in LLM_PROMPT_SEEDS:
        existing = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == seed["key"]).first()
        if not existing:
            db.add(models.LlmPrompt(
                key=seed["key"],
                content=seed["content"],
                description=seed["description"],
                updated_at=datetime.now(timezone.utc),
            ))
            logger.info(f"Seeded LLM prompt: {seed['key']}")


def _seed_categories(db) -> None:
    if db.query(models.LoraCategory).count() == 0:
        for name in LORA_CATEGORY_SEEDS:
            db.add(models.LoraCategory(name=name))
        logger.info("Seeded lora_categories table.")

    if db.query(models.TagsetCategory).count() == 0:
        for name in TAGSET_CATEGORY_SEEDS:
            db.add(models.TagsetCategory(name=name))
        logger.info("Seeded tagset_categories table.")


def _apply_workflow_1_corrections(db) -> None:
    """Apply one-time mapping corrections for workflow ID=1."""
    workflow = db.query(models.Workflow).filter(models.Workflow.id == 1).first()
    if not workflow:
        return
    for node_id, role in WORKFLOW_1_MAPPING_CORRECTIONS.items():
        master = db.query(models.MappingMaster).filter(
            (models.MappingMaster.role == role) | (models.MappingMaster.base_key == role)
        ).first()
        if not master:
            continue
        variant = db.query(models.MappingVariant).filter(
            models.MappingVariant.master_id == master.id
        ).first()
        variant_id = variant.id if variant else None

        mapping = db.query(models.WorkflowMapping).filter(
            models.WorkflowMapping.workflow_id == 1,
            models.WorkflowMapping.node_id == node_id,
        ).first()
        if mapping:
            if mapping.master_id != master.id or (variant_id and mapping.variant_id != variant_id):
                mapping.master_id = master.id
                if variant_id:
                    mapping.variant_id = variant_id
                logger.info(f"Updated mapping for node {node_id} to {role} (master_id: {master.id}, variant_id: {variant_id})")
        else:
            db.add(models.WorkflowMapping(
                workflow_id=1,
                master_id=master.id,
                variant_id=variant_id,
                node_id=node_id,
            ))
            logger.info(f"Created mapping for node {node_id} to {role} (master_id: {master.id}, variant_id: {variant_id})")


def _seed_base_models(db) -> None:
    if db.query(models.BaseModel).count() == 0:
        default_models = ["Illus", "Noob", "Anima"]
        for name in default_models:
            db.add(models.BaseModel(name=name))
        db.commit()
        logger.info("Seeded default base models: Illus, Noob, Anima")


def _migrate_existing_loras(db) -> None:
    illus_model = db.query(models.BaseModel).filter(models.BaseModel.name == "Illus").first()
    if not illus_model:
        return
        
    loras = db.query(models.Lora).all()
    migrated_count = 0
    for lora in loras:
        if not lora.base_models:
            lora.base_models.append(illus_model)
            migrated_count += 1
            
    if migrated_count > 0:
        db.commit()
        logger.info(f"Migrated {migrated_count} existing loras to 'Illus' base model.")

