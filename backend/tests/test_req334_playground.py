import httpx
import pytest
from fastapi import HTTPException

from app.routers.llm_prompts import PlaygroundRequest, playground
from app.services import llm_request


def _run(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    coroutine.close()
    raise AssertionError("Mocked Playground coroutine unexpectedly yielded to external I/O")


def test_playground_renders_unsaved_prompts_and_calls_llm_once(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    async def fake_call_llm(**kwargs: object) -> str:
        calls.append(kwargs)
        return "preview result"

    async def fake_context_limit(model_id: str) -> int | None:
        assert model_id == "selected-model"
        return 32768

    monkeypatch.setattr(llm_request, "call_llm", fake_call_llm)
    monkeypatch.setattr(llm_request, "get_model_context_limit", fake_context_limit)
    payload = PlaygroundRequest(
        system_prompt="Saved is ignored: {{name}} / {{missing}} / {{copy}}",
        text="Hello {{name}}",
        variables={"name": "Unsaved", "copy": "{{name}}"},
        model="selected-model",
        llm_params={"temperature": 0.4},
    )

    response = _run(playground(payload))

    assert response.model_dump() == {
        "rendered_prompt": "Saved is ignored: Unsaved / {{missing}} / {{name}}",
        "result": "preview result",
        "token_limit": 32768,
    }
    assert calls == [{
        "system_prompt": "Saved is ignored: Unsaved / {{missing}} / {{name}}",
        "user_prompt": "Hello Unsaved",
        "timeout": 30.0,
        "model": "selected-model",
        "llm_params": {"temperature": 0.4},
    }]


def test_playground_returns_null_for_unknown_token_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_call_llm(**_kwargs: object) -> str:
        return "ok"

    async def no_metadata(_model_id: str) -> int | None:
        return None

    monkeypatch.setattr(llm_request, "call_llm", fake_call_llm)
    monkeypatch.setattr(llm_request, "get_model_context_limit", no_metadata)

    response = _run(playground(PlaygroundRequest(
        system_prompt="Unsaved system prompt", text="Unsaved input", model="unknown"
    )))

    assert response.rendered_prompt == "Unsaved system prompt"
    assert response.token_limit is None


@pytest.mark.parametrize(
    ("error", "status_code"),
    [(httpx.TimeoutException("late"), 504), (RuntimeError("offline"), 502)],
)
def test_playground_returns_meaningful_http_failure(
    monkeypatch: pytest.MonkeyPatch, error: Exception, status_code: int
) -> None:
    async def fail_call_llm(**_kwargs: object) -> str:
        raise error

    monkeypatch.setattr(llm_request, "call_llm", fail_call_llm)
    async def no_metadata(_model_id: str) -> int | None:
        return None

    monkeypatch.setattr(llm_request, "get_model_context_limit", no_metadata)
    with pytest.raises(HTTPException) as exc_info:
        _run(playground(PlaygroundRequest(system_prompt="system", text="input", model="model")))
    assert exc_info.value.status_code == status_code


def test_model_context_metadata_requires_positive_integer(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"data": [
                {"id": "valid", "context_length": True, "max_context_length": 8192},
                {"id": "invalid", "context_length": 0},
            ]}

    class FakeClient:
        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def get(self, _url: str) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr(llm_request.httpx, "AsyncClient", lambda: FakeClient())

    assert _run(llm_request.get_model_context_limit("valid")) == 8192
    assert _run(llm_request.get_model_context_limit("invalid")) is None
    assert _run(llm_request.get_model_context_limit("missing")) is None
