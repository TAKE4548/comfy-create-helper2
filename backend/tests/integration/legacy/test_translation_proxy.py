import pytest
from unittest.mock import AsyncMock, MagicMock
import httpx

from app.services import translation_service


def test_sanitize_and_restore_lora_and_weights():
    original = "<lora:animestyle:0.8>, <hypernet:style:0.5>, embedding:easynegative"
    sanitized, tokens = translation_service.sanitize_and_tokenize(original)

    # Pure meta tags should be replaced with tokens
    assert "<lora:" not in sanitized
    assert "<hypernet:" not in sanitized
    assert "embedding:easynegative" not in sanitized
    assert len(tokens) == 3

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
async def test_chunk_splitting_and_deduplication(monkeypatch):
    monkeypatch.setattr(translation_service, "load_danbooru_dict", lambda force_reload=False: 0)
    monkeypatch.setattr(translation_service, "DANBOORU_DICT", {})
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
async def test_google_cloud_translation_mock(monkeypatch):
    monkeypatch.setattr(translation_service, "load_danbooru_dict", lambda force_reload=False: 0)
    monkeypatch.setattr(translation_service, "DANBOORU_DICT", {})
    translation_service.clear_cache()
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "data": {"translations": [{"translatedText": "青空"}, {"translatedText": "笑顔"}]}
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
        repack=True,
    )

    assert "<lora:myshit:1.0>" in translated
    assert "青空" in translated
    assert meta["total_chunks"] == 3


@pytest.mark.asyncio
async def test_google_cloud_missing_api_key(monkeypatch):
    monkeypatch.setattr(translation_service, "load_danbooru_dict", lambda force_reload=False: 0)
    monkeypatch.setattr(translation_service, "DANBOORU_DICT", {})
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
async def test_llm_translation_mock(monkeypatch):
    monkeypatch.setattr(translation_service, "load_danbooru_dict", lambda force_reload=False: 0)
    monkeypatch.setattr(translation_service, "DANBOORU_DICT", {})
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


@pytest.mark.asyncio
async def test_fugumt_translation_mock(monkeypatch):
    monkeypatch.setattr(translation_service, "load_danbooru_dict", lambda force_reload=False: 0)
    monkeypatch.setattr(translation_service, "DANBOORU_DICT", {})
    translation_service.clear_cache()
    from unittest.mock import patch, MagicMock

    with patch("app.services.fugumt_service.FuguMTService.get_instance") as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ["1人の女の子"]
        mock_get_instance.return_value = mock_service

        prompt = "1girl"
        translated, meta = await translation_service.translate_prompt(
            prompt=prompt,
            source_lang="en",
            target_lang="ja",
            provider="fugumt",
        )

        assert translated == "1人の女の子"
        assert meta["provider"] == "fugumt"
        assert meta["total_chunks"] == 1
        assert meta["cached_chunks"] == 0
        assert meta["api_requested_chunks"] == 1
        mock_service.translate_batch.assert_called_once_with(["1girl"])


@pytest.mark.asyncio
async def test_fugumt_cache_normalization_ac1(monkeypatch):
    monkeypatch.setattr(translation_service, "load_danbooru_dict", lambda force_reload=False: 0)
    monkeypatch.setattr(translation_service, "DANBOORU_DICT", {})
    translation_service.clear_cache()
    from unittest.mock import patch, MagicMock

    with patch("app.services.fugumt_service.FuguMTService.get_instance") as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ["1人の女の子"]
        mock_get_instance.return_value = mock_service

        # First request with extra spaces: " 1girl "
        translated1, meta1 = await translation_service.translate_prompt(
            prompt=" 1girl ",
            source_lang="en",
            target_lang="ja",
            provider="fugumt",
        )
        assert translated1 == "1人の女の子"
        assert meta1["cached_chunks"] == 0
        assert meta1["api_requested_chunks"] == 1
        assert mock_service.translate_batch.call_count == 1

        # Second request without spaces: "1girl" -> should hit cache, 0 API requests
        translated2, meta2 = await translation_service.translate_prompt(
            prompt="1girl",
            source_lang="en",
            target_lang="ja",
            provider="fugumt",
        )
        assert translated2 == "1人の女の子"
        assert meta2["cached_chunks"] == 1
        assert meta2["api_requested_chunks"] == 0
        assert mock_service.translate_batch.call_count == 1  # Not called again


