import csv
import hashlib
import io
import json
import logging
import os
import re
import urllib.parse
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Literal, Union
import httpx
from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger(__name__)

# In-memory chunk translation cache: hash -> translated_text
TRANSLATION_CACHE: Dict[str, str] = {}

DANBOORU_DICT: Dict[str, str] = {}
_DICT_LOADED: bool = False

# カンマ、読点、改行、句点、感嘆符/疑問符、および直後が空白または終端であるピリオド（小数点・三点リーダー除外）
SPLIT_PATTERN = re.compile(r"([,、\n\r]+\s*|(?<![\d.])\.(?![\d.])(?:\s+|$)|[。！？!?]+\s*)")

WEIGHT_TAG_REGEX = re.compile(r"^([(\[{]+)(.+?)(?::([0-9.]+))?([)\]}]+)$")


def unpack_tag(chunk: str) -> Tuple[str, str, Optional[float], str]:
    """
    Unpacks prompt chunk wrapped in brackets/parentheses and weights into components:
    (prefix, cleaned_core, weight_val, suffix).
    If chunk is not wrapped, returns ("", chunk_cleaned, None, "").
    """
    stripped = chunk.strip()
    if re.match(r"^__TOKEN_\d+__$", stripped):
        return "", stripped, None, ""
    match = WEIGHT_TAG_REGEX.match(stripped)
    if match:
        prefix = match.group(1)
        core = match.group(2)
        weight_str = match.group(3)
        weight_val = float(weight_str) if weight_str is not None else None
        suffix = match.group(4)
        cleaned_core = core.replace("_", " ").strip()
        return prefix, cleaned_core, weight_val, suffix
    return "", stripped.replace("_", " "), None, ""


def repack_tag(translated_core: str, prefix: str, weight: Optional[Union[float, str]], suffix: str) -> str:
    """
    Repacks translated core string with original prefix, weight, and suffix.
    If prefix, suffix, and weight are empty/None, returns translated_core directly.
    """
    if not prefix and not suffix and (weight is None or str(weight).strip() == ""):
        return translated_core
    if weight is not None and str(weight).strip() != "":
        return f"{prefix}{translated_core}:{weight}{suffix}"
    return f"{prefix}{translated_core}{suffix}"


def load_danbooru_dict(force_reload: bool = False) -> int:
    """
    Loads Danbooru tag dictionary from local disk or zip archive into DANBOORU_DICT.
    Supports dual-key lookup (with underscore and with space).
    Graceful degradation on missing or corrupt files.
    """
    global _DICT_LOADED, DANBOORU_DICT
    if _DICT_LOADED and not force_reload:
        return len(DANBOORU_DICT)

    if force_reload:
        DANBOORU_DICT.clear()
        _DICT_LOADED = False

    repo_root = Path(__file__).resolve().parents[3]
    candidate_rel_paths: List[str] = []

    env_path = os.environ.get("DANBOORU_DICT_PATH")
    if env_path:
        candidate_rel_paths.append(env_path)

    candidate_rel_paths.extend([
        "tmp/danbooruTagCompleteCsv_v1020250919.zip",
        "tmp/danbooru_extracted/danbooru_translations_jp.csv",
        "tmp/danbooru_translations_jp.csv",
        "tmp/danbooru_ja.csv",
        "tmp/danbooru.csv",
        "data/dictionaries/danbooru_ja.csv",
    ])

    resolved_path: Optional[Path] = None
    for cand in candidate_rel_paths:
        p = Path(cand)
        if p.is_file():
            resolved_path = p
            break
        p_from_root = repo_root / cand
        if p_from_root.is_file():
            resolved_path = p_from_root
            break

    if not resolved_path:
        logger.warning("Danbooru dictionary file not found in search paths. Operating without Danbooru dictionary.")
        _DICT_LOADED = True
        return 0

    try:
        raw_bytes: bytes
        if str(resolved_path).lower().endswith(".zip"):
            with zipfile.ZipFile(resolved_path, "r") as zf:
                csv_name: Optional[str] = None
                for target_name in ["danbooru_translations_jp.csv", "danbooru_ja.csv"]:
                    if target_name in zf.namelist():
                        csv_name = target_name
                        break
                if not csv_name:
                    for name in zf.namelist():
                        if name.lower().endswith(".csv"):
                            csv_name = name
                            break
                if not csv_name:
                    logger.warning(f"No CSV file found inside zip archive: {resolved_path}")
                    _DICT_LOADED = True
                    return 0
                with zf.open(csv_name, "r") as zf_file:
                    raw_bytes = zf_file.read()
        else:
            with open(resolved_path, "rb") as f:
                raw_bytes = f.read()

        try:
            text = raw_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = raw_bytes.decode("cp932")
            except UnicodeDecodeError:
                text = raw_bytes.decode("utf-8-sig", errors="replace")

        reader = csv.reader(io.StringIO(text))
        loaded_count = 0
        for row in reader:
            if not row or len(row) < 2:
                continue
            tag = row[0].strip()
            trans_raw = row[1].strip()
            if not tag or not trans_raw:
                continue
            trans_val = trans_raw.split(",")[0].strip()
            tag_lower = tag.lower()
            tag_space = tag_lower.replace("_", " ")
            DANBOORU_DICT[tag_lower] = trans_val
            DANBOORU_DICT[tag_space] = trans_val
            loaded_count += 1

        _DICT_LOADED = True
        logger.info(f"Loaded {loaded_count} tags from Danbooru dictionary: {resolved_path}")
        return len(DANBOORU_DICT)

    except Exception as e:
        logger.warning(f"Failed to load Danbooru dictionary from {resolved_path}: {e}", exc_info=True)
        _DICT_LOADED = True
        return 0



