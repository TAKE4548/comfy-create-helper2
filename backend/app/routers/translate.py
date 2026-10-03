import logging
from typing import Literal, Optional, TypedDict, cast
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import translation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/translate", tags=["translate"])


class PromptTranslateRequest(BaseModel):
    prompt: str
    source_lang: Optional[str] = "en"
    target_lang: Optional[str] = "ja"
    provider: Optional[str] = None
    repack: Optional[bool] = True


class TranslateMeta(BaseModel):
    total_chunks: int
    cached_chunks: int
    api_requested_chunks: int
    billed_characters: int
    provider: str


class TranslationMetaData(TypedDict):
    total_chunks: int
    cached_chunks: int
    api_requested_chunks: int
    billed_characters: int
    provider: str


class PromptTranslateResponse(BaseModel):
    translated_prompt: str
    meta: TranslateMeta


class TranslateTestRequest(BaseModel):
    provider: Literal["google_cloud", "deepl", "llm", "fugumt"]
    api_key: Optional[str] = None
    api_url: Optional[str] = None


class TranslateTestResponse(BaseModel):
    success: bool
    sample_translation: str
    error: Optional[str] = None


class TranslateStatsResponse(BaseModel):
    cached_entries_count: int


@router.post("/prompt", response_model=PromptTranslateResponse)
async def translate_prompt_endpoint(
    payload: PromptTranslateRequest,
    db: Session = Depends(get_db),
):
    try:
        translated_prompt, meta_dict = await translation_service.translate_prompt(
            prompt=payload.prompt,
            source_lang=payload.source_lang or "en",
            target_lang=payload.target_lang or "ja",
            provider=payload.provider,
            db=db,
            repack=True if payload.repack is None else payload.repack,
        )
        meta_data = cast(TranslationMetaData, meta_dict)
        return PromptTranslateResponse(
            translated_prompt=translated_prompt,
            meta=TranslateMeta(
                total_chunks=meta_data["total_chunks"],
                cached_chunks=meta_data["cached_chunks"],
                api_requested_chunks=meta_data["api_requested_chunks"],
                billed_characters=meta_data["billed_characters"],
                provider=meta_data["provider"],
            ),
        )
    except Exception as e:
        logger.exception(f"Error during prompt translation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Translation failed: {str(e)}",
        )


@router.post("/test", response_model=TranslateTestResponse)
async def test_translate_endpoint(
    payload: TranslateTestRequest,
    db: Session = Depends(get_db),
):
    success, sample_translation, error = await translation_service.test_connection(
        provider=payload.provider,
        api_key=payload.api_key,
        api_url=payload.api_url,
        db=db,
    )
    return TranslateTestResponse(
        success=success,
        sample_translation=sample_translation,
        error=error,
    )


@router.get("/stats", response_model=TranslateStatsResponse)
async def get_stats_endpoint():
    count = translation_service.get_cache_stats()
    return TranslateStatsResponse(cached_entries_count=count)


@router.post("/clear-cache")
async def clear_cache_endpoint():
    cleared = translation_service.clear_cache()
    return {"message": "Cache cleared successfully", "cleared_count": cleared}
