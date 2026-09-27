from pydantic import BaseModel, Field
from typing import Optional, List, Literal


class BubblePosition(BaseModel):
    x: float = Field(description='X座標 (px, 1024基準)')
    y: float = Field(description='Y座標 (px, 1024基準)')
    w: float = Field(description='幅 (px, 1024基準)')
    h: float = Field(description='高さ (px, 1024基準)')


class BubbleTail(BaseModel):
    direction: Literal['top', 'bottom', 'left', 'right', 'none']
    tip_x: float
    tip_y: float


class BubbleStyleConfig(BaseModel):
    shape: Literal['oval', 'round', 'rounded-rect', 'rect', 'cloud', 'burst', 'none'] = 'oval'
    textColor: str = '#1A202C'
    backgroundColor: str = '#FFFFFF'
    borderColor: str = '#CBD5E0'
    borderWidth: float = 2.0
    fontFamily: str = 'Noto Sans JP'
    fontSize: float = 16.0


class GeneratedSpeechBubbleRead(BaseModel):
    id: str = Field(description='UUID')
    text: str
    role: Literal['main', 'sub', 'se']
    speaker_name: str
    speaker_tag_set_id: Optional[int] = None
    is_se: bool = False
    position: BubblePosition
    tail: Optional[BubbleTail] = None
    style: BubbleStyleConfig


class SceneDraftRequest(BaseModel):
    snapshot_id: int
    target_tag_set_id: Optional[int] = None
    explicit_preset_id: Optional[int] = None
    scene_hint: Optional[str] = None


class SceneDraftResponse(BaseModel):
    scene_interpretation: str
    reference_tone_char: Optional[str] = None
    reference_scene_prompt: Optional[str] = None
    vram_unloaded: bool = True
    bubbles: List[GeneratedSpeechBubbleRead]
