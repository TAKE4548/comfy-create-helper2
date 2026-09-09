"""Workflow scanner service - ported from Streamlit v1."""

import json
import logging

from typing import Optional

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
        master_id = master.id
        role = master.role
        expected_class_types = _safe_parse_json_list(
            master.expected_class_types, master_id, "expected_class_types"
        )
        title_patterns = _safe_parse_json_list(
            master.title_patterns, master_id, "title_patterns"
        )

        # Parse param_name as potentially comma-separated aliases
        param_names = []
        if master.param_name:
            param_names = [p.strip().lower() for p in master.param_name.split(",") if p.strip()]

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
