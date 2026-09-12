"""Workflow diff engine for ComfyUI workflows.

Extracts network topology (DAG connections, node class types, titles, IDs)
and matches old and new nodes using fingerprinting and Jaccard similarity scoring.
"""

from __future__ import annotations

import difflib
from typing import Any, Optional, TypedDict


class NodeTopology(TypedDict):
    node_id: str
    title: str
    class_type: str
    inputs: list[dict[str, Any]]   # [{'slot': 'clip', 'source_node_id': '4', 'source_class': '...', 'source_title': '...'}]
    outputs: list[dict[str, Any]]  # [{'slot': 'positive', 'target_node_id': '3', 'target_class': '...', 'target_title': '...'}]


class NodeCandidate(TypedDict):
    node_id: str
    title: str
    class_type: str
    score: float


class RoleMigration(TypedDict):
    master_id: int
    role: str
    display_name: str
    old_node_id: str
    new_node_id: Optional[str]
    confidence: float
    reason: str
    status: str  # ok | renamed | reindexed | substituted | false_reuse | not_found
    candidates: list[NodeCandidate]
    old_topology: Optional[NodeTopology]
    new_topology: Optional[NodeTopology]


def jaccard_similarity(set_a: set[Any], set_b: set[Any]) -> float:
    """Compute Jaccard similarity between two sets.
    
    Returns 1.0 if both sets are empty (e.g. source nodes with no inputs,
    or terminal sink nodes with no outputs).
    """
    if len(set_a) == 0 and len(set_b) == 0:
        return 1.0
    union = len(set_a | set_b)
    if union == 0:
        return 0.0
    return len(set_a & set_b) / union


def levenshtein_ratio(s1: str, s2: str) -> float:
    """Compute string similarity ratio between two titles."""
    if s1 == s2:
        return 1.0
    return difflib.SequenceMatcher(None, s1.lower(), s2.lower()).ratio()


def extract_topology(workflow: dict[str, Any]) -> dict[str, NodeTopology]:
    """Extract DAG topology from a ComfyUI workflow JSON.
    
    Supports both:
    1. UI / Graph format: {"nodes": [...], "links": [...]}
    2. API / Prompt format: {"node_id": {"class_type": ..., "inputs": ...}}
    """
    if not isinstance(workflow, dict):
        return {}

    # Check if UI format
    if "nodes" in workflow and isinstance(workflow["nodes"], list):
        return _extract_ui_topology(workflow)
    
    # Otherwise treat as API prompt format
    return _extract_api_topology(workflow)


def _extract_ui_topology(workflow: dict[str, Any]) -> dict[str, NodeTopology]:
    nodes_list = workflow.get("nodes", [])
    links_list = workflow.get("links", [])

    # Map link_id -> (source_node_id, source_slot_index, target_node_id, target_slot_index, type_name)
    link_map: dict[int, tuple[str, Any, str, Any, str]] = {}
    if isinstance(links_list, list):
        for link in links_list:
            if isinstance(link, (list, tuple)) and len(link) >= 5:
                lid = link[0]
                src_id = str(link[1])
                src_slot = link[2]
                tgt_id = str(link[3])
                tgt_slot = link[4]
                type_name = link[5] if len(link) > 5 else ""
                link_map[lid] = (src_id, src_slot, tgt_id, tgt_slot, type_name)

    topologies: dict[str, NodeTopology] = {}

    for node in nodes_list:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id"))
        class_type = str(node.get("type", ""))
        title = str(node.get("title") or class_type)

        raw_inputs = node.get("inputs", [])
        inputs_parsed: list[dict[str, Any]] = []
        if isinstance(raw_inputs, list):
            for inp in raw_inputs:
                if not isinstance(inp, dict):
                    continue
                slot_name = inp.get("name", "")
                link_id = inp.get("link")
                source_id = None
                if link_id is not None and link_id in link_map:
                    source_id = link_map[link_id][0]
                if source_id is not None:
                    inputs_parsed.append({
                        "slot": slot_name,
                        "source_node_id": source_id,
                        "source_class": "",
                        "source_title": "",
                    })

        raw_outputs = node.get("outputs", [])
        outputs_parsed: list[dict[str, Any]] = []
        if isinstance(raw_outputs, list):
            for out in raw_outputs:
                if not isinstance(out, dict):
                    continue
                slot_name = out.get("name", "")
                links = out.get("links") or []
                if isinstance(links, list):
                    for lid in links:
                        if lid in link_map:
                            target_id = link_map[lid][2]
                            outputs_parsed.append({
                                "slot": slot_name,
                                "target_node_id": target_id,
                                "target_class": "",
                                "target_title": "",
                            })

        topologies[node_id] = {
            "node_id": node_id,
            "title": title,
            "class_type": class_type,
            "inputs": inputs_parsed,
            "outputs": outputs_parsed,
        }

    # Second pass: fill class_type and title for source and target
    _resolve_peer_metadata(topologies)
    return topologies


