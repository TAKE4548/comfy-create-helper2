"""VariantRef schema for mapping variant references (REQ-418)."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, ConfigDict


class VariantRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    display_name: Optional[str] = None   # variant.master.display_name
