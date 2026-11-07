"""Key classification, normalization, and expansion for variants (REQ-418)."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import json
import logging
import re
from typing import Any, Mapping, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

RESERVED_PREFIX = "__"

_VARIANT_KEY_RE = re.compile(r"^v:(?P<id>\d+)(?::(?P<sub>[A-Za-z0-9_]+))?$")
_DERIVED_ROLE_RE = re.compile(
    r"^(?P<base>.+)_(?P<sub>lora_count|(?:lora_name|lora_wt|model_str|clip_str)_\d+)$"
)


class KeyKind(str, Enum):
    RESERVED = "reserved"
    VARIANT = "variant"
    ROLE = "role"
    DERIVED_ROLE = "derived_role"
    UNRESOLVED = "unresolved"


@dataclass(frozen=True)
class ClassifiedKey:
    kind: KeyKind
    key: str
    variant_id: int | None   # None for RESERVED / UNRESOLVED
    sub_key: str             # '' for plain value; e.g. 'lora_count', 'lora_name_3' for derived keys


def encode_variant_key(variant_id: int, sub_key: str = "") -> str:
    """Encode variant_id and optional sub_key into wire format ('v:<id>' or 'v:<id>:<sub_key>')."""
    if sub_key:
        return f"v:{variant_id}:{sub_key}"
    return f"v:{variant_id}"


def decode_variant_key(key: str) -> tuple[int, str] | None:
    """Decode wire format variant key into (variant_id, sub_key). Returns None if not matching."""
    m = _VARIANT_KEY_RE.match(key)
    if not m:
        return None
    return int(m.group("id")), m.group("sub") or ""


class VariantIndex:
    def __init__(self, roles_by_id: Mapping[int, str]) -> None:
        self._roles_by_id: dict[int, str] = dict(roles_by_id)
        self._id_by_role: dict[str, int] = {role: vid for vid, role in self._roles_by_id.items()}

    @classmethod
    def from_session(cls, db: Session) -> VariantIndex:
        """Load id -> role mappings directly from mapping_variants table."""
        from app.models import MappingVariant

        rows = db.query(MappingVariant.id, MappingVariant.role).all()
        return cls({row[0]: row[1] for row in rows})

    def role_of(self, variant_id: int) -> str | None:
        return self._roles_by_id.get(variant_id)

    def role_key(self, variant_id: int, sub_key: str = "") -> str | None:
        role = self._roles_by_id.get(variant_id)
        if role is None:
            return None
        if sub_key:
            return f"{role}_{sub_key}"
        return role

    def classify(self, key: str) -> ClassifiedKey:
        # (1) key starts with __ -> RESERVED
        if key.startswith(RESERVED_PREFIX):
            return ClassifiedKey(kind=KeyKind.RESERVED, key=key, variant_id=None, sub_key="")

        # (2) matches ^v:(?P<id>\d+)(?::(?P<sub>[A-Za-z0-9_]+))?$ -> VARIANT if id exists in index, else UNRESOLVED
        vm = _VARIANT_KEY_RE.match(key)
        if vm:
            vid = int(vm.group("id"))
            if vid in self._roles_by_id:
                return ClassifiedKey(
                    kind=KeyKind.VARIANT,
                    key=key,
                    variant_id=vid,
                    sub_key=vm.group("sub") or "",
                )
            return ClassifiedKey(kind=KeyKind.UNRESOLVED, key=key, variant_id=None, sub_key="")

        # (3) key equals a role exactly -> ROLE
        if key in self._id_by_role:
            return ClassifiedKey(
                kind=KeyKind.ROLE,
                key=key,
                variant_id=self._id_by_role[key],
                sub_key="",
            )

        # (4) matches derived pattern AND base equals a role exactly -> DERIVED_ROLE
        dm = _DERIVED_ROLE_RE.match(key)
        if dm:
            base = dm.group("base")
            if base in self._id_by_role:
                return ClassifiedKey(
                    kind=KeyKind.DERIVED_ROLE,
                    key=key,
                    variant_id=self._id_by_role[base],
                    sub_key=dm.group("sub"),
                )

        # (5) otherwise UNRESOLVED
        return ClassifiedKey(kind=KeyKind.UNRESOLVED, key=key, variant_id=None, sub_key="")


@dataclass
class NormalizedParams:
    entries: dict[tuple[int, str], str]   # (variant_id, sub_key) -> value (string)
    reserved: dict[str, Any]
    unresolved: list[str]                 # sorted


@dataclass
class ExpandedParams:
    role_keyed: dict[str, Any]            # current role names (sorted-key construction)
    variant_keyed: dict[str, Any]         # 'v:<id>[:sub]' keys
    missing: list[str]                    # unresolved original keys, sorted


def normalize_params(index: VariantIndex, params: Mapping[str, Any]) -> NormalizedParams:
    entries: dict[tuple[int, str], str] = {}
    reserved: dict[str, Any] = {}
    unresolved: list[str] = []

    role_keys: list[tuple[str, ClassifiedKey]] = []
    variant_keys: list[tuple[str, ClassifiedKey]] = []

    for k in sorted(params.keys()):
        classified = index.classify(k)
        if classified.kind == KeyKind.RESERVED:
            reserved[k] = params[k]
        elif classified.kind == KeyKind.UNRESOLVED:
            unresolved.append(k)
        elif classified.kind in (KeyKind.ROLE, KeyKind.DERIVED_ROLE):
            role_keys.append((k, classified))
        elif classified.kind == KeyKind.VARIANT:
            variant_keys.append((k, classified))

    def _to_str(val: Any) -> str:
        if isinstance(val, str):
            return val
        return json.dumps(val, ensure_ascii=False)

    for k, classified in role_keys:
        assert classified.variant_id is not None
        entries[(classified.variant_id, classified.sub_key)] = _to_str(params[k])

    for k, classified in variant_keys:
        assert classified.variant_id is not None
        entries[(classified.variant_id, classified.sub_key)] = _to_str(params[k])

    return NormalizedParams(
        entries=entries,
        reserved=reserved,
        unresolved=sorted(unresolved),
    )


def expand_stored_params(
    index: VariantIndex,
    stored: Mapping[str, Any],
    *,
    owner_label: str = "stored_params",
    warn: bool = True,
) -> ExpandedParams:
    role_keyed: dict[str, Any] = {}
    variant_keyed: dict[str, Any] = {}
    missing: list[str] = []

    reserved_items: list[tuple[str, Any]] = []
    role_items: list[tuple[str, ClassifiedKey]] = []
    variant_items: list[tuple[str, ClassifiedKey]] = []

    for k in sorted(stored.keys()):
        classified = index.classify(k)
        if classified.kind == KeyKind.RESERVED:
            reserved_items.append((k, stored[k]))
        elif classified.kind == KeyKind.UNRESOLVED:
            missing.append(k)
        elif classified.kind in (KeyKind.ROLE, KeyKind.DERIVED_ROLE):
            role_items.append((k, classified))
        elif classified.kind == KeyKind.VARIANT:
            variant_items.append((k, classified))

    # Process ROLE / DERIVED_ROLE first
    for k, classified in role_items:
        assert classified.variant_id is not None
        r_key = index.role_key(classified.variant_id, classified.sub_key)
        v_key = encode_variant_key(classified.variant_id, classified.sub_key)
        val = stored[k]
        if r_key is not None:
            role_keyed[r_key] = val
        variant_keyed[v_key] = val

    # Process VARIANT second (v: wins on collision)
    for k, classified in variant_items:
        assert classified.variant_id is not None
        r_key = index.role_key(classified.variant_id, classified.sub_key)
        v_key = encode_variant_key(classified.variant_id, classified.sub_key)
        val = stored[k]
        if r_key is not None:
            role_keyed[r_key] = val
        variant_keyed[v_key] = val

    # RESERVED keys appear unchanged in BOTH output dicts
    for k, val in reserved_items:
        role_keyed[k] = val
        variant_keyed[k] = val

    role_keyed = dict(sorted(role_keyed.items()))
    variant_keyed = dict(sorted(variant_keyed.items()))
    missing = sorted(missing)

    if warn and missing:
        logger.warning("%s: unresolvable parameter keys skipped: %s", owner_label, missing)

    return ExpandedParams(
        role_keyed=role_keyed,
        variant_keyed=variant_keyed,
        missing=missing,
    )


def to_storage_params(
    index: VariantIndex,
    params: Mapping[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    storage_dict: dict[str, Any] = {}
    unresolved: list[str] = []

    reserved_items: list[tuple[str, Any]] = []
    role_items: list[tuple[str, ClassifiedKey]] = []
    variant_items: list[tuple[str, ClassifiedKey]] = []

    for k in sorted(params.keys()):
        classified = index.classify(k)
        if classified.kind == KeyKind.RESERVED:
            reserved_items.append((k, params[k]))
        elif classified.kind == KeyKind.UNRESOLVED:
            unresolved.append(k)
        elif classified.kind in (KeyKind.ROLE, KeyKind.DERIVED_ROLE):
            role_items.append((k, classified))
        elif classified.kind == KeyKind.VARIANT:
            variant_items.append((k, classified))

    # Process ROLE / DERIVED_ROLE first
    for k, classified in role_items:
        assert classified.variant_id is not None
        v_key = encode_variant_key(classified.variant_id, classified.sub_key)
        storage_dict[v_key] = params[k]

    # Process VARIANT second (v: wins on collision)
    for k, classified in variant_items:
        assert classified.variant_id is not None
        v_key = encode_variant_key(classified.variant_id, classified.sub_key)
        storage_dict[v_key] = params[k]

    # RESERVED keys passthrough
    for k, val in reserved_items:
        storage_dict[k] = val

    storage_dict = dict(sorted(storage_dict.items()))
    return storage_dict, sorted(unresolved)
