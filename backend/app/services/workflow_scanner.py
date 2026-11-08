"""Workflow scanner service - ported from Streamlit v1."""

import json
import logging

from typing import Optional, Any

logger = logging.getLogger(__name__)


def _safe_parse_json_list(val, master_id: int, field_name: str) -> list:
    if not val:
        return []
    if isinstance(val, list):
        return val
    try:
        return json.loads(val)
    except Exception as e:
        logger.error(f"Failed to parse {field_name} for master {master_id}: {e}")
        return []


def _find_candidate_nodes(
    workflow_json: dict,
    title_patterns: list,
    expected_class_types: list,
    param_names: list
) -> list[tuple[str, str, str]]:
    """Find nodes matching title patterns, class types, or parameter names."""
    candidates = []
    for node_id, node_data in workflow_json.items():
        if not isinstance(node_data, dict):
            continue
        meta = node_data.get("_meta")
        node_title = meta.get("title", "") if isinstance(meta, dict) and isinstance(meta.get("title"), str) else ""
        raw_class_type = node_data.get("class_type")
        node_class_type = raw_class_type if isinstance(raw_class_type, str) else ""

        # 1. Check title_patterns match
        title_match = False
        for pattern in title_patterns:
            if not isinstance(pattern, str):
                continue
            p_clean = pattern.strip().lower()
            if p_clean == node_title.strip().lower() or (node_class_type and p_clean == node_class_type.strip().lower()):
                title_match = True
                break

        # 2. Check class type match
        class_type_match = False
        if expected_class_types and node_class_type:
            class_type_match = any(
                isinstance(ct, str) and ct.strip().lower() == node_class_type.strip().lower()
                for ct in expected_class_types
            )

        # 3. Check parameter name match (if class type also matches)
        param_match = False
        if expected_class_types and param_names:
            if class_type_match:
                node_inputs = node_data.get("inputs", {})
                if isinstance(node_inputs, dict):
                    for input_key in node_inputs.keys():
                        if isinstance(input_key, str) and input_key.strip().lower() in param_names:
                            param_match = True
                            break

        if title_match or class_type_match or param_match:
            candidates.append((str(node_id), node_class_type, node_title))
    return candidates


def scan_workflow(workflow_json: dict, mapping_masters: list) -> dict:
    """
    Scan a ComfyUI API-format workflow JSON against mapping masters.
    Returns: { matched: [...], warnings: [...] }
    """
    matched = []
    warnings = []

    for master in mapping_masters:
        master_id = getattr(master, "id", 0)
        role = getattr(master, "role", getattr(master, "computed_role", getattr(master, "base_key", "")))
        expected_class_types = _safe_parse_json_list(
            getattr(master, "expected_class_types", None), master_id, "expected_class_types"
        )
        title_patterns = _safe_parse_json_list(
            getattr(master, "title_patterns", getattr(master, "base_title_patterns", None)),
            master_id,
            "title_patterns",
        )

        # Parse param_name as primary, plus fallback_param_names in order
        param_names = []
        if getattr(master, "param_name", None):
            param_names = [p.strip().lower() for p in master.param_name.split(",") if p.strip()]
        fallbacks = _safe_parse_json_list(getattr(master, "fallback_param_names", None), master_id, "fallback_param_names")
        for fb in fallbacks:
            if isinstance(fb, str) and fb.strip():
                fb_clean = fb.strip().lower()
                if fb_clean not in param_names:
                    param_names.append(fb_clean)

        candidates = _find_candidate_nodes(
            workflow_json, title_patterns, expected_class_types, param_names
        )

        if not candidates:
            warnings.append({
                "master_id": master_id,
                "role": role,
                "status": "not_found",
            })
            continue

        # Sort by node_id (numeric preferred)
        try:
            candidates.sort(key=lambda x: int(x[0]))
        except ValueError:
            candidates.sort(key=lambda x: x[0])

        all_ids = [c[0] for c in candidates]

        # Check if there is exactly one perfect match (class type AND title pattern match)
        perfect_matches = []
        for node_id, node_class_type, node_title in candidates:
            class_type_ok = any(
                isinstance(ct, str) and ct.strip().lower() == node_class_type.strip().lower()
                for ct in expected_class_types
            ) if expected_class_types and node_class_type else (not expected_class_types)
            title_ok = any(
                isinstance(p, str) and p.strip().lower() == node_title.strip().lower()
                for p in title_patterns
            ) if title_patterns and node_title else False
            if class_type_ok and title_ok:
                perfect_matches.append((node_id, node_class_type, node_title))

        is_smart_match = False
        if len(perfect_matches) == 1:
            selected_node_id, selected_class_type, selected_node_title = perfect_matches[0]
            is_smart_match = True
        elif len(perfect_matches) > 1:
            selected_node_id, selected_class_type, selected_node_title = perfect_matches[0]
            is_smart_match = False
        else:
            selected_node_id, selected_class_type, selected_node_title = candidates[0]
            is_smart_match = False

        if len(candidates) > 1 and not is_smart_match:
            warnings.append({
                "master_id": master_id,
                "role": role,
                "status": "duplicated",
                "node_ids": all_ids,
            })

        if expected_class_types and selected_class_type not in expected_class_types:
            warnings.append({
                "master_id": master_id,
                "role": role,
                "status": "class_type_mismatch",
                "node_id": selected_node_id,
                "actual_class_type": selected_class_type,
            })

        matched.append({
            "master_id": master_id,
            "role": role,
            "node_id": selected_node_id,
            "node_title": selected_node_title,
            "status": "ok",
            "node_ids": all_ids,
        })

    return {"matched": matched, "warnings": warnings}


