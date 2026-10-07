import pytest
from app.services.benchmark_service import BenchmarkService, STRESS_TEST_AXES, WEIGHTS, BENCHMARK_SEED
from fastapi.testclient import TestClient
from app.routers.benchmark_router import router
from fastapi import FastAPI

app = FastAPI()
app.include_router(router)
client = TestClient(app)

def test_generate_stress_test_prompts_count_and_seed():
    prompts = BenchmarkService.generate_stress_test_prompts(
        lora_name="test_char_lora",
        character_trigger="test_char",
        outfit_trigger="school uniform"
    )
    # 4 axes * 3 weights = 12 prompts
    assert len(prompts) == 12
    for p in prompts:
        assert p["seed"] == BENCHMARK_SEED
        assert p["seed"] == 12345678
        assert p["weight"] in WEIGHTS
        assert "test_char_lora" in p["prompt"]
        assert "test_char" in p["prompt"]

def test_generate_stress_test_prompts_axes_content():
    prompts = BenchmarkService.generate_stress_test_prompts(
        lora_name="hero_v1",
        character_trigger="hero_girl",
        outfit_trigger="armor suit"
    )
    axes_found = {p["axis_id"] for p in prompts}
    expected_axes = {"decoupling", "bake_in", "pose", "angle"}
    assert axes_found == expected_axes

    # Verify decoupling axis has red hoodie
    decoupling_prompts = [p for p in prompts if p["axis_id"] == "decoupling"]
    assert len(decoupling_prompts) == 3
    assert all("wearing red hoodie" in p["prompt"] for p in decoupling_prompts)

    # Verify bake_in axis has outfit trigger
    bake_in_prompts = [p for p in prompts if p["axis_id"] == "bake_in"]
    assert len(bake_in_prompts) == 3
    assert all("armor suit" in p["prompt"] for p in bake_in_prompts)

def test_calculate_sweet_spot():
    dummy_results = [{"cell": i, "pass": True} for i in range(12)]
    res = BenchmarkService.calculate_sweet_spot(dummy_results)
    assert res["recommended_weight_min"] == 0.75
    assert res["recommended_weight_max"] == 0.85
    assert res["recommended_weight_display"] == "0.75 - 0.85"
    assert "reason" in res

def test_benchmark_router_endpoints():
    # Test POST /api/benchmark/generate-prompts
    payload = {
        "lora_name": "my_lora",
        "character_trigger": "alice",
        "outfit_trigger": "gothic dress"
    }
    resp = client.post("/api/benchmark/generate-prompts", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 12
    assert len(data["prompts"]) == 12
    assert data["prompts"][0]["seed"] == 12345678

    # Test POST /api/benchmark/evaluate
    eval_payload = {
        "results": [{"cell_id": 1, "passed": True}]
    }
    resp = client.post("/api/benchmark/evaluate", json=eval_payload)
    assert resp.status_code == 200
    eval_data = resp.json()
    assert "sweet_spot" in eval_data
    assert eval_data["sweet_spot"]["recommended_weight_min"] == 0.75
    assert eval_data["sweet_spot"]["recommended_weight_max"] == 0.85