def sanitize_and_tokenize(text: str) -> Tuple[str, Dict[str, str]]:
    """
    Protects LoRA tags, hypernetworks, and embeddings by replacing them with placeholders.
    e.g. <lora:name:0.8>, <hypernet:name:0.5>, embedding:name
    """
    tokens: Dict[str, str] = {}
    counter = 0

    def repl(match: re.Match) -> str:
        nonlocal counter
        placeholder = f"__TOKEN_{counter}__"
        tokens[placeholder] = match.group(0)
        counter += 1
        return placeholder

    pattern = re.compile(r"<lora:[^>]+>|<hypernet:[^>]+>|embedding:[^\s,]+")
    sanitized = pattern.sub(repl, text)
    return sanitized, tokens


def restore_tokens(text: str, tokens: Dict[str, str]) -> str:
    """Restores placeholders back to original syntax tokens."""
    for placeholder, original in tokens.items():
        text = text.replace(placeholder, original)
    return text


def get_cache_key(chunk: str, target_lang: str, provider: str) -> str:
    normalized = re.sub(r"\s+", " ", chunk.strip()).lower()
    return hashlib.sha256(f"{normalized}:{target_lang.lower()}:{provider}".encode("utf-8")).hexdigest()


def get_translation_settings(db: Optional[Session]) -> Dict[str, Optional[str]]:
    provider = "fugumt"
    api_key = None
    api_url = None

    if db is not None:
        try:
            records = (
                db.query(models.LlmPrompt)
                .filter(
                    models.LlmPrompt.key.in_(
                        ["translation_provider", "translation_api_key", "translation_api_url"]
                    )
                )
                .all()
            )
            settings_map = {r.key: r.content for r in records}
            p = settings_map.get("translation_provider")
            if p and p != "google_free":
                provider = p
            else:
                provider = "fugumt"
            api_key = settings_map.get("translation_api_key")
            api_url = settings_map.get("translation_api_url")
        except Exception as e:
            logger.warning(f"Failed to query translation settings from DB: {e}")

    return {
        "provider": provider,
        "api_key": api_key,
        "api_url": api_url,
    }


async def translate_google_cloud(
    texts: List[str],
    api_key: str,
    source_lang: str = "en",
    target_lang: str = "ja",
    client: Optional[httpx.AsyncClient] = None,
) -> List[str]:
    """Google Cloud Translation API v2."""
    if not api_key:
        raise ValueError("Google Cloud Translation API key is required")
    url = f"https://translation.googleapis.com/language/translate/v2?key={api_key}"
    payload = {
        "q": texts,
        "source": source_lang,
        "target": target_lang,
        "format": "text",
    }

    close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=10.0)
        close_client = True

    try:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        translations = data.get("data", {}).get("translations", [])
        return [t.get("translatedText", "") for t in translations]
    finally:
        if close_client:
            await client.aclose()