def _extract_api_topology(workflow: dict[str, Any]) -> dict[str, NodeTopology]:
    topologies: dict[str, NodeTopology] = {}

    for node_id_raw, node_data in workflow.items():
        if not isinstance(node_data, dict):
            continue
        if "class_type" not in node_data and "inputs" not in node_data:
            continue

        node_id = str(node_id_raw)
        class_type = str(node_data.get("class_type", ""))
        meta = node_data.get("_meta", {})
        title = ""
        if isinstance(meta, dict):
            title = meta.get("title", "")
        if not title:
            title = str(node_data.get("title") or class_type)

        raw_inputs = node_data.get("inputs", {})
        inputs_parsed: list[dict[str, Any]] = []
        if isinstance(raw_inputs, dict):
            for slot_name, val in raw_inputs.items():
                if isinstance(val, (list, tuple)) and len(val) == 2:
                    source_id = str(val[0])
                    inputs_parsed.append({
                        "slot": slot_name,
                        "source_node_id": source_id,
                        "source_class": "",
                        "source_title": "",
                    })

        topologies[node_id] = {
            "node_id": node_id,
            "title": title,
            "class_type": class_type,
            "inputs": inputs_parsed,
            "outputs": [],
        }

    # Populate outputs by inverting inputs
    for node_id, topo in list(topologies.items()):
        for inp in topo["inputs"]:
            src_id = inp["source_node_id"]
            if src_id in topologies:
                topologies[src_id]["outputs"].append({
                    "slot": inp["slot"],
                    "target_node_id": node_id,
                    "target_class": "",
                    "target_title": "",
                })

    # Second pass: fill class_type and title for source and target
    _resolve_peer_metadata(topologies)
    return topologies


def _resolve_peer_metadata(topologies: dict[str, NodeTopology]) -> None:
    for topo in topologies.values():
        for inp in topo["inputs"]:
            src_id = inp.get("source_node_id")
            if src_id and src_id in topologies:
                inp["source_class"] = topologies[src_id]["class_type"]
                inp["source_title"] = topologies[src_id]["title"]
            else:
                inp["source_class"] = "unknown"
                inp["source_title"] = "unknown"

        for out in topo["outputs"]:
            tgt_id = out.get("target_node_id")
            if tgt_id and tgt_id in topologies:
                out["target_class"] = topologies[tgt_id]["class_type"]
                out["target_title"] = topologies[tgt_id]["title"]
            else:
                out["target_class"] = "unknown"
                out["target_title"] = "unknown"


