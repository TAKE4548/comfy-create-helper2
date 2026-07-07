"""BypassProfile Pydantic schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict


class BypassProfileBase(BaseModel):
    name: str
    bypassed_node_ids: list[str]


class BypassProfileCreate(BypassProfileBase):
    pass


class BypassProfileUpdate(BaseModel):
    name: str | None = None
    bypassed_node_ids: list[str] | None = None
    is_enabled: bool | None = None


class BypassProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workflow_id: int
    name: str
    bypassed_node_ids: list[str]
    is_enabled: bool
    created_at: datetime
