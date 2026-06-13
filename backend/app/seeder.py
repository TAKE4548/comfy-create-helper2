"""Database seeder — populates initial data on first startup."""

import json
import logging
from datetime import datetime

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
    _apply_workflow_1_corrections(db)
    db.commit()


# ─── Private helpers ──────────────────────────────────────────────

def _seed_mapping_masters(db) -> None:
    for m in MAPPING_MASTER_SEEDS:
        existing = db.query(models.MappingMaster).filter(
            models.MappingMaster.role == m["role"]
        ).first()
        if not existing:
            db.add(models.MappingMaster(
                role=m["role"],
                expected_class_types=json.dumps(m["expected_class_types"]),
                param_name=m["param_name"],
                input_type=m["input_type"],
                display_name=m["display_name"],
                title_patterns=json.dumps(m["title_patterns"]),
            ))
            logger.info(f"Added mapping master: {m['role']}")


def _seed_llm_prompts(db) -> None:
    if db.query(models.LlmPrompt).count() != 0:
        return
    for seed in LLM_PROMPT_SEEDS:
        db.add(models.LlmPrompt(
            key=seed["key"],
            content=seed["content"],
            description=seed["description"],
            updated_at=datetime.utcnow(),
        ))
    logger.info("Seeded llm_prompts table.")


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
            models.MappingMaster.role == role
        ).first()
        if not master:
            continue
        mapping = db.query(models.WorkflowMapping).filter(
            models.WorkflowMapping.workflow_id == 1,
            models.WorkflowMapping.node_id == node_id,
        ).first()
        if mapping:
            if mapping.master_id != master.id:
                mapping.master_id = master.id
                logger.info(f"Updated mapping for node {node_id} to {role} (master_id: {master.id})")
        else:
            db.add(models.WorkflowMapping(
                workflow_id=1,
                master_id=master.id,
                node_id=node_id,
            ))
            logger.info(f"Created mapping for node {node_id} to {role} (master_id: {master.id})")