def compute_similarity(
    old_node: NodeTopology,
    new_node: NodeTopology,
    old_topologies: dict[str, NodeTopology] | None = None,
    new_topologies: dict[str, NodeTopology] | None = None,
) -> tuple[float, str]:
    """Compute topology fingerprint similarity (0.0 to 100.0) and descriptive reason.
    
    Scoring breakdown (100 pts max):
    - 1. Class Type Match: 35 pts
    - 2. In-Degree Topology Jaccard: 30 pts (slot_name, upstream_class)
    - 3. Out-Degree Topology Jaccard: 20 pts (target_slot_name, downstream_class)
    - 4. Title similarity: 10 pts
    - 5. ID Bonus: 5 pts
    """
    old_class = old_node.get("class_type", "")
    new_class = new_node.get("class_type", "")
    class_match = 35.0 if old_class == new_class else 0.0

    # In-degree topology signatures: (slot, source_class)
    old_in_sig = {(inp.get("slot"), inp.get("source_class")) for inp in old_node.get("inputs", [])}
    new_in_sig = {(inp.get("slot"), inp.get("source_class")) for inp in new_node.get("inputs", [])}
    in_jaccard = jaccard_similarity(old_in_sig, new_in_sig)
    in_score = 30.0 * in_jaccard

    # Out-degree topology signatures: (slot, target_class)
    old_out_sig = {(out.get("slot"), out.get("target_class")) for out in old_node.get("outputs", [])}
    new_out_sig = {(out.get("slot"), out.get("target_class")) for out in new_node.get("outputs", [])}
    out_jaccard = jaccard_similarity(old_out_sig, new_out_sig)
    out_score = 20.0 * out_jaccard

    # Title similarity
    old_title = (old_node.get("title") or "").strip()
    new_title = (new_node.get("title") or "").strip()
    title_ratio = levenshtein_ratio(old_title, new_title)
    title_score = 10.0 * title_ratio

    # ID Bonus
    old_id = str(old_node.get("node_id"))
    new_id = str(new_node.get("node_id"))
    id_bonus = 5.0 if old_id == new_id else 0.0

    total = round(class_match + in_score + out_score + title_score + id_bonus, 1)
    total = max(0.0, min(100.0, total))

    # Generate reason
    reasons: list[str] = []
    if total == 100.0:
        reason = "完全一致 (クラス、入出力トポロジー、タイトル、IDが全て一致)"
    else:
        if class_match == 35.0:
            reasons.append("クラス型一致 (+35.0)")
        else:
            reasons.append(f"クラス型不一致 ({old_class} vs {new_class})")

        if in_score > 0:
            reasons.append(f"入力配線類似度 {in_jaccard:.2f} (+{in_score:.1f})")
        if out_score > 0:
            reasons.append(f"出力配線類似度 {out_jaccard:.2f} (+{out_score:.1f})")

        if title_score == 10.0:
            reasons.append("タイトル完全一致 (+10.0)")
        elif title_score > 0:
            reasons.append(f"タイトル類似度 {title_ratio:.2f} (+{title_score:.1f})")

        if id_bonus > 0:
            reasons.append(f"ID一致 ({old_id}) (+5.0)")
        elif old_id != new_id:
            reasons.append(f"ID変更 ({old_id} -> {new_id})")

        reason = f"類似度 {total:.1f}点: " + " / ".join(reasons)

    return total, reason


def find_candidates(
    old_node_id: str,
    old_topologies: dict[str, NodeTopology],
    new_topologies: dict[str, NodeTopology],
    min_score: float = 15.0,
) -> list[NodeCandidate]:
    """Find all candidate nodes in new workflow for a given old node, sorted by score descending."""
    if old_node_id not in old_topologies:
        return []

    old_node = old_topologies[old_node_id]
    candidates: list[NodeCandidate] = []

    for new_node_id, new_node in new_topologies.items():
        score, _ = compute_similarity(old_node, new_node, old_topologies, new_topologies)
        # Include if score >= min_score, or if same ID (even if lower, to diagnose false reuse)
        if score >= min_score or str(new_node_id) == str(old_node_id):
            candidates.append({
                "node_id": new_node_id,
                "title": new_node.get("title", ""),
                "class_type": new_node.get("class_type", ""),
                "score": score,
            })

    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates


