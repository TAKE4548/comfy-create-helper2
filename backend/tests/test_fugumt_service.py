import pytest
from unittest.mock import MagicMock
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
    service = FuguMTService(model_dir="non_existent_model_dir_path_xyz")
    assert service.initialize() is False
    assert service._is_initialized is False

    with pytest.raises(RuntimeError, match="FuguMT engine is not available"):
        service.translate_batch(["test"])


def test_singleton_get_instance() -> None:
    FuguMTService._instance = None
    inst1 = FuguMTService.get_instance()
    inst2 = FuguMTService.get_instance()
    assert inst1 is inst2
    assert isinstance(inst1, FuguMTService)
