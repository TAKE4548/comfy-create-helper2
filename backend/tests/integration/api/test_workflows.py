import httpx
import itertools
import json
from types import SimpleNamespace as _World

import pytest
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings, strategies as st
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.main import app
from app.seeder import seed_prompt_structure_templates


@pytest.fixture
def client(db_session: Session, mock_external_services):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    mock_external_services.get("http://localhost:8188/queue").mock(
        return_value=httpx.Response(200, json={"queue_running": [], "queue_pending": []})
    )
    mock_external_services.get("http://127.0.0.1:8188/queue").mock(
        return_value=httpx.Response(200, json={"queue_running": [], "queue_pending": []})
    )
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def setup_stages(db_session: Session):
    db_session.add_all([
        models.StageMaster(
            key="main", name="Main", suffix="", search_keywords="[]",
            previous_suffixes="[]", is_builtin=True, is_active=True, sort_order=0
        ),
        models.StageMaster(
            key="rough", name="Rough", suffix="_rough", search_keywords="[]",
            previous_suffixes="[]", is_builtin=True, is_active=True, sort_order=1
        ),
    ])
    db_session.flush()


def _create_master(client: TestClient, base_key: str, fallback_param_names=None):
    res = client.post(
        "/api/mapping-masters",
        json={
            "base_key": base_key,
            "name": base_key,
            "param_name": "seed",
            "input_type": "seed",
            "base_title_patterns": ["KSampler"],
            "fallback_param_names": fallback_param_names,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _create_workflow(client: TestClient, name: str, mappings: list, json_body: dict | None = None):
    res = client.post(
        "/api/workflows",
        json={
            "name": name,
            "json_body": json_body or {"1": {"class_type": "KSampler", "inputs": {}}},
            "mappings": mappings,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_workflow_mapping_returns_ordered_fallbacks(client: TestClient, db_session: Session) -> None:
    """[REQ-353/AC-1] GET /api/workflows/{id} returns ordered fallbacks for master and variant mapping."""
    master = _create_master(client, "test_seed", ["noise_seed", "seed_alt"])
    variant_id = master["variants"][0]["id"]
    workflow_id = _create_workflow(
        client,
        "REQ-353 fallback order",
        [
            {"master_id": master["id"], "node_id": "1"},
            {"master_id": master["id"], "variant_id": variant_id, "node_id": "2"},
        ],
    )

    response = client.get(f"/api/workflows/{workflow_id}")
    assert response.status_code == 200, response.text
    mappings = response.json()["mappings"]
    assert mappings[0]["fallback_param_names"] == ["noise_seed", "seed_alt"]
    assert mappings[0]["variant_id"] is None
    assert mappings[1]["fallback_param_names"] == ["noise_seed", "seed_alt"]
    assert mappings[1]["master_id"] == master["id"]
    assert mappings[1]["variant_id"] == variant_id


def test_workflow_seed_alias_custom_mapping(client: TestClient, db_session: Session) -> None:
    """[REQ-350/AC-2] GET /api/workflows returns seed alias for custom mappings."""
    master = _create_master(client, "test_noise_seed", ["noise_seed"])
    variant_id = master["variants"][0]["id"]
    node_ids = ["101", "102", "103", "104", "105", "106", "107"]
    json_body = {
        nid: {"class_type": "SamplerCustom", "inputs": {"noise_seed": 0}}
        for nid in node_ids
    }
    mappings = [
        {"master_id": master["id"], "node_id": node_ids[0]},
        *[
            {"master_id": master["id"], "variant_id": variant_id, "node_id": nid}
            for nid in node_ids[1:]
        ],
    ]
    workflow_id = _create_workflow(client, "REQ-350 seed alias custom", mappings, json_body=json_body)

    response = client.get(f"/api/workflows/{workflow_id}")
    assert response.status_code == 200, response.text
    result = response.json()
    assert len(result["mappings"]) == 7
    for mapping in result["mappings"]:
        assert mapping["param_name"] == "seed"
        assert mapping["input_type"] == "seed"
        assert mapping["fallback_param_names"] == ["noise_seed"]


def test_workflow_preserves_null_and_empty_fallbacks(client: TestClient, db_session: Session) -> None:
    """[REQ-353/AC-2] GET /api/workflows/{id} preserves null and empty fallback lists."""
    null_master = _create_master(client, "test_null_master")
    empty_master = _create_master(client, "test_empty_master", ["temporary"])
    row = db_session.query(models.MappingMaster).filter_by(id=empty_master["id"]).one()
    row.fallback_param_names = "[]"
    db_session.flush()

    workflow_id = _create_workflow(
        client,
        "REQ-353 null versus empty",
        [
            {"master_id": null_master["id"], "node_id": "1"},
            {"master_id": empty_master["id"], "node_id": "2"},
        ],
    )
    response = client.get(f"/api/workflows/{workflow_id}")
    assert response.status_code == 200, response.text
    assert response.json()["mappings"][0]["fallback_param_names"] is None
    assert response.json()["mappings"][1]["fallback_param_names"] == []


def test_workflow_missing_returns_404(client: TestClient) -> None:
    """[REQ-353/AC-3] GET /api/workflows/{id} returns 404 for nonexistent workflow."""
    response = client.get("/api/workflows/999999")
    assert response.status_code == 404


def test_workflow_seed_type_roundtrip_keeps_variant(client: TestClient, db_session: Session) -> None:
    """[REQ-350/AC-1] Workflow creation with seed input_type retains mapping variant associations."""
    created = client.post(
        "/api/mapping-masters",
        json={
            "base_key": "seed_rt",
            "name": "Seed RT",
            "param_name": "seed",
            "input_type": "seed",
            "base_title_patterns": ["KSampler"],
        },
    )
    assert created.status_code == 201, created.text
    master = created.json()
    master_id = master["id"]
    variant_id = master["variants"][0]["id"]

    updated = client.put(f"/api/mapping-masters/{master_id}", json={"input_type": "seed"})
    assert updated.status_code == 200, updated.text

    wf_res = client.post(
        "/api/workflows",
        json={
            "name": "REQ-350 Seed contract",
            "json_body": {"1": {"class_type": "KSampler", "inputs": {}}},
            "mappings": [{"master_id": master_id, "variant_id": variant_id, "node_id": "1"}],
        },
    )
    assert wf_res.status_code == 201, wf_res.text
    res_id = wf_res.json()["id"]
    wf = client.get(f"/api/workflows/{res_id}")
    assert wf.status_code == 200, wf.text
    mapping = wf.json()["mappings"][0]
    assert mapping["input_type"] == "seed"
    assert mapping["variant_id"] == variant_id


def test_workflow_state_create_get_and_update_roundtrip(client: TestClient, db_session: Session) -> None:
    """[REQ-358/AC-19] Workflow slot state persists across POST, GET, and omitted PUT."""
    initial_states = {"m:901": True, "v:902": False}
    response = client.post(
        "/api/workflows",
        json={
            "name": "REQ-358 state roundtrip",
            "json_body": {"nodes": []},
            "mapping_slot_states": initial_states,
        },
    )
    assert response.status_code == 201, response.text
    workflow_id = response.json()["id"]

    fetched = client.get(f"/api/workflows/{workflow_id}")
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["mapping_slot_states"] == initial_states

    # omitted PUT retains
    omitted = client.put(f"/api/workflows/{workflow_id}", json={"name": "REQ-358 state roundtrip 2"})
    assert omitted.status_code == 200, omitted.text
    assert client.get(f"/api/workflows/{workflow_id}").json()["mapping_slot_states"] == initial_states

    # empty dict replaces
    replaced = client.put(f"/api/workflows/{workflow_id}", json={"mapping_slot_states": {}})
    assert replaced.status_code == 200, replaced.text
    assert client.get(f"/api/workflows/{workflow_id}").json()["mapping_slot_states"] == {}


def test_workflow_state_rollback(client: TestClient, db_session: Session) -> None:
    """[REQ-358/AC-28] Rollback restores prior workflow slot states."""
    original_states = {"m:901": True, "v:902": False}
    created = client.post(
        "/api/workflows",
        json={
            "name": "REQ-358 rollback",
            "json_body": {"nodes": [{"id": 1}]},
            "mapping_slot_states": original_states,
        },
    )
    assert created.status_code == 201, created.text
    workflow_id = created.json()["id"]

    changed = client.put(
        f"/api/workflows/{workflow_id}",
        json={
            "json_body": {"nodes": [{"id": 2}]},
            "mapping_slot_states": {"m:901": False},
        },
    )
    assert changed.status_code == 200, changed.text

    rolled_back = client.post(f"/api/workflows/{workflow_id}/rollback")
    assert rolled_back.status_code == 200, rolled_back.text
    restored = client.get(f"/api/workflows/{workflow_id}")
    assert restored.status_code == 200, restored.text
    assert restored.json()["json_body"] == {"nodes": [{"id": 1}]}
    assert restored.json()["mapping_slot_states"] == original_states


def test_workflow_copy_duplicates_workflow(client: TestClient, db_session: Session) -> None:
    """[REQ-356/AC-2] Workflow copy creates duplicate with mappings and presets."""
    created = client.post(
        "/api/workflows",
        json={"name": "Original", "json_body": {"nodes": []}},
    )
    assert created.status_code == 201
    wf_id = created.json()["id"]

    copy_res = client.post(f"/api/workflows/{wf_id}/copy", json={"name": "Copied"})
    assert copy_res.status_code == 201
    assert copy_res.json()["name"] == "Copied"


def test_workflow_save_filters_orphaned_master_and_variant_mappings(client: TestClient, db_session: Session) -> None:
    """[REQ-369/AC-4] Workflow save/update/copy/rollback filters out orphaned master and variant mappings."""
    # 1. Create a valid master and variant
    master = models.MappingMaster(
        role="test_role",
        display_name="Test Master",
        input_type="int",
        param_name="steps",
        expected_class_types='["KSampler"]',
        sort_order=1,
    )
    db_session.add(master)
    db_session.flush()

    rs = models.BindingRuleSet(name="test_role RuleSet")
    db_session.add(rs)
    db_session.flush()

    variant = models.MappingVariant(
        master_id=master.id,
        stage_id=1,
        role="test_role",
        binding_rule_set_id=rs.id,
        is_enabled=True,
        sort_order=0,
    )
    db_session.add(variant)
    db_session.flush()


    # 2. POST /api/workflows with 1 valid mapping, 1 orphan master (9999), 1 mismatched variant (8888)
    res = client.post(
        "/api/workflows",
        json={
            "name": "REQ-369 Sanitized WF",
            "json_body": {"nodes": []},
            "mappings": [
                {"master_id": master.id, "node_id": "10", "variant_id": variant.id},
                {"master_id": 9999, "node_id": "99", "variant_id": None},
                {"master_id": master.id, "node_id": "20", "variant_id": 8888},
            ],
        },
    )
    assert res.status_code == 201, res.text
    wf_id = res.json()["id"]

    fetched = client.get(f"/api/workflows/{wf_id}")
    assert fetched.status_code == 200
    mappings = fetched.json()["mappings"]
    assert len(mappings) == 1
    assert mappings[0]["master_id"] == master.id
    assert mappings[0]["variant_id"] == variant.id
    assert mappings[0]["role"] is not None

    # 3. PUT /api/workflows/{id} also sanitizes mappings
    put_res = client.put(
        f"/api/workflows/{wf_id}",
        json={
            "mappings": [
                {"master_id": master.id, "node_id": "15", "variant_id": variant.id},
                {"master_id": 8888, "node_id": "99"},
            ],
        },
    )
    assert put_res.status_code == 200, put_res.text
    fetched_after_put = client.get(f"/api/workflows/{wf_id}").json()["mappings"]
    assert len(fetched_after_put) == 1
    assert fetched_after_put[0]["node_id"] == "15"

    # 4. Copy workflow sanitizes mappings
    copy_res = client.post(f"/api/workflows/{wf_id}/copy", json={"name": "REQ-369 Copied WF"})
    assert copy_res.status_code == 201
    copied_wf_id = copy_res.json()["id"]
    copied_mappings = client.get(f"/api/workflows/{copied_wf_id}").json()["mappings"]
    assert len(copied_mappings) == 1
    assert copied_mappings[0]["master_id"] == master.id


def test_step_031_cleanup_orphaned_workflow_mappings(db_session: Session) -> None:
    """[REQ-369/AC-5] Migration step 031 idempotently removes orphaned workflow_mappings rows."""
    from sqlalchemy import inspect
    from app.migrations.steps import step_031_cleanup_orphaned_workflow_mappings

    # Setup 1 valid workflow, 1 valid master, 1 valid variant
    master = models.MappingMaster(
        role="valid_master",
        display_name="Valid Master",
        input_type="int",
        param_name="steps",
        expected_class_types='["KSampler"]',
        sort_order=1,
    )
    db_session.add(master)
    db_session.flush()

    rs = models.BindingRuleSet(name="valid_master RuleSet")
    db_session.add(rs)
    db_session.flush()

    variant = models.MappingVariant(
        master_id=master.id,
        stage_id=1,
        role="valid_master",
        binding_rule_set_id=rs.id,
        is_enabled=True,
        sort_order=0,
    )
    db_session.add(variant)

    wf = models.Workflow(name="WF for Migration Test", json_body="{}")
    db_session.add(wf)
    db_session.flush()

    # Valid mapping
    db_session.add(models.WorkflowMapping(workflow_id=wf.id, master_id=master.id, variant_id=variant.id, node_id="1"))
    # Orphan mapping: master does not exist
    db_session.add(models.WorkflowMapping(workflow_id=wf.id, master_id=9999, variant_id=None, node_id="2"))
    # Orphan mapping: variant does not exist
    db_session.add(models.WorkflowMapping(workflow_id=wf.id, master_id=master.id, variant_id=8888, node_id="3"))
    db_session.commit()

    conn = db_session.connection()
    inspector = inspect(conn)

    # First run cleans up the 2 orphaned rows
    step_031_cleanup_orphaned_workflow_mappings(conn, inspector)
    db_session.commit()

    remaining = db_session.query(models.WorkflowMapping).filter(models.WorkflowMapping.workflow_id == wf.id).all()
    assert len(remaining) == 1
    assert remaining[0].master_id == master.id
    assert remaining[0].variant_id == variant.id

    # Second run is idempotent (0 errors, remaining unchanged)
    step_031_cleanup_orphaned_workflow_mappings(conn, inspector)
    db_session.commit()

    remaining_idempotent = db_session.query(models.WorkflowMapping).filter(models.WorkflowMapping.workflow_id == wf.id).all()
    assert len(remaining_idempotent) == 1


def test_req417_ac5_binding_rules_crud_and_referencing_roles_guard(client: TestClient, db_session: Session):
    """[REQ-417/AC-5] BindingRuleSet / NodeSelector CRUD and referencing roles deletion guard."""
    # 1. Create rule set and node selector
    rs_res = client.post("/api/binding-rules", json={
        "name": "KSampler RuleSet",
        "entries": [
            {"class_type": "KSampler", "param_name": "seed", "priority": 1},
            {"class_type": "KSamplerAdvanced", "param_name": "noise_seed", "priority": 2},
        ]
    })
    assert rs_res.status_code == 201, rs_res.text
    rs_data = rs_res.json()
    rs_id = rs_data["id"]
    assert rs_data["name"] == "KSampler RuleSet"
    assert len(rs_data["entries"]) == 2
    assert rs_data["referenced_roles"] == []

    sel_res = client.post("/api/node-selectors", json={
        "name": "Main KSampler Selector",
        "patterns": [
            {"pattern": "Main KSampler", "match_type": "exact", "priority": 1},
            {"pattern": "KSampler", "match_type": "contains", "priority": 2},
        ]
    })
    assert sel_res.status_code == 201, sel_res.text
    sel_data = sel_res.json()
    sel_id = sel_data["id"]
    assert sel_data["name"] == "Main KSampler Selector"
    assert len(sel_data["patterns"]) == 2
    assert sel_data["referenced_roles"] == []

    # 2. Verify GET list & GET by id
    list_rs = client.get("/api/binding-rules")
    assert list_rs.status_code == 200
    assert any(r["id"] == rs_id for r in list_rs.json())

    get_rs = client.get(f"/api/binding-rules/{rs_id}")
    assert get_rs.status_code == 200
    assert get_rs.json()["name"] == "KSampler RuleSet"

    get_sel = client.get(f"/api/node-selectors/{sel_id}")
    assert get_sel.status_code == 200
    assert get_sel.json()["name"] == "Main KSampler Selector"

    # 3. Create master and variant referencing this rule_set and selector
    master = models.MappingMaster(
        base_key="test_seed",
        name="Test Seed",
        param_name="seed",
        input_type="seed",
        role="test_seed",
        sort_order=10,
    )
    db_session.add(master)
    db_session.flush()

    var = models.MappingVariant(
        master_id=master.id,
        stage_id=1,
        role="seed_main",
        binding_rule_set_id=rs_id,
        node_selector_id=sel_id,
        is_enabled=True,
        sort_order=0,
    )
    db_session.add(var)
    db_session.commit()

    # 4. Check referenced_roles are now reported
    get_rs_ref = client.get(f"/api/binding-rules/{rs_id}")
    assert "seed_main" in get_rs_ref.json()["referenced_roles"]

    get_sel_ref = client.get(f"/api/node-selectors/{sel_id}")
    assert "seed_main" in get_sel_ref.json()["referenced_roles"]

    # 5. Attempt deletion while in use -> Expect 400 Bad Request with referenced_roles
    del_rs_fail = client.delete(f"/api/binding-rules/{rs_id}")
    assert del_rs_fail.status_code == 400
    detail_rs = del_rs_fail.json()["detail"]
    assert "Cannot delete rule set currently in use" in detail_rs["error"]
    assert "seed_main" in detail_rs["referenced_roles"]

    del_sel_fail = client.delete(f"/api/node-selectors/{sel_id}")
    assert del_sel_fail.status_code == 400
    detail_sel = del_sel_fail.json()["detail"]
    assert "Cannot delete node selector currently in use" in detail_sel["error"]
    assert "seed_main" in detail_sel["referenced_roles"]

    # 6. Delete variant / remove reference
    db_session.delete(var)
    db_session.commit()

    # 7. Delete unreferenced rule set & selector -> Expect 204 No Content
    del_rs_ok = client.delete(f"/api/binding-rules/{rs_id}")
    assert del_rs_ok.status_code == 204

    del_sel_ok = client.delete(f"/api/node-selectors/{sel_id}")
    assert del_sel_ok.status_code == 204

    # 8. Verify they are gone (404)
    assert client.get(f"/api/binding-rules/{rs_id}").status_code == 404
    assert client.get(f"/api/node-selectors/{sel_id}").status_code == 404


# ─── REQ-419: atomic master save / scan preview / inline variant definitions ───

_SNAPSHOT_TABLES = (
    "mapping_masters",
    "mapping_variants",
    "binding_rule_sets",
    "binding_rule_entries",
    "node_selectors",
    "node_selector_patterns",
    "workflow_mappings",
    "workflows",
)


def _db_snapshot(db_session: Session) -> dict:
    return {
        t: [tuple(r) for r in db_session.execute(text(f"SELECT * FROM {t} ORDER BY id")).all()]
        for t in _SNAPSHOT_TABLES
    }


def _stage_id(db_session: Session, key: str) -> int:
    return db_session.query(models.StageMaster).filter_by(key=key).one().id


def _req419_world(db_session: Session, with_fine_stage: bool = False) -> _World:
    w = _World()
    if with_fine_stage:
        db_session.add(models.StageMaster(
            key="fine", name="Fine", suffix="_fine", search_keywords="[]",
            previous_suffixes="[]", is_builtin=False, is_active=True, sort_order=2,
        ))
        db_session.flush()
    w.main = _stage_id(db_session, "main")
    w.rough = _stage_id(db_session, "rough")
    w.fine = _stage_id(db_session, "fine") if with_fine_stage else None

    rs1 = models.BindingRuleSet(name="rs1")
    rs1.entries.append(models.BindingRuleEntry(class_type="KSamplerAdvanced", param_name="noise_seed", priority=2))
    rs1.entries.append(models.BindingRuleEntry(class_type="KSampler", param_name="seed", priority=1))
    rs2 = models.BindingRuleSet(name="rs2")
    rs2.entries.append(models.BindingRuleEntry(class_type="CLIPTextEncode", param_name="text", priority=1))
    s1 = models.NodeSelector(name="s1")
    s1.patterns.append(models.NodeSelectorPattern(pattern="Zeta", match_type="contains", priority=2))
    s1.patterns.append(models.NodeSelectorPattern(pattern="Main", match_type="exact", priority=1))
    s2 = models.NodeSelector(name="s2")
    s2.patterns.append(models.NodeSelectorPattern(pattern="Rough", match_type="contains", priority=1))
    master = models.MappingMaster(
        base_key="seed_m", name="Seed M", param_name="seed", input_type="seed",
        role="seed_m", display_name="Seed M", sort_order=10,
    )
    db_session.add_all([rs1, rs2, s1, s2, master])
    db_session.flush()
    va = models.MappingVariant(master_id=master.id, stage_id=w.main, role="seed_m",
                               binding_rule_set_id=rs1.id, node_selector_id=s1.id, sort_order=0)
    vb = models.MappingVariant(master_id=master.id, stage_id=w.rough, role="seed_m_rough",
                               binding_rule_set_id=rs1.id, node_selector_id=s2.id, sort_order=1)
    db_session.add_all([va, vb])
    db_session.commit()
    w.master_id, w.rs1, w.rs2, w.s1, w.s2 = master.id, rs1.id, rs2.id, s1.id, s2.id
    w.a, w.b = va.id, vb.id
    return w


def _atomic_req(**overrides) -> dict:
    body: dict = {
        "master": {"name": "Seed M", "input_type": "seed", "group_id": None, "default_enabled": True},
        "rule_sets": [],
        "selectors": [],
        "variants": [],
    }
    body.update(overrides)
    return body


def _variant_item(w: _World, which: str, rule_set: dict, selector: dict | None, **extra) -> dict:
    item = {
        "row_key": f"row-{which}",
        "id": w.a if which == "a" else w.b,
        "stage_id": w.main if which == "a" else w.rough,
        "is_enabled": True,
        "rule_set": rule_set,
        "selector": selector,
    }
    item.update(extra)
    return item


def _get_variants(client: TestClient, master_id: int) -> dict[int, dict]:
    res = client.get(f"/api/mapping-masters/{master_id}")
    assert res.status_code == 200, res.text
    return {v["id"]: v for v in res.json()["variants"]}


def _full_request(w: _World) -> dict:
    return _atomic_req(
        master={"name": "Renamed M", "input_type": "seed", "group_id": None, "default_enabled": True},
        rule_sets=[
            {"ref": "shared", "op": "update", "id": w.rs1, "name": "rs1",
             "entries": [{"class_type": "KSampler", "param_name": "cfg", "priority": 1}]},
            {"ref": "copy", "op": "create", "name": "rs1 copy",
             "entries": [{"class_type": "KSampler", "param_name": "steps", "priority": 1}]},
        ],
        variants=[
            _variant_item(w, "a", {"ref": "copy"}, {"id": w.s1}),
            _variant_item(w, "b", {"id": w.rs2}, None),
        ],
    )


def test_req419_ac2_variant_read_includes_inline_definitions(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-2] Variant read includes rule entries (priority order) and selector patterns (None without selector)."""
    w = _req419_world(db_session, with_fine_stage=True)
    db_session.add(models.MappingVariant(
        master_id=w.master_id, stage_id=w.fine, role="seed_m_fine",
        binding_rule_set_id=w.rs2, node_selector_id=None, sort_order=2,
    ))
    db_session.commit()

    listed = client.get("/api/mapping-masters")
    assert listed.status_code == 200, listed.text
    master = next(m for m in listed.json() if m["id"] == w.master_id)
    by_stage = {v["stage_id"]: v for v in master["variants"]}

    assert by_stage[w.main]["rule_entries"] == [
        {"class_type": "KSampler", "param_name": "seed", "priority": 1},
        {"class_type": "KSamplerAdvanced", "param_name": "noise_seed", "priority": 2},
    ]
    assert by_stage[w.main]["selector_patterns"] == [
        {"pattern": "Main", "match_type": "exact", "priority": 1},
        {"pattern": "Zeta", "match_type": "contains", "priority": 2},
    ]
    assert by_stage[w.fine]["selector_patterns"] is None
    assert by_stage[w.fine]["rule_entries"] == [{"class_type": "CLIPTextEncode", "param_name": "text", "priority": 1}]


def test_req419_ac3_atomic_save_repoints_and_clears_selector(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-3] One request switches a rule set (new ref) and clears the selector; omitted variants stay."""
    w = _req419_world(db_session)
    before_b = _get_variants(client, w.master_id)[w.b]

    res = client.post(f"/api/mapping-masters/{w.master_id}/atomic-save", json=_atomic_req(
        rule_sets=[{"ref": "n1", "op": "create", "name": "brand new",
                    "entries": [{"class_type": "KSampler", "param_name": "steps", "priority": 1}]}],
        variants=[_variant_item(w, "a", {"ref": "n1"}, None)],
    ))
    assert res.status_code == 200, res.text

    after = _get_variants(client, w.master_id)
    assert after[w.a]["rule_entries"] == [{"class_type": "KSampler", "param_name": "steps", "priority": 1}]
    assert after[w.a]["node_selector_id"] is None
    assert after[w.a]["selector_patterns"] is None
    assert after[w.b] == before_b


def test_req419_ac3_atomic_save_swaps_selectors(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-3] Swapping selectors between two variants (A=s1,B=s2 to A=s2,B=s1) succeeds in one request."""
    w = _req419_world(db_session)
    res = client.post(f"/api/mapping-masters/{w.master_id}/atomic-save", json=_atomic_req(
        variants=[
            _variant_item(w, "a", {"id": w.rs1}, {"id": w.s2}),
            _variant_item(w, "b", {"id": w.rs1}, {"id": w.s1}),
        ],
    ))
    assert res.status_code == 200, res.text
    after = _get_variants(client, w.master_id)
    assert after[w.a]["node_selector_id"] == w.s2
    assert after[w.b]["node_selector_id"] == w.s1


def test_req419_ac5_atomic_save_duplicate_keeps_original(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-5] Duplicate (create copy, repoint only the edited variant) leaves the original rule set intact."""
    w = _req419_world(db_session)
    original = client.get(f"/api/binding-rules/{w.rs1}").json()
    original.pop("referenced_roles")

    res = client.post(f"/api/mapping-masters/{w.master_id}/atomic-save", json=_atomic_req(
        rule_sets=[{"ref": "copy", "op": "create", "name": "rs1 (copy)",
                    "entries": [{"class_type": "KSampler", "param_name": "cfg", "priority": 1}]}],
        variants=[_variant_item(w, "a", {"ref": "copy"}, {"id": w.s1})],
    ))
    assert res.status_code == 200, res.text

    unchanged = client.get(f"/api/binding-rules/{w.rs1}").json()
    unchanged.pop("referenced_roles")
    assert unchanged == original
    after = _get_variants(client, w.master_id)
    assert after[w.a]["rule_entries"] == [{"class_type": "KSampler", "param_name": "cfg", "priority": 1}]
    assert after[w.b]["binding_rule_set_id"] == w.rs1
    assert [e["param_name"] for e in after[w.b]["rule_entries"]] == ["seed", "noise_seed"]


def test_req419_ac5_atomic_save_update_shared_changes_all_referrers(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-5] Updating a shared rule set in place changes the entries seen by every referring variant."""
    w = _req419_world(db_session)
    new_entries = [{"class_type": "KSampler", "param_name": "denoise", "priority": 1}]
    res = client.post(f"/api/mapping-masters/{w.master_id}/atomic-save", json=_atomic_req(
        rule_sets=[{"ref": "shared", "op": "update", "id": w.rs1, "name": "rs1", "entries": new_entries}],
    ))
    assert res.status_code == 200, res.text
    after = _get_variants(client, w.master_id)
    assert after[w.a]["rule_entries"] == new_entries
    assert after[w.b]["rule_entries"] == new_entries


def _case_dup_stage(w: _World) -> tuple[dict, str, str]:
    items = [
        {"row_key": "n1", "stage_id": w.fine, "rule_set": {"id": w.rs1}, "selector": None},
        {"row_key": "n2", "stage_id": w.fine, "rule_set": {"id": w.rs1}, "selector": None},
    ]
    return _atomic_req(variants=items), "variant", "stage_id"


def _case_dup_selector(w: _World) -> tuple[dict, str, str]:
    return _atomic_req(variants=[
        _variant_item(w, "a", {"id": w.rs1}, {"id": w.s2}),
        _variant_item(w, "b", {"id": w.rs1}, {"id": w.s2}),
    ]), "variant", "selector"


def _case_new_item_used_stage(w: _World) -> tuple[dict, str, str]:
    return _atomic_req(variants=[
        {"row_key": "n1", "stage_id": w.main, "rule_set": {"id": w.rs1}, "selector": None},
    ]), "variant", "stage_id"


def _case_role_collision(w: _World) -> tuple[dict, str, str]:
    return _atomic_req(variants=[
        {"row_key": "n1", "stage_id": w.fine, "rule_set": {"id": w.rs1}, "selector": None},
    ]), "variant", "role"


def _case_rule_set_name_collision(w: _World) -> tuple[dict, str, str]:
    return _atomic_req(rule_sets=[
        {"ref": "x", "op": "create", "name": "rs2", "entries": []},
    ]), "rule_set", "name"


def _case_unknown_ref(w: _World) -> tuple[dict, str, str]:
    return _atomic_req(variants=[
        _variant_item(w, "a", {"ref": "nope"}, {"id": w.s1}),
    ]), "variant", "rule_set"


def _case_foreign_variant_id(w: _World) -> tuple[dict, str, str]:
    return _atomic_req(variants=[
        {"row_key": "f", "id": w.foreign_variant, "stage_id": w.main, "rule_set": {"id": w.rs1}, "selector": None},
    ]), "variant", "id"


def _case_existing_variant_stage_change(w: _World) -> tuple[dict, str, str]:
    return _atomic_req(variants=[
        _variant_item(w, "a", {"id": w.rs1}, {"id": w.s1}, stage_id=w.fine),
    ]), "variant", "stage_id"


def _case_update_missing_id(w: _World) -> tuple[dict, str, str]:
    return _atomic_req(rule_sets=[
        {"ref": "x", "op": "update", "name": "whatever", "entries": []},
    ]), "rule_set", "id"


@pytest.mark.parametrize(
    "build_case",
    [
        _case_dup_stage, _case_dup_selector, _case_new_item_used_stage, _case_role_collision,
        _case_rule_set_name_collision, _case_unknown_ref, _case_foreign_variant_id, _case_update_missing_id,
        _case_existing_variant_stage_change,
    ],
    ids=[
        "[REQ-419/AC-6] dup-stage", "[REQ-419/AC-6] dup-selector", "[REQ-419/AC-6] new-item-used-stage",
        "[REQ-419/AC-6] role-collision", "[REQ-419/AC-6] rule-set-name-collision", "[REQ-419/AC-6] unknown-ref",
        "[REQ-419/AC-6] foreign-variant-id", "[REQ-419/AC-6] update-missing-id",
        "[REQ-419/AC-6] existing-variant-stage-change",
    ],
)
def test_req419_ac6_atomic_save_rejects_invalid_requests(client: TestClient, db_session: Session, build_case) -> None:
    """[REQ-419/AC-6] Invalid atomic-save requests return 422 with row errors and leave the DB untouched."""
    w = _req419_world(db_session, with_fine_stage=True)
    other = models.MappingMaster(base_key="other", name="Other", param_name="seed", input_type="seed", role="other", sort_order=11)
    db_session.add(other)
    db_session.flush()
    foreign = models.MappingVariant(master_id=other.id, stage_id=w.fine, role="seed_m_fine",
                                    binding_rule_set_id=w.rs2, sort_order=2)
    db_session.add(foreign)
    db_session.commit()
    w.foreign_variant = foreign.id

    body, scope, field = build_case(w)
    before = _db_snapshot(db_session)
    res = client.post(f"/api/mapping-masters/{w.master_id}/atomic-save", json=body)

    assert res.status_code == 422, res.text
    detail = res.json()["detail"]
    assert detail["code"] == "MASTER_SAVE_VALIDATION_FAILED"
    assert any(e["scope"] == scope and e["field"] == field for e in detail["errors"]), detail["errors"]
    for e in detail["errors"]:
        assert set(e) == {"scope", "index", "ref", "row_key", "field", "message"}
    assert _db_snapshot(db_session) == before


def test_req419_ac6_atomic_save_allows_multiple_null_selectors(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-6] Several variants without a selector are allowed (NULL is excluded from uniqueness)."""
    w = _req419_world(db_session)
    res = client.post(f"/api/mapping-masters/{w.master_id}/atomic-save", json=_atomic_req(
        variants=[_variant_item(w, "a", {"id": w.rs1}, None), _variant_item(w, "b", {"id": w.rs1}, None)],
    ))
    assert res.status_code == 200, res.text
    after = _get_variants(client, w.master_id)
    assert after[w.a]["node_selector_id"] is None and after[w.b]["node_selector_id"] is None


def test_req419_ac12_atomic_save_applies_all_changes_in_one_request(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-12] A single request applies master rename, switches, shared update and duplicate with one commit."""
    w = _req419_world(db_session)
    commits: list[int] = []

    def on_commit(_session) -> None:
        commits.append(1)

    event.listen(db_session, "after_commit", on_commit)
    try:
        res = client.post(f"/api/mapping-masters/{w.master_id}/atomic-save", json=_full_request(w))
    finally:
        event.remove(db_session, "after_commit", on_commit)

    assert res.status_code == 200, res.text
    assert len(commits) == 1
    body = res.json()
    assert body["name"] == "Renamed M"
    after = _get_variants(client, w.master_id)
    assert after[w.a]["rule_entries"] == [{"class_type": "KSampler", "param_name": "steps", "priority": 1}]
    assert after[w.a]["node_selector_id"] == w.s1
    assert after[w.b]["binding_rule_set_id"] == w.rs2
    assert after[w.b]["selector_patterns"] is None
    shared = client.get(f"/api/binding-rules/{w.rs1}").json()
    assert [(e["param_name"]) for e in shared["entries"]] == ["cfg"]
    assert client.get(f"/api/mapping-masters/{w.master_id}").json()["name"] == "Renamed M"


@pytest.mark.parametrize(
    "trigger",
    ["after-definition-create", "during-variant-update"],
    ids=["[REQ-419/AC-12] after-definition-create", "[REQ-419/AC-12] during-variant-update"],
)
def test_req419_ac12_atomic_save_rolls_back_on_injected_db_failure(
    client: TestClient, db_session: Session, trigger: str
) -> None:
    """[REQ-419/AC-12] A DB failure injected mid-save leaves no partial change (full rollback)."""
    w = _req419_world(db_session)
    before = _db_snapshot(db_session)

    def fail_on_flush(session, flush_context, instances) -> None:
        if trigger == "after-definition-create":
            hit = any(isinstance(o, models.BindingRuleSet) for o in session.new)
        else:
            hit = any(isinstance(o, models.MappingVariant) for o in session.dirty)
        if hit:
            raise OperationalError("INSERT", {}, Exception("injected failure"))

    event.listen(db_session, "before_flush", fail_on_flush)
    try:
        res = TestClient(app, raise_server_exceptions=False).post(
            f"/api/mapping-masters/{w.master_id}/atomic-save", json=_full_request(w)
        )
    finally:
        event.remove(db_session, "before_flush", fail_on_flush)

    assert res.status_code >= 500
    assert _db_snapshot(db_session) == before


def test_req419_ac12_atomic_save_integrity_error_returns_409_and_rolls_back(
    client: TestClient, db_session: Session
) -> None:
    """[REQ-419/AC-12] An IntegrityError during apply maps to 409 MASTER_SAVE_CONFLICT with full rollback."""
    w = _req419_world(db_session)
    before = _db_snapshot(db_session)

    def fail_on_flush(session, flush_context, instances) -> None:
        if any(isinstance(o, models.BindingRuleSet) for o in session.new):
            raise IntegrityError("INSERT", {}, Exception("injected conflict"))

    event.listen(db_session, "before_flush", fail_on_flush)
    try:
        res = client.post(f"/api/mapping-masters/{w.master_id}/atomic-save", json=_full_request(w))
    finally:
        event.remove(db_session, "before_flush", fail_on_flush)

    assert res.status_code == 409, res.text
    assert res.json()["detail"]["code"] == "MASTER_SAVE_CONFLICT"
    assert _db_snapshot(db_session) == before


_PROP_COUNTER = itertools.count(1)


@settings(max_examples=30, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    name=st.sampled_from(["M1", "M2", ""]),
    a_rs=st.sampled_from(["rs1", "rs2", "new", "missing"]),
    b_rs=st.sampled_from(["rs1", "rs2", "new", "missing"]),
    a_sel=st.sampled_from([None, "s1", "s2", "new"]),
    b_sel=st.sampled_from([None, "s1", "s2", "new"]),
    extra_new_on_used_stage=st.booleans(),
)
def test_req419_ac12_atomic_save_all_or_nothing_property(
    client: TestClient, db_session: Session, name, a_rs, b_rs, a_sel, b_sel, extra_new_on_used_stage
) -> None:
    """[REQ-419/AC-12] Random requests are either fully applied (200) or leave every table unchanged."""
    if not hasattr(db_session, "_req419_world"):
        db_session._req419_world = _req419_world(db_session)  # type: ignore[attr-defined]
    w = db_session._req419_world  # type: ignore[attr-defined]
    n = next(_PROP_COUNTER)
    new_entries = [{"class_type": "KSampler", "param_name": f"p{n}", "priority": 1}]
    rs_ids = {"rs1": w.rs1, "rs2": w.rs2}
    sel_ids = {"s1": w.s1, "s2": w.s2}

    def rs_ref(choice: str) -> dict:
        return {"id": rs_ids[choice]} if choice in rs_ids else {"ref": choice}

    def sel_ref(choice):
        if choice is None:
            return None
        return {"id": sel_ids[choice]} if choice in sel_ids else {"ref": "new"}

    variants = [_variant_item(w, "a", rs_ref(a_rs), sel_ref(a_sel)), _variant_item(w, "b", rs_ref(b_rs), sel_ref(b_sel))]
    if extra_new_on_used_stage:
        variants.append({"row_key": "x", "stage_id": w.main, "rule_set": {"id": w.rs1}, "selector": None})
    body = _atomic_req(
        master={"name": name, "input_type": "seed", "group_id": None, "default_enabled": True},
        rule_sets=[{"ref": "new", "op": "create", "name": f"prop-rs-{n}", "entries": new_entries}],
        selectors=[{"ref": "new", "op": "create", "name": f"prop-sel-{n}",
                    "patterns": [{"pattern": f"pp{n}", "match_type": "contains", "priority": 1}]}],
        variants=variants,
    )
    before = _db_snapshot(db_session)
    res = client.post(f"/api/mapping-masters/{w.master_id}/atomic-save", json=body)

    if res.status_code != 200:
        assert res.status_code in (409, 422)
        assert _db_snapshot(db_session) == before
        return
    after = _get_variants(client, w.master_id)
    assert client.get(f"/api/mapping-masters/{w.master_id}").json()["name"] == name
    for which, rs_choice, sel_choice in (("a", a_rs, a_sel), ("b", b_rs, b_sel)):
        v = after[w.a if which == "a" else w.b]
        if rs_choice in rs_ids:
            assert v["binding_rule_set_id"] == rs_ids[rs_choice]
        else:
            assert v["rule_entries"] == new_entries
        if sel_choice is None:
            assert v["node_selector_id"] is None and v["selector_patterns"] is None
        elif sel_choice in sel_ids:
            assert v["node_selector_id"] == sel_ids[sel_choice]
        else:
            assert v["selector_patterns"] == [{"pattern": f"pp{n}", "match_type": "contains", "priority": 1}]


def _preview_workflow(db_session: Session, nodes: dict, name: str = "preview-wf") -> models.Workflow:
    wf = models.Workflow(name=name, json_body=json.dumps(nodes))
    db_session.add(wf)
    db_session.commit()
    return wf


def _ks(title: str, **inputs) -> dict:
    return {"class_type": "KSampler", "_meta": {"title": title}, "inputs": inputs or {"steps": 20}}


def _pv(client_key: str, stage_id: int, patterns, **extra) -> dict:
    item = {
        "client_key": client_key, "stage_id": stage_id, "role": f"role_{client_key}",
        "entries": [{"class_type": "KSampler", "param_name": "steps", "priority": 1}],
        "patterns": patterns,
    }
    item.update(extra)
    return item


def test_req419_ac9_scan_preview_uses_unsaved_definitions(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-9] Preview ranks nodes by the unsaved draft definitions and excludes rank-4 nodes."""
    w = _req419_world(db_session)
    wf = _preview_workflow(db_session, {
        "1": _ks("Main Sampler"),
        "2": _ks("Rough Sampler"),
        "3": _ks("Plain"),
    })
    body: dict = {
        "workflow_id": wf.id,
        "variants": [
            _pv("main", w.main, [{"pattern": "Main", "match_type": "contains", "priority": 1}]),
            _pv("rough", w.rough, [{"pattern": "Rough", "match_type": "contains", "priority": 1}]),
        ],
    }
    res = client.post("/api/mapping-masters/scan-preview", json=body)
    assert res.status_code == 200, res.text
    results = {r["client_key"]: r for r in res.json()["results"]}

    main = results["main"]
    assert main["status"] == "ok" and main["stage_key"] == "main" and main["role"] == "role_main"
    assert main["confirmed"]["node_id"] == "1"
    assert main["confirmed"]["stage_label"] == "contains"
    assert main["confirmed"]["input_name"] == "steps"
    assert [(c["node_id"], c["stage_label"]) for c in main["candidates"]] == [("1", "contains"), ("3", "no_selector")]
    rough = results["rough"]
    assert rough["confirmed"]["node_id"] == "2"
    assert "2" not in [c["node_id"] for c in main["candidates"]]

    body["variants"][1]["is_enabled"] = False
    disabled = {r["client_key"]: r for r in client.post("/api/mapping-masters/scan-preview", json=body).json()["results"]}
    assert disabled["rough"]["status"] == "disabled"
    assert disabled["rough"]["confirmed"] is None and disabled["rough"]["candidates"] == []


@pytest.mark.parametrize(
    "case",
    ["missing-workflow", "unknown-stage", "empty-variants", "bad-match-type"],
    ids=[
        "[REQ-419/AC-9] missing-workflow", "[REQ-419/AC-9] unknown-stage",
        "[REQ-419/AC-9] empty-variants", "[REQ-419/AC-9] bad-match-type",
    ],
)
def test_req419_ac9_scan_preview_error_responses(client: TestClient, db_session: Session, case: str) -> None:
    """[REQ-419/AC-9] Preview rejects a missing workflow (404) and invalid stage/variants/match_type (422)."""
    w = _req419_world(db_session)
    wf = _preview_workflow(db_session, {"1": _ks("Main Sampler")})
    ok_variant = _pv("v", w.main, [{"pattern": "Main", "match_type": "contains", "priority": 1}])
    bodies = {
        "missing-workflow": ({"workflow_id": 987654, "variants": [ok_variant]}, 404),
        "unknown-stage": ({"workflow_id": wf.id, "variants": [dict(ok_variant, stage_id=987654)]}, 422),
        "empty-variants": ({"workflow_id": wf.id, "variants": []}, 422),
        "bad-match-type": (
            {"workflow_id": wf.id, "variants": [dict(ok_variant, patterns=[{"pattern": "x", "match_type": "regex", "priority": 1}])]},
            422,
        ),
    }
    body, expected = bodies[case]
    res = client.post("/api/mapping-masters/scan-preview", json=body)
    assert res.status_code == expected, res.text


def test_req419_ac13_scan_preview_ignores_legacy_fields(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-13] (a) legacy columns never add nodes; (b) legacy keywords/title patterns never change rank or order."""
    w = _req419_world(db_session)
    db_session.query(models.StageMaster).filter_by(id=w.rough).update({"search_keywords": '["rough"]'})
    master = db_session.get(models.MappingMaster, w.master_id)
    assert master is not None
    master.expected_class_types = '["CLIPTextEncode"]'
    master.fallback_param_names = '["text"]'
    master.base_title_patterns = '["Legacy"]'
    master.title_patterns = '["Legacy"]'
    wf = _preview_workflow(db_session, {
        "1": _ks("Plain"),
        "2": _ks("rough sampler"),
        "3": _ks("Legacy node"),
        "4": {"class_type": "CLIPTextEncode", "_meta": {"title": "Legacy text"}, "inputs": {"text": "x"}},
    })
    res = client.post("/api/mapping-masters/scan-preview", json={
        "workflow_id": wf.id,
        "variants": [_pv("r", w.rough, None, variant_id=w.b)],
    })
    assert res.status_code == 200, res.text
    result = res.json()["results"][0]
    ids = [c["node_id"] for c in result["candidates"]]
    # (a) entry mismatch node (4, legacy column match) is absent everywhere
    assert "4" not in ids
    assert result["confirmed"] is not None and result["confirmed"]["node_id"] != "4"
    # (b) legacy-matching titles are plain no_selector candidates, ordered by node id like node "1"
    assert {c["stage_label"] for c in result["candidates"]} == {"no_selector"}
    assert ids == ["1", "2", "3"]
    assert result["confirmed"]["node_id"] == "1"
    assert result["status"] == "duplicated"


def test_req419_ac10_scan_preview_does_not_persist(client: TestClient, db_session: Session) -> None:
    """[REQ-419/AC-10] Preview with drafts (incl. an existing variant_id with different content) writes nothing."""
    w = _req419_world(db_session)
    wf = _preview_workflow(db_session, {"1": _ks("Main Sampler"), "2": _ks("Rough Sampler")})
    db_session.add(models.WorkflowMapping(workflow_id=wf.id, master_id=w.master_id, variant_id=w.a, node_id="1", input_name="steps"))
    db_session.commit()
    before = _db_snapshot(db_session)

    res = client.post("/api/mapping-masters/scan-preview", json={
        "workflow_id": wf.id,
        "variants": [
            _pv("a", w.main, [{"pattern": "Rough", "match_type": "exact", "priority": 3}], variant_id=w.a,
                entries=[{"class_type": "KSampler", "param_name": "steps", "priority": 5}]),
            _pv("b", w.rough, None, variant_id=w.b, is_enabled=False),
        ],
    })
    assert res.status_code == 200, res.text
    assert _db_snapshot(db_session) == before
    assert not db_session.new and not db_session.dirty and not db_session.deleted


@getattr(pytest.mark, "REQ-423")
@getattr(pytest.mark, "AC-2")
def test_req423_ac2_workflow_mappings_persist_and_roundtrip_input_name(client: TestClient, db_session: Session) -> None:
    """[REQ-423/AC-2] Workflow mappings persist and roundtrip input_name across POST, GET, and PUT."""
    master = models.MappingMaster(
        role="seed",
        display_name="Seed",
        input_type="int",
        param_name="seed",
        sort_order=1,
    )
    db_session.add(master)
    db_session.commit()

    # 1. POST /api/workflows with input_name="noise_seed"
    post_res = client.post(
        "/api/workflows",
        json={
            "name": "REQ-423 Input Name Roundtrip WF",
            "json_body": {"3": {"class_type": "KSamplerAdvanced", "inputs": {"noise_seed": 12345}}},
            "mappings": [
                {
                    "master_id": master.id,
                    "node_id": "3",
                    "input_name": "noise_seed",
                }
            ],
        },
    )
    assert post_res.status_code == 201, post_res.text
    wf_id = post_res.json()["id"]

    # Direct DB verification of persisted input_name
    db_mapping = db_session.query(models.WorkflowMapping).filter_by(workflow_id=wf_id).first()
    assert db_mapping is not None
    assert db_mapping.input_name == "noise_seed"

    # 2. GET /api/workflows/{id} roundtrip verification
    get_res = client.get(f"/api/workflows/{wf_id}")
    assert get_res.status_code == 200, get_res.text
    mappings = get_res.json()["mappings"]
    assert len(mappings) == 1
    assert mappings[0]["master_id"] == master.id
    assert mappings[0]["node_id"] == "3"
    assert mappings[0]["input_name"] == "noise_seed"

    # 3. PUT /api/workflows/{id} update input_name to "seed"
    put_res = client.put(
        f"/api/workflows/{wf_id}",
        json={
            "mappings": [
                {
                    "master_id": master.id,
                    "node_id": "3",
                    "input_name": "seed",
                }
            ]
        },
    )
    assert put_res.status_code == 200, put_res.text

    # Re-fetch via GET to verify updated input_name persisted
    get_after_put = client.get(f"/api/workflows/{wf_id}")
    assert get_after_put.status_code == 200, get_after_put.text
    updated_mappings = get_after_put.json()["mappings"]
    assert len(updated_mappings) == 1
    assert updated_mappings[0]["input_name"] == "seed"

    # Direct DB verification after PUT
    db_session.expire_all()
    updated_db_mapping = db_session.query(models.WorkflowMapping).filter_by(workflow_id=wf_id).first()
    assert updated_db_mapping is not None
    assert updated_db_mapping.input_name == "seed"


@getattr(pytest.mark, "REQ-423")
@getattr(pytest.mark, "AC-2")
def test_req423_ac2_workflow_duplicate_preserves_mapping_input_names(client: TestClient, db_session: Session) -> None:
    """[REQ-423/AC-2] Workflow copy/duplicate preserves mapping input_names."""
    master_seed = models.MappingMaster(
        role="seed",
        display_name="Seed",
        input_type="int",
        param_name="seed",
        sort_order=1,
    )
    master_prompt = models.MappingMaster(
        role="prompt",
        display_name="Prompt",
        input_type="textarea",
        param_name="text",
        sort_order=2,
    )
    db_session.add_all([master_seed, master_prompt])
    db_session.commit()

    # Create source workflow with mappings
    src_res = client.post(
        "/api/workflows",
        json={
            "name": "REQ-423 Source WF for Duplicate",
            "json_body": {
                "3": {"class_type": "KSamplerAdvanced", "inputs": {"noise_seed": 42}},
                "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "cat"}},
            },
            "mappings": [
                {"master_id": master_seed.id, "node_id": "3", "input_name": "noise_seed"},
                {"master_id": master_prompt.id, "node_id": "6", "input_name": "text"},
            ],
        },
    )
    assert src_res.status_code == 201, src_res.text
    src_wf_id = src_res.json()["id"]

    # Duplicate via copy endpoint (POST /api/workflows/{id}/copy)
    dup_res = client.post(f"/api/workflows/{src_wf_id}/copy", json={"name": "REQ-423 Duplicated WF"})
    assert dup_res.status_code == 201, dup_res.text
    dup_wf_id = dup_res.json()["id"]

    # Verify duplicated workflow mappings via GET
    dup_get = client.get(f"/api/workflows/{dup_wf_id}")
    assert dup_get.status_code == 200, dup_get.text
    dup_mappings = {m["master_id"]: m["input_name"] for m in dup_get.json()["mappings"]}
    assert dup_mappings[master_seed.id] == "noise_seed"
    assert dup_mappings[master_prompt.id] == "text"

    # Direct DB verification on copied records
    dup_db_mappings = {
        m.master_id: m.input_name
        for m in db_session.query(models.WorkflowMapping).filter_by(workflow_id=dup_wf_id).all()
    }
    assert dup_db_mappings[master_seed.id] == "noise_seed"
    assert dup_db_mappings[master_prompt.id] == "text"


def test_prompt_structure_templates_anima_seed(client: TestClient, db_session: Session):
    """[REQ-425/AC-2] Anima standard template is seeded with 19 character blocks and 17 global blocks in exact order."""
    seed_prompt_structure_templates(db_session)
    res = client.get("/api/prompt-templates")
    assert res.status_code == 200, res.text
    templates = res.json()
    anima = next((t for t in templates if t["name"] == "Anima 標準テンプレート"), None)
    assert anima is not None
    assert anima["is_builtin"] is True

    sections = anima["structure"]["sections"]
    assert len(sections) == 2

    # Section 1: character (19 blocks, repeatable)
    char_sec = sections[0]
    assert char_sec["id"] == "character"
    assert char_sec["name"] == "キャラクター"
    assert char_sec["is_repeatable"] is True
    expected_char_blocks = [
        "character_name",
        "series_name",
        "artist_name",
        "skin_ears_horns_halo_wings",
        "hair_color",
        "hair_length",
        "hair_style",
        "eye_color",
        "eye_shape",
        "pupils",
        "expression",
        "body_features",
        "headwear_eyewear",
        "neckwear",
        "upper_clothes",
        "lower_clothes",
        "legwear",
        "shoes",
        "accessories_tail_wings",
    ]
    assert [b["id"] for b in char_sec["blocks"]] == expected_char_blocks
    assert char_sec["blocks"][2]["label"] == "@artist name if needed"

    # Section 2: global (17 blocks, non-repeatable)
    global_sec = sections[1]
    assert global_sec["id"] == "global"
    assert global_sec["name"] == "全体"
    assert global_sec["is_repeatable"] is False
    expected_global_blocks = [
        "pose",
        "hand_position",
        "leg_position",
        "action",
        "camera_distance",
        "camera_angle",
        "lens",
        "focus",
        "composition",
        "background",
        "time",
        "weather",
        "scene_objects",
        "lighting",
        "depth",
        "effects",
        "after_details",
    ]
    assert [b["id"] for b in global_sec["blocks"]] == expected_global_blocks


def test_prompt_structure_template_crud(client: TestClient, db_session: Session):
    """[REQ-425/AC-1] Custom prompt structure template creation, duplicate conflict, update, and deletion."""
    create_payload = {
        "name": "Custom Test Template",
        "description": "Custom template description",
        "structure": {
            "sections": [
                {
                    "id": "char",
                    "name": "Char",
                    "is_repeatable": True,
                    "blocks": [
                        {"id": "name", "label": "Name", "description": "", "default_value": ""},
                        {"id": "outfit", "label": "Outfit", "description": "", "default_value": ""},
                    ],
                }
            ]
        },
        "sort_order": 10,
    }
    create_res = client.post("/api/prompt-templates", json=create_payload)
    assert create_res.status_code == 201, create_res.text
    created = create_res.json()
    tpl_id = created["id"]
    assert created["name"] == "Custom Test Template"
    assert len(created["structure"]["sections"]) == 1

    # Conflict on duplicate name
    dup_res = client.post("/api/prompt-templates", json=create_payload)
    assert dup_res.status_code == 409

    # Update template
    update_res = client.put(
        f"/api/prompt-templates/{tpl_id}",
        json={"description": "Updated description", "sort_order": 20},
    )
    assert update_res.status_code == 200, update_res.text
    assert update_res.json()["description"] == "Updated description"
    assert update_res.json()["sort_order"] == 20

    # Delete template
    del_res = client.delete(f"/api/prompt-templates/{tpl_id}")
    assert del_res.status_code == 204

    # Verify deleted
    get_res = client.get("/api/prompt-templates")
    assert all(t["id"] != tpl_id for t in get_res.json())


def test_workflow_prompt_template_config_lifecycle(client: TestClient, db_session: Session):
    """[REQ-425/AC-3] Workflow prompt_template_config is persisted, updated, duplicated via copy, and restored via rollback."""
    initial_config = {
        "template_id": 1,
        "template_snapshot": {
            "sections": [
                {
                    "id": "sec1",
                    "name": "Sec 1",
                    "is_repeatable": True,
                    "blocks": [{"id": "b1", "label": "B1", "description": "", "default_value": ""}],
                }
            ]
        },
        "output_groups": [
            {
                "id": "grp1",
                "name": "Positive Main",
                "target_role": "positive",
                "block_ids": ["b1"],
                "repeat_filter": {"mode": "all"},
            },
            {
                "id": "grp2",
                "name": "Positive Upscale",
                "target_role": "positive_upscale",
                "block_ids": ["b1"],
                "repeat_filter": {"mode": "index", "index": 1},
            },
        ],
    }

    # 1. Create workflow with prompt_template_config
    wf_res = client.post(
        "/api/workflows",
        json={
            "name": "Workflow with Template Config",
            "json_body": {"6": {"class_type": "CLIPTextEncode", "inputs": {"text": ""}}},
            "prompt_template_config": initial_config,
        },
    )
    assert wf_res.status_code == 201, wf_res.text
    wf_id = wf_res.json()["id"]

    # 2. Get workflow and verify prompt_template_config
    get_res = client.get(f"/api/workflows/{wf_id}")
    assert get_res.status_code == 200, get_res.text
    wf_data = get_res.json()
    assert wf_data["prompt_template_config"]["template_id"] == 1
    assert len(wf_data["prompt_template_config"]["output_groups"]) == 2
    assert wf_data["prompt_template_config"]["output_groups"][1]["repeat_filter"]["mode"] == "index"
    assert wf_data["prompt_template_config"]["output_groups"][1]["repeat_filter"]["index"] == 1

    # 3. Duplicate workflow via copy
    copy_res = client.post(f"/api/workflows/{wf_id}/copy", json={"name": "Copied Workflow with Config"})
    assert copy_res.status_code == 201, copy_res.text
    copy_id = copy_res.json()["id"]
    copy_get = client.get(f"/api/workflows/{copy_id}")
    assert copy_get.json()["prompt_template_config"]["template_id"] == 1
    assert len(copy_get.json()["prompt_template_config"]["output_groups"]) == 2

    # 4. Update workflow with new json_body and modified output_groups (creates history entry)
    updated_config = {
        "template_id": 1,
        "template_snapshot": initial_config["template_snapshot"],
        "output_groups": [
            {
                "id": "grp1",
                "name": "Positive Main",
                "target_role": "positive",
                "block_ids": ["b1"],
                "repeat_filter": {"mode": "all"},
            }
        ],
    }
    update_res = client.put(
        f"/api/workflows/{wf_id}",
        json={
            "json_body": {"6": {"class_type": "CLIPTextEncode", "inputs": {"text": "new"}}},
            "prompt_template_config": updated_config,
        },
    )
    assert update_res.status_code == 200, update_res.text

    # Verify updated
    get_res_updated = client.get(f"/api/workflows/{wf_id}")
    assert len(get_res_updated.json()["prompt_template_config"]["output_groups"]) == 1

    # 5. Rollback workflow and verify previous prompt_template_config is restored
    rollback_res = client.post(f"/api/workflows/{wf_id}/rollback")
    assert rollback_res.status_code == 200, rollback_res.text
    get_res_restored = client.get(f"/api/workflows/{wf_id}")
    assert len(get_res_restored.json()["prompt_template_config"]["output_groups"]) == 2


def test_workflow_without_prompt_template_config_backward_compatibility(client: TestClient, db_session: Session):
    """[REQ-425/AC-9] Workflow created without prompt_template_config returns default empty config object."""
    wf_res = client.post(
        "/api/workflows",
        json={
            "name": "Legacy Compatibility Workflow",
            "json_body": {"6": {"class_type": "CLIPTextEncode", "inputs": {"text": "legacy"}}},
        },
    )
    assert wf_res.status_code == 201, wf_res.text
    wf_id = wf_res.json()["id"]

    get_res = client.get(f"/api/workflows/{wf_id}")
    assert get_res.status_code == 200, get_res.text
    config = get_res.json()["prompt_template_config"]
    assert config["template_id"] is None
    assert config["template_snapshot"] is None
    assert config["output_groups"] == []