def match_role(
    old_node_id: str,
    old_topologies: dict[str, NodeTopology],
    new_topologies: dict[str, NodeTopology],
    master_id: int = 0,
    role: str = "",
    display_name: str = "",
) -> RoleMigration:
    """Match an individual old node / role to the new workflow and determine migration status."""
    old_topology = old_topologies.get(old_node_id)
    if not old_topology:
        return {
            "master_id": master_id,
            "role": role,
            "display_name": display_name,
            "old_node_id": old_node_id,
            "new_node_id": None,
            "confidence": 0.0,
            "reason": f"旧ノード ID {old_node_id} がワークフロー内に存在しません",
            "status": "not_found",
            "candidates": [],
            "old_topology": None,
            "new_topology": None,
        }

    candidates = find_candidates(old_node_id, old_topologies, new_topologies)

    # Check same-ID node in new topology if present
    same_id_node = new_topologies.get(old_node_id)
    same_id_score = 0.0
    same_id_reason = ""
    if same_id_node:
        same_id_score, same_id_reason = compute_similarity(
            old_topology, same_id_node, old_topologies, new_topologies
        )

    best_candidate = candidates[0] if candidates else None

    # Decision logic
    status: str
    chosen_node_id: Optional[str] = None
    confidence: float = 0.0
    final_reason: str = ""

    # Case 1: Same ID exists but score < 40 -> False Reuse check
    if same_id_node and same_id_score < 40.0:
        # Check if there is another candidate that matches by topology with good score
        if best_candidate and best_candidate["node_id"] != old_node_id and best_candidate["score"] >= 65.0:
            status = "reindexed"
            chosen_node_id = best_candidate["node_id"]
            confidence = best_candidate["score"]
            final_reason = (
                f"旧ID {old_node_id} は別ノードに再利用されています(類似度{same_id_score:.1f}点)。"
                f"トポロジーからノード {chosen_node_id} へ引き継ぎと推測(信頼度{confidence:.1f}点)"
            )
        else:
            status = "false_reuse"
            chosen_node_id = None
            confidence = same_id_score
            final_reason = (
                f"ID不正再利用の警告: 同一ID {old_node_id} のノードが存在しますが、"
                f"クラス型または配線が乖離しています(類似度{same_id_score:.1f}点 < 40)"
            )

    # Case 2: Best candidate found
    elif best_candidate and best_candidate["score"] >= 40.0:
        chosen_node_id = best_candidate["node_id"]
        confidence = best_candidate["score"]
        candidate_node = new_topologies[chosen_node_id]
        cand_class = candidate_node.get("class_type", "")
        cand_title = candidate_node.get("title", "")
        old_class = old_topology.get("class_type", "")
        old_title = old_topology.get("title", "")

        if confidence == 100.0:
            status = "ok"
            final_reason = "完全一致 (100.0点)"
        elif old_class != cand_class:
            status = "substituted"
            final_reason = f"代替ノード検出: クラス型変更 ({old_class} -> {cand_class}, 信頼度{confidence:.1f}点)"
        elif chosen_node_id != old_node_id:
            # ID changed
            if old_title != cand_title:
                status = "renamed"
                final_reason = f"ID変更およびタイトル変更検出 (旧ID:{old_node_id}, 信頼度{confidence:.1f}点)"
            else:
                status = "reindexed"
                final_reason = f"ID変更検出 (旧ID:{old_node_id} -> 新ID:{chosen_node_id}, 信頼度{confidence:.1f}点)"
        elif old_title != cand_title:
            status = "renamed"
            final_reason = f"タイトル変更検出 ('{old_title}' -> '{cand_title}', 信頼度{confidence:.1f}点)"
        else:
            status = "ok"
            final_reason = f"同一ノード同定 (信頼度{confidence:.1f}点)"

    # Case 3: No valid candidate found
    else:
        status = "not_found"
        chosen_node_id = None
        confidence = 0.0
        final_reason = "新ワークフロー内に該当するノードが見つかりませんでした"

    new_topology = new_topologies.get(chosen_node_id) if chosen_node_id else None

    return {
        "master_id": master_id,
        "role": role,
        "display_name": display_name,
        "old_node_id": old_node_id,
        "new_node_id": chosen_node_id,
        "confidence": confidence,
        "reason": final_reason,
        "status": status,
        "candidates": candidates,
        "old_topology": old_topology,
        "new_topology": new_topology,
    }


