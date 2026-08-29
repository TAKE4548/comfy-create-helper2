from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel

class SpeechBatchJobItemCreate(BaseModel):
    id: str  # e.g. f"{snapshot_id}_{bubble_id}"
    snapshot_id: int
    bubble_id: str
    bubble_index: int
    text: str
    scene_hint: Optional[str] = None
    include_image: Optional[bool] = True
    image_path: Optional[str] = None

class SpeechBatchJobCreate(BaseModel):
    preset_id: Optional[int] = None
    tone_prompt: Optional[str] = None
    model: Optional[str] = None
    llm_params: Optional[dict[str, Any]] = None
    items: list[SpeechBatchJobItemCreate]

class SpeechBatchJobItemRead(BaseModel):
    id: str
    snapshot_id: int
    bubble_id: str
    bubble_index: int
    original_text: str
    rewritten_text: Optional[str] = None
    status: str = "pending"  # pending | processing | completed | failed | cancelled
    error: Optional[str] = None
    scene_hint: Optional[str] = None
    include_image: Optional[bool] = True
    image_path: Optional[str] = None

class SpeechBatchJobRead(BaseModel):
    job_id: str
    preset_id: Optional[int] = None
    tone_prompt: Optional[str] = None
    model: Optional[str] = None
    status: str = "pending"  # pending | processing | completed | failed | cancelled
    total_count: int
    completed_count: int
    failed_count: int
    created_at: datetime
    items: list[SpeechBatchJobItemRead]
