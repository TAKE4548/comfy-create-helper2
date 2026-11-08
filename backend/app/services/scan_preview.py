"""Non-persistent scan preview using unsaved (draft) variant definitions.

Only reads the workflow and the stage masters. Draft definitions are turned into
transient dataclass objects, so no ORM object is created, mutated, added or flushed.
"""

import json
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.schemas.mapping import (
    ScanPreviewCandidate,
    ScanPreviewRequest,
    ScanPreviewResponse,
    ScanPreviewVariantResult,
)
from app.services.workflow_scanner import scan_master_variants_detailed

_STAGE_LABELS = {1: "exact", 2: "contains", 3: "no_selector"}


@dataclass
class _Stage:
    id: int
    key: str
    sort_order: int
    suffix: str = ""


@dataclass
class _Entry:
    class_type: str
    param_name: str
    priority: int = 1


@dataclass
class _RuleSet:
    entries: list[_Entry] = field(default_factory=list)


@dataclass
class _Pattern:
    pattern: str
    match_type: str
    priority: int = 1


@dataclass
class _Selector:
    patterns: list[_Pattern] = field(default_factory=list)


@dataclass
class _Variant:
    id: int
    stage_id: int
    stage: _Stage
    role: str
    is_enabled: bool
    binding_rule_set: _RuleSet
    node_selector: Optional[_Selector]
    client_key: str
    variant_id: Optional[int]
    master_id: int = 0
    sort_order: int = 0


def _to_candidate(c: dict[str, Any]) -> ScanPreviewCandidate:
    return ScanPreviewCandidate(
        node_id=c["node_id"],
        node_title=c["node_title"],
        class_type=c["class_type"],
        input_name=c["input_name"],
        stage_rank=c["stage_rank"],
        stage_label=_STAGE_LABELS[c["stage_rank"]],  # type: ignore[arg-type]
        entry_priority=c["entry_priority"],
        pattern_priority=c["pattern_priority"],
    )


def run_scan_preview(db: Session, payload: ScanPreviewRequest) -> ScanPreviewResponse:
    workflow = db.query(models.Workflow).filter(models.Workflow.id == payload.workflow_id).first()
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    try:
        workflow_json = json.loads(workflow.json_body)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Workflow json_body is not valid JSON")
    if not isinstance(workflow_json, dict):
        raise HTTPException(status_code=422, detail="Workflow json_body must be a JSON object")

    stage_rows = {
        s.id: _Stage(id=s.id, key=s.key, sort_order=s.sort_order, suffix=s.suffix or "")
        for s in db.query(models.StageMaster).all()
    }

    drafts: list[_Variant] = []
    for idx, item in enumerate(payload.variants):
        stage = stage_rows.get(item.stage_id)
        if stage is None:
            raise HTTPException(status_code=422, detail=f"Stage {item.stage_id} not found")
        selector = (
            None
            if item.patterns is None
            else _Selector([_Pattern(p.pattern, p.match_type, p.priority) for p in item.patterns])
        )
        drafts.append(_Variant(
            id=idx + 1,
            stage_id=stage.id,
            stage=stage,
            role=item.role,
            is_enabled=item.is_enabled,
            binding_rule_set=_RuleSet([_Entry(e.class_type, e.param_name, e.priority) for e in item.entries]),
            node_selector=selector,
            client_key=item.client_key,
            variant_id=item.variant_id,
        ))

    results: list[ScanPreviewVariantResult] = []
    for r in scan_master_variants_detailed(workflow_json, drafts):
        v: _Variant = r["variant"]
        confirmed = r["confirmed"]
        results.append(ScanPreviewVariantResult(
            client_key=v.client_key,
            variant_id=v.variant_id,
            stage_id=v.stage_id,
            stage_key=v.stage.key,
            role=v.role,
            is_enabled=v.is_enabled,
            status=r["status"],
            confirmed=_to_candidate(confirmed) if confirmed else None,
            candidates=[_to_candidate(c) for c in r["candidates"]],
        ))
    return ScanPreviewResponse(workflow_id=workflow.id, results=results)