@pytest.mark.asyncio
async def test_connection_service_fugumt():
    translation_service.clear_cache()
    from unittest.mock import patch, MagicMock

    with patch("app.services.fugumt_service.FuguMTService.get_instance") as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ["1人の女の子", "美しい空"]
        mock_get_instance.return_value = mock_service

        success, sample, error = await translation_service.test_connection(
            provider="fugumt",
        )
        assert success is True
        assert sample != ""
        assert error is None


def test_translation_settings_default_fugumt():
    settings = translation_service.get_translation_settings(None)
    assert settings["provider"] == "fugumt"
    assert settings["api_key"] is None
    assert settings["api_url"] is None


def test_router_models_fugumt_validation():
    from app.routers.translate import PromptTranslateRequest, TranslateTestRequest

    # Test PromptTranslateRequest accepts provider and repack
    req = PromptTranslateRequest(prompt="1girl", provider="fugumt", repack=False)
    assert req.provider == "fugumt"
    assert req.repack is False

    req_default = PromptTranslateRequest(prompt="1girl")
    assert req_default.provider is None
    assert req_default.repack is True

    # Test TranslateTestRequest accepts "fugumt"
    test_req = TranslateTestRequest(provider="fugumt")
    assert test_req.provider == "fugumt"


def test_split_pattern_with_periods_and_weights():
    # 1. Commas and newlines
    text1 = "1girl, masterpiece\n(best quality:1.2),  smile"
    chunks1 = [
        c.strip()
        for c in translation_service.SPLIT_PATTERN.split(text1)
        if c.strip() and not translation_service.SPLIT_PATTERN.fullmatch(c)
    ]
    assert "1girl" in chunks1
    assert "masterpiece" in chunks1
    assert "(best quality:1.2)" in chunks1
    assert "smile" in chunks1

    # 2. Periods in weights (e.g. 1.2, 0.8) and ellipses (...) should not be split
    text2 = "cat ears, (masterpiece:1.2), thinking... A girl in a room. She is smiling."
    parts2 = translation_service.SPLIT_PATTERN.split(text2)
    # Verify that "(masterpiece:1.2)" is not broken apart
    assert any("(masterpiece:1.2)" in p for p in parts2)

    # Verify sentence splitting on period followed by space
    assert any("A girl in a room" in p for p in parts2)
    assert any("She is smiling" in p for p in parts2)

    # 3. Japanese punctuation: 、 。 ！ ？
    text3 = "美しい空、青い海。輝く星！何が見える？"
    parts3 = [
        p.strip()
        for p in translation_service.SPLIT_PATTERN.split(text3)
        if p.strip() and not translation_service.SPLIT_PATTERN.fullmatch(p)
    ]
    assert "美しい空" in parts3
    assert "青い海" in parts3
    assert "輝く星" in parts3
    assert "何が見える" in parts3


def test_unpack_and_repack_weight_tags():
    # Tag with parenthesis and weight
    p, core, w, s = translation_service.unpack_tag("(masterpiece:1.2)")
    assert p == "("
    assert core == "masterpiece"
    assert w == 1.2
    assert s == ")"
    repacked = translation_service.repack_tag("傑作", p, w, s)
    assert repacked == "(傑作:1.2)"

    # Tag with curly braces and underscore
    p, core, w, s = translation_service.unpack_tag("{best_quality}")
    assert p == "{"
    assert core == "best quality"
    assert w is None
    assert s == "}"
    repacked = translation_service.repack_tag("最高品質", p, w, s)
    assert repacked == "{最高品質}"

    # Nested brackets
    p, core, w, s = translation_service.unpack_tag("((solo))")
    assert p == "(("
    assert core == "solo"
    assert w is None
    assert s == "))"
    repacked = translation_service.repack_tag("1人", p, w, s)
    assert repacked == "((1人))"

    # Plain tag without brackets or weight
    p, core, w, s = translation_service.unpack_tag("1girl")
    assert p == ""
    assert core == "1girl"
    assert w is None
    assert s == ""
    repacked = translation_service.repack_tag("1人の女の子", p, w, s)
    assert repacked == "1人の女の子"

    # Tag with underscore but no brackets
    p, core, w, s = translation_service.unpack_tag("high_heels")
    assert p == ""
    assert core == "high heels"
    assert w is None
    assert s == ""
    repacked = translation_service.repack_tag("ハイヒール", p, w, s)
    assert repacked == "ハイヒール"


