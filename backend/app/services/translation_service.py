import hashlib
import json
import logging
import re
import urllib.parse
from typing import Dict, List, Optional, Tuple, Literal
import httpx
from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger(__name__)

# In-memory chunk translation cache: hash -> translated_text
TRANSLATION_CACHE: Dict[str, str] = {}


def sanitize_and_tokenize(text: str) -> Tuple[str, Dict[str, str]]:
    """
    Protects LoRA tags, embeddings, weights, and syntax tokens by replacing them with placeholders.
    e.g. <lora:name:0.8>, (masterpiece:1.2), (tag), {tag}, [tag], embedding:name
    """
    tokens: Dict[str, str] = {}
    counter = 0

    def repl(match: re.Match) -> str:
        nonlocal counter
        placeholder = f"__TOKEN_{counter}__"
        tokens[placeholder] = match.group(0)
        counter += 1
        return placeholder

    pattern = re.compile(
        r"<lora:[^>]+>|\((?:[^:()]+:[0-9.]+)\)|\((?:[^()]+)\)|\{[^{}]+\}|\[[^\[\]]+\]|embedding:[^\s,]+"
    )
    sanitized = pattern.sub(repl, text)
    return sanitized, tokens


def restore_tokens(text: str, tokens: Dict[str, str]) -> str:
    """Restores placeholders back to original syntax tokens."""
    for placeholder, original in tokens.items():
        text = text.replace(placeholder, original)
    return text


def get_cache_key(chunk: str, target_lang: str, provider: str) -> str:
    normalized = chunk.strip().lower()
    return hashlib.sha256(f"{normalized}:{target_lang.lower()}:{provider}".encode("utf-8")).hexdigest()


def get_translation_settings(db: Optional[Session]) -> Dict[str, Optional[str]]:
    provider = "google_cloud"
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
                provider = "google_cloud"
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

    prompt = (
        f"Translate the following stable diffusion prompt from {source_lang} to {target_lang}. "
        f"Preserve all tokens like __TOKEN_0__, commas, and structure. Output ONLY the translated prompt without explanations.\n\n"
        f"Input:\n{text}"
    )
    result = await call_llm(prompt, db=db)
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
) -> Tuple[str, Dict[str, int | str]]:
    if not prompt or not prompt.strip():
        return "", {
            "total_chunks": 0,
            "cached_chunks": 0,
            "api_requested_chunks": 0,
            "billed_characters": 0,
            "provider": provider or "google_cloud",
        }

    # Fetch settings from DB if not explicitly provided
    if not provider:
        settings = get_translation_settings(db)
        provider = settings["provider"] or "google_cloud"
        api_key = api_key or settings["api_key"]
        api_url = api_url or settings["api_url"]
    elif provider == "google_free":
        provider = "google_cloud"

    sanitized, tokens = sanitize_and_tokenize(prompt)

    # Split into tags/chunks by commas and newlines
    raw_chunks = [c.strip() for c in re.split(r"[,、\n]+", sanitized) if c.strip()]
    if not raw_chunks:
        return prompt, {
            "total_chunks": 0,
            "cached_chunks": 0,
            "api_requested_chunks": 0,
            "billed_characters": 0,
            "provider": provider,
        }

    total_chunks = len(raw_chunks)
    chunk_translations: List[str] = ["" for _ in range(total_chunks)]

    # Track missing unique chunks and their mapped target indices
    unique_missing: Dict[str, List[int]] = {}
    cached_chunks = 0

    for idx, chunk in enumerate(raw_chunks):
        # If chunk is purely a placeholder token (e.g. __TOKEN_0__), no translation needed
        if re.match(r"^__TOKEN_\d+__$", chunk):
            chunk_translations[idx] = chunk
            cached_chunks += 1
            continue

        cache_key = get_cache_key(chunk, target_lang, provider)
        if cache_key in TRANSLATION_CACHE:
            chunk_translations[idx] = TRANSLATION_CACHE[cache_key]
            cached_chunks += 1
        elif chunk in unique_missing:
            unique_missing[chunk].append(idx)
            cached_chunks += 1  # Deduplicated within the same prompt
        else:
            unique_missing[chunk] = [idx]

    missing_chunks_list = list(unique_missing.keys())
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
        else:
            raise ValueError(f"Unsupported translation provider: {provider}")

        # Cache results and update chunk_translations for all target indices
        for orig_chunk, trans in zip(missing_chunks_list, translated_missing):
            cache_key = get_cache_key(orig_chunk, target_lang, provider)
            TRANSLATION_CACHE[cache_key] = trans
            for target_idx in unique_missing[orig_chunk]:
                chunk_translations[target_idx] = trans

    joined_prompt = ", ".join(chunk_translations)
    restored_prompt = restore_tokens(joined_prompt, tokens)

    meta = {
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
