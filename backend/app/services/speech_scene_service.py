"""Speech scene generation service for Prompt Surgeon (REQ-291).

Coordinates reference extraction (tone and similar scene), dual-track prompt construction,
and robust JSON parsing with <think> tag purging.
"""

import base64
import json
import logging
from pathlib import Path
import re
import uuid
from typing import Any, Optional

import httpx
from nltk.stem.snowball import SnowballStemmer  # type: ignore[import-untyped]
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Snapshot, SpeechBubblePreset, SpeechTonePreset, TagSet
from app.schemas.speech import (
    BubblePosition,
    BubbleStyleConfig,
    BubbleTail,
    GeneratedSpeechBubbleRead,
)
from app.services.speech_draft_service import call_vlm, get_llm_prompt_content

logger = logging.getLogger(__name__)

stemmer = SnowballStemmer("english")

# Predefined emotion words (stemmed) with score +5
EMOTION_STEMS = {
    stemmer.stem(w)
    for w in [
        "cry", "crying", "tear", "tears", "sad", "sadness", "sorrow",
        "angry", "anger", "rage", "furious", "mad", "scream", "shout",
        "happy", "joy", "smile", "smiling", "laugh", "laughing", "cheer",
        "love", "blush", "blushing", "shy", "embarrassed", "heart",
        "fear", "scared", "afraid", "terror", "panic", "shock", "shocked",
        "surprise", "surprised", "confused", "despair", "pain", "hurt",
    ]
}

# Predefined situation words (stemmed) with score +2
SITUATION_STEMS = {
    stemmer.stem(w)
    for w in [
        "battle", "fight", "fighting", "attack", "action", "combat", "war",
        "defeat", "victory", "fall", "falling", "run", "running", "escape",
        "chase", "kiss", "embrace", "hug", "touch", "hold", "holding",
        "school", "classroom", "street", "room", "night", "rain", "dark",
        "sunset", "morning", "bed", "hospital", "kitchen", "cafe", "coffee",
        "party", "festival", "dance", "sword", "magic", "fire", "explosion",
    ]
}


def extract_character_tone_samples(db: Session, target_tag_set_id: Optional[int]) -> list[str]:
    """系統A: 同キャラ確定セリフ抽出 (直近50件走査、0件時はSpeechTonePresetへフォールバック)."""
    if not target_tag_set_id:
        return []
    snaps = db.query(Snapshot).order_by(Snapshot.created_at.desc()).limit(50).all()
    samples: list[str] = []
    for s in snaps:
        if not s.params:
            continue
        try:
            params_dict = s.params if isinstance(s.params, dict) else json.loads(s.params)
        except Exception:
            continue
        bubbles = params_dict.get("speech_bubbles", []) if isinstance(params_dict, dict) else []
        for b in bubbles:
            if b.get("speaker_tag_set_id") == target_tag_set_id and not b.get("is_se"):
                text = b.get("text", "")
                if text:
                    samples.append(text)
                if len(samples) >= 3:
                    return samples
    if not samples:
        tone = (
            db.query(SpeechTonePreset)
            .join(SpeechBubblePreset, SpeechBubblePreset.tone_preset_id == SpeechTonePreset.id)
            .filter(SpeechBubblePreset.tag_set_id == target_tag_set_id)
            .first()
        )
        if tone and tone.prompt:
            samples.append(tone.prompt)
    return samples


def _tokenize_and_stem(text: str) -> set[str]:
    """Extract words and stem them using SnowballStemmer."""
    if not text:
        return set()
    words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
    return {stemmer.stem(w) for w in words}


def _extract_prompt_text(params_val: Any) -> str:
    """Extract prompt string from snapshot params."""
    if not params_val:
        return ""
    try:
        pdict = params_val if isinstance(params_val, dict) else json.loads(params_val)
    except Exception:
        return ""
    if not isinstance(pdict, dict):
        return ""
    for k in ("positive_prompt", "prompt", "positive"):
        if k in pdict and isinstance(pdict[k], str):
            return pdict[k]
    for val in pdict.values():
        if isinstance(val, str) and len(val) > 20:
            return val
    return ""


