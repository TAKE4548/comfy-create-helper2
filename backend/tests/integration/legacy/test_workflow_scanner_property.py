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