@pytest.mark.asyncio
async def test_danbooru_dict_lookup_priority(monkeypatch, tmp_path):
    from unittest.mock import patch, MagicMock

    dict_file = tmp_path / "custom_danbooru.csv"
    dict_file.write_text(
        "cat_ears,\"猫耳,ネコミミ\"\n"
        "sailor_collar,\"セーラー襟\"\n"
        "ahoge,\"アホ毛\"\n"
        "1girl,\"1人の女の子,少女\"\n",
        encoding="utf-8-sig",
    )
    monkeypatch.setenv("DANBOORU_DICT_PATH", str(dict_file))

    try:
        count = translation_service.load_danbooru_dict(force_reload=True)
        assert count > 0

        # Dual-key normalization: underscore and space
        assert translation_service.DANBOORU_DICT.get("cat_ears") == "猫耳"
        assert translation_service.DANBOORU_DICT.get("cat ears") == "猫耳"
        assert translation_service.DANBOORU_DICT.get("sailor_collar") == "セーラー襟"
        assert translation_service.DANBOORU_DICT.get("sailor collar") == "セーラー襟"
        assert translation_service.DANBOORU_DICT.get("1girl") == "1人の女の子"

        with patch("app.services.fugumt_service.FuguMTService.get_instance") as mock_get_instance:
            mock_service = MagicMock()
            mock_service.translate_batch.return_value = ["少女が微笑む"]
            mock_get_instance.return_value = mock_service

            # Case 1: All tags in Danbooru dict -> 0 FuguMT inference calls
            translation_service.clear_cache()
            translated, meta = await translation_service.translate_prompt(
                prompt="ahoge, cat_ears",
                source_lang="en",
                target_lang="ja",
                provider="fugumt",
            )
            assert "アホ毛" in translated
            assert "猫耳" in translated
            assert meta["cached_chunks"] == 2
            assert meta["api_requested_chunks"] == 0
            assert mock_service.translate_batch.call_count == 0

            # Case 2: Partial dictionary hit -> only missing tag passed to FuguMT
            translation_service.clear_cache()
            translated2, meta2 = await translation_service.translate_prompt(
                prompt="cat_ears, A girl smiles",
                source_lang="en",
                target_lang="ja",
                provider="fugumt",
            )
            assert "猫耳" in translated2
            assert "少女が微笑む" in translated2
            assert meta2["cached_chunks"] == 1
            assert meta2["api_requested_chunks"] == 1
            mock_service.translate_batch.assert_called_once_with(["A girl smiles"])
    finally:
        monkeypatch.delenv("DANBOORU_DICT_PATH", raising=False)
        translation_service.load_danbooru_dict(force_reload=True)


@pytest.mark.asyncio
async def test_missing_dictionary_fallback_to_fugumt(monkeypatch, tmp_path):
    from unittest.mock import patch, MagicMock

    translation_service.clear_cache()
    non_existent = tmp_path / "non_existent.csv"
    monkeypatch.setenv("DANBOORU_DICT_PATH", str(non_existent))

    try:
        with patch.object(translation_service.Path, "is_file", return_value=False):
            count = translation_service.load_danbooru_dict(force_reload=True)
            assert count == 0
            assert translation_service._DICT_LOADED is True
            assert translation_service.DANBOORU_DICT == {}

        with patch("app.services.fugumt_service.FuguMTService.get_instance") as mock_get_instance:
            mock_service = MagicMock()
            mock_service.translate_batch.return_value = ["アホ毛", "1人の女の子"]
            mock_get_instance.return_value = mock_service

            translated, meta = await translation_service.translate_prompt(
                prompt="ahoge, 1girl",
                source_lang="en",
                target_lang="ja",
                provider="fugumt",
            )
            assert "アホ毛" in translated
            assert "1人の女の子" in translated
            assert meta["provider"] == "fugumt"
            assert meta["api_requested_chunks"] == 2
            mock_service.translate_batch.assert_called_once_with(["ahoge", "1girl"])
    finally:
        monkeypatch.delenv("DANBOORU_DICT_PATH", raising=False)
        translation_service.load_danbooru_dict(force_reload=True)


test_danbooru_missing_dictionary_fallback_to_fugumt = test_missing_dictionary_fallback_to_fugumt


