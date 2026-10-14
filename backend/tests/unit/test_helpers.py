"""Unit tests for pure helper functions (isolated text & data processing)."""
import pytest

from app.services.replacement_dictionary import apply_replacement_rules
from app.services.speech_parser import (
    is_valid_structured_response,
    parse_structured_dialogue_response,
)
from app.services.llm_parser import (
    parse_interference,
    parse_vocabulary,
    parse_physical,
)


def test_replacement_rules_longest_first_and_non_cascading() -> None:
    """[REQ-334/AC-9] Replacement rules are applied literal, longest first, and non-cascading."""
    rules = [
        {"source": "York", "replacement": "Y"},
        {"source": "New York", "replacement": "NY"},
        {"source": "Alice", "replacement": "Bob"},
        {"source": "Bob", "replacement": "Carol"},
        {"source": "a.*", "replacement": "literal"},
    ]
    result = apply_replacement_rules("New York; Alice Bob; a.*", rules)
    assert result == "NY; Bob Carol; literal"


def test_replacement_rules_empty_rules_or_text() -> None:
    """[REQ-334/AC-9] Replacement rules handle empty text or empty rules gracefully."""
    assert apply_replacement_rules("", [{"source": "a", "replacement": "b"}]) == ""
    assert apply_replacement_rules("hello world", []) == "hello world"


def test_speech_parser_is_valid_structured_response_tags() -> None:
    """[REQ-319/AC-1] Speech parser recognizes valid XML-tagged dialogue output."""
    valid_output = """
    <interpretation>キャラクターは驚いている</interpretation>
    <reasoning>驚きを表現するため語尾に！を追加</reasoning>
    <dialogue>ええっ、本当ですか！？</dialogue>
    """
    assert is_valid_structured_response(valid_output) is True


def test_speech_parser_is_valid_structured_response_json() -> None:
    """[REQ-319/AC-1] Speech parser recognizes markdown JSON block dialogue output."""
    valid_json = """
    ```json
    {
      "scene_interpretation": "喜び",
      "reasoning": "テンション高め",
      "dialogue": "やったー！"
    }
    ```
    """
    assert is_valid_structured_response(valid_json) is True


def test_speech_parser_is_valid_structured_response_invalid() -> None:
    """[REQ-319/AC-1] Speech parser rejects invalid, empty, or plain text outputs."""
    assert is_valid_structured_response("") is False
    assert is_valid_structured_response("   ") is False
    assert is_valid_structured_response("これはただのテキストです。") is False
    assert is_valid_structured_response("<think>考え中</think>こんにちは") is False


def test_speech_parser_extracts_dialogue_and_metadata() -> None:
    """[REQ-319/AC-2] Speech parser extracts dialogue, interpretation, and reasoning fields."""
    output = """
    <interpretation>夕暮れの静かな浜辺での独白</interpretation>
    <reasoning>切なさを強調するために余韻を持たせる言い回しにする</reasoning>
    <dialogue>もう、誰もいないんだね……</dialogue>
    """
    dialogue, interp, reasoning = parse_structured_dialogue_response(output)
    assert dialogue == "もう、誰もいないんだね……"
    assert interp == "夕暮れの静かな浜辺での独白"
    assert reasoning == "切なさを強調するために余韻を持たせる言い回しにする"


def test_speech_parser_strips_think_tags() -> None:
    """[REQ-319/AC-2] Speech parser strips reasoning think tags before extracting dialogue."""
    output = """
    <think>
    ユーザーの要求はお嬢様言葉への変換です。
    「本当ですか」を「本当でして？」にします。
    </think>
    <interpretation>上品なサロンでの会話</interpretation>
    <dialogue>まあ、本当でして？</dialogue>
    """
    dialogue, interp, reasoning = parse_structured_dialogue_response(output)
    assert dialogue == "まあ、本当でして？"


def test_llm_parser_extracts_interference_tags() -> None:
    """[REQ-048/AC-1] LLM parser extracts interference tags and reasons from XML block."""
    text = """
    <remove_tags>
        <item>
            <tag>nsfw</tag>
            <reason_jp>不適切なタグの除去</reason_jp>
        </item>
        <item>
            <tag>bad quality</tag>
            <reason_jp>品質低下タグの除去</reason_jp>
        </item>
    </remove_tags>
    """
    results = parse_interference(text)
    assert len(results) == 2
    assert results[0] == {"tag": "nsfw", "reason": "不適切なタグの除去"}
    assert results[1] == {"tag": "bad quality", "reason": "品質低下タグの除去"}


def test_llm_parser_extracts_vocabulary_suggestions() -> None:
    """[REQ-048/AC-2] LLM parser extracts vocabulary suggestion items from XML block."""
    text = """
    <suggestions>
        <item>
            <vocabulary>masterpiece</vocabulary>
            <effect_jp>全体の作画精度向上</effect_jp>
        </item>
    </suggestions>
    """
    results = parse_vocabulary(text)
    assert len(results) == 1
    assert results[0] == {"suggestion": "masterpiece", "effect": "全体の作画精度向上"}


def test_llm_parser_extracts_physical_evaluation() -> None:
    """[REQ-048/AC-3] LLM parser extracts physical evaluation ratings and alternatives."""
    text = """
    <evaluation>
        <rating>warning</rating>
        <reason_jp>手の構造に矛盾が生じる可能性があります</reason_jp>
        <alternatives>
            <item>gloves</item>
            <item>hands in pockets</item>
        </alternatives>
    </evaluation>
    """
    result = parse_physical(text)
    assert result["status"] == "warning"
    assert result["note"] == "手の構造に矛盾が生じる可能性があります"
    assert result["alternatives"] == ["gloves", "hands in pockets"]
