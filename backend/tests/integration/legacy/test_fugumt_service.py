import pytest
from unittest.mock import MagicMock, patch
from app.services.fugumt_service import FuguMTService


def test_normalize_input_scenarios() -> None:
    service = FuguMTService()
    assert service.normalize_input("") == ""
    assert service.normalize_input("  hello world  ") == "hello world"
    assert service.normalize_input("hello    world") == "hello world"
    assert service.normalize_input("hello\t\n  world\n\r") == "hello world"
    assert service.normalize_input("   \t \n  ") == ""


def test_translate_batch_empty_list() -> None:
    service = FuguMTService()
    assert service.translate_batch([]) == []


def test_set_translator_and_mock_inference() -> None:
    service = FuguMTService()
    mock_translator = MagicMock()
    mock_tokenizer = MagicMock()

    mock_tokenizer.encode.side_effect = lambda text: [1, 2]
    mock_tokenizer.convert_ids_to_tokens.side_effect = lambda ids: ["token_a", "token_b"]
    mock_tokenizer.convert_tokens_to_ids.side_effect = lambda tokens: [10, 20]

    mock_result1 = MagicMock()
    mock_result1.hypotheses = [["target_1", "target_2"]]
    mock_result2 = MagicMock()
    mock_result2.hypotheses = [["target_3", "target_4"]]
    mock_translator.translate_batch.return_value = [mock_result1, mock_result2]

    def mock_decode(token_ids: list) -> str:
        return "テスト翻訳"

    mock_tokenizer.decode.side_effect = mock_decode

    service.set_translator(mock_translator, mock_tokenizer)
    assert service._is_initialized is True

    results = service.translate_batch(["a cat", "a dog"])
    assert results == ["テスト翻訳", "テスト翻訳"]
    assert mock_translator.translate_batch.call_count == 1


def test_translate_batch_special_tokens_preservation() -> None:
    service = FuguMTService()
    mock_translator = MagicMock()
    mock_tokenizer = MagicMock()

    mock_tokenizer.encode.return_value = [101, 102]
    mock_tokenizer.convert_ids_to_tokens.return_value = ["<lora:test:1>", "(1girl:1.2)"]
    mock_tokenizer.convert_tokens_to_ids.return_value = [201, 202]

    mock_res = MagicMock()
    mock_res.hypotheses = [["<lora:test:1>", "(1girl:1.2)"]]
    mock_translator.translate_batch.return_value = [mock_res]

    mock_tokenizer.decode.return_value = "<lora:test:1> (1girl:1.2)"

    service.set_translator(mock_translator, mock_tokenizer)
    res = service.translate_batch(["<lora:test:1> (1girl:1.2)"])
    assert res == ["<lora:test:1> (1girl:1.2)"]


def test_translate_batch_chunking_over_max_batch_size() -> None:
    service = FuguMTService()
    mock_translator = MagicMock()
    mock_tokenizer = MagicMock()

    mock_tokenizer.encode.return_value = [1]
    mock_tokenizer.convert_ids_to_tokens.return_value = ["tok"]
    mock_tokenizer.convert_tokens_to_ids.return_value = [2]
    mock_tokenizer.decode.return_value = "日本詞"

    items = [f"item {i}" for i in range(150)]
    mock_translator.translate_batch.side_effect = lambda chunks: [
        MagicMock(hypotheses=[["target"]]) for _ in chunks
    ]

    service.set_translator(mock_translator, mock_tokenizer)
    results = service.translate_batch(items)

    assert len(results) == 150
    assert mock_translator.translate_batch.call_count == 2


def test_initialize_non_existent_directory() -> None:
    service = FuguMTService(model_dir="non_existent_model_dir_path_xyz", auto_download=False)
    assert service.initialize() is False
    assert service._is_initialized is False

    with pytest.raises(RuntimeError, match="FuguMT engine is not available"):
        service.translate_batch(["test"])


