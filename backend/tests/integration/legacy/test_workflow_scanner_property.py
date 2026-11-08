"""Property-based fuzzing tests for workflow_scanner using hypothesis."""
from hypothesis import given, strategies as st, settings, HealthCheck
from app.services.workflow_scanner import scan_workflow
from app.models import MappingMaster


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(
    st.dictionaries(
        keys=st.text(min_size=1, max_size=10),
        values=st.one_of(
            st.none(),
            st.integers(),
            st.booleans(),
            st.text(),
            st.lists(st.one_of(st.none(), st.integers(), st.text())),
            st.dictionaries(
                keys=st.text(min_size=1, max_size=10),
                values=st.one_of(
                    st.none(),
                    st.text(),
                    st.integers(),
                    st.lists(st.text()),
                    st.dictionaries(keys=st.text(), values=st.text())
                ),
            ),
        ),
    )
)
def test_scan_workflow_never_crashes_on_fuzzed_json(corrupted_json):
    """AC-6: Ensure scan_workflow never crashes even when presented with arbitrary corrupted workflow JSON."""
    master = MappingMaster(
        id=1,
        role="Positive_Prompt",
        expected_class_types='["CLIPTextEncode", "CR Prompt Text"]',
        title_patterns='["Positive", "Prompt"]',
        param_name="text,prompt",
    )
    result = scan_workflow(corrupted_json, [master])
    assert isinstance(result, dict)
    assert "matched" in result
    assert "warnings" in result
    assert isinstance(result["matched"], list)
    assert isinstance(result["warnings"], list)


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(
    st.lists(
        st.tuples(
            st.integers(min_value=1, max_value=3),  # stage_rank: 1, 2, 3
            st.integers(min_value=1, max_value=10),  # entry_priority
            st.integers(min_value=1, max_value=10),  # pattern_priority
            st.integers(min_value=1, max_value=1000),  # numeric_id
        ),
        min_size=1,
        max_size=30,
        unique_by=lambda x: (x[3],),  # unique node IDs
    ),
    st.randoms(),
)
def test_req417_candidate_sort_key_determinism(raw_candidates, rnd):
    """[REQ-417/AC-2] Candidate sorting is strictly deterministic and invariant to input permutation."""
    from app.services.workflow_scanner import _candidate_sort_key

    candidate_dicts = [
        {
            "stage_rank": sr,
            "entry_priority": ep,
            "pattern_priority": pp,
            "numeric_id": nid,
            "node_id": str(nid),
        }
        for (sr, ep, pp, nid) in raw_candidates
    ]

    # Baseline sort
    sorted_baseline = sorted(candidate_dicts, key=_candidate_sort_key)

    # Permuted sort
    shuffled = list(candidate_dicts)
    rnd.shuffle(shuffled)
    sorted_permuted = sorted(shuffled, key=_candidate_sort_key)

    # Identical order and top candidate
    assert sorted_baseline == sorted_permuted
    assert sorted_baseline[0]["node_id"] == sorted_permuted[0]["node_id"]

    # Verify monotonicity:
    for i in range(len(sorted_baseline) - 1):
        k1 = _candidate_sort_key(sorted_baseline[i])
        k2 = _candidate_sort_key(sorted_baseline[i + 1])
        assert k1 <= k2



class _PEntry:
    def __init__(self, class_type, param_name, priority):
        self.class_type = class_type
        self.param_name = param_name
        self.priority = priority


class _PPattern:
    def __init__(self, pattern, match_type, priority):
        self.pattern = pattern
        self.match_type = match_type
        self.priority = priority


class _PStage:
    def __init__(self, id, sort_order):
        self.id = id
        self.key = f"s{id}"
        self.suffix = f"_s{id}"
        self.sort_order = sort_order


class _PVariant:
    def __init__(self, id, entries, patterns, enabled):
        self.id = id
        self.master_id = 1
        self.stage_id = id
        self.stage = _PStage(id, id)
        self.role = f"role_{id}"
        self.sort_order = 0
        self.is_enabled = enabled
        self.binding_rule_set = type("RuleSet", (), {"entries": entries})() if entries else None
        self.node_selector = type("Selector", (), {"patterns": patterns})() if patterns else None