def extract_best_similar_scene_samples(
    db: Session,
    current_prompt: str,
    exclude_snapshot_id: Optional[int] = None,
) -> tuple[Optional[str], list[dict]]:
    """系統B: SnowballStemmer による最類似シーン抽出.

    感情語(+5), 状況語(+2), 一般語(+1) スコアリングで Top-1 シーンのプロンプトとセリフ構成を抽出。
    スコア2点以上のTop-1シーンを返す。2点未満の場合は (None, []) を返す。
    """
    if not current_prompt:
        return None, []

    current_stems = _tokenize_and_stem(current_prompt)
    if not current_stems:
        return None, []

    snaps = db.query(Snapshot).order_by(Snapshot.created_at.desc()).limit(100).all()

    best_score = 0
    best_prompt: Optional[str] = None
    best_bubbles: list[dict] = []

    for s in snaps:
        if exclude_snapshot_id and s.id == exclude_snapshot_id:
            continue
        scene_prompt = _extract_prompt_text(s.params)
        if not scene_prompt:
            continue

        scene_stems = _tokenize_and_stem(scene_prompt)
        common_stems = current_stems & scene_stems
        if not common_stems:
            continue

        score = 0
        for st in common_stems:
            if st in EMOTION_STEMS:
                score += 5
            elif st in SITUATION_STEMS:
                score += 2
            else:
                score += 1

        if score > best_score:
            try:
                pdict = s.params if isinstance(s.params, dict) else json.loads(s.params)
                bubbles = pdict.get("speech_bubbles", []) if isinstance(pdict, dict) else []
            except Exception:
                bubbles = []

            best_score = score
            best_prompt = scene_prompt
            best_bubbles = bubbles

    if best_score >= 2:
        return best_prompt, best_bubbles
    return None, []


def build_dual_track_prompt(
    character_name: str,
    tone_samples: list[str],
    similar_scene_prompt: Optional[str],
    similar_scene_bubbles: list[dict],
    scene_hint: Optional[str] = None,
) -> str:
    """Qwen3.5-9B-Claude 向けに思考・演出・空き方角を指定する二系統統合プロンプトを構築."""
    prompt_lines = [
        "You are a manga scriptwriter and speech director specializing in manga composition and character dialogue.",
        f"Generate manga speech bubbles and sound effects (SE) for the main character '{character_name}' and scene.",
        "",
        "### Track A: Target Character Tone & Lines (系統A: キャラクター口調・過去セリフ)",
    ]

    if tone_samples:
        for idx, sample in enumerate(tone_samples, 1):
            prompt_lines.append(f"- Sample {idx}: {sample}")
    else:
        prompt_lines.append("- (No previous tone samples. Adapt natural anime/manga tone.)")

    prompt_lines.extend([
        "",
        "### Track B: Similar Scene Composition & Atmosphere (系統B: 類似シーンの演出・会話構成)",
    ])

    if similar_scene_prompt:
        prompt_lines.append(f"Reference Scene: {similar_scene_prompt}")
        if similar_scene_bubbles:
            prompt_lines.append("Reference Scene Bubbles:")
            for b in similar_scene_bubbles:
                spk = b.get("speaker_name") or b.get("speaker", "unknown")
                txt = b.get("text", "")
                is_se_flag = b.get("is_se", False)
                prefix = "[SE]" if is_se_flag else f"[{spk}]"
                prompt_lines.append(f"  * {prefix}: {txt}")
    else:
        prompt_lines.append("- (No reference scene found.)")

    if scene_hint:
        prompt_lines.extend([
            "",
            "### Additional Scene Hint:",
            f"{scene_hint}",
        ])

    prompt_lines.extend([
        "",
        "### Instructions:",
        "1. Analyze the scene and output valid JSON describing the speech bubbles and SE items.",
        "2. For position, choose from: 'top_right' (opening/opponent), 'center_right' / 'center' (sound effects/SE), 'top_left' (main character punchline/reaction), 'bottom_left' (lower visual area).",
        "3. For role, specify 'main' (for main character), 'sub' (for other speakers), or 'se' (sound effect).",
        "4. Output format MUST be a JSON object with 'scene_interpretation' and 'items' list:",
        "```json",
        "{",
        '  "scene_interpretation": "Brief description of the visual scene and dialogue flow",',
        '  "items": [',
        '    {"role": "main", "speaker": "MainChar", "text": "セリフ", "position": "top_left"},',
        '    {"role": "se", "speaker": "", "text": "ドキッ", "position": "center_right"}',
        "  ]",
        "}",
        "```",
    ])

    return "\n".join(prompt_lines)


