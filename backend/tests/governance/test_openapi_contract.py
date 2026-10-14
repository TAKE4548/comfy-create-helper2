from datetime import datetime, timezone
import json
from pathlib import Path

import pytest
import yaml  # type: ignore[import-untyped]

from app.main import app
from app.schemas.workflow import WorkflowCreate, WorkflowRead, WorkflowUpdate


def test_workflow_mapping_read_fallback_param_names_matches_openapi_snapshot() -> None:
    """[REQ-353/AC-1] WorkflowMappingRead schema fallback_param_names matches openapi snapshot."""
    schema = app.openapi()["components"]["schemas"]["WorkflowMappingRead"]
    property_schema = schema["properties"]["fallback_param_names"]
    snapshot_path = Path(__file__).resolve().parents[2] / "openapi.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    snapshot_schema = snapshot["components"]["schemas"]["WorkflowMappingRead"]

    assert snapshot_schema["properties"]["fallback_param_names"] == property_schema
    assert property_schema["anyOf"] == [
        {"items": {"type": "string"}, "type": "array"},
        {"type": "null"},
    ]
    assert "fallback_param_names" not in schema.get("required", [])


@pytest.mark.parametrize(
    "schema_name",
    ["WorkflowCreate", "WorkflowRead", "WorkflowUpdate"],
    ids=["[REQ-358/AC-19] create", "[REQ-358/AC-19] read", "[REQ-358/AC-19] update"],
)
def test_req358_openapi_workflow_mapping_slot_states_matches_runtime_and_snapshot(schema_name: str) -> None:
    """[REQ-358/AC-19] Workflow slot state schemas stay aligned with the runtime OpenAPI contract."""
    runtime = app.openapi()
    snapshot_path = Path(__file__).resolve().parents[2] / "openapi.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))

    assert snapshot["components"]["schemas"][schema_name] == runtime["components"]["schemas"][schema_name]
    states_schema = runtime["components"]["schemas"][schema_name]["properties"]["mapping_slot_states"]
    if schema_name in {"WorkflowCreate", "WorkflowRead"}:
        assert states_schema == {
            "additionalProperties": {"type": "boolean"},
            "type": "object",
            "title": "Mapping Slot States",
        }
        assert schema_name == "WorkflowRead" or "mapping_slot_states" not in runtime["components"]["schemas"][schema_name].get("required", [])
    else:
        assert "mapping_slot_states" not in runtime["components"]["schemas"][schema_name].get("required", [])

    for route, methods in {
        "/api/workflows": ("post",),
        "/api/workflows/{workflow_id}": ("get", "put"),
    }.items():
        for method in methods:
            assert snapshot["paths"][route][method]["responses"] == runtime["paths"][route][method]["responses"]


def test_req358_openapi_workflow_slot_states_defaults_and_update_null_rejection() -> None:
    """[REQ-358/AC-31] Read defaults to empty, update omission is distinguishable, and null is rejected."""
    created = WorkflowCreate(name="wf", json_body={})
    read = WorkflowRead(id=1, name="wf", json_body={}, created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    omitted_update = WorkflowUpdate.model_validate({})

    assert created.mapping_slot_states == {}
    assert read.mapping_slot_states == {}
    assert "mapping_slot_states" not in omitted_update.model_fields_set
    with pytest.raises(ValueError, match="cannot be null"):
        WorkflowUpdate.model_validate({"mapping_slot_states": None})


def test_req358_openapi_master_routes_match_runtime_and_both_snapshots_AC_26() -> None:
    """[REQ-358/AC-26] Mapping master routes expose the runtime V2 request and response schemas."""
    runtime = app.openapi()
    backend_snapshot = json.loads((Path(__file__).resolve().parents[2] / "openapi.json").read_text(encoding="utf-8"))
    docs_snapshot = yaml.safe_load((Path(__file__).resolve().parents[3] / "docs/openapi.yaml").read_text(encoding="utf-8"))
    routes = ("/api/mapping-masters", "/api/mapping-masters/{master_id}")

    for route in routes:
        assert backend_snapshot["paths"][route] == runtime["paths"][route]
        assert docs_snapshot["paths"][route] == runtime["paths"][route]

    expected_refs = {
        ("/api/mapping-masters", "get", "200"): "MappingMasterV2Read",
        ("/api/mapping-masters", "post", "201"): "MappingMasterV2Read",
        ("/api/mapping-masters/{master_id}", "get", "200"): "MappingMasterV2Read",
        ("/api/mapping-masters/{master_id}", "put", "200"): "MappingMasterV2Read",
    }
    for (route, method, status), schema_name in expected_refs.items():
        response_schema = runtime["paths"][route][method]["responses"][status]["content"]["application/json"]["schema"]
        if route == "/api/mapping-masters" and method == "get":
            response_schema = response_schema["items"]
        assert response_schema["$ref"] == f"#/components/schemas/{schema_name}"

    request_refs = {
        ("/api/mapping-masters", "post"): "MappingMasterCreatePayload",
        ("/api/mapping-masters/{master_id}", "put"): "MappingMasterUpdate",
    }
    for (route, method), schema_name in request_refs.items():
        request_schema = runtime["paths"][route][method]["requestBody"]["content"]["application/json"]["schema"]
        assert request_schema["$ref"] == f"#/components/schemas/{schema_name}"


def test_req358_openapi_master_default_enabled_contract_AC_28_AC_30_AC_31() -> None:
    """[REQ-358/AC-28][REQ-358/AC-30][REQ-358/AC-31] Verify mapping master default_enabled OpenAPI contract."""
    runtime = app.openapi()
    backend_snapshot = json.loads((Path(__file__).resolve().parents[2] / "openapi.json").read_text(encoding="utf-8"))
    docs_snapshot = yaml.safe_load((Path(__file__).resolve().parents[3] / "docs/openapi.yaml").read_text(encoding="utf-8"))
    master_schemas = runtime["components"]["schemas"]
    for name in ("MappingMasterCreatePayload", "MappingMasterV2Read"):
        prop = master_schemas[name]["properties"]["default_enabled"]
        assert prop == {"type": "boolean", "title": "Default Enabled", "default": True}
        assert backend_snapshot["components"]["schemas"][name] == master_schemas[name]
        assert docs_snapshot["components"]["schemas"][name] == master_schemas[name]

    update = master_schemas["MappingMasterUpdate"]
    assert "default_enabled" in update["properties"]
    assert "default_enabled" not in update.get("required", [])
    assert backend_snapshot["components"]["schemas"]["MappingMasterUpdate"] == update
    assert docs_snapshot["components"]["schemas"]["MappingMasterUpdate"] == update
