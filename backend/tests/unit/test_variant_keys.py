"""Unit tests for variant_keys and VariantRef schema (REQ-418)."""

import logging
from hypothesis import given, strategies as st
import pytest

from app.schemas.variant_ref import VariantRef
from app.services.variant_keys import (
    ClassifiedKey,
    ExpandedParams,
    KeyKind,
    NormalizedParams,
    VariantIndex,
    decode_variant_key,
    encode_variant_key,
    expand_stored_params,
    normalize_params,
    to_storage_params,
)


def test_variant_ref_schema_instantiation() -> None:
    """[REQ-418/AC-1] Test VariantRef schema creation and field access."""
    ref = VariantRef(id=1, role="Sampler_Seed", display_name="Seed")
    assert ref.id == 1
    assert ref.role == "Sampler_Seed"
    assert ref.display_name == "Seed"

    ref_no_display = VariantRef(id=2, role="Prompt_pos")
    assert ref_no_display.display_name is None


def test_variant_ref_ac1_classify_priority_order() -> None:
    """[REQ-418/AC-1] Test classification priority order (RESERVED -> VARIANT -> ROLE -> DERIVED_ROLE -> UNRESOLVED)."""
    index = VariantIndex({1: "Sampler_Seed", 2: "Prompt_pos"})

    # (1) RESERVED
    res1 = index.classify("__custom_meta")
    assert res1 == ClassifiedKey(kind=KeyKind.RESERVED, key="__custom_meta", variant_id=None, sub_key="")

    # (2) VARIANT - existing
    res2 = index.classify("v:1")
    assert res2 == ClassifiedKey(kind=KeyKind.VARIANT, key="v:1", variant_id=1, sub_key="")

    res2_sub = index.classify("v:2:lora_count")
    assert res2_sub == ClassifiedKey(kind=KeyKind.VARIANT, key="v:2:lora_count", variant_id=2, sub_key="lora_count")

    # (2) VARIANT - non-existing (deleted variant) -> UNRESOLVED
    res2_unres = index.classify("v:999")
    assert res2_unres == ClassifiedKey(kind=KeyKind.UNRESOLVED, key="v:999", variant_id=None, sub_key="")

    # (3) ROLE
    res3 = index.classify("Prompt_pos")
    assert res3 == ClassifiedKey(kind=KeyKind.ROLE, key="Prompt_pos", variant_id=2, sub_key="")

    # (4) DERIVED_ROLE
    res4_count = index.classify("Sampler_Seed_lora_count")
    assert res4_count == ClassifiedKey(
        kind=KeyKind.DERIVED_ROLE, key="Sampler_Seed_lora_count", variant_id=1, sub_key="lora_count"
    )

    res4_name = index.classify("Sampler_Seed_lora_name_3")
    assert res4_name == ClassifiedKey(
        kind=KeyKind.DERIVED_ROLE, key="Sampler_Seed_lora_name_3", variant_id=1, sub_key="lora_name_3"
    )

    res4_wt = index.classify("Sampler_Seed_lora_wt_0")
    assert res4_wt == ClassifiedKey(
        kind=KeyKind.DERIVED_ROLE, key="Sampler_Seed_lora_wt_0", variant_id=1, sub_key="lora_wt_0"
    )

    res4_model = index.classify("Sampler_Seed_model_str_12")
    assert res4_model == ClassifiedKey(
        kind=KeyKind.DERIVED_ROLE, key="Sampler_Seed_model_str_12", variant_id=1, sub_key="model_str_12"
    )

    res4_clip = index.classify("Sampler_Seed_clip_str_1")
    assert res4_clip == ClassifiedKey(
        kind=KeyKind.DERIVED_ROLE, key="Sampler_Seed_clip_str_1", variant_id=1, sub_key="clip_str_1"
    )

    # (5) UNRESOLVED
    res5_unknown = index.classify("Unknown_Role")
    assert res5_unknown == ClassifiedKey(kind=KeyKind.UNRESOLVED, key="Unknown_Role", variant_id=None, sub_key="")

    res5_unknown_derived = index.classify("Unknown_Role_lora_count")
    assert res5_unknown_derived == ClassifiedKey(
        kind=KeyKind.UNRESOLVED, key="Unknown_Role_lora_count", variant_id=None, sub_key=""
    )

    # role_of & role_key
    assert index.role_of(1) == "Sampler_Seed"
    assert index.role_of(2) == "Prompt_pos"
    assert index.role_of(999) is None

    assert index.role_key(1) == "Sampler_Seed"
    assert index.role_key(1, "lora_count") == "Sampler_Seed_lora_count"
    assert index.role_key(999) is None
    assert index.role_key(999, "lora_count") is None

    # from_session
    class _FakeQuery:
        def all(self) -> list[tuple[int, str]]:
            return [(10, "Role_A"), (20, "Role_B")]

    class _FakeSession:
        def query(self, *entities: object) -> _FakeQuery:
            return _FakeQuery()

    session_index = VariantIndex.from_session(_FakeSession())  # type: ignore[arg-type]
    assert session_index.role_of(10) == "Role_A"
    assert session_index.role_of(20) == "Role_B"
    assert session_index.classify("Role_A").kind == KeyKind.ROLE


def test_variant_ref_ac1_exact_role_beats_derived_suffix() -> None:
    """[REQ-418/AC-1] Test that an exact role match beats the derived suffix pattern."""
    index = VariantIndex({1: "Base_role", 2: "Base_role_lora_count"})

    exact_res = index.classify("Base_role_lora_count")
    assert exact_res.kind == KeyKind.ROLE
    assert exact_res.variant_id == 2
    assert exact_res.sub_key == ""

    derived_res = index.classify("Base_role_lora_count_lora_count")
    assert derived_res.kind == KeyKind.DERIVED_ROLE
    assert derived_res.variant_id == 2
    assert derived_res.sub_key == "lora_count"


