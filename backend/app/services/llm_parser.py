"""LLM response parsers — extract structured data from XML-tagged LLM output."""

import re


def parse_interference(text: str) -> list[dict]:
    """Extract interference tag candidates from LLM output."""
    results: list[dict[str, str]] = []
    block = re.search(r'<remove_tags>(.*?)</remove_tags>', text, re.DOTALL | re.IGNORECASE)
    if not block:
        return results
    pattern = re.compile(
        r'<item>.*?<tag>(.*?)</tag>.*?<reason_jp>(.*?)</reason_jp>.*?</item>',
        re.DOTALL | re.IGNORECASE,
    )
    for tag, reason in pattern.findall(block.group(1)):
        if tag.strip():
            results.append({"tag": tag.strip(), "reason": reason.strip()})
    return results


def parse_vocabulary(text: str) -> list[dict]:
    """Extract vocabulary suggestion candidates from LLM output."""
    results: list[dict[str, str]] = []
    block = re.search(r'<suggestions>(.*?)</suggestions>', text, re.DOTALL | re.IGNORECASE)
    if not block:
        return results
    pattern = re.compile(
        r'<item>.*?<vocabulary>(.*?)</vocabulary>.*?<effect_jp>(.*?)</effect_jp>.*?</item>',
        re.DOTALL | re.IGNORECASE,
    )
    for vocab, effect in pattern.findall(block.group(1)):
        if vocab.strip():
            results.append({"suggestion": vocab.strip(), "effect": effect.strip()})
    return results


def parse_physical(text: str) -> dict:
    """Extract physical/compositional consistency result from LLM output."""
    result: dict = {"status": "unknown", "note": None, "alternatives": []}
    block = re.search(r'<evaluation>(.*?)</evaluation>', text, re.DOTALL | re.IGNORECASE)
    if not block:
        return result
    content = block.group(1)

    rating = re.search(r'<rating>(.*?)</rating>', content, re.IGNORECASE)
    if rating:
        result["status"] = rating.group(1).strip().lower()

    reason = re.search(r'<reason_jp>(.*?)</reason_jp>', content, re.IGNORECASE)
    if reason:
        result["note"] = reason.group(1).strip()

    alts_block = re.search(r'<alternatives>(.*?)</alternatives>', content, re.DOTALL | re.IGNORECASE)
    if alts_block:
        result["alternatives"] = [
            a.strip()
            for a in re.findall(r'<item>(.*?)</item>', alts_block.group(1), re.IGNORECASE)
            if a.strip()
        ]
    return result
