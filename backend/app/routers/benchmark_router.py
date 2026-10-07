from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from app.services.benchmark_service import BenchmarkService

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])


class GeneratePromptsRequest(BaseModel):
    lora_name: str = Field(..., description="Target LoRA model name")
    character_trigger: str = Field(..., description="Character trigger word")
    outfit_trigger: str = Field(..., description="Outfit trigger word")


class EvaluateBenchmarkRequest(BaseModel):
    results: List[Dict[str, Any]] = Field(default_factory=list, description="List of benchmark execution results per cell")


@router.post("/generate-prompts")
async def generate_prompts(req: GeneratePromptsRequest):
    prompts = BenchmarkService.generate_stress_test_prompts(
        lora_name=req.lora_name,
        character_trigger=req.character_trigger,
        outfit_trigger=req.outfit_trigger,
    )
    return {"prompts": prompts, "total": len(prompts)}


@router.post("/evaluate")
async def evaluate_benchmark(req: EvaluateBenchmarkRequest):
    sweet_spot = BenchmarkService.calculate_sweet_spot(req.results)
    return {
        "sweet_spot": sweet_spot,
        "results": req.results,
    }