@pytest.mark.asyncio
async def test_repack_parameter_control():
    translation_service.clear_cache()
    # repack=False: brackets and weight removed (for tag chips)
    res_no_repack, _ = await translation_service.translate_prompt(
        prompt="((ahoge:1.2))",
        source_lang="en",
        target_lang="ja",
        provider="fugumt",
        repack=False,
    )
    assert res_no_repack == "アホ毛"

    # repack=True: brackets and weight preserved (for full prompt)
    res_repack, _ = await translation_service.translate_prompt(
        prompt="((ahoge:1.2))",
        source_lang="en",
        target_lang="ja",
        provider="fugumt",
        repack=True,
    )
    assert res_repack == "((アホ毛:1.2))"


@pytest.mark.asyncio
async def test_meta_syntax_protection_intact():
    translation_service.clear_cache()
    prompt = "<lora:animestyle:0.8>, ((cat_ears:1.2)), embedding:easynegative"
    translated, meta = await translation_service.translate_prompt(
        prompt=prompt,
        source_lang="en",
        target_lang="ja",
        provider="fugumt",
        repack=True,
    )
    assert "<lora:animestyle:0.8>" in translated
    assert "embedding:easynegative" in translated
    assert "((猫耳:1.2))" in translated


@pytest.mark.asyncio
async def test_router_translate_prompt_endpoint_repack_parameter():
    from app.routers.translate import translate_prompt_endpoint, PromptTranslateRequest
    from unittest.mock import MagicMock

    translation_service.clear_cache()
    mock_db = MagicMock()
    req_no_repack = PromptTranslateRequest(prompt="((cat_ears:1.2))", repack=False)
    resp = await translate_prompt_endpoint(req_no_repack, db=mock_db)
    assert resp.translated_prompt == "猫耳"

    req_repack = PromptTranslateRequest(prompt="((cat_ears:1.2))", repack=True)
    resp2 = await translate_prompt_endpoint(req_repack, db=mock_db)
    assert resp2.translated_prompt == "((猫耳:1.2))"


# =============================================================================
# REQ-313 Gate 3: Scenario & Red Teaming Test Cases
# =============================================================================

@pytest.mark.asyncio
async def test_scenario_1_multisentence_natural_text_no_omission():
    """Scenario 1: AC-1 Multi-sentence natural text translation without omission."""
    from unittest.mock import patch, MagicMock
    translation_service.clear_cache()

    with patch("app.services.fugumt_service.FuguMTService.get_instance") as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ["少女が微笑む", "彼女は図書館で本を読む"]
        mock_get_instance.return_value = mock_service

        translated, meta = await translation_service.translate_prompt(
            prompt="A girl smiles. She reads a book in the library.",
            source_lang="en",
            target_lang="ja",
            provider="fugumt",
            repack=True,
        )
        assert "少女が微笑む" in translated
        assert "彼女は図書館で本を読む" in translated
        assert meta["total_chunks"] == 2
        mock_service.translate_batch.assert_called_once_with([
            "A girl smiles",
            "She reads a book in the library",
        ])


@pytest.mark.asyncio
async def test_scenario_2_tag_card_and_prompt_repack_differentiation():
    """Scenario 2: AC-5 Tag card clean text vs full prompt repacked text."""
    from unittest.mock import patch, MagicMock
    translation_service.clear_cache()

    with patch("app.services.fugumt_service.FuguMTService.get_instance") as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ["猫耳"]
        mock_get_instance.return_value = mock_service

        # Tag card (repack=False): purely clean translated text without weights/brackets
        res_card, _ = await translation_service.translate_prompt(
            prompt="((cat_ears:1.2))",
            source_lang="en",
            target_lang="ja",
            provider="fugumt",
            repack=False,
        )
        assert res_card == "猫耳"

        # Full prompt (repack=True): original weight brackets restored
        res_prompt, _ = await translation_service.translate_prompt(
            prompt="((cat_ears:1.2))",
            source_lang="en",
            target_lang="ja",
            provider="fugumt",
            repack=True,
        )
        assert res_prompt == "((猫耳:1.2))"