def parse_vlm_json_with_fallback(raw_text: str) -> dict:
    """<think> タグ除去 & マークダウン抽出に対応した堅牢な JSON パーサー."""
    cleaned = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL)
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    json_str = match.group(1) if match else cleaned
    return json.loads(json_str.strip())


POSITION_MAP_1024 = {
    'top_right': BubblePosition(x=700.0, y=90.0, w=230.0, h=110.0),
    'center_right': BubblePosition(x=550.0, y=350.0, w=160.0, h=75.0),
    'center': BubblePosition(x=550.0, y=350.0, w=160.0, h=75.0),
    'top_left': BubblePosition(x=120.0, y=120.0, w=240.0, h=120.0),
    'bottom_left': BubblePosition(x=140.0, y=700.0, w=240.0, h=120.0),
}


def _preset_to_style_config(preset: Any) -> BubbleStyleConfig:
    """Convert SpeechBubblePreset model or dict-like object to BubbleStyleConfig."""
    if not preset:
        return BubbleStyleConfig()
    if hasattr(preset, "to_dict"):
        return BubbleStyleConfig(**preset.to_dict())
    return BubbleStyleConfig(
        shape=getattr(preset, "shape", "oval"),
        textColor=getattr(preset, "text_color", "#1A202C"),
        backgroundColor=getattr(preset, "background_color", "#FFFFFF"),
        borderColor=getattr(preset, "border_color", "#CBD5E0"),
        borderWidth=float(getattr(preset, "border_width", 2.0)),
        fontFamily=getattr(preset, "font_family", "Noto Sans JP"),
        fontSize=float(getattr(preset, "font_size", 16.0)) or 16.0,
    )


def resolve_bubble_style(
    db: Session,
    item: dict,
    target_tag_set_id: Optional[int],
    explicit_preset_id: Optional[int],
) -> tuple[Optional[int], bool, BubbleStyleConfig]:
    role = item.get('role', 'main')
    if role == 'main':
        preset = db.query(SpeechBubblePreset).filter_by(id=explicit_preset_id).first() if explicit_preset_id \
            else db.query(SpeechBubblePreset).filter_by(tag_set_id=target_tag_set_id, is_default=True).first()
        style = _preset_to_style_config(preset) if preset else BubbleStyleConfig()
        return (target_tag_set_id, False, style)
    elif role == 'sub':
        speaker = item.get('speaker', '')
        matched_ts = db.query(TagSet).filter(TagSet.name == speaker).first()
        ts_id = matched_ts.id if matched_ts else None
        preset = db.query(SpeechBubblePreset).filter_by(tag_set_id=ts_id, is_default=True).first() if ts_id else None
        style = _preset_to_style_config(preset) if preset else BubbleStyleConfig(backgroundColor='#FFFFFF', textColor='#1A202C')
        return (ts_id, False, style)
    else:  # 'se'
        return (None, True, BubbleStyleConfig(shape='none', backgroundColor='transparent', borderColor='transparent', textColor='#FFCC00'))


def convert_items_to_bubbles(
    db: Session,
    items: list[dict],
    target_tag_set_id: Optional[int] = None,
    explicit_preset_id: Optional[int] = None,
) -> list[GeneratedSpeechBubbleRead]:
    """Convert VLM output items to GeneratedSpeechBubbleRead instances with style, 1024px coordinates, and tail."""
    bubbles: list[GeneratedSpeechBubbleRead] = []

    for item in items:
        role = item.get("role", "main")
        if role not in ("main", "sub", "se"):
            role = "main"

        text = item.get("text", "")
        speaker_name = item.get("speaker", "")

        pos_key = item.get("position", "top_left")
        pos_template = POSITION_MAP_1024.get(pos_key, POSITION_MAP_1024["top_left"])
        position = BubblePosition(
            x=pos_template.x,
            y=pos_template.y,
            w=pos_template.w,
            h=pos_template.h,
        )

        speaker_tag_set_id, is_se, style = resolve_bubble_style(
            db, item, target_tag_set_id, explicit_preset_id
        )

        # Initial tail placement: bottom tail pointing slightly below bubble
        tail: Optional[BubbleTail] = None
        if not is_se:
            tail = BubbleTail(
                direction="bottom",
                tip_x=position.x + position.w / 2.0,
                tip_y=min(1024.0, position.y + position.h + 20.0),
            )

        bubble = GeneratedSpeechBubbleRead(
            id=str(uuid.uuid4()),
            text=text,
            role=role,
            speaker_name=speaker_name,
            speaker_tag_set_id=speaker_tag_set_id,
            is_se=is_se,
            position=position,
            tail=tail,
            style=style,
        )
        bubbles.append(bubble)

    return bubbles


