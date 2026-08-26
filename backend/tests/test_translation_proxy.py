import pytest
from unittest.mock import AsyncMock, MagicMock
import httpx

from app.services import translation_service


def test_sanitize_and_restore_lora_and_weights():
    original = "<lora:animestyle:0.8>, (masterpiece:1.2), (solo), {best quality}, [bad anatomy], embedding:easynegative"
    sanitized, tokens = translation_service.sanitize_and_tokenize(original)

    # All special tags should be replaced with tokens
    assert "<lora:" not in sanitized
    assert "(masterpiece:1.2)" not in sanitized
    assert "{best quality}" not in sanitized
    assert "embedding:easynegative" not in sanitized
    assert len(tokens) == 6

    # Restoring should yield the exact original
    restored = translation_service.restore_tokens(sanitized, tokens)
    assert restored == original


def test_empty_and_whitespace_prompt():
    import asyncio

    res, meta = asyncio.run(
        translation_service.translate_prompt("", source_lang="en", target_lang="ja", provider="google_cloud")
    )
    assert res == ""
    assert meta["total_chunks"] == 0

    res_ws, meta_ws = asyncio.run(
        translation_service.translate_prompt("   \n\t  ", source_lang="en", target_lang="ja", provider="google_cloud")
    )
    assert res_ws == ""
    assert meta_ws["total_chunks"] == 0


@pytest.mark.asyncio
async def test_chunk_splitting_and_deduplication():
    translation_service.clear_cache()
    mock_client = AsyncMock(spec=httpx.AsyncClient)

    # Mock response for google cloud
    async def mock_post(url, **kwargs):
        response = MagicMock(spec=httpx.Response)
        response.status_code = 200
        json_data = kwargs.get("json", {})
        texts = json_data.get("q", [])
        translations = []
        for t in texts:
            if "1girl" in t:
                translations.append({"translatedText": "1人の女の子"})
            elif "masterpiece" in t:
                translations.append({"translatedText": "傑作"})
            else:
                translations.append({"translatedText": "テスト"})
        response.json.return_value = {"data": {"translations": translations}}
        return response

    mock_client.post.side_effect = mock_post

    prompt = "1girl, masterpiece, 1girl"
    translated, meta = await translation_service.translate_prompt(
        prompt=prompt,
        source_lang="en",
        target_lang="ja",
        provider="google_cloud",
        api_key="mock",
        client=mock_client,
    )

    assert "1人の女の子" in translated
    assert "傑作" in translated
    assert meta["total_chunks"] == 3
    assert meta["cached_chunks"] == 1  # 2nd 1girl was deduped
    assert meta["api_requested_chunks"] == 2
    assert translation_service.get_cache_stats() == 2


@pytest.mark.asyncio
async def test_google_cloud_translation_mock():
    translation_service.clear_cache()
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "data": {"translations": [{"translatedText": "青空"}]}
    }
    mock_client.post.return_value = response

    prompt = "<lora:myshit:1.0>, blue sky, (smile:1.1)"
    translated, meta = await translation_service.translate_prompt(
        prompt=prompt,
        source_lang="en",
        target_lang="ja",
        provider="google_cloud",
        api_key="mock",
        client=mock_client,
    )

    assert "<lora:myshit:1.0>" in translated
    assert "(smile:1.1)" in translated
    assert "青空" in translated
    assert meta["total_chunks"] == 3


@pytest.mark.asyncio
async def test_google_cloud_missing_api_key():
    translation_service.clear_cache()
    with pytest.raises(ValueError, match="Google Cloud Translation API key is not configured"):
        await translation_service.translate_prompt(
            prompt="1girl",
            source_lang="en",
            target_lang="ja",
            provider="google_cloud",
            api_key=None,
        )


@pytest.mark.asyncio
async def test_connection_service():
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "data": {"translations": [{"translatedText": "少女、美しい空"}]}
    }
    mock_client.post.return_value = response

    success, sample, error = await translation_service.test_connection(
        provider="google_cloud",
        api_key="mock",
        client=mock_client,
    )
    assert success is True
    assert "少女" in sample
    assert error is None


@pytest.mark.asyncio
async def test_llm_translation_mock():
    translation_service.clear_cache()
    from unittest.mock import patch

    with patch("app.services.llm_request.call_llm", new_callable=AsyncMock) as mock_call_llm:
        mock_call_llm.return_value = "1人の女の子"

        prompt = "1girl"
        translated, meta = await translation_service.translate_prompt(
            prompt=prompt,
            source_lang="en",
            target_lang="ja",
            provider="llm",
        )

        assert translated == "1人の女の子"
        assert meta["provider"] == "llm"
        mock_call_llm.assert_called_once()
        kwargs = mock_call_llm.call_args.kwargs
        assert "user_prompt" in kwargs
        assert kwargs["user_prompt"] == "1girl"
        assert "system_prompt" in kwargs


@pytest.mark.asyncio
async def test_connection_service_llm():
    translation_service.clear_cache()
    from unittest.mock import patch

    with patch("app.services.llm_request.call_llm", new_callable=AsyncMock) as mock_call_llm:
        mock_call_llm.return_value = "1人の女の子"

        success, sample, error = await translation_service.test_connection(
            provider="llm",
        )
        assert success is True
        assert sample != ""
        assert error is None