@pytest.mark.asyncio
async def test_scenario_3_composite_prompt_dict_fugumt_meta_protection(monkeypatch, tmp_path):
    """Scenario 3: AC-3, AC-4, AC-7 Composite prompt with Meta syntax, Dict lookup, and FuguMT."""
    from unittest.mock import patch, MagicMock

    dict_file = tmp_path / "danbooru.csv"
    dict_file.write_text("ahoge,アホ毛\ncat_ears,猫耳\n", encoding="utf-8")
    monkeypatch.setenv("DANBOORU_DICT_PATH", str(dict_file))

    try:
        translation_service.load_danbooru_dict(force_reload=True)
        translation_service.clear_cache()

        with patch("app.services.fugumt_service.FuguMTService.get_instance") as mock_get_instance:
            mock_service = MagicMock()
            mock_service.translate_batch.return_value = ["1人の女の子", "彼女は青い花を持っている"]
            mock_get_instance.return_value = mock_service

            composite_prompt = "<lora:my_lora:0.7>, ((ahoge:1.1)), 1girl. She holds a blue flower."
            translated, meta = await translation_service.translate_prompt(
                prompt=composite_prompt,
                source_lang="en",
                target_lang="ja",
                provider="fugumt",
                repack=True,
            )
            # Meta tag preserved
            assert "<lora:my_lora:0.7>" in translated
            # Dict hit tag repacked
            assert "((アホ毛:1.1))" in translated
            # FuguMT translated text
            assert "1人の女の子" in translated
            assert "彼女は青い花を持っている" in translated
    finally:
        monkeypatch.delenv("DANBOORU_DICT_PATH", raising=False)
        translation_service.load_danbooru_dict(force_reload=True)


def test_redteam_1_malformed_bracket_colon_syntax():
    """Red-1: Fault tolerance for malformed brackets and colon syntax."""
    malformed_inputs = [
        "(cat_ears",
        "((cat_ears:))",
        ":::cat_ears",
        "cat_ears:abc",
        "[smile",
        "{solo:}"
    ]
    for raw in malformed_inputs:
        prefix, core, weight, suffix = translation_service.unpack_tag(raw)
        # Must not raise exception and core must be non-empty string
        assert isinstance(core, str)
        assert len(core) > 0
        repacked = translation_service.repack_tag("テスト", prefix, weight, suffix)
        assert isinstance(repacked, str)


@pytest.mark.asyncio
async def test_redteam_2_missing_or_corrupt_dictionary_graceful_degradation(monkeypatch, tmp_path):
    """Red-2: Graceful degradation when Danbooru dictionary is missing or corrupted."""
    from unittest.mock import patch, MagicMock

    corrupt_zip = tmp_path / "corrupt.zip"
    corrupt_zip.write_bytes(b"corrupt zip content not valid archive")
    monkeypatch.setenv("DANBOORU_DICT_PATH", str(corrupt_zip))

    try:
        count = translation_service.load_danbooru_dict(force_reload=True)
        # Should degrade gracefully to empty dict
        assert count == 0
        assert len(translation_service.DANBOORU_DICT) == 0

        with patch("app.services.fugumt_service.FuguMTService.get_instance") as mock_get_instance:
            mock_service = MagicMock()
            mock_service.translate_batch.return_value = ["アホ毛"]
            mock_get_instance.return_value = mock_service

            # Translation pipeline must proceed with FuguMT without crashing
            res, meta = await translation_service.translate_prompt(
                prompt="ahoge",
                source_lang="en",
                target_lang="ja",
                provider="fugumt",
            )
            assert res == "アホ毛"
            assert meta["provider"] == "fugumt"
    finally:
        monkeypatch.delenv("DANBOORU_DICT_PATH", raising=False)
        translation_service.load_danbooru_dict(force_reload=True)


def test_redteam_3_consecutive_delimiters_decimals_ellipses():
    """Red-3: Boundary stress test with consecutive delimiters, weights, and ellipses."""
    stress_input = ",,, ... waiting... 1.5, :1.2 ... end."
    chunks = [
        c.strip()
        for c in translation_service.SPLIT_PATTERN.split(stress_input)
        if c.strip() and not translation_service.SPLIT_PATTERN.fullmatch(c)
    ]
    # No empty chunks
    assert "" not in chunks
    # Critical tokens preserved
    assert any("waiting..." in c for c in chunks)
    assert any(":1.2" in c for c in chunks)
    assert any("1.5" in c for c in chunks)

@pytest.mark.asyncio
async def test_sentence_rejoin_with_commas_for_natural_text():
    from unittest.mock import patch, MagicMock

    translation_service.clear_cache()
    prompt = 'A cute girl with silver hair, who is reading a book under an oak tree, smiles gently.'

    with patch('app.services.fugumt_service.FuguMTService.get_instance') as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ['オークの木の下で本を読んでいる銀髪のかわいい少女が、優しく微笑んでいる']
        mock_get_instance.return_value = mock_service

        translated, meta = await translation_service.translate_prompt(
            prompt=prompt,
            source_lang='en',
            target_lang='ja',
            provider='fugumt',
        )

        assert mock_service.translate_batch.call_count == 1
        called_batch = mock_service.translate_batch.call_args[0][0]
        assert len(called_batch) == 1
        assert 'A cute girl with silver hair, who is reading a book under an oak tree, smiles gently' in called_batch[0]
        assert '優しく微笑んでいる' in translated
        assert meta['total_chunks'] == 1


