"""LLM Audit router."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.services import llm_service

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.post("", response_model=schemas.AuditResult)
async def run_audit(payload: schemas.AuditRequest, db: Session = Depends(get_db)):
    # Load system prompts from DB
    prompt_rows = db.query(models.LlmPrompt).all()
    system_prompts = {row.key: row.content for row in prompt_rows}

    # Load and parse llm_params_audit
    params_record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "llm_params_audit").first()
    llm_params = None
    if params_record and params_record.content:
        import json
        try:
            llm_params = json.loads(params_record.content)
        except Exception:
            pass

    raw_result = await llm_service.run_audit(
        audit_types=payload.audit_types,
        positive=payload.positive,
        negative=payload.negative,
        intent=payload.intent,
        model_hint=payload.model_hint,
        system_prompts=system_prompts,
    )

    result = schemas.AuditResult()
    if "interference" in raw_result:
        result.interference = [
            schemas.InterferenceItem(**item) for item in raw_result["interference"]
        ]
    if "vocabulary" in raw_result:
        result.vocabulary = [
            schemas.VocabularyItem(**item) for item in raw_result["vocabulary"]
        ]
    if "physical" in raw_result:
        p = raw_result["physical"]
        result.physical = schemas.PhysicalResult(
            status=p.get("status", "unknown"),
            note=p.get("note"),
            alternatives=p.get("alternatives", []),
        )
    return result
