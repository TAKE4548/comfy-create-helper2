"""LLM Audit and LlmPrompt Pydantic schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ─── Audit ───────────────────────────────────────────────────────

class AuditRequest(BaseModel):
    audit_types: list[str]  # interference / vocabulary / physical
    positive: str
    negative: str = ""
    intent: str = ""
    model_hint: str = "SDXL"


class InterferenceItem(BaseModel):
    tag: str
    reason: str


class VocabularyItem(BaseModel):
    suggestion: str
    effect: str


class PhysicalResult(BaseModel):
    status: str  # ok / warning / conflict
    note: Optional[str] = None
    alternatives: list[str] = []


class AuditResult(BaseModel):
    interference: Optional[list[InterferenceItem]] = None
    vocabulary: Optional[list[VocabularyItem]] = None
    physical: Optional[PhysicalResult] = None


# ─── LLM System Prompt ───────────────────────────────────────────

class LlmPromptUpdate(BaseModel):
    content: str
    description: Optional[str] = None


class LlmPromptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    key: str
    content: str
    description: Optional[str] = None
    updated_at: datetime
