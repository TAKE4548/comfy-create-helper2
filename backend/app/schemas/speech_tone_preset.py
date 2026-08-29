"""Speech tone preset and rewrite schemas."""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict


class SpeechTonePresetBase(BaseModel):
    name: str
    prompt: str
    description: Optional[str] = None
    sort_order: int = 0


class SpeechTonePresetCreate(SpeechTonePresetBase):
    pass


class SpeechTonePresetUpdate(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class SpeechTonePresetRead(SpeechTonePresetBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SpeechToneRewriteRequest(BaseModel):
    text: str
    tone_prompt: Optional[str] = None
    preset_id: Optional[int] = None
    model: Optional[str] = None
    llm_params: Optional[dict[str, Any]] = None
    snapshot_id: Optional[int] = None
    image_path: Optional[str] = None
    include_image: Optional[bool] = False
    scene_hint: Optional[str] = None


class SpeechToneRewriteResponse(BaseModel):
    rewritten_text: str
