"""Persistence and literal postprocessing for user translation replacements."""

import json
from typing import Mapping, Sequence

from sqlalchemy.orm import Session

from app.models import AppSetting


DICTIONARY_KEY = "translation_dictionary"


def load_replacement_dictionary(db: Session) -> list[dict[str, str]]:
    setting = db.get(AppSetting, DICTIONARY_KEY)
    if setting is None:
        return []
    try:
        stored = json.loads(setting.value)
    except (TypeError, ValueError):
        return []
    if not isinstance(stored, list):
        return []
    rules: list[dict[str, str]] = []
    for rule in stored:
        if (
            isinstance(rule, dict)
            and isinstance(rule.get("source"), str)
            and rule["source"].strip()
            and isinstance(rule.get("replacement"), str)
        ):
            rules.append({"source": rule["source"], "replacement": rule["replacement"]})
    return rules


def save_replacement_dictionary(db: Session, rules: list[dict[str, str]]) -> list[dict[str, str]]:
    setting = db.get(AppSetting, DICTIONARY_KEY)
    serialized = json.dumps(rules, ensure_ascii=False)
    try:
        if setting is None:
            db.add(AppSetting(key=DICTIONARY_KEY, value=serialized))
        else:
            setting.value = serialized
        db.commit()
    except Exception:
        db.rollback()
        raise
    return rules


def apply_replacement_rules(text: str, rules: Sequence[Mapping[str, str]]) -> str:
    """Apply literal rules in one pass, preferring the longest source at each position."""
    by_first_character: dict[str, list[tuple[str, str]]] = {}
    for rule in rules:
        source = rule.get("source", "")
        replacement = rule.get("replacement", "")
        if source:
            by_first_character.setdefault(source[0], []).append((source, replacement))
    for candidates in by_first_character.values():
        candidates.sort(key=lambda pair: len(pair[0]), reverse=True)

    output: list[str] = []
    index = 0
    while index < len(text):
        match = next(
            ((source, replacement) for source, replacement in by_first_character.get(text[index], [])
             if text.startswith(source, index)),
            None,
        )
        if match is None:
            output.append(text[index])
            index += 1
        else:
            source, replacement = match
            output.append(replacement)
            index += len(source)
    return "".join(output)
