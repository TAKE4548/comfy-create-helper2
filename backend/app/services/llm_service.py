"""LLM audit orchestration service.

Coordinates audit_types → user_prompt construction → LLM call → parse → result assembly.
Default system prompts (fallbacks) are defined here; overrides come from the DB.
"""

import logging
from app.services.llm_request import call_llm
from app.services.llm_parser import parse_interference, parse_vocabulary, parse_physical

logger = logging.getLogger(__name__)


def _get_current_model() -> str | None:
    from app.database import SessionLocal
    from app.models import LlmPrompt
    try:
        with SessionLocal() as db:
            record = db.query(LlmPrompt).filter(LlmPrompt.key == "llm_model").first()
            if record and record.content:
                return record.content
    except Exception as e:
        logger.error(f"Failed to fetch llm_model from DB: {e}")
    return None


async def run_audit(
    audit_types: list[str],
    positive: str,
    negative: str,
    intent: str,
    model_hint: str,
    system_prompts: dict[str, str],
) -> dict:
    """Run requested audit types and return structured results."""
    result: dict = {}
    model = _get_current_model()

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
            raw = await call_llm(sp, user_prompt, model=model)
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
            raw = await call_llm(sp, user_prompt, model=model)
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
            raw = await call_llm(sp, user_prompt, model=model)
            result["physical"] = parse_physical(raw)
        except Exception as e:
            logger.error(f"Physical audit failed: {e}")
            result["physical"] = {"status": "error", "note": str(e), "alternatives": []}

    return result


async def run_scene_generate(
    target_fields: list[str],
    base_params: dict[str, str],
    scenes: list[dict],   # [{"id": str, "summary": str}]
    system_prompt_override: str | None = None,
    anima_mode: bool = False,
) -> list[dict]:   # [{"scene_id": str, "diff_params": {str: str}}]
    if anima_mode:
        sp = system_prompt_override or _default_scene_generate_anima_prompt()
    else:
        sp = system_prompt_override or _default_scene_generate_prompt()
    model = _get_current_model()
    
    target_fields_with_values_list = []
    for f in target_fields:
        val = base_params.get(f, "")
        target_fields_with_values_list.append(f"- {f}: {val}")
    target_fields_with_values = "\n".join(target_fields_with_values_list)
    
    import json
    scenes_json = json.dumps(scenes, ensure_ascii=False, indent=2)
    
    user_prompt = (
        f"Target Fields and Current Values:\n"
        f"{target_fields_with_values}\n\n"
        f"Generate diff_params for each scene below:\n"
        f"{scenes_json}\n\n"
        f"Return ONLY a JSON array in this format:\n"
        '[{"scene_id": "...", "diff_params": {"FieldName": "english, tags"}}]'
    )
    
    raw = await call_llm(sp, user_prompt, model=model)
    return _parse_scene_generate(raw)


def _parse_scene_generate(raw: str) -> list[dict]:
    """Extract JSON array from LLM response, stripping markdown fences if present."""
    import json
    import re
    text = raw.strip()
    # Remove ```json ... ``` fences if present
    match = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', text, re.DOTALL)
    if match:
        text = match.group(1)
    else:
        # Find first '[' to last ']'
        start = text.find('[')
        end = text.rfind(']')
        if start != -1 and end != -1:
            text = text[start:end+1]
    return json.loads(text)


def _default_scene_generate_prompt() -> str:
    return (
        "You are a scene description expert for AI image generation.\n"
        "Given a scene summary in Japanese and a list of candidate fields with their current values,\n"
        "analyze the scene and generate English prompts ONLY for the fields that are relevant to the scene.\n"
        "You decide which fields to update based on the scene's natural implication.\n\n"
        "Rules:\n"
        "1. Output MUST be a valid JSON array — no markdown, no explanation outside JSON.\n"
        "2. Only include fields you want to change; omit unchanged fields.\n"
        "3. Each field value must be comma-separated English prompt tags (no Japanese, no full sentences).\n"
        "4. Do NOT hallucinate fields that are not listed in target_fields."
    )


def _default_scene_generate_anima_prompt() -> str:
    return (
        "You are an expert translator and scene interpreter for AI image generation with Anima (Qwen-CLIP based model).\n"
        "Given a scene summary written in Japanese (may include some English), translate and expand it into\n"
        "descriptive, natural English expressions that Anima's CLIP encoder interprets well.\n"
        "Anima excels at understanding natural language descriptions, NOT just comma-separated Danbooru tags.\n\n"
        "Rules:\n"
        "1. Output MUST be a valid JSON array — no markdown, no explanation outside JSON.\n"
        "2. Only include fields you want to change; omit unchanged fields.\n"
        "3. Use descriptive English phrases and sentences, not just comma-separated short tags.\n"
        "4. Preserve the nuances and atmosphere of the Japanese input.\n"
        "5. Do NOT hallucinate fields that are not listed in target_fields."
    )


# ─── Default system prompts (fallbacks when DB has no entry) ──────

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
