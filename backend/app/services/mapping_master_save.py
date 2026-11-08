"""Atomic save of a mapping master (values, definitions and variants) in one transaction.

``validate_atomic_save`` only reads the DB and collects every problem.
``apply_atomic_save`` mutates the session (flush only, never commit); the caller
owns commit/rollback so that any failure rolls back the whole request.
"""

from typing import Any, Optional

from sqlalchemy.orm import Session

from app import models
from app.schemas.mapping import DefinitionOp, DefinitionRef, MasterAtomicSaveRequest


class MasterSaveValidationError(Exception):
    def __init__(self, errors: list[dict]):
        super().__init__(f"{len(errors)} validation error(s)")
        self.errors = errors


def _err(
    scope: str,
    field: str,
    message: str,
    index: Optional[int] = None,
    ref: Optional[str] = None,
    row_key: Optional[str] = None,
) -> dict:
    return {
        "scope": scope,
        "index": index,
        "ref": ref,
        "row_key": row_key,
        "field": field,
        "message": message,
    }


def _validate_definitions(
    db: Session,
    scope: str,
    ops: list[DefinitionOp],
    model: Any,
    errors: list[dict],
) -> tuple[set[str], dict[str, Optional[int]]]:
    """Validate definition ops. Returns (defined refs, ref -> existing id for updates)."""
    existing = {row.id: row.name for row in db.query(model.id, model.name).all()}
    seen_refs: set[str] = set()
    ref_to_id: dict[str, Optional[int]] = {}
    final_names: dict[str, int] = {}

    for idx, op in enumerate(ops):
        if not op.ref.strip():
            errors.append(_err(scope, "ref", "ref は必須です", idx, op.ref))
        elif op.ref in seen_refs:
            errors.append(_err(scope, "ref", f"ref '{op.ref}' が重複しています", idx, op.ref))
        else:
            seen_refs.add(op.ref)
            ref_to_id[op.ref] = op.id if op.op == "update" else None

        if op.op == "update":
            if op.id is None:
                errors.append(_err(scope, "id", "update には id が必要です", idx, op.ref))
            elif op.id not in existing:
                errors.append(_err(scope, "id", f"id {op.id} は存在しません", idx, op.ref))

        name = op.name.strip()
        if not name:
            errors.append(_err(scope, "name", "name は必須です", idx, op.ref))
        else:
            own_id = op.id if op.op == "update" else None
            clash = [i for i, n in existing.items() if n == name and i != own_id]
            if clash:
                errors.append(_err(scope, "name", f"名前 '{name}' は既に使用されています", idx, op.ref))
            elif name in final_names:
                errors.append(_err(scope, "name", f"名前 '{name}' が要求内で重複しています", idx, op.ref))
            final_names.setdefault(name, idx)

        if scope == "rule_set":
            if op.patterns is not None:
                errors.append(_err(scope, "patterns", "ルールセットに patterns は指定できません", idx, op.ref))
            if op.entries is not None:
                keys = [(e.class_type, e.param_name) for e in op.entries]
                if len(set(keys)) != len(keys):
                    errors.append(_err(scope, "entries", "entries に同一の class_type/param_name があります", idx, op.ref))
        else:
            if op.entries is not None:
                errors.append(_err(scope, "entries", "セレクタに entries は指定できません", idx, op.ref))
            if op.patterns is not None:
                pats = [p.pattern for p in op.patterns]
                if len(set(pats)) != len(pats):
                    errors.append(_err(scope, "patterns", "patterns に同一の pattern があります", idx, op.ref))

    return seen_refs, ref_to_id


def _selector_key(ref: Optional[DefinitionRef], selector_ref_to_id: dict[str, Optional[int]]) -> Optional[tuple]:
    if ref is None:
        return None
    if ref.id is not None:
        return ("id", ref.id)
    assert ref.ref is not None
    ref_id = selector_ref_to_id.get(ref.ref)
    if ref_id is not None:
        return ("id", ref_id)
    return ("ref", ref.ref)