STAGE_EXACT_MATCH = 1
STAGE_CONTAINS_MATCH = 2
STAGE_NO_SELECTOR = 3
STAGE_OTHER_SELECTOR = 4


def _candidate_sort_key(candidate: dict) -> tuple[int, int, int, int, str]:
    """
    辞書式ソートキー:
    1. stage_rank (1=自セレクタ完全一致, 2=自セレクタ部分一致, 3=セレクタなし/不一致)
    2. entry_priority (小さい値が高優先)
    3. pattern_priority (小さい値が高優先)
    4. numeric_id (小さいノードID優先)
    5. raw_node_id (安定比較用)
    """
    return (
        candidate["stage_rank"],
        candidate["entry_priority"],
        candidate["pattern_priority"],
        candidate["numeric_id"],
        candidate["node_id"],
    )


def _match_binding_entries(node_data: dict, variant: Any) -> Optional[tuple[str, int]]:
    """
    Match node_data against variant's BindingRuleSet entries.
    Returns (actual_input_name, entry_priority) if matched, or None if disqualified.
    """
    if not isinstance(node_data, dict):
        return None
    raw_class_type = node_data.get("class_type")
    node_class_type = str(raw_class_type).strip().lower() if raw_class_type else ""
    node_inputs = node_data.get("inputs")
    if not isinstance(node_inputs, dict):
        return None

    input_keys_map = {str(k).strip().lower(): str(k) for k in node_inputs.keys()}

    # Entries come only from variant.binding_rule_set (no master-column fallback).
    rule_entries: list[Any] = []
    binding_rule_set = getattr(variant, "binding_rule_set", None)
    if binding_rule_set and getattr(binding_rule_set, "entries", None):
        rule_entries = list(binding_rule_set.entries)

    if not rule_entries:
        return None

    matched_entries: list[tuple[int, str]] = []
    for entry in rule_entries:
        e_ct = str(getattr(entry, "class_type", "")).strip().lower()
        e_param = str(getattr(entry, "param_name", "")).strip().lower()
        e_prio = getattr(entry, "priority", 1)

        if e_ct == node_class_type and e_param in input_keys_map:
            actual_name = input_keys_map[e_param]
            matched_entries.append((e_prio, actual_name))

    if not matched_entries:
        return None

    matched_entries.sort(key=lambda x: x[0])
    best_prio, best_input_name = matched_entries[0]
    return (best_input_name, best_prio)


def _get_variant_patterns(variant: Any) -> list[tuple[str, str, int]]:
    """
    Returns list of (pattern, match_type, priority).
    """
    patterns: list[tuple[str, str, int]] = []
    selector = getattr(variant, "node_selector", None)
    if selector and getattr(selector, "patterns", None):
        for p in selector.patterns:
            pat_str = getattr(p, "pattern", "")
            if isinstance(pat_str, str) and pat_str.strip():
                m_type = getattr(p, "match_type", "contains")
                if m_type not in ("exact", "contains"):
                    m_type = "contains"
                prio = getattr(p, "priority", 1)
                patterns.append((pat_str.strip(), m_type, prio))

    return patterns


