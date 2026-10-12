import json
from pathlib import Path

from app.main import app


def test_workflow_mapping_read_fallback_param_names_matches_openapi_snapshot() -> None:
    schema = app.openapi()["components"]["schemas"]["WorkflowMappingRead"]
    property_schema = schema["properties"]["fallback_param_names"]
    snapshot_path = Path(__file__).resolve().parents[1] / "openapi.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    snapshot_schema = snapshot["components"]["schemas"]["WorkflowMappingRead"]

    assert snapshot_schema["properties"]["fallback_param_names"] == property_schema
    assert property_schema["anyOf"] == [
        {"items": {"type": "string"}, "type": "array"},
        {"type": "null"},
    ]
    assert "fallback_param_names" not in schema.get("required", [])
