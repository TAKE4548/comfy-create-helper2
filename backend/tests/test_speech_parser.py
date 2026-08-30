"""Unit tests for structured speech output parser."""
import pytest
from app.services.speech_parser import (
    is_valid_structured_response,
    parse_structured_dialogue_response,
)


def test_is_valid_structured_response_tags():
    valid_output = """
    <interpretation>キャラクターは驚いている</interpretation>
    <reasoning>驚きを表現するため語尾に！を追加</reasoning>
    <dialogue>ええっ、本当ですか！？</dialogue>
    """
    assert is_valid_structured_response(valid_output) is True


def test_is_valid_structured_response_json():
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


def test_is_valid_structured_response_invalid():
    assert is_valid_structured_response("") is False
    assert is_valid_structured_response("   ") is False
    assert is_valid_structured_response("これはただのテキストです。") is False
    assert is_valid_structured_response("<think>考え中</think>こんにちは") is False


def test_parse_structured_dialogue_standard_tags():
    output = """
    <interpretation>夕暮れの静かな浜辺での独白</interpretation>
    <reasoning>切なさを強調するために余韻を持たせる言い回しにする</reasoning>
    <dialogue>もう、誰もいないんだね……</dialogue>
    """
    dialogue, interp, reasoning = parse_structured_dialogue_response(output)
    assert dialogue == "もう、誰もいないんだね……"
    assert interp == "夕暮れの静かな浜辺での独白"
    assert reasoning == "切なさを強調するために余韻を持たせる言い回しにする"


def test_parse_structured_dialogue_deepseek_think_tag():
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
    assert interp == "上品なサロンでの会話"
    assert "ユーザーの要求はお嬢様言葉への変換です" in reasoning


def test_parse_structured_dialogue_with_quotes_cleaned():
    output = """
    <dialogue> "これはテストです！" </dialogue>
    """
    dialogue, interp, reasoning = parse_structured_dialogue_response(output)
    assert dialogue == "これはテストです！"
    assert interp is None
    assert reasoning is None


def test_parse_structured_dialogue_json_fallback():
    output = """
    ```json
    {
      "scene_interpretation": "焦り",
      "reasoning": "早口",
      "dialogue": "大変だ、急がないと！"
    }
    ```
    """
    dialogue, interp, reasoning = parse_structured_dialogue_response(output)
    assert dialogue == "大変だ、急がないと！"
    assert interp == "焦り"
    assert reasoning == "早口"


def test_parse_structured_dialogue_plain_text_fallback():
    output = "おはようございます！今日も一日頑張りましょう。"
    dialogue, interp, reasoning = parse_structured_dialogue_response(output)
    assert dialogue == "おはようございます！今日も一日頑張りましょう。"
    assert interp is None
    assert reasoning is None


def test_parse_structured_dialogue_plain_text_with_think():
    output = "<think>挨拶のトーン調整</think>ごきげんよう。"
    dialogue, interp, reasoning = parse_structured_dialogue_response(output)
    assert dialogue == "ごきげんよう。"
    assert interp is None
    assert reasoning == "挨拶のトーン調整"
