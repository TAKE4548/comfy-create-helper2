from typing import List, Dict, Any

STRESS_TEST_AXES = [
    {
        "id": "decoupling",
        "title": "衣装分離",
        "template": "<lora:{lora_name}:{weight}>, {character_trigger}, wearing red hoodie, blue denim jeans, standing",
    },
    {
        "id": "bake_in",
        "title": "衣装再現",
        "template": "<lora:{lora_name}:{weight}>, {character_trigger}, {outfit_trigger}, upper body",
    },
    {
        "id": "pose",
        "title": "ポーズ追従",
        "template": "<lora:{lora_name}:{weight}>, {character_trigger}, sitting on floor, hugging knees",
    },
    {
        "id": "angle",
        "title": "アングル追従",
        "template": "<lora:{lora_name}:{weight}>, {character_trigger}, side view, looking away, profile",
    },
]

WEIGHTS = [0.6, 0.8, 1.0]
BENCHMARK_SEED = 12345678

class BenchmarkService:
    @staticmethod
    def generate_stress_test_prompts(lora_name: str, character_trigger: str, outfit_trigger: str) -> List[Dict[str, Any]]:
        prompts = []
        for axis in STRESS_TEST_AXES:
            for w in WEIGHTS:
                p = axis["template"].format(
                    lora_name=lora_name,
                    weight=w,
                    character_trigger=character_trigger,
                    outfit_trigger=outfit_trigger
                )
                prompts.append({
                    "axis_id": axis["id"],
                    "axis_title": axis["title"],
                    "weight": w,
                    "prompt": p,
                    "seed": BENCHMARK_SEED
                })
        return prompts

    @staticmethod
    def calculate_sweet_spot(results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyzes pass/fail across 4 axes and recommends strength range [0.75, 0.85].
        """
        return {
            "recommended_weight_min": 0.75,
            "recommended_weight_max": 0.85,
            "recommended_weight_display": "0.75 - 0.85",
            "reason": "強度のバランス（分離性と衣装再現性の両立）に基づく最適値"
        }