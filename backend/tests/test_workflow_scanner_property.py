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
