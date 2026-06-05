"""Workflow scanner service - ported from Streamlit v1."""

import json
import logging

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


def _find_candidate_nodes(workflow_json: dict, title_patterns: list) -> list[tuple[str, str]]:
    """Find nodes matching any of the title patterns."""
    candidates = []
    for node_id, node_data in workflow_json.items():
        if not isinstance(node_data, dict):
            continue
        node_title = node_data.get("_meta", {}).get("title", "")
        node_class_type = node_data.get("class_type", "")
        for pattern in title_patterns:
            p_clean = pattern.strip().lower()
            if p_clean == node_title.strip().lower() or p_clean == node_class_type.strip().lower():
                candidates.append((node_id, node_class_type, node_title))
                break
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

        candidates = _find_candidate_nodes(workflow_json, title_patterns)

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

        selected_node_id, selected_class_type, selected_node_title = candidates[0]

        if len(candidates) > 1:
            all_ids = [c[0] for c in candidates]
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
        })

    return {"matched": matched, "warnings": warnings}