@pytest.mark.asyncio
async def test_hybrid_prompt_tags_dict_and_natural_sentence():
    from unittest.mock import patch, MagicMock

    translation_service.clear_cache()
    translation_service.load_danbooru_dict(force_reload=True)
    prompt = 'solo, 1girl, A girl wearing a white dress, sitting on a bench, looks at viewer. cat_ears'

    with patch('app.services.fugumt_service.FuguMTService.get_instance') as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ['白いドレスを着てベンチに座っている少女が、こちらを見ている']
        mock_get_instance.return_value = mock_service

        translated, meta = await translation_service.translate_prompt(
            prompt=prompt,
            source_lang='en',
            target_lang='ja',
            provider='fugumt',
        )

        assert mock_service.translate_batch.call_count == 1
        called_batch = mock_service.translate_batch.call_args[0][0]
        assert len(called_batch) == 1
        assert 'A girl wearing a white dress, sitting on a bench, looks at viewer' in called_batch[0]

        assert 'ソロ' in translated
        assert '女の子' in translated or '少女' in translated
        assert '白いドレスを着てベンチに座っている少女が、こちらを見ている' in translated
        assert '猫耳' in translated


@pytest.mark.asyncio
async def test_weighted_natural_sentence_unpack_and_repack():
    from unittest.mock import patch, MagicMock

    translation_service.clear_cache()
    prompt = '((A girl holding a cat, smiling happily:1.2)), solo'

    with patch('app.services.fugumt_service.FuguMTService.get_instance') as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ['猫を抱いて幸せそうに微笑んでいる少女']
        mock_get_instance.return_value = mock_service

        translated, meta = await translation_service.translate_prompt(
            prompt=prompt,
            source_lang='en',
            target_lang='ja',
            provider='fugumt',
            repack=True,
        )

        assert '((猫を抱いて幸せそうに微笑んでいる少女:1.2))' in translated
        assert 'ソロ' in translated


@pytest.mark.asyncio
async def test_period_boundary_multisentence_no_omission():
    from unittest.mock import patch, MagicMock

    translation_service.clear_cache()
    prompt = 'The sun is rising over the mountains. A flock of birds flies across the sky.'

    with patch('app.services.fugumt_service.FuguMTService.get_instance') as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ['山々の上に太陽が昇っている', '鳥の群れが空を飛んでいる']
        mock_get_instance.return_value = mock_service

        translated, meta = await translation_service.translate_prompt(
            prompt=prompt,
            source_lang='en',
            target_lang='ja',
            provider='fugumt',
        )

        called_batch = mock_service.translate_batch.call_args[0][0]
        assert len(called_batch) == 2
        assert '太陽が昇っている' in translated
        assert '鳥の群れが空を飛んでいる' in translated


@pytest.mark.asyncio
async def test_trailing_period_missing_fallback():
    from unittest.mock import patch, MagicMock

    translation_service.clear_cache()
    prompt = 'A girl sitting on a chair, reading a book'

    with patch('app.services.fugumt_service.FuguMTService.get_instance') as mock_get_instance:
        mock_service = MagicMock()
        mock_service.translate_batch.return_value = ['椅子に座って本を読んでいる少女']
        mock_get_instance.return_value = mock_service

        translated, meta = await translation_service.translate_prompt(
            prompt=prompt,
            source_lang='en',
            target_lang='ja',
            provider='fugumt',
        )

        called_batch = mock_service.translate_batch.call_args[0][0]
        assert len(called_batch) == 1
        assert 'A girl sitting on a chair, reading a book' in called_batch[0]
        assert '椅子に座って本を読んでいる少女' in translated


@pytest.mark.asyncio
async def test_consecutive_and_trailing_commas_sanitized():
    translation_service.clear_cache()
    translation_service.load_danbooru_dict(force_reload=True)
    prompt = '1girl, , solo, '

    translated, meta = await translation_service.translate_prompt(
        prompt=prompt,
        source_lang='en',
        target_lang='ja',
        provider='fugumt',
    )

    assert '女の子' in translated or '少女' in translated
    assert 'ソロ' in translated
    assert meta['api_requested_chunks'] == 0