def validate_atomic_save(db: Session, master: models.MappingMaster, req: MasterAtomicSaveRequest) -> list[dict]:
    errors: list[dict] = []

    # master
    if not req.master.name.strip():
        errors.append(_err("master", "name", "name は必須です"))
    if req.master.group_id is not None:
        if db.query(models.MappingGroupMaster.id).filter(models.MappingGroupMaster.id == req.master.group_id).first() is None:
            errors.append(_err("master", "group_id", f"group_id {req.master.group_id} は存在しません"))

    # definitions
    rs_refs, _ = _validate_definitions(db, "rule_set", req.rule_sets, models.BindingRuleSet, errors)
    sel_refs, sel_ref_to_id = _validate_definitions(db, "selector", req.selectors, models.NodeSelector, errors)

    existing_rs_ids = {r.id for r in db.query(models.BindingRuleSet.id).all()}
    existing_sel_ids = {r.id for r in db.query(models.NodeSelector.id).all()}

    # variants
    own_variants = {v.id: v for v in db.query(models.MappingVariant).filter(models.MappingVariant.master_id == master.id).all()}
    stages = {s.id: s for s in db.query(models.StageMaster).all()}
    all_roles = {r.role for r in db.query(models.MappingVariant.role).all()}
    base_key = master.base_key or master.role or ""

    # final state per variant: ("existing", id) / ("new", idx) -> (stage_id, selector_key)
    final_stage: dict[tuple, int] = {}
    final_selector: dict[tuple, Optional[tuple]] = {}
    request_vkeys: dict[int, tuple] = {}
    seen_ids: set[int] = set()
    new_roles: dict[str, int] = {}

    for idx, item in enumerate(req.variants):
        rk = item.row_key
        if item.stage_id not in stages:
            errors.append(_err("variant", "stage_id", f"stage_id {item.stage_id} は存在しません", idx, None, rk))

        if item.id is not None:
            if item.id not in own_variants:
                errors.append(_err("variant", "id", f"id {item.id} はこの Master の Variant ではありません", idx, None, rk))
                vkey = ("bad", idx)
                stage_for_final = item.stage_id
            else:
                if item.id in seen_ids:
                    errors.append(_err("variant", "id", f"id {item.id} が要求内で重複しています", idx, None, rk))
                seen_ids.add(item.id)
                vkey = ("existing", item.id)
                # stage of an existing variant is not changed by atomic save; a differing request is rejected
                stage_for_final = own_variants[item.id].stage_id
                if item.stage_id != stage_for_final:
                    errors.append(_err(
                        "variant", "stage_id",
                        f"既存 Variant のステージは変更できません（保存済み: {stage_for_final}、要求: {item.stage_id}）",
                        idx, None, rk,
                    ))
        else:
            vkey = ("new", idx)
            stage_for_final = item.stage_id
            stage = stages.get(item.stage_id)
            if stage is not None:
                role = f"{base_key}{stage.suffix or ''}"
                if role in all_roles:
                    errors.append(_err("variant", "role", f"role '{role}' は既に使用されています", idx, None, rk))
                elif role in new_roles:
                    errors.append(_err("variant", "role", f"role '{role}' が要求内で重複しています", idx, None, rk))
                new_roles.setdefault(role, idx)
        request_vkeys[idx] = vkey
        final_stage[vkey] = stage_for_final

        # rule_set ref
        rs = item.rule_set
        if rs.id is not None:
            if rs.id not in existing_rs_ids:
                errors.append(_err("variant", "rule_set", f"rule_set id {rs.id} は存在しません", idx, None, rk))
        elif rs.ref not in rs_refs:
            errors.append(_err("variant", "rule_set", f"rule_set ref '{rs.ref}' は未定義です", idx, rs.ref, rk))

        # selector ref
        sel = item.selector
        if sel is not None:
            if sel.id is not None:
                if sel.id not in existing_sel_ids:
                    errors.append(_err("variant", "selector", f"selector id {sel.id} は存在しません", idx, None, rk))
            elif sel.ref not in sel_refs:
                errors.append(_err("variant", "selector", f"selector ref '{sel.ref}' は未定義です", idx, sel.ref, rk))
        final_selector[vkey] = _selector_key(sel, sel_ref_to_id)

    # unmentioned existing variants keep their stage and selector
    mentioned = {vk for vk in request_vkeys.values() if vk[0] == "existing"}
    for vid, v in own_variants.items():
        if ("existing", vid) in mentioned:
            continue
        final_stage[("existing", vid)] = v.stage_id
        final_selector[("existing", vid)] = ("id", v.node_selector_id) if v.node_selector_id is not None else None

    stage_groups: dict[int, list[tuple]] = {}
    for vk, sid in final_stage.items():
        stage_groups.setdefault(sid, []).append(vk)
    sel_groups: dict[tuple, list[tuple]] = {}
    for vk, sk in final_selector.items():
        if sk is not None:
            sel_groups.setdefault(sk, []).append(vk)

    for idx, item in enumerate(req.variants):
        vk = request_vkeys[idx]
        if len(stage_groups.get(final_stage[vk], [])) > 1:
            errors.append(_err("variant", "stage_id", f"stage_id {final_stage[vk]} の Variant が複数になります", idx, None, item.row_key))
        sk = final_selector.get(vk)
        if sk is not None and len(sel_groups.get(sk, [])) > 1:
            errors.append(_err("variant", "selector", "同一セレクタを複数の Variant が参照することはできません", idx, None, item.row_key))

    return errors


