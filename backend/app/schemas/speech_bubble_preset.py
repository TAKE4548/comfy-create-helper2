"""Speech bubble preset schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class SpeechBubblePresetBase(BaseModel):
    name: str
    shape: str = "oval"
    orientation: str = "vertical"
    font_family: str = "sans-serif"
    font_size: int = 0
    text_color: str = "rgba(0, 0, 0, 1)"
    background_color: str = "rgba(255, 255, 255, 0.95)"
    border_color: str = "rgba(0, 0, 0, 1)"
    border_width: int = 2
    sort_order: int = 0


class SpeechBubblePresetCreate(SpeechBubblePresetBase):
    pass


class SpeechBubblePresetUpdate(BaseModel):
    name: Optional[str] = None
    shape: Optional[str] = None
    orientation: Optional[str] = None
    font_family: Optional[str] = None
    font_size: Optional[int] = None
    text_color: Optional[str] = None
    background_color: Optional[str] = None
    border_color: Optional[str] = None
    border_width: Optional[int] = None
    sort_order: Optional[int] = None


class SpeechBubblePresetRead(SpeechBubblePresetBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