@given(
    variant_id=st.integers(min_value=0, max_value=1_000_000),
    sub_key=st.from_regex(r"^[A-Za-z0-9_]*$", fullmatch=True),
)
def test_variant_ref_ac1_encode_decode_roundtrip_pbt(variant_id: int, sub_key: str) -> None:
    """[REQ-418/AC-1] Hypothesis test for encode_variant_key / decode_variant_key round-trip."""
    encoded = encode_variant_key(variant_id, sub_key)
    decoded = decode_variant_key(encoded)
    assert decoded == (variant_id, sub_key)


@given(key=st.text())
def test_variant_ref_ac1_classify_never_raises_pbt(key: str) -> None:
    """[REQ-418/AC-1] Hypothesis test that VariantIndex.classify never raises for arbitrary string keys."""
    index = VariantIndex({1: "Sampler_Seed", 2: "Prompt_pos"})
    classified = index.classify(key)
    assert isinstance(classified, ClassifiedKey)
    assert classified.key == key
    assert classified.kind in KeyKind


def test_variant_ref_ac1_normalize_params_values_and_unresolved() -> None:
    """[REQ-418/AC-1] Test normalize_params stringification, collision order, and unresolved keys."""
    index = VariantIndex({1: "Sampler_Seed", 2: "Prompt_pos"})
    params = {
        "Sampler_Seed": 42,
        "Prompt_pos": "test prompt",
        "__meta": {"source": "test"},
        "Unknown_key": "xyz",
        "v:1": 999,
        "v:2:lora_count": 3,
    }

    norm = normalize_params(index, params)
    assert isinstance(norm, NormalizedParams)
    assert norm.entries[(1, "")] == "999"  # v:1 wins over Sampler_Seed, stringified
    assert norm.entries[(2, "")] == "test prompt"  # str preserved unchanged
    assert norm.entries[(2, "lora_count")] == "3"
    assert norm.reserved == {"__meta": {"source": "test"}}
    assert norm.unresolved == ["Unknown_key"]


def test_variant_ref_ac2_expand_legacy_role_keys_maps_and_reports_missing() -> None:
    """[REQ-418/AC-2] Test expand_stored_params role mapping, current role expansion, and missing keys."""
    index = VariantIndex({1: "Sampler_Seed", 2: "Prompt_pos"})
    stored = {
        "Sampler_Seed": 42,
        "Prompt_pos_lora_count": 3,
        "v:1:lora_wt_1": 0.8,
        "__tag": "unit-test",
        "Deleted_role": "legacy",
    }

    expanded = expand_stored_params(index, stored, owner_label="test_owner", warn=False)
    assert isinstance(expanded, ExpandedParams)

    assert expanded.role_keyed == {
        "__tag": "unit-test",
        "Prompt_pos_lora_count": 3,
        "Sampler_Seed": 42,
        "Sampler_Seed_lora_wt_1": 0.8,
    }

    assert expanded.variant_keyed == {
        "__tag": "unit-test",
        "v:1": 42,
        "v:1:lora_wt_1": 0.8,
        "v:2:lora_count": 3,
    }

    assert expanded.missing == ["Deleted_role"]


def test_variant_ref_ac2_expand_warns_with_owner_label(caplog: pytest.LogCaptureFixture) -> None:
    """[REQ-418/AC-2] Test expand_stored_params warning emissions with caplog and owner_label."""
    index = VariantIndex({1: "Sampler_Seed"})
    stored_with_missing = {"Unknown_A": 1, "Unknown_B": 2}

    # Case 1: warn=True and missing is non-empty -> emits warning with owner_label and missing keys
    with caplog.at_level(logging.WARNING):
        caplog.clear()
        expand_stored_params(index, stored_with_missing, owner_label="preset:my_preset", warn=True)
        assert len(caplog.records) == 1
        assert caplog.records[0].levelno == logging.WARNING
        assert "preset:my_preset" in caplog.text
        assert "Unknown_A" in caplog.text
        assert "Unknown_B" in caplog.text

    # Case 2: warn=False and missing is non-empty -> silent
    with caplog.at_level(logging.WARNING):
        caplog.clear()
        expand_stored_params(index, stored_with_missing, owner_label="preset:my_preset", warn=False)
        assert len(caplog.records) == 0

    # Case 3: warn=True but missing is empty -> silent
    with caplog.at_level(logging.WARNING):
        caplog.clear()
        expand_stored_params(index, {"Sampler_Seed": 10}, owner_label="preset:my_preset", warn=True)
        assert len(caplog.records) == 0


def test_variant_ref_ac2_to_storage_params_variant_keys_and_reserved_passthrough() -> None:
    """[REQ-418/AC-2] Test to_storage_params produces v: keys and passes reserved keys unmodified."""
    index = VariantIndex({1: "Sampler_Seed", 2: "Prompt_pos"})
    params = {
        "Sampler_Seed": 42,
        "Prompt_pos_lora_count": 3,
        "v:1": 99,
        "__custom": ["a", "b"],
        "Unknown_key": "drop_me",
    }

    storage_dict, unresolved = to_storage_params(index, params)

    assert storage_dict == {
        "__custom": ["a", "b"],
        "v:1": 99,
        "v:2:lora_count": 3,
    }
    assert storage_dict["v:1"] == 99  # original int value, v:1 overwrote Sampler_Seed
    assert storage_dict["__custom"] == ["a", "b"]  # original list value
    assert unresolved == ["Unknown_key"]
