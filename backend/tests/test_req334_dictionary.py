import asyncio
import json
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AppSetting
from app.routers.translate import (
    DictionaryUpdateRequest,
    PromptTranslateRequest,
    get_translation_dictionary,
    translate_prompt_endpoint,
    update_translation_dictionary,
)
from app.services import translation_service
from app.services.replacement_dictionary import apply_replacement_rules


def _run(coroutine: Any) -> Any:
    if not hasattr(coroutine, "send"):
        return coroutine
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    coroutine.close()
    raise AssertionError("Mocked coroutine unexpectedly yielded to external I/O")


def _request(rules: list[dict[str, str]]) -> DictionaryUpdateRequest:
    return DictionaryUpdateRequest.model_validate({"rules": rules})


@pytest.fixture
def dictionary_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_dictionary_get_put_persists_normalized_whole_list(dictionary_db: Session) -> None:
    request = _request([
        {"source": "  Tokyo  ", "replacement": "東京"},
        {"source": "Station", "replacement": ""},
    ])

    saved = _run(update_translation_dictionary(request, dictionary_db))
    loaded = _run(get_translation_dictionary(dictionary_db))

    assert [rule.model_dump() for rule in saved.rules] == [
        {"source": "Tokyo", "replacement": "東京"},
        {"source": "Station", "replacement": ""},
    ]
    assert [rule.model_dump() for rule in loaded.rules] == [rule.model_dump() for rule in saved.rules]
    stored = dictionary_db.get(AppSetting, "translation_dictionary")
    assert stored is not None
    assert json.loads(stored.value) == [
        {"source": "Tokyo", "replacement": "東京"},
        {"source": "Station", "replacement": ""},
    ]

    cleared = _run(update_translation_dictionary(_request([]), dictionary_db))
    assert cleared.rules == []


@pytest.mark.parametrize("rules", [
    [{"source": "  ", "replacement": "x"}],
    [{"source": "same", "replacement": "1"}, {"source": " same ", "replacement": "2"}],
])
def test_invalid_dictionary_is_rejected_before_persistence(dictionary_db: Session, rules: list[dict[str, str]]) -> None:
    valid = _run(update_translation_dictionary(
        _request([{"source": "saved", "replacement": "value"}]), dictionary_db
    ))
    with pytest.raises(ValidationError):
        _request(rules)

    loaded = _run(get_translation_dictionary(dictionary_db))
    assert [rule.model_dump() for rule in loaded.rules] == [rule.model_dump() for rule in valid.rules]


def test_replacements_are_literal_longest_first_and_non_cascading() -> None:
    rules = [
        {"source": "York", "replacement": "Y"},
        {"source": "New York", "replacement": "NY"},
        {"source": "Alice", "replacement": "Bob"},
        {"source": "Bob", "replacement": "Carol"},
        {"source": "a.*", "replacement": "literal"},
    ]

    assert apply_replacement_rules("New York; Alice Bob; a.*", rules) == "NY; Bob Carol; literal"


def test_translation_postprocesses_provider_output_without_caching_replacement(
    dictionary_db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def cached_provider_result(**_kwargs: object) -> tuple[str, dict[str, object]]:
        return "New York and York", {
            "total_chunks": 1,
            "cached_chunks": 1,
            "api_requested_chunks": 0,
            "billed_characters": 0,
            "provider": "mock",
        }

    monkeypatch.setattr(translation_service, "translate_prompt", cached_provider_result)
    _run(update_translation_dictionary(_request([
        {"source": "York", "replacement": "Y"},
        {"source": "New York", "replacement": "NY"},
    ]), dictionary_db))

    translated = _run(translate_prompt_endpoint(
        PromptTranslateRequest(prompt="raw"),
        dictionary_db,
    ))
    assert translated.translated_prompt == "NY and Y"

    _run(update_translation_dictionary(_request([{"source": "York", "replacement": "Y"}]), dictionary_db))
    translated_after_delete = _run(translate_prompt_endpoint(
        PromptTranslateRequest(prompt="raw"),
        dictionary_db,
    ))
    assert translated_after_delete.translated_prompt == "New Y and Y"