async def unload_vlm_model_with_retry(max_retries: int = 1) -> bool:
    """LM Studio API を呼び出してGPU VRAMを即時解放 (1回リトライ付き)"""
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(
                    f"{settings.llm_base_url}/models/unload",
                    json={},
                    headers={"Content-Type": "application/json"},
                )
                if res.status_code in (200, 204):
                    logger.info("VLM model successfully unloaded from GPU VRAM.")
                    return True
        except Exception as e:
            logger.warning(f"Unload attempt {attempt + 1} failed: {e}")
    logger.error("CRITICAL: Failed to unload VLM model. GPU VRAM might cause CUDA OOM in ComfyUI!")
    return False


async def generate_scene_script(
    db: Session,
    snapshot_id: int,
    target_tag_set_id: Optional[int] = None,
    explicit_preset_id: Optional[int] = None,
    scene_hint: Optional[str] = None,
) -> tuple[str, list[GeneratedSpeechBubbleRead], bool, Optional[str], Optional[str]]:
    """スナップショット画像とプロンプトから二系統リファレンスを参照し、吹き出し群と解釈文を生成する.
    
    推論終了時、finally 句で確実に unload_vlm_model_with_retry を実行し、vram_unloaded フラグを返却する。
    """
    snapshot = db.query(Snapshot).filter(Snapshot.id == snapshot_id).first()
    if not snapshot:
        raise ValueError(f"Snapshot not found: {snapshot_id}")

    # Resolve character name for prompt
    char_name = "Main Character"
    if target_tag_set_id:
        ts = db.query(TagSet).filter(TagSet.id == target_tag_set_id).first()
        if ts and ts.name:
            char_name = ts.name

    # 1. 系統A: 同キャラ確定セリフ抽出
    tone_samples = extract_character_tone_samples(db, target_tag_set_id)
    ref_tone_char = tone_samples[0] if tone_samples else None

    # 2. 系統B: 類似シーン抽出
    current_prompt = _extract_prompt_text(snapshot.params)
    ref_scene_prompt, ref_bubbles = extract_best_similar_scene_samples(
        db, current_prompt, exclude_snapshot_id=snapshot.id
    )

    # 3. 二系統統合プロンプト構築
    prompt = build_dual_track_prompt(
        character_name=char_name,
        tone_samples=tone_samples,
        similar_scene_prompt=ref_scene_prompt,
        similar_scene_bubbles=ref_bubbles,
        scene_hint=scene_hint,
    )

    # 4. 画像 Base64 読み込み
    if snapshot.image_path.startswith("/api/snapshots/images/"):
        filename = snapshot.image_path.replace("/api/snapshots/images/", "", 1)
        image_path = settings.snapshot_path / filename
    else:
        image_path = settings.snapshot_path / Path(snapshot.image_path).name

    if not image_path.exists():
        raise ValueError(f"Image file not found: {image_path}")

    with open(image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode("utf-8")

    # 5. モデル選定
    vlm_model = get_llm_prompt_content(db, "speech_draft_vlm_model", settings.llm_model)

    vram_unloaded = False
    try:
        raw_response = await call_vlm(image_base64, prompt, vlm_model)
        parsed = parse_vlm_json_with_fallback(raw_response)
        interpretation = parsed.get("scene_interpretation", "")
        items = parsed.get("items", [])
        bubbles = convert_items_to_bubbles(
            db, items, target_tag_set_id=target_tag_set_id, explicit_preset_id=explicit_preset_id
        )
    finally:
        vram_unloaded = await unload_vlm_model_with_retry()

    return (interpretation, bubbles, vram_unloaded, ref_tone_char, ref_scene_prompt)