@patch("os.path.exists", side_effect=[False, True])
@patch("os.makedirs")
@patch("huggingface_hub.snapshot_download")
@patch("ctranslate2.Translator")
@patch("transformers.AutoTokenizer.from_pretrained")
def test_initialize_auto_download_success(
    mock_auto_tokenizer: MagicMock,
    mock_ct2_translator: MagicMock,
    mock_snapshot: MagicMock,
    mock_makedirs: MagicMock,
    mock_exists: MagicMock,
) -> None:
    service = FuguMTService(model_dir="mock_model_dir", auto_download=True)
    assert service.initialize() is True
    assert service._is_initialized is True
    mock_snapshot.assert_called_once_with(
        repo_id="jkawamoto/fugumt-en-ja-ct2",
        local_dir="mock_model_dir",
    )
    mock_ct2_translator.assert_called_once()
    mock_auto_tokenizer.assert_called_once_with("mock_model_dir")


@patch("os.path.exists", return_value=False)
@patch("os.makedirs")
@patch("huggingface_hub.snapshot_download", side_effect=RuntimeError("Download failed"))
def test_initialize_auto_download_failure(
    mock_snapshot: MagicMock,
    mock_makedirs: MagicMock,
    mock_exists: MagicMock,
) -> None:
    service = FuguMTService(model_dir="mock_model_dir", auto_download=True)
    assert service.initialize() is False
    assert service._is_initialized is False
    mock_snapshot.assert_called_once_with(
        repo_id="jkawamoto/fugumt-en-ja-ct2",
        local_dir="mock_model_dir",
    )
    with pytest.raises(RuntimeError, match="FuguMT engine is not available"):
        service.translate_batch(["test"])


@patch("os.path.exists", return_value=False)
@patch("huggingface_hub.snapshot_download")
def test_initialize_auto_download_disabled(
    mock_snapshot: MagicMock,
    mock_exists: MagicMock,
) -> None:
    service = FuguMTService(model_dir="mock_model_dir", auto_download=False)
    assert service.initialize() is False
    assert service._is_initialized is False
    mock_snapshot.assert_not_called()


def test_init_auto_download_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FUGUMT_AUTO_DOWNLOAD", "false")
    service1 = FuguMTService()
    assert service1.auto_download is False

    monkeypatch.setenv("FUGUMT_AUTO_DOWNLOAD", "0")
    service2 = FuguMTService()
    assert service2.auto_download is False

    monkeypatch.setenv("FUGUMT_AUTO_DOWNLOAD", "1")
    service3 = FuguMTService()
    assert service3.auto_download is True


def test_singleton_get_instance() -> None:
    FuguMTService._instance = None
    inst1 = FuguMTService.get_instance()
    inst2 = FuguMTService.get_instance()
    assert inst1 is inst2
    assert isinstance(inst1, FuguMTService)


def test_sentencepiece_installed() -> None:
    """Verify sentencepiece is installed and accessible in the environment (AC-1)."""
    import sentencepiece  # type: ignore[import-untyped,import-not-found]

    assert sentencepiece.__version__ is not None


def test_init_error_message_propagation() -> None:
    """Verify detailed error message is recorded and propagated in RuntimeError (AC-3)."""
    service = FuguMTService(model_dir="non_existent_mock_dir_xyz987", auto_download=False)
    assert service.initialize() is False
    assert service._init_error is not None
    assert "non_existent_mock_dir_xyz987" in service._init_error
    with pytest.raises(RuntimeError) as exc_info:
        service.translate_batch(["test"])
    assert "FuguMT engine is not available" in str(exc_info.value)
    assert "non_existent_mock_dir_xyz987" in str(exc_info.value)


def test_fugumt_tokenizer_encoding_functionality() -> None:
    """Verify real tokenizer loading and encoding when model directory exists (AC-2, AC-4)."""
    import os

    service = FuguMTService()
    if os.path.exists(service.model_dir):
        assert service.initialize() is True
        assert service.tokenizer is not None
        tokens = service.tokenizer.encode("Hello world")
        assert len(tokens) > 0


def test_model_dir_fallback_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify model_dir fallback finds backend/models when default models dir not found."""
    monkeypatch.delenv("FUGUMT_MODEL_DIR", raising=False)
    service = FuguMTService()
    assert "fugumt-en-ja" in service.model_dir