class WorkflowDiffEngine:
    """Service class for workflow topology extraction, similarity scoring, and role migration."""

    @staticmethod
    def extract(workflow: dict[str, Any]) -> dict[str, NodeTopology]:
        return extract_topology(workflow)

    @staticmethod
    def compare_nodes(
        old_node: NodeTopology,
        new_node: NodeTopology,
        old_topologies: dict[str, NodeTopology] | None = None,
        new_topologies: dict[str, NodeTopology] | None = None,
    ) -> tuple[float, str]:
        return compute_similarity(old_node, new_node, old_topologies, new_topologies)

    @classmethod
    def analyze_role_migrations(
        cls,
        old_workflow: dict[str, Any],
        new_workflow: dict[str, Any],
        roles: list[dict[str, Any]],
    ) -> list[RoleMigration]:
        """Analyze role migrations for specified roles."""
        old_topos = extract_topology(old_workflow)
        new_topos = extract_topology(new_workflow)

        results: list[RoleMigration] = []
        for role_item in roles:
            master_id = int(role_item.get("master_id") or role_item.get("id", 0))
            role_name = str(role_item.get("role", ""))
            display_name = str(role_item.get("display_name", ""))
            old_node_id = str(role_item.get("node_id", ""))

            migration = match_role(
                old_node_id=old_node_id,
                old_topologies=old_topos,
                new_topologies=new_topos,
                master_id=master_id,
                role=role_name,
                display_name=display_name,
            )
            results.append(migration)

        return results

    @classmethod
    def analyze_all_nodes_diff(
        cls,
        old_workflow: dict[str, Any],
        new_workflow: dict[str, Any],
    ) -> list[RoleMigration]:
        """Analyze diff for all nodes in the old workflow."""
        old_topos = extract_topology(old_workflow)
        new_topos = extract_topology(new_workflow)

        results: list[RoleMigration] = []
        for old_node_id, old_node in old_topos.items():
            master_id = int(old_node_id) if old_node_id.isdigit() else 0
            migration = match_role(
                old_node_id=old_node_id,
                old_topologies=old_topos,
                new_topologies=new_topos,
                master_id=master_id,
                role=old_node.get("class_type", ""),
                display_name=old_node.get("title", ""),
            )
            results.append(migration)

        return results


def analyze_workflow_diff(
    old_json: dict[str, Any],
    new_json: dict[str, Any],
    mappings: list[Any],
    masters: list[Any],
    bypass_profiles: list[Any] | None = None,
) -> dict[str, Any]:
    """Perform full workflow diff analysis including role migrations, bypass warnings, and unmapped nodes."""
    import json
    old_topos = extract_topology(old_json)
    new_topos = extract_topology(new_json)

    master_dict = {m.id: m for m in masters}

    role_migrations: list[RoleMigration] = []
    mapped_new_node_ids: set[str] = set()

    for m in mappings:
        master = master_dict.get(m.master_id)
        role_name = master.role if master else ""
        display_name = master.display_name if master else ""
        mig = match_role(
            old_node_id=str(m.node_id),
            old_topologies=old_topos,
            new_topologies=new_topos,
            master_id=m.master_id,
            role=role_name,
            display_name=display_name,
        )
        role_migrations.append(mig)
        if mig["new_node_id"]:
            mapped_new_node_ids.add(mig["new_node_id"])

    summary: dict[str, int] = {
        "ok": sum(1 for r in role_migrations if r["status"] == "ok"),
        "renamed": sum(1 for r in role_migrations if r["status"] == "renamed"),
        "reindexed": sum(1 for r in role_migrations if r["status"] == "reindexed"),
        "substituted": sum(1 for r in role_migrations if r["status"] == "substituted"),
        "false_reuse": sum(1 for r in role_migrations if r["status"] == "false_reuse"),
        "not_found": sum(1 for r in role_migrations if r["status"] == "not_found"),
        "total": len(role_migrations),
    }

    bypass_warnings: list[dict[str, Any]] = []
    if bypass_profiles:
        for bp in bypass_profiles:
            try:
                raw_ids = json.loads(bp.bypassed_node_ids)
                if isinstance(raw_ids, list):
                    for nid in raw_ids:
                        str_nid = str(nid)
                        if str_nid not in new_topos:
                            bypass_warnings.append({
                                "profile_id": bp.id,
                                "profile_name": bp.name,
                                "node_id": str_nid,
                                "warning": f"バイパス対象ノード {str_nid} が新ワークフローに存在しません",
                            })
            except Exception:
                pass

    unmapped_new_nodes: list[dict[str, Any]] = []
    for nid, ntopo in new_topos.items():
        if nid not in mapped_new_node_ids:
            unmapped_new_nodes.append({
                "node_id": nid,
                "title": ntopo["title"],
                "class_type": ntopo["class_type"],
            })

    return {
        "summary": summary,
        "role_migrations": role_migrations,
        "bypass_warnings": bypass_warnings,
        "unmapped_new_nodes": unmapped_new_nodes,
    }
