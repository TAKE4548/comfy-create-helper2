"""LLM audit relay service - ported and refactored from ollama_api.py."""

import re
import json
import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


async def call_llm(system_prompt: str, user_prompt: str, timeout: float = 180.0) -> str:
    """Call the LLM server (OpenAI-compatible API) asynchronously."""
    prompt_tokens = (len(system_prompt or "") + len(user_prompt or "")) / 3
    num_ctx = int(prompt_tokens) + 8192
    num_ctx = max(2048, min(262144, num_ctx))

    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "temperature": 0.2,
    }

    # If using Ollama endpoint (/v1/chat/completions compatible)
    url = f"{settings.llm_base_url}/chat/completions"

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


def parse_interference(text: str) -> list[dict]:
    results = []
    block = re.search(r'<remove_tags>(.*?)</remove_tags>', text, re.DOTALL | re.IGNORECASE)
    if not block:
        return results
    pattern = re.compile(
        r'<item>.*?<tag>(.*?)</tag>.*?<reason_jp>(.*?)</reason_jp>.*?</item>',
        re.DOTALL | re.IGNORECASE
    )
    for tag, reason in pattern.findall(block.group(1)):
        if tag.strip():
            results.append({"tag": tag.strip(), "reason": reason.strip()})
    return results


def parse_vocabulary(text: str) -> list[dict]:
    results = []
    block = re.search(r'<suggestions>(.*?)</suggestions>', text, re.DOTALL | re.IGNORECASE)
    if not block:
        return results
    pattern = re.compile(
        r'<item>.*?<vocabulary>(.*?)</vocabulary>.*?<effect_jp>(.*?)</effect_jp>.*?</item>',
        re.DOTALL | re.IGNORECASE
    )
    for vocab, effect in pattern.findall(block.group(1)):
        if vocab.strip():
            results.append({"suggestion": vocab.strip(), "effect": effect.strip()})
    return results


def parse_physical(text: str) -> dict:
    result = {"status": "unknown", "note": None, "alternatives": []}
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
            a.strip() for a in re.findall(r'<item>(.*?)</item>', alts_block.group(1), re.IGNORECASE)
            if a.strip()
        ]
    return result


async def run_audit(
    audit_types: list[str],
    positive: str,
    negative: str,
    intent: str,
    model_hint: str,
    system_prompts: dict[str, str],
) -> dict:
    """Run requested audit types and return structured results."""
    result = {}

    if "interference" in audit_types:
        sp = system_prompts.get("audit_interference", _default_interference_prompt(model_hint))
        user_prompt = (
            f"<input>\n"
            f"Intent: {intent}\n"
            f"Positive Prompt: {positive}\n"
            f"Negative Prompt: {negative}\n"
            f"Model Policy: {model_hint}\n"
            f"</input>\n\n"
            "Please analyze the <input> based on the <criteria> and output your diagnosis strictly following the <output_format>."
        )
        try:
            raw = await call_llm(sp, user_prompt)
            result["interference"] = parse_interference(raw)
        except Exception as e:
            logger.error(f"Interference audit failed: {e}")
            result["interference"] = [{"tag": "Error", "reason": str(e)}]

    if "vocabulary" in audit_types:
        sp = system_prompts.get("audit_vocabulary", _default_vocabulary_prompt(model_hint))
        user_prompt = (
            f"User Intent (How they want to change the image): {intent}\n"
            f"Model Policy (SDXL/Anima): {model_hint}\n"
            "Suggest 3-5 tags or expressions that help achieve this intent, with short descriptions."
        )
        try:
            raw = await call_llm(sp, user_prompt)
            result["vocabulary"] = parse_vocabulary(raw)
        except Exception as e:
            logger.error(f"Vocabulary audit failed: {e}")
            result["vocabulary"] = [{"suggestion": "Error", "effect": str(e)}]

    if "physical" in audit_types:
        sp = system_prompts.get("audit_physical", _default_physical_prompt())
        user_prompt = (
            f"Prompt: {positive}\n"
            "Please check if there are physical or compositional conflicts in this prompt."
        )
        try:
            raw = await call_llm(sp, user_prompt)
            result["physical"] = parse_physical(raw)
        except Exception as e:
            logger.error(f"Physical audit failed: {e}")
            result["physical"] = {"status": "error", "note": str(e), "alternatives": []}

    return result


# ─── Default system prompts (fallback) ───────────────────────────

def _default_interference_prompt(model_hint: str) -> str:
    is_anima = str(model_hint).lower() == "anima"
    tag_type = "tags and natural language expressions" if is_anima else "Danbooru-style tags"
    return (
        f"You are 'Prompt Surgeon', an expert AI image generation consultant.\n\n"
        f"<task>\n"
        f"Diagnose {tag_type} in a prompt that interfere with the user's intent.\n"
        f"Provide insights for the user to make the final decision. DO NOT rewrite the entire prompt.\n"
        f"</task>\n\n"
        f"<criteria>\n"
        f"1. Composition vs. Details: 'close-up' intent heavily conflicts with lower-body tags like 'socks' or 'shoes'.\n"
        f"2. Contradictory States: Conflicting postures (e.g., 'standing' vs 'sitting') or lighting.\n"
        f"3. Focus: Tags that dilute the user's main subject.\n"
        f"</criteria>\n\n"
        f"<output_format>\n"
        f"Your final output MUST be strictly enclosed in the following XML tags:\n\n"
        f"<remove_tags>\n"
        f"  <item>\n"
        f"    <tag>tag_name</tag>\n"
        f"    <reason_jp>clear_reason_in_japanese</reason_jp>\n"
        f"  </item>\n"
        f"</remove_tags>\n"
        f"</output_format>"
    )


def _default_vocabulary_prompt(model_hint: str) -> str:
    is_anima = str(model_hint).lower() == "anima"
    tag_type = "tags or natural language expressions" if is_anima else "Danbooru-style tags"
    return (
        f"You are Prompt Surgeon, an expert assistant in AI image generation.\n"
        f"Suggest additional {tag_type} in English based on the user's intention.\n"
        f"Your final output MUST be strictly enclosed in the following XML tags:\n\n"
        f"<suggestions>\n"
        f"  <item>\n"
        f"    <vocabulary>tag_in_english</vocabulary>\n"
        f"    <effect_jp>effect_description_in_japanese</effect_jp>\n"
        f"  </item>\n"
        f"</suggestions>"
    )


def _default_physical_prompt() -> str:
    return (
        "You are Prompt Surgeon, an expert assistant in AI image generation.\n"
        "Evaluate if the combination of pose, composition, and subjects in the prompt is physically and logically consistent.\n"
        "Your final output MUST be strictly enclosed in the following XML tags:\n\n"
        "<evaluation>\n"
        "  <rating>OK or Warning or Conflict</rating>\n"
        "  <reason_jp>reason_description_in_japanese</reason_jp>\n"
        "  <alternatives>\n"
        "    <item>alternative_recommendation_1</item>\n"
        "  </alternatives>\n"
        "</evaluation>"
    )