def apply_atomic_save(db: Session, master: models.MappingMaster, req: MasterAtomicSaveRequest) -> None:
    """Apply a validated request. Flushes only; never commits."""
    # 1. master values (role / base_key / legacy columns stay untouched)
    master.name = req.master.name.strip()
    master.display_name = req.master.name.strip()
    master.input_type = req.master.input_type
    master.group_id = req.master.group_id
    master.default_enabled = req.master.default_enabled

    # 2. definitions
    rs_by_ref: dict[str, models.BindingRuleSet] = {}
    for op in req.rule_sets:
        if op.op == "create":
            rs: models.BindingRuleSet = models.BindingRuleSet(name=op.name.strip())
            for e in op.entries or []:
                rs.entries.append(models.BindingRuleEntry(class_type=e.class_type, param_name=e.param_name, priority=e.priority))
            db.add(rs)
        else:
            found_rs = db.get(models.BindingRuleSet, op.id)
            assert found_rs is not None
            rs = found_rs
            rs.name = op.name.strip()
            if op.entries is not None:
                rs.entries.clear()
                db.flush()
                for e in op.entries:
                    rs.entries.append(models.BindingRuleEntry(class_type=e.class_type, param_name=e.param_name, priority=e.priority))
        rs_by_ref[op.ref] = rs

    sel_by_ref: dict[str, models.NodeSelector] = {}
    for op in req.selectors:
        if op.op == "create":
            sel: models.NodeSelector = models.NodeSelector(name=op.name.strip())
            for p in op.patterns or []:
                sel.patterns.append(models.NodeSelectorPattern(pattern=p.pattern, match_type=p.match_type, priority=p.priority))
            db.add(sel)
        else:
            found_sel = db.get(models.NodeSelector, op.id)
            assert found_sel is not None
            sel = found_sel
            sel.name = op.name.strip()
            if op.patterns is not None:
                sel.patterns.clear()
                db.flush()
                for p in op.patterns:
                    sel.patterns.append(models.NodeSelectorPattern(pattern=p.pattern, match_type=p.match_type, priority=p.priority))
        sel_by_ref[op.ref] = sel
    db.flush()  # resolve ref -> id

    def resolve_rs(ref: DefinitionRef) -> int:
        if ref.id is not None:
            return ref.id
        assert ref.ref is not None
        return rs_by_ref[ref.ref].id

    def resolve_sel(ref: Optional[DefinitionRef]) -> Optional[int]:
        if ref is None:
            return None
        if ref.id is not None:
            return ref.id
        assert ref.ref is not None
        return sel_by_ref[ref.ref].id

    # 3. release selectors of existing variants whose selector changes (swap support)
    own_variants = {v.id: v for v in db.query(models.MappingVariant).filter(models.MappingVariant.master_id == master.id).all()}
    released = False
    for item in req.variants:
        if item.id is None:
            continue
        v = own_variants[item.id]
        if v.node_selector_id is not None and v.node_selector_id != resolve_sel(item.selector):
            v.node_selector_id = None
            released = True
    if released:
        db.flush()

    # 4. variants
    base_key = master.base_key or master.role or ""
    for item in req.variants:
        rs_id = resolve_rs(item.rule_set)
        sel_id = resolve_sel(item.selector)
        if item.id is not None:
            v = own_variants[item.id]
            v.binding_rule_set_id = rs_id
            v.node_selector_id = sel_id
            v.is_enabled = item.is_enabled
        else:
            stage = db.get(models.StageMaster, item.stage_id)
            assert stage is not None
            db.add(models.MappingVariant(
                master_id=master.id,
                stage_id=stage.id,
                role=f"{base_key}{stage.suffix or ''}",
                binding_rule_set_id=rs_id,
                node_selector_id=sel_id,
                is_enabled=item.is_enabled,
                sort_order=stage.sort_order,
                extra_title_patterns="[]",
            ))
    db.flush()
