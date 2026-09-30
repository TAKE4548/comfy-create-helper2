"""Speech scene generation service for Prompt Surgeon (REQ-291).

Coordinates reference extraction (tone and similar scene), dual-track prompt construction,
and robust JSON parsing with <think> tag purging.
"""

import base64
import asyncio
import io
import json
import logging
from pathlib import Path
import re
import sys
import uuid
from weakref import WeakKeyDictionary
from typing import Any, Awaitable, Callable, Literal, Optional

import httpx
from nltk.stem.snowball import SnowballStemmer  # type: ignore[import-untyped]
from PIL import Image
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Snapshot, SpeechBubblePreset, SpeechTonePreset, TagSet
from app.schemas.speech import (
    BubblePosition,
    BubbleStyleConfig,
    BubbleTail,
    GeneratedSpeechBubbleRead,
    SimilarSceneCandidate,
    ToneSampleItem,
)
from app.services.speech_draft_service import (
    SceneVlmCompletion,
    VlmResponseShapeError,
    call_scene_vlm,
    get_llm_prompt_content,
)
from app.services.lm_studio_lifecycle import (
    acquire_model_instance,
    unload_model_instance_with_retry,
)


logger = logging.getLogger(__name__)

_scene_model_locks: WeakKeyDictionary[asyncio.AbstractEventLoop, dict[str, asyncio.Lock]] = WeakKeyDictionary()


def _scene_model_lock(model_key: str) -> asyncio.Lock:
    """Serialize acquire, inference, and unload for a model within this process."""
    loop = asyncio.get_running_loop()
    locks = _scene_model_locks.setdefault(loop, {})
    return locks.setdefault(model_key, asyncio.Lock())


async def _await_cleanup(awaitable: Awaitable[bool]) -> tuple[bool, bool]:
    """Finish cleanup despite cancellation and report cancellation seen while waiting."""
    task: asyncio.Future[bool] = asyncio.ensure_future(awaitable)
    cancellation_seen = False
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            cancellation_seen = True
    return task.result(), cancellation_seen


def _scene_error_code(exc: BaseException, *, cleanup: bool = False) -> str:
    if isinstance(exc, SceneDraftError):
        return exc.code
    if cleanup:
        return "LM_STUDIO_UNLOAD_FAILED"
    if (
        isinstance(exc, RuntimeError)
        and exc.args
        and exc.args[0] == "LM_STUDIO_INSTANCE_NOT_READY"
    ):
        return "LM_STUDIO_INSTANCE_NOT_READY"
    return "SCENE_VLM_FAILED"

ProgressStepKey = Literal["reference", "vlm", "style", "vram"]
ProgressStatus = Literal["active", "done", "error"]
ProgressCallback = Callable[[ProgressStepKey, ProgressStatus], Awaitable[None]]

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

# Filler pattern to exclude trivial single-word utterances
FILLER_PATTERNS = re.compile(
    r'^(うん|はい|ええ|あ|ああ|そう|なるほど|うーん|んー|へー|ふーん){1,3}[。！？…]?$'
)


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


