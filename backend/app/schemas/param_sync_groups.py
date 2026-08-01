from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime


class ParamSyncGroupBase(BaseModel):
    name: str
    master_role: str
    slave_roles: List[str]
    is_enabled: bool = False


class ParamSyncGroupCreate(ParamSyncGroupBase):
    pass


class ParamSyncGroupUpdate(BaseModel):
    name: Optional[str] = None
    master_role: Optional[str] = None
    slave_roles: Optional[List[str]] = None
    is_enabled: Optional[bool] = None


class ParamSyncGroupRead(ParamSyncGroupBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workflow_id: int
    created_at: datetime
