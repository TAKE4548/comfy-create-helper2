from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class DatasetProjectCreate(BaseModel):
    name: str
    character_trigger: str
    outfit_trigger: str
    workflow_id: int
    prompt_meta: str
    prompt_physical: str
    prompt_exclusive_outfit: str
    selected_alt_outfits: str = "[]"


class DatasetProjectUpdate(BaseModel):
    name: Optional[str] = None
    character_trigger: Optional[str] = None
    outfit_trigger: Optional[str] = None
    workflow_id: Optional[int] = None
    prompt_meta: Optional[str] = None
    prompt_physical: Optional[str] = None
    prompt_exclusive_outfit: Optional[str] = None
    selected_alt_outfits: Optional[str] = None


class DatasetProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    character_trigger: str
    outfit_trigger: str
    workflow_id: int
    prompt_meta: str
    prompt_physical: str
    prompt_exclusive_outfit: str
    selected_alt_outfits: str
    created_at: datetime
    updated_at: datetime


class DatasetItemCreate(BaseModel):
    project_id: int
    slot_index: int
    factors_json: str
    raw_prompt: str
    caption_text: str
    image_path: Optional[str] = None
    seed: int
    status: str = "APPROVED"


class DatasetItemUpdate(BaseModel):
    factors_json: Optional[str] = None
    raw_prompt: Optional[str] = None
    caption_text: Optional[str] = None
    image_path: Optional[str] = None
    seed: Optional[int] = None
    status: Optional[str] = None


class DatasetItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    slot_index: int
    factors_json: str
    raw_prompt: str
    caption_text: str
    image_path: Optional[str] = None
    seed: int
    status: str


class OutfitMasterPresetCreate(BaseModel):
    name: str
    category: str
    prompt_tags: str
    is_builtin: bool = True


class OutfitMasterPresetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    prompt_tags: str
    is_builtin: bool


class LoraTrainingJobCreate(BaseModel):
    project_id: int
    lora_name: str
    model_type: str = "anima_2b"
    config_toml_content: str
    epochs: int
    repeats: int
    batch_size: int
    total_steps: int
    network_dim: int
    network_alpha: int
    learning_rate: str
    status: str = "IDLE"


class LoraTrainingJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    lora_name: str
    model_type: str
    config_toml_content: str
    epochs: int
    repeats: int
    batch_size: int
    total_steps: int
    network_dim: int
    network_alpha: int
    learning_rate: str
    status: str
    final_loss: Optional[float] = None
    pid: Optional[int] = None