async def translate_deepl(
    texts: List[str],
    api_key: str,
    api_url: Optional[str] = None,
    source_lang: str = "en",
    target_lang: str = "ja",
    client: Optional[httpx.AsyncClient] = None,
) -> List[str]:
    """DeepL API."""
    if not api_key:
        raise ValueError("DeepL API key is required")

    endpoint = api_url
    if not endpoint:
        if api_key.endswith(":fx"):
            endpoint = "https://api-free.deepl.com/v2/translate"
        else:
            endpoint = "https://api.deepl.com/v2/translate"

    headers = {
        "Authorization": f"DeepL-Auth-Key {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "text": texts,
        "source_lang": source_lang.upper(),
        "target_lang": target_lang.upper(),
    }

    close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=10.0)
        close_client = True

    try:
        response = await client.post(endpoint, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        translations = data.get("translations", [])
        return [t.get("text", "") for t in translations]
    finally:
        if close_client:
            await client.aclose()


async def translate_llm(
    text: str,
    source_lang: str = "en",
    target_lang: str = "ja",
    db: Optional[Session] = None,
) -> str:
    """Local LLM translation using existing call_llm service."""
    from app.services.llm_request import call_llm

    system_prompt = (
        f"You are a professional prompt translator for AI image generation. "
        f"Translate the following stable diffusion prompt from {source_lang} to {target_lang}. "
        f"Preserve all tokens like __TOKEN_0__, commas, and structure. Output ONLY the translated prompt without explanations."
    )
    model = None
    llm_params = None
    if db:
        try:
            from app import models
            import json
            model_record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "translation_model").first()
            if model_record and model_record.content and model_record.content.strip():
                model = model_record.content
            params_record = db.query(models.LlmPrompt).filter(models.LlmPrompt.key == "llm_params_translation").first()
            if params_record and params_record.content:
                try:
                    llm_params = json.loads(params_record.content)
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Failed to fetch translation LLM settings from DB: {e}")

    result = await call_llm(
        system_prompt=system_prompt,
        user_prompt=text,
        model=model,
        llm_params=llm_params,
        timeout=60.0,
    )
    return result.strip() if result else text


