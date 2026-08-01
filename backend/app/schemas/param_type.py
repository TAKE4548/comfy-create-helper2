"""Pydantic schemas for ParamTypeMaster."""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ParamTypeMasterBase(BaseModel):
    name: str
    widget_type: str = "select"
    combo_options: Optional[list[str]] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    step: Optional[float] = None


class ParamTypeMasterCreate(ParamTypeMasterBase):
    pass


class ParamTypeMasterRead(ParamTypeMasterBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
