"""Speech bubble preset schemas."""
import json
from datetime import datetime
from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict, model_validator


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
    effects: Optional[Dict[str, Any]] = None
    text: Optional[str] = None


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
    effects: Optional[Dict[str, Any]] = None
    text: Optional[str] = None


class SpeechBubblePresetRead(SpeechBubblePresetBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def parse_effects_json(cls, data: Any) -> Any:
        if hasattr(data, "effects_json"):
            effects_raw = getattr(data, "effects_json")
            if effects_raw:
                try:
                    effects = json.loads(effects_raw)
                except Exception:
                    effects = {}
            else:
                effects = {}
            # Return dict matching attributes
            return {
                "id": data.id,
                "name": data.name,
                "shape": data.shape,
                "orientation": data.orientation,
                "font_family": data.font_family,
                "font_size": data.font_size,
                "text_color": data.text_color,
                "background_color": data.background_color,
                "border_color": data.border_color,
                "border_width": data.border_width,
                "sort_order": data.sort_order,
                "effects": effects,
                "text": getattr(data, "text", None),
                "created_at": data.created_at,
            }
        return data