_entry_st = st.tuples(
    st.sampled_from(["KSampler", "CLIPTextEncode"]),
    st.sampled_from(["steps", "text"]),
    st.integers(min_value=1, max_value=3),
)
_pattern_st = st.tuples(
    st.sampled_from(["a", "b", "ab"]),
    st.sampled_from(["exact", "contains"]),
    st.integers(min_value=1, max_value=3),
)
_variant_spec_st = st.tuples(
    st.lists(_entry_st, max_size=2),
    st.lists(_pattern_st, max_size=2),
    st.booleans(),
)
_node_st = st.tuples(
    st.sampled_from(["a", "b", "ab", "x"]),
    st.sampled_from(["KSampler", "CLIPTextEncode"]),
    st.sets(st.sampled_from(["steps", "text"]), min_size=1),
)


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(
    st.lists(_variant_spec_st, min_size=1, max_size=3),
    st.lists(_node_st, max_size=5),
    st.randoms(),
)
def test_req419_ac9_detailed_scan_consistent_with_scan_workflow_variants(variant_specs, node_specs, rnd):
    """[REQ-419/AC-9] Detailed scan and scan_workflow_variants agree; no stage 4; confirmed is first; order independent."""
    from app.services.workflow_scanner import scan_master_variants_detailed, scan_workflow_variants

    variants = [
        _PVariant(
            i + 1,
            [_PEntry(*e) for e in entries],
            [_PPattern(*p) for p in patterns],
            enabled,
        )
        for i, (entries, patterns, enabled) in enumerate(variant_specs)
    ]
    workflow = {
        str(10 * (i + 1)): {
            "class_type": ctype,
            "inputs": {k: 1 for k in sorted(inputs)},
            "_meta": {"title": title},
        }
        for i, (title, ctype, inputs) in enumerate(node_specs)
    }

    detailed = scan_master_variants_detailed(workflow, variants)
    assert len(detailed) == len(variants)

    # (ii) / (iii)
    for r in detailed:
        assert all(c["stage_rank"] != 4 for c in r["candidates"])
        if r["status"] in ("ok", "duplicated"):
            assert r["confirmed"] == r["candidates"][0]
        else:
            assert r["confirmed"] is None
            assert r["candidates"] == []

    # (i) derive matched/warnings from the detailed results
    scan = scan_workflow_variants(workflow, variants)
    exp_matched: list[dict] = []
    exp_warnings: list[dict] = []
    for r in detailed:
        v = r["variant"]
        if r["status"] == "disabled":
            continue
        base = {
            "master_id": v.master_id,
            "variant_id": v.id,
            "stage_id": v.stage_id,
            "stage_key": v.stage.key,
            "role": v.role,
        }
        if r["status"] == "not_found":
            exp_warnings.append({**base, "status": "not_found"})
            continue
        ids = [c["node_id"] for c in r["candidates"]]
        if r["status"] == "duplicated":
            exp_warnings.append({**base, "status": "duplicated", "node_ids": ids})
        exp_matched.append({
            **base,
            "node_id": r["confirmed"]["node_id"],
            "node_title": r["confirmed"]["node_title"],
            "input_name": r["confirmed"]["input_name"],
            "status": "ok",
            "node_ids": ids,
        })
    if not any(v.is_enabled for v in variants):
        exp_matched, exp_warnings = [], []
    assert scan["matched"] == exp_matched
    assert scan["warnings"] == exp_warnings

    # (iv) permuting the input list does not change per-variant results
    shuffled = list(variants)
    rnd.shuffle(shuffled)
    permuted = scan_master_variants_detailed(workflow, shuffled)
    baseline_by_id = {r["variant"].id: (r["status"], r["confirmed"], r["candidates"]) for r in detailed}
    permuted_by_id = {r["variant"].id: (r["status"], r["confirmed"], r["candidates"]) for r in permuted}
    assert baseline_by_id == permuted_by_id