def _match_variant_patterns(node_title: str, patterns: list[tuple[str, str, int]]) -> Optional[tuple[int, int, int]]:
    """
    Match node_title against a variant's patterns.
    Returns (tier, length, best_priority) where tier is 2 for exact, 1 for contains.
    """
    best_spec = None
    best_prio = 999999
    t_clean = node_title.strip().lower()

    for pat, match_type, prio in patterns:
        p_clean = pat.strip().lower()
        if not p_clean:
            continue
        matched = False
        tier = 0
        if match_type == "exact":
            if p_clean == t_clean:
                matched = True
                tier = 2
        elif match_type == "contains":
            if p_clean in t_clean:
                matched = True
                tier = 1

        if matched:
            spec = (tier, len(p_clean), -prio)
            if best_spec is None or spec > best_spec:
                best_spec = spec
                best_prio = prio

    if best_spec is not None:
        tier, length, _ = best_spec
        return (tier, length, best_prio)
    return None


def _resolve_multi_stage_conflicts(
    node_title: str, master_variants: list[Any], node_data: dict
) -> dict[Any, tuple[int, int]]:
    """
    Resolve stage classifications (1, 2, 3, 4) for all variants of the same master
    that matched the node's entry.
    Returns: {id(v): (stage_rank, pattern_priority)}
    """
    variant_matches: dict[Any, tuple[int, int, int]] = {}
    valid_variants: list[Any] = []

    for v in master_variants:
        if _match_binding_entries(node_data, v) is None:
            continue
        valid_variants.append(v)
        pats = _get_variant_patterns(v)
        m = _match_variant_patterns(node_title, pats)
        if m is not None:
            variant_matches[id(v)] = m

    if not valid_variants:
        return {}

    result: dict[Any, tuple[int, int]] = {}

    if not variant_matches:
        # Stage 3: No selector or no match on any selector
        for v in valid_variants:
            result[id(v)] = (STAGE_NO_SELECTOR, 999999)
        return result

    # At least one variant had a selector match. Find maximum specificity:
    max_spec = max((m[0], m[1]) for m in variant_matches.values())

    for v in valid_variants:
        m = variant_matches.get(id(v))
        if m is not None and (m[0], m[1]) == max_spec:
            tier, _, pat_prio = m
            if tier == 2:
                result[id(v)] = (STAGE_EXACT_MATCH, pat_prio)
            else:
                result[id(v)] = (STAGE_CONTAINS_MATCH, pat_prio)
        else:
            result[id(v)] = (STAGE_OTHER_SELECTOR, 999999)

    return result


def _evaluate_candidate_stages(workflow_json: dict, master_variants: list[Any]) -> dict[Any, list[dict]]:
    """
    Evaluate candidate nodes for each variant of the master.
    Returns: {id(v): list[candidate_dict]}
    """
    candidates_by_var: dict[Any, list[dict]] = {id(v): [] for v in master_variants}

    for node_id, node_data in workflow_json.items():
        if not isinstance(node_data, dict):
            continue
        meta = node_data.get("_meta")
        node_title = (
            meta.get("title", "") if isinstance(meta, dict) and isinstance(meta.get("title"), str) else ""
        )
        if not node_title:
            raw_class_type = node_data.get("class_type")
            node_title = str(raw_class_type or "")

        conflicts = _resolve_multi_stage_conflicts(node_title, master_variants, node_data)

        try:
            numeric_id = int(node_id)
        except (ValueError, TypeError):
            numeric_id = 999999999

        for v in master_variants:
            if id(v) not in conflicts:
                continue
            stage_rank, pat_prio = conflicts[id(v)]
            if stage_rank == STAGE_OTHER_SELECTOR:
                continue

            entry_match = _match_binding_entries(node_data, v)
            if entry_match is None:
                continue
            input_name, entry_prio = entry_match

            candidate = {
                "node_id": str(node_id),
                "numeric_id": numeric_id,
                "stage_rank": stage_rank,
                "entry_priority": entry_prio,
                "pattern_priority": pat_prio,
                "input_name": input_name,
                "node_title": node_title,
                "class_type": str(node_data.get("class_type") or ""),
            }
            candidates_by_var[id(v)].append(candidate)

    return candidates_by_var


STATUS_DISABLED = "disabled"


def _is_variant_enabled(variant: Any) -> bool:
    return getattr(variant, "is_enabled", True) is not False


def _master_group_key(var: Any) -> Any:
    m_id = getattr(var, "master_id", None)
    if m_id is None and getattr(var, "master", None):
        m_id = getattr(var.master, "id", None)
    if m_id is None:
        m_id = id(getattr(var, "master", var))
    return m_id


