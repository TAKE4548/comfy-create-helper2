"""Structured output parser for LLM speech rewriting."""
import json
import re
from typing import Optional, Tuple
from app.services.llm_request import call_llm


def is_valid_structured_response(raw_output: str) -> bool:
    """LLM応答が有効な構造化タグ（<dialogue>タグ）または有効なJSON構造を持っているかを検証する。"""
    if not raw_output or not raw_output.strip():
        return False

    # Check for <dialogue> tag
    if re.search(r"<dialogue>(.*?)</dialogue>", raw_output, re.DOTALL | re.IGNORECASE):
        return True

    # Check for JSON structure containing dialogue
    trimmed = raw_output.strip()
    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", trimmed, re.DOTALL)
    candidate_json = json_match.group(1) if json_match else trimmed
    if candidate_json.startswith("{") and candidate_json.endswith("}"):
        try:
            data = json.loads(candidate_json)
            if isinstance(data, dict) and ("dialogue" in data or "rewritten_text" in data):
                return True
        except Exception:
            pass

    return False


def _clean_dialogue_text(text: str) -> str:
    """Clean surrounding whitespace and unnecessary quotes."""
    text = text.strip()
    # Strip wrapping single/double quotes if they wrap the entire text
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1].strip()
    return text


def parse_structured_dialogue_response(raw_output: str) -> Tuple[str, Optional[str], Optional[str]]:
    """LLM出力をパースして (dialogue_text, scene_interpretation, reasoning) を返す。

    - <dialogue>...</dialogue> を最優先抽出
    - <interpretation>...</interpretation> を抽出
    - <reasoning>...</reasoning> または <think>...</think> を抽出
    - JSON形式（{"dialogue": ...}）のパースフォールバック
    - タグなしプレーンテキストのフォールバック
    """
    if not raw_output:
        return "", None, None

    raw_text = raw_output.strip()

    # 1. Extract interpretation
    interpretation_match = re.search(r"<interpretation>(.*?)</interpretation>", raw_text, re.DOTALL | re.IGNORECASE)
    scene_interpretation = interpretation_match.group(1).strip() if interpretation_match else None

    # 2. Extract reasoning / think
    reasoning_match = re.search(r"<reasoning>(.*?)</reasoning>", raw_text, re.DOTALL | re.IGNORECASE)
    if not reasoning_match:
        reasoning_match = re.search(r"<think>(.*?)</think>", raw_text, re.DOTALL | re.IGNORECASE)
    reasoning = reasoning_match.group(1).strip() if reasoning_match else None

    # 3. Extract dialogue tag
    dialogue_match = re.search(r"<dialogue>(.*?)</dialogue>", raw_text, re.DOTALL | re.IGNORECASE)
    if dialogue_match:
        dialogue_text = _clean_dialogue_text(dialogue_match.group(1))
        return dialogue_text, scene_interpretation, reasoning

    # 4. JSON fallback
    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
    candidate_json = json_match.group(1) if json_match else raw_text
    if candidate_json.startswith("{") and candidate_json.endswith("}"):
        try:
            data = json.loads(candidate_json)
            if isinstance(data, dict):
                dialogue_val = data.get("dialogue") or data.get("rewritten_text")
                if dialogue_val:
                    json_interp = data.get("scene_interpretation") or data.get("interpretation") or scene_interpretation
                    json_reasoning = data.get("reasoning") or data.get("think") or reasoning
                    return _clean_dialogue_text(str(dialogue_val)), json_interp, json_reasoning
        except Exception:
            pass

    # 5. Plain text fallback (remove <think>...</think> or <interpretation>...</interpretation> if present)
    fallback_text = raw_text
    fallback_text = re.sub(r"<think>.*?</think>", "", fallback_text, flags=re.DOTALL | re.IGNORECASE)
    fallback_text = re.sub(r"<reasoning>.*?</reasoning>", "", fallback_text, flags=re.DOTALL | re.IGNORECASE)
    fallback_text = re.sub(r"<interpretation>.*?</interpretation>", "", fallback_text, flags=re.DOTALL | re.IGNORECASE)
    fallback_text = _clean_dialogue_text(fallback_text)

    return fallback_text, scene_interpretation, reasoning


DEFAULT_SPEECH_REWRITE_ROLE_PROMPT = (
    "あなたはセリフの言い回しや口調を変換する専門家です。\n"
    "元のセリフの意味、状況、感情、意図は一切変えずに、指定された口調・話し方・キャラクター特徴に合わせて自然なセリフに書き換えてください。\n\n"
    "【基本方針】\n"
    "1. セリフの意味内容・文脈・伝達したい情報は忠実に維持すること。\n"
    "2. 指定された口調、語尾、一人称・二人称、キャラクターの性格ニュアンスを的確に反映すること。"
)

STRUCTURED_OUTPUT_SYSTEM_INSTRUCTION = (
    "【出力フォーマット（システム必須要件）】\n"
    "必ず以下のタグ形式で出力してください。タグ外の前置きや解説、挨拶は一切出力しないでください。\n\n"
    "<interpretation>\n"
    "（画像や場面ヒントから読み取った状況、表情、キャラクターの心理・雰囲気の解釈）\n"
    "</interpretation>\n"
    "<reasoning>\n"
    "（指定された口調・キャラクター設定に合わせてどのように言葉を選び、変換したかの思考過程・推論）\n"
    "</reasoning>\n"
    "<dialogue>\n"
    "（変換後の最終的なセリフ本文のみ。カギ括弧や引用符は含めないでください）\n"
    "</dialogue>"
)


def get_effective_speech_rewrite_system_prompt(db) -> str:
    """DBからシステムプロンプト設定を取得し、構造化出力指示を付加して返却する。"""
    from app import models

    record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "speech_rewrite_system_prompt").first()
    base_prompt = (
        record.content.strip()
        if record and record.content and record.content.strip()
        else DEFAULT_SPEECH_REWRITE_ROLE_PROMPT
    )
    return f"{base_prompt}\n\n{STRUCTURED_OUTPUT_SYSTEM_INSTRUCTION}"


async def call_llm_with_structured_dialogue(
    system_prompt: str,
    user_prompt: str,
    model: Optional[str] = None,
    llm_params: Optional[dict] = None,
    image_data: Optional[str] = None,
    max_format_retries: int = 2,
) -> Tuple[str, Optional[str], Optional[str]]:
    """LLMを呼び出し、構造化タグが正しく含まれているか検証しながら自動リトライを行う。"""
    current_prompt = user_prompt
    raw_output = ""
    for attempt in range(max_format_retries + 1):
        raw_output = await call_llm(
            system_prompt=system_prompt,
            user_prompt=current_prompt,
            model=model,
            llm_params=llm_params,
            image_data=image_data,
        )
        if is_valid_structured_response(raw_output):
            return parse_structured_dialogue_response(raw_output)

        if attempt < max_format_retries:
            current_prompt = (
                f"{user_prompt}\n\n"
                "【重要：出力形式の再要求】\n"
                "直前の出力は指定されたタグ形式（<interpretation>...</interpretation><reasoning>...</reasoning><dialogue>...</dialogue>）に違反していました。\n"
                "挨拶やタグ外の解説は一切含めず、必ず指定された3つのタグで囲んで出力してください。"
            )
    return parse_structured_dialogue_response(raw_output)


