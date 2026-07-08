from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class BaseModelCreate(BaseModel):
    name: str
    description: Optional[str] = None

class BaseModelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime

class CheckpointMappingCreate(BaseModel):
    checkpoint_name: str
    base_model_id: int

class CheckpointMappingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    checkpoint_name: str
    base_model_id: int
    created_at: datetime
    base_model: Optional[BaseModelRead] = None