def extract_character_tone_samples_high_mid_low(
    db: Session,
    target_tag_set_id: Optional[int],
    current_prompt: str,
    exclude_snapshot_id: Optional[int] = None,
) -> list[ToneSampleItem]:
    """系統A改: 高/中/低 Stemmer類似度でToneSampleItemを3件選定 (フィルタ適用, fallbackあり)."""
    if not target_tag_set_id:
        return []

    current_stems = _tokenize_and_stem(current_prompt)

    snaps = db.query(Snapshot).order_by(Snapshot.created_at.desc()).limit(50).all()

    # Collect (score, snapshot_id, text, thumbnail_url) candidates
    candidates: list[tuple[int, int, str, Optional[str]]] = []

    for s in snaps:
        if exclude_snapshot_id and s.id == exclude_snapshot_id:
            continue
        if not s.params:
            continue
        try:
            params_dict = s.params if isinstance(s.params, dict) else json.loads(s.params)
        except Exception:
            continue
        bubbles = params_dict.get("speech_bubbles", []) if isinstance(params_dict, dict) else []
        for b in bubbles:
            if b.get("speaker_tag_set_id") != target_tag_set_id:
                continue
            if b.get("is_se"):
                continue
            text = b.get("text", "")
            if not text:
                continue
            if not (8 <= len(text) <= 50):
                continue
            if FILLER_PATTERNS.match(text):
                continue

            # Stemmer similarity score vs current_prompt
            score = 0
            if current_stems:
                text_stems = _tokenize_and_stem(text)
                common = current_stems & text_stems
                for st in common:
                    if st in EMOTION_STEMS:
                        score += 5
                    elif st in SITUATION_STEMS:
                        score += 2
                    else:
                        score += 1

            # Compute thumbnail_url
            thumb: Optional[str] = None
            if s.image_path:
                try:
                    thumb = f"/api/snapshots/images/{Path(s.image_path).name}"
                except Exception:
                    thumb = None

            candidates.append((score, s.id, text, thumb))

    if not candidates:
        # Fallback: fetch SpeechTonePreset.prompt
        tone = (
            db.query(SpeechTonePreset)
            .join(SpeechBubblePreset, SpeechBubblePreset.tone_preset_id == SpeechTonePreset.id)
            .filter(SpeechBubblePreset.tag_set_id == target_tag_set_id)
            .first()
        )
        if tone and tone.prompt:
            return [ToneSampleItem(
                snapshot_id=None,
                thumbnail_url=None,
                text=tone.prompt,
                similarity_tier='fallback',
            )]
        return []

    # Keep the strongest line from each snapshot before assigning tiers.
    candidates.sort(key=lambda x: x[0], reverse=True)
    distinct_candidates: list[tuple[int, int, str, Optional[str]]] = []
    seen_ids: set[int] = set()
    for candidate in candidates:
        if candidate[1] not in seen_ids:
            seen_ids.add(candidate[1])
            distinct_candidates.append(candidate)
    candidates = distinct_candidates

    result: list[ToneSampleItem] = []
    n = len(candidates)

    if n == 1:
        score, sid, text, thumb = candidates[0]
        result.append(ToneSampleItem(snapshot_id=sid, thumbnail_url=thumb, text=text, similarity_tier='high'))
    elif n == 2:
        score0, sid0, text0, thumb0 = candidates[0]
        score1, sid1, text1, thumb1 = candidates[1]
        result.append(ToneSampleItem(snapshot_id=sid0, thumbnail_url=thumb0, text=text0, similarity_tier='high'))
        result.append(ToneSampleItem(snapshot_id=sid1, thumbnail_url=thumb1, text=text1, similarity_tier='low'))
    else:
        # 3 or more: high=index[0], mid=index[len//2], low=index[-1]
        high = candidates[0]
        mid = candidates[n // 2]
        low = candidates[-1]

        for tier, (score, sid, text, thumb) in [
            ('high', high), ('mid', mid), ('low', low)
        ]:
            result.append(ToneSampleItem(
                snapshot_id=sid,
                thumbnail_url=thumb,
                text=text,
                similarity_tier=tier,  # type: ignore[arg-type]
            ))

    return result



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


def extract_top3_similar_scenes(
    db: Session,
    current_prompt: str,
    exclude_snapshot_id: Optional[int] = None,
    override_snapshot_id: Optional[int] = None,
) -> tuple[Optional[int], list[SimilarSceneCandidate]]:
    """系統B改: Stemmer スコアリングで上位3件の SimilarSceneCandidate を返す.

    override_snapshot_id 指定時は selected_id = override_snapshot_id を返す。
    """
    if not current_prompt:
        if override_snapshot_id is not None:
            raise ValueError(f"Invalid similar scene override: {override_snapshot_id}")
        return (None, [])

    current_stems = _tokenize_and_stem(current_prompt)
    if not current_stems:
        if override_snapshot_id is not None:
            raise ValueError(f"Invalid similar scene override: {override_snapshot_id}")
        return (None, [])

    snaps = db.query(Snapshot).order_by(Snapshot.created_at.desc()).limit(100).all()

    scored: list[tuple[int, int, str, list[str], int]] = []
    # (score, snapshot_id, scene_prompt, matched_stems, bubble_count)

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

        try:
            pdict = s.params if isinstance(s.params, dict) else json.loads(s.params)
            bubbles = pdict.get("speech_bubbles", []) if isinstance(pdict, dict) else []
        except Exception:
            bubbles = []

        scored.append((score, s.id, scene_prompt, sorted(common_stems), len(bubbles)))

    # Sort descending by score, take top 3
    scored.sort(key=lambda x: x[0], reverse=True)
    if override_snapshot_id is not None and override_snapshot_id not in {row[1] for row in scored}:
        raise ValueError(f"Invalid similar scene override: {override_snapshot_id}")
    top3 = scored[:3]

    candidates: list[SimilarSceneCandidate] = []
    for score, sid, scene_prompt, matched, bubble_count in top3:
        thumb = ""
        try:
            snap_obj = db.query(Snapshot).filter(Snapshot.id == sid).first()
            if snap_obj and snap_obj.image_path:
                thumb = f"/api/snapshots/images/{Path(snap_obj.image_path).name}"
        except Exception:
            pass
        candidates.append(SimilarSceneCandidate(
            snapshot_id=sid,
            thumbnail_url=thumb,
            score=score,
            matched_stems=matched,
            prompt=scene_prompt,
            bubble_count=bubble_count,
        ))

    if override_snapshot_id is not None:
        selected_id: Optional[int] = override_snapshot_id
    elif candidates:
        selected_id = candidates[0].snapshot_id
    else:
        selected_id = None

    return (selected_id, candidates)


def load_image_as_base64(image_path: Path, max_size: int = 1024) -> str:
    """Pillow で画像を開き、長辺 max_size にリサイズして JPEG base64 エンコードして返す."""
    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if max(w, h) > max_size:
        scale = max_size / max(w, h)
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


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


class SceneDraftError(RuntimeError):
    """Safe, stable error classification for scene VLM output failures."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


_SCENE_ROLES = {"main", "sub", "se"}
_SCENE_POSITIONS = {"top_right", "center_right", "center", "top_left", "bottom_left"}


def validate_scene_vlm_completion(
    completion: SceneVlmCompletion | VlmResponseShapeError,
) -> dict[str, Any]:
    """Parse and validate a scene VLM completion without exposing its content in errors."""
    if isinstance(completion, VlmResponseShapeError):
        raise SceneDraftError("vlm_empty") from None

    if completion.finish_reason == "length":
        raise SceneDraftError("vlm_truncated")
    if completion.finish_reason == "content_filter":
        raise SceneDraftError("vlm_filtered")
    if completion.finish_reason != "stop":
        raise SceneDraftError("vlm_empty")

    content = completion.content
    if not isinstance(content, str) or not content.strip():
        raise SceneDraftError("vlm_empty")
    try:
        parsed = parse_vlm_json_with_fallback(content)
    except (ValueError, TypeError):
        raise SceneDraftError("vlm_invalid_json") from None

    if not isinstance(parsed, dict):
        raise SceneDraftError("vlm_schema_invalid")
    if set(parsed) != {"scene_interpretation", "items"}:
        raise SceneDraftError("vlm_schema_invalid")
    if not isinstance(parsed["scene_interpretation"], str):
        raise SceneDraftError("vlm_schema_invalid")
    items = parsed["items"]
    if not isinstance(items, list) or not items:
        raise SceneDraftError("vlm_schema_invalid")
    required_item_keys = {"role", "speaker", "text", "position"}
    for item in items:
        if not isinstance(item, dict) or set(item) != required_item_keys:
            raise SceneDraftError("vlm_schema_invalid")
        role = item["role"]
        position = item["position"]
        if (
            not isinstance(role, str)
            or role not in _SCENE_ROLES
            or not isinstance(position, str)
            or position not in _SCENE_POSITIONS
        ):
            raise SceneDraftError("vlm_schema_invalid")
        if not isinstance(item["speaker"], str) or not isinstance(item["text"], str):
            raise SceneDraftError("vlm_schema_invalid")
    return parsed


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


async def generate_scene_script(
    db: Session,
    snapshot_id: int,
    target_tag_set_id: Optional[int] = None,
    explicit_preset_id: Optional[int] = None,
    scene_hint: Optional[str] = None,
    override_similar_scene_snapshot_id: Optional[int] = None,
    progress_callback: ProgressCallback | None = None,
) -> tuple[str, list[GeneratedSpeechBubbleRead], bool, list[ToneSampleItem], Optional[int], list[SimilarSceneCandidate]]:
    """スナップショット画像とプロンプトから二系統リファレンスを参照し、吹き出し群と解釈文を生成する.

    推論終了時、finally 句で対象 instance_id の解放と状態確認を実行する。
    """
    async def emit(step: ProgressStepKey, status: ProgressStatus) -> None:
        if progress_callback is not None:
            await progress_callback(step, status)

    async def emit_error_safely(step: ProgressStepKey) -> None:
        try:
            await emit(step, "error")
        except BaseException:
            # Preserve the original service/cancellation exception.
            pass

    await emit("reference", "active")
    active_step: ProgressStepKey = "reference"
    try:
        snapshot = db.query(Snapshot).filter(Snapshot.id == snapshot_id).first()
        if not snapshot:
            raise ValueError(f"Snapshot not found: {snapshot_id}")

        # Resolve character name for prompt
        char_name = "Main Character"
        if target_tag_set_id:
            ts = db.query(TagSet).filter(TagSet.id == target_tag_set_id).first()
            if ts and ts.name:
                char_name = ts.name

        # 1. 系統A: 同キャラ高/中/低セリフ抽出
        current_prompt = _extract_prompt_text(snapshot.params)
        tone_sample_items = extract_character_tone_samples_high_mid_low(
            db, target_tag_set_id, current_prompt, exclude_snapshot_id=snapshot.id
        )
        tone_texts = [item.text for item in tone_sample_items]

        selected_similar_scene_id, candidate_similar_scenes = extract_top3_similar_scenes(
            db, current_prompt,
            exclude_snapshot_id=snapshot.id,
            override_snapshot_id=override_similar_scene_snapshot_id,
        )

        ref_scene_prompt: Optional[str] = None
        ref_bubbles: list[dict] = []
        if selected_similar_scene_id is not None:
            selected_candidate = next(
                (candidate for candidate in candidate_similar_scenes
                 if candidate.snapshot_id == selected_similar_scene_id), None
            )
            if selected_candidate is not None:
                ref_scene_prompt = selected_candidate.prompt
            else:
                selected_snapshot = db.query(Snapshot).filter(Snapshot.id == selected_similar_scene_id).first()
                if selected_snapshot is not None:
                    ref_scene_prompt = _extract_prompt_text(selected_snapshot.params)
            try:
                snap_obj = db.query(Snapshot).filter(Snapshot.id == selected_similar_scene_id).first()
                if snap_obj and snap_obj.params:
                    pdict = snap_obj.params if isinstance(snap_obj.params, dict) else json.loads(snap_obj.params)
                    ref_bubbles = pdict.get("speech_bubbles", []) if isinstance(pdict, dict) else []
            except Exception:
                pass

        prompt = build_dual_track_prompt(
            character_name=char_name,
            tone_samples=tone_texts,
            similar_scene_prompt=ref_scene_prompt,
            similar_scene_bubbles=ref_bubbles,
            scene_hint=scene_hint,
        )

        if not snapshot.image_path:
            raise ValueError(f"Image path missing for snapshot: {snapshot.id}")
        if snapshot.image_path.startswith("/api/snapshots/images/"):
            filename = snapshot.image_path.replace("/api/snapshots/images/", "", 1)
            image_path = settings.snapshot_path / filename
        else:
            image_path = settings.snapshot_path / Path(snapshot.image_path).name

        if not image_path.exists():
            raise ValueError(f"Image file not found: {image_path}")

        image_base64 = load_image_as_base64(image_path)

        vlm_model = get_llm_prompt_content(db, "speech_draft_vlm_model", settings.llm_model)
        await emit("reference", "done")
    except BaseException:
        await emit_error_safely("reference")
        raise

    vram_unloaded = False
    active_step = "vlm"
    instance_id: Optional[str] = None
    async with _scene_model_lock(vlm_model):
        try:
            await emit("vlm", "active")
            instance_id = await acquire_model_instance(vlm_model)
            completion = await call_scene_vlm(image_base64, prompt, instance_id)
            parsed = validate_scene_vlm_completion(completion)
            interpretation = parsed["scene_interpretation"]
            items = parsed["items"]
            await emit("vlm", "done")
            active_step = "style"
            await emit("style", "active")
            bubbles = convert_items_to_bubbles(
                db, items, target_tag_set_id=target_tag_set_id, explicit_preset_id=explicit_preset_id
            )
            await emit("style", "done")
        except BaseException as exc:
            logger.warning("%s", _scene_error_code(exc))
            await emit_error_safely(active_step)
            raise
        finally:
            # Capture a generation/cancellation failure before cleanup so a cleanup
            # problem can never replace it.
            generation_error = sys.exc_info()[1]
            cancellation_seen = False
            try:
                await emit("vram", "active")
            except asyncio.CancelledError:
                cancellation_seen = True
            except BaseException:
                # Progress delivery must never prevent VRAM cleanup.
                pass

            if instance_id is not None:
                try:
                    vram_unloaded, cancelled_during_unload = await _await_cleanup(
                        unload_model_instance_with_retry(instance_id)
                    )
                    cancellation_seen = cancellation_seen or cancelled_during_unload
                    if not vram_unloaded:
                        logger.warning("LM_STUDIO_UNLOAD_FAILED")
                except BaseException as exc:
                    logger.warning("%s", _scene_error_code(exc, cleanup=True))
                    vram_unloaded = False

            try:
                await emit("vram", "done" if vram_unloaded else "error")
            except asyncio.CancelledError:
                cancellation_seen = True
            except BaseException:
                # Cleanup has completed; callback errors must not replace service errors.
                pass

            if cancellation_seen and generation_error is None:
                raise asyncio.CancelledError

    return (interpretation, bubbles, vram_unloaded, tone_sample_items, selected_similar_scene_id, candidate_similar_scenes)