def _variant_stage_sort_key(v: Any) -> tuple[int, int, int, int]:
    st = getattr(v, "stage", None)
    st_order = getattr(st, "sort_order", 0) if st else 0
    st_id = getattr(st, "id", 0) if st else getattr(v, "stage_id", 0)
    v_order = getattr(v, "sort_order", 0)
    v_id = getattr(v, "id", 0)
    return (st_order, v_order, st_id, v_id)


def _resolve_variant_role(var: Any) -> Any:
    """Resolve role: role -> computed_role -> custom_role_override -> base_key + suffix."""
    stage = getattr(var, "stage", None)
    master = getattr(var, "master", None)
    role = getattr(var, "role", None) or getattr(var, "computed_role", None)
    if not role:
        if getattr(var, "custom_role_override", None):
            role = var.custom_role_override
        else:
            suffix = getattr(stage, "suffix", "") if stage else ""
            base = getattr(master, "base_key", getattr(master, "role", "")) if master else ""
            role = f"{base}{suffix}"
    return role


def scan_master_variants_detailed(workflow_json: dict, mapping_variants: list) -> list[dict]:
    """Return one result per input variant (including disabled ones).

    Keys: variant (the input object), status ('ok'|'duplicated'|'not_found'|'disabled'),
    confirmed (candidate dict or None), candidates (list of candidate dicts sorted by
    _candidate_sort_key after excluding nodes confirmed by earlier variants of the same master).
    Candidate dict keys: node_id, numeric_id, stage_rank, entry_priority, pattern_priority,
    input_name, node_title, class_type. stage_rank 4 never appears.
    Order: grouped by master in first-seen order; within a master by _variant_stage_sort_key;
    disabled variants are placed by the same key with status 'disabled' and do not consume nodes.
    """
    master_groups: dict[Any, list[Any]] = {}
    for var in mapping_variants:
        master_groups.setdefault(_master_group_key(var), []).append(var)

    workflow_ok = isinstance(workflow_json, dict)
    results: list[dict] = []

    for m_vars in master_groups.values():
        m_vars = sorted(m_vars, key=_variant_stage_sort_key)
        enabled_vars = [v for v in m_vars if _is_variant_enabled(v)]
        candidates_by_var = (
            _evaluate_candidate_stages(workflow_json, enabled_vars) if workflow_ok else {}
        )

        confirmed_nodes: set[str] = set()
        confirmed_pairs: set[tuple[str, str]] = set()

        for var in m_vars:
            if not _is_variant_enabled(var):
                results.append({
                    "variant": var,
                    "status": STATUS_DISABLED,
                    "confirmed": None,
                    "candidates": [],
                })
                continue

            var_candidates = [
                c for c in candidates_by_var.get(id(var), [])
                if c["node_id"] not in confirmed_nodes and (c["node_id"], c["input_name"]) not in confirmed_pairs
            ]
            if not var_candidates:
                results.append({
                    "variant": var,
                    "status": "not_found",
                    "confirmed": None,
                    "candidates": [],
                })
                continue

            var_candidates.sort(key=_candidate_sort_key)
            best = var_candidates[0]
            top_stage_count = sum(1 for c in var_candidates if c["stage_rank"] == best["stage_rank"])
            results.append({
                "variant": var,
                "status": "duplicated" if top_stage_count > 1 else "ok",
                "confirmed": best,
                "candidates": var_candidates,
            })
            confirmed_nodes.add(best["node_id"])
            confirmed_pairs.add((best["node_id"], best["input_name"]))

    return results