async def translate_prompt(
    prompt: str,
    source_lang: str = "en",
    target_lang: str = "ja",
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    api_url: Optional[str] = None,
    db: Optional[Session] = None,
    client: Optional[httpx.AsyncClient] = None,
    repack: bool = True,
) -> Tuple[str, Dict[str, int | str]]:
    if not prompt or not prompt.strip():
        return "", {
            "total_chunks": 0,
            "cached_chunks": 0,
            "api_requested_chunks": 0,
            "billed_characters": 0,
            "provider": provider or "fugumt",
        }

    # Fetch settings from DB if not explicitly provided
    if not provider:
        settings = get_translation_settings(db)
        provider = settings["provider"] or "fugumt"
        api_key = api_key or settings["api_key"]
        api_url = api_url or settings["api_url"]
    elif provider == "google_free":
        provider = "google_cloud"

    # Step 1: Protect pure meta syntax (<lora:...>, <hypernet:...>, embedding:...)
    sanitized, tokens = sanitize_and_tokenize(prompt)

    # Step 2: Ensure Danbooru dictionary is loaded
    load_danbooru_dict()

    # Step 3: Split into chunks and delimiters preserving punctuation
    parts = SPLIT_PATTERN.split(sanitized)

    # Step 4: Extract non-empty even-index chunks and unpack them
    chunk_indices: List[int] = [i for i in range(0, len(parts), 2) if parts[i].strip()]
    if not chunk_indices:
        return prompt, {
            "total_chunks": 0,
            "cached_chunks": 0,
            "api_requested_chunks": 0,
            "billed_characters": 0,
            "provider": provider,
        }

    total_chunks = len(chunk_indices)
    unpacked_info: Dict[int, Tuple[str, str, Optional[float], str]] = {}
    chunk_translations: Dict[int, str] = {}
    unique_missing: Dict[str, Tuple[str, List[int]]] = {}
    cached_chunks = 0

    # Step 5: Check tokens, Danbooru dictionary, and cache for each chunk core
    for idx in chunk_indices:
        prefix, core, weight_val, suffix = unpack_tag(parts[idx])
        unpacked_info[idx] = (prefix, core, weight_val, suffix)

        # If placeholder token (__TOKEN_\d+__), skip translation
        if re.match(r"^__TOKEN_\d+__$", core):
            chunk_translations[idx] = core
            cached_chunks += 1
            continue

        # Danbooru dictionary lookup (English to Japanese)
        core_clean = core.strip().lower()
        danbooru_trans = (
            (DANBOORU_DICT.get(core_clean) or DANBOORU_DICT.get(core_clean.replace(" ", "_")))
            if target_lang.lower().startswith("ja")
            else None
        )
        if danbooru_trans:
            chunk_translations[idx] = danbooru_trans
            cached_chunks += 1
            continue

        # Check translation cache
        cache_key = get_cache_key(core, target_lang, provider)
        if cache_key in TRANSLATION_CACHE:
            chunk_translations[idx] = TRANSLATION_CACHE[cache_key]
            cached_chunks += 1
        elif cache_key in unique_missing:
            unique_missing[cache_key][1].append(idx)
            cached_chunks += 1  # Deduplicated within the same prompt
        else:
            unique_missing[cache_key] = (core, [idx])

    # Step 6: Request translation for missing chunks
    missing_items = list(unique_missing.values())
    missing_chunks_list = [item[0] for item in missing_items]
    api_requested_chunks = len(missing_chunks_list)
    billed_characters = sum(len(c) for c in missing_chunks_list)

    if missing_chunks_list:
        translated_missing: List[str] = []
        if provider == "google_cloud":
            if not api_key:
                raise ValueError("Google Cloud Translation API key is not configured. Please set the API key in Settings.")
            try:
                translated_missing = await translate_google_cloud(
                    missing_chunks_list,
                    api_key=api_key,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    client=client,
                )
            except Exception as e:
                logger.error(f"Google Cloud translation error: {e}")
                raise e
        elif provider == "deepl":
            if not api_key:
                raise ValueError("DeepL API key is not configured. Please set the API key in Settings.")
            try:
                translated_missing = await translate_deepl(
                    missing_chunks_list,
                    api_key=api_key,
                    api_url=api_url,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    client=client,
                )
            except Exception as e:
                logger.error(f"DeepL translation error: {e}")
                raise e
        elif provider == "llm":
            for chunk in missing_chunks_list:
                try:
                    res = await translate_llm(
                        chunk, source_lang=source_lang, target_lang=target_lang, db=db
                    )
                    translated_missing.append(res)
                except Exception as e:
                    logger.error(f"LLM translation error for '{chunk}': {e}")
                    raise e
        elif provider == "fugumt":
            from app.services.fugumt_service import FuguMTService

            fugumt = FuguMTService.get_instance()
            try:
                translated_missing = fugumt.translate_batch(missing_chunks_list)
            except Exception as e:
                logger.error(f"FuguMT translation error: {e}")
                raise e
        else:
            raise ValueError(f"Unsupported translation provider: {provider}")

        # Cache results and update chunk_translations for all target indices
        for (cache_key, (orig_core, target_indices)), trans in zip(unique_missing.items(), translated_missing):
            TRANSLATION_CACHE[cache_key] = trans
            for target_idx in target_indices:
                chunk_translations[target_idx] = trans

    # Step 7: Repack chunks and reconstruct prompt
    for idx in chunk_indices:
        prefix, core, weight_val, suffix = unpacked_info[idx]
        trans_core = chunk_translations.get(idx, core)
        if re.match(r"^__TOKEN_\d+__$", core):
            parts[idx] = trans_core
        elif repack:
            parts[idx] = repack_tag(trans_core, prefix, weight_val, suffix)
        else:
            parts[idx] = trans_core

    joined_prompt = "".join(parts)
    restored_prompt = restore_tokens(joined_prompt, tokens)

    meta: Dict[str, int | str] = {
        "total_chunks": total_chunks,
        "cached_chunks": cached_chunks,
        "api_requested_chunks": api_requested_chunks,
        "billed_characters": billed_characters,
        "provider": provider,
    }

    return restored_prompt, meta


async def test_connection(
    provider: str,
    api_key: Optional[str] = None,
    api_url: Optional[str] = None,
    db: Optional[Session] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> Tuple[bool, str, Optional[str]]:
    test_text = "1girl, beautiful sky"
    try:
        translated, _ = await translate_prompt(
            prompt=test_text,
            source_lang="en",
            target_lang="ja",
            provider=provider,
            api_key=api_key,
            api_url=api_url,
            db=db,
            client=client,
        )
        return True, translated, None
    except Exception as e:
        logger.exception(f"Connection test failed for provider {provider}")
        return False, "", str(e)


def clear_cache() -> int:
    count = len(TRANSLATION_CACHE)
    TRANSLATION_CACHE.clear()
    return count


def get_cache_stats() -> int:
    return len(TRANSLATION_CACHE)