def scan_workflow_variants(workflow_json: dict, mapping_variants: list) -> dict:
    """
    Scan a ComfyUI API-format workflow JSON against mapping variants using
    Entry-based candidate extraction, multi-stage conflict resolution, and lexicographical sorting.
    Returns: { matched: [...], warnings: [...] }
    """
    matched: list[dict] = []
    warnings: list[dict] = []

    enabled_variants = [v for v in mapping_variants if _is_variant_enabled(v)]
    if not enabled_variants or not isinstance(workflow_json, dict):
        return {"matched": [], "warnings": []}

    # Master group output order: first appearance among enabled variants.
    master_order: dict[Any, int] = {}
    for var in enabled_variants:
        master_order.setdefault(_master_group_key(var), len(master_order))

    detailed = scan_master_variants_detailed(workflow_json, mapping_variants)
    # Stable sort keeps the per-master variant order produced by the detailed scan.
    ordered = sorted(
        (r for r in detailed if r["status"] != STATUS_DISABLED),
        key=lambda r: master_order[_master_group_key(r["variant"])],
    )

    for res in ordered:
        var = res["variant"]
        stage = getattr(var, "stage", None)
        master = getattr(var, "master", None)
        base = {
            "master_id": getattr(var, "master_id", getattr(master, "id", 0) if master else 0),
            "variant_id": getattr(var, "id", 0),
            "stage_id": getattr(var, "stage_id", 0),
            "stage_key": getattr(stage, "key", "") if stage else "",
            "role": _resolve_variant_role(var),
        }

        if res["status"] == "not_found":
            warnings.append({**base, "status": "not_found"})
            continue

        best = res["confirmed"]
        all_candidate_ids = [c["node_id"] for c in res["candidates"]]
        if res["status"] == "duplicated":
            warnings.append({**base, "status": "duplicated", "node_ids": all_candidate_ids})
        matched.append({
            **base,
            "node_id": best["node_id"],
            "node_title": best["node_title"],
            "input_name": best["input_name"],
            "status": "ok",
            "node_ids": all_candidate_ids,
        })

    return {"matched": matched, "warnings": warnings}


def detect_checkpoint_names(workflow_json: dict) -> list[str]:
    """Detect checkpoint names from workflow JSON."""
    checkpoint_names = []
    if not isinstance(workflow_json, dict):
        return []
    for node_id, node_data in workflow_json.items():
        if not isinstance(node_data, dict):
            continue
        class_type = node_data.get("class_type")
        inputs = node_data.get("inputs", {})
        if not isinstance(inputs, dict):
            continue

        is_checkpoint_node = False
        if class_type in ("CheckpointLoaderSimple", "CheckpointLoader"):
            is_checkpoint_node = True
        elif "ckpt_name" in inputs:
            is_checkpoint_node = True

        if is_checkpoint_node:
            ckpt_name = inputs.get("ckpt_name")
            if isinstance(ckpt_name, str) and ckpt_name:
                cleaned = ckpt_name.strip()
                if cleaned and cleaned not in checkpoint_names:
                    checkpoint_names.append(cleaned)
    return checkpoint_names


def estimate_base_model_from_checkpoints(checkpoint_names: list[str], mappings: list) -> Optional[int]:
    """
    Estimate base model ID from detected checkpoint names based on mappings.
    mappings is a list of CheckpointMapping objects with checkpoint_name and base_model_id.
    """
    if not checkpoint_names or not mappings:
        return None

    # 1. Exact Match (case-insensitive) of full checkpoint name
    for ckpt in checkpoint_names:
        ckpt_lower = ckpt.lower()
        for m in mappings:
            if m.checkpoint_name.lower() == ckpt_lower:
                return m.base_model_id

    # 2. Exact Match (case-insensitive) of base filename
    for ckpt in checkpoint_names:
        normalized = ckpt.replace("\\", "/")
        filename = normalized.split("/")[-1]
        filename_lower = filename.lower()
        for m in mappings:
            m_normalized = m.checkpoint_name.replace("\\", "/").split("/")[-1]
            if m_normalized.lower() == filename_lower:
                return m.base_model_id

    # 3. Partial Match: mapping checkpoint_name is substring of filename
    sorted_mappings = sorted(mappings, key=lambda x: len(x.checkpoint_name), reverse=True)
    for ckpt in checkpoint_names:
        normalized = ckpt.replace("\\", "/")
        filename = normalized.split("/")[-1]
        filename_lower = filename.lower()
        for m in sorted_mappings:
            m_lower = m.checkpoint_name.lower()
            if m_lower in filename_lower:
                return m.base_model_id

    # 4. Partial Match: filename is substring of mapping checkpoint_name
    for ckpt in checkpoint_names:
        normalized = ckpt.replace("\\", "/")
        filename = normalized.split("/")[-1]
        filename_lower = filename.lower()
        if filename_lower.endswith(".safetensors"):
            filename_no_ext = filename_lower[:-12]
        elif filename_lower.endswith(".ckpt"):
            filename_no_ext = filename_lower[:-5]
        else:
            filename_no_ext = filename_lower

        if filename_no_ext:
            for m in sorted_mappings:
                m_lower = m.checkpoint_name.lower()
                if filename_no_ext in m_lower or m_lower in filename_lower:
                    return m.base_model_id

    return None
