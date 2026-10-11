from __future__ import annotations

import asyncio
from typing import Any
from typing import cast

import httpx
import pytest
from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.comfy import ImageAvailability
from app.routers.generation import router
from app.services.generation_service import GenerationService
from app.services import residual_history as residual


class FakeService:
    def __init__(self, jobs: list[dict[str, Any]]) -> None:
        self.jobs = jobs

    def snapshot(self) -> dict[str, Any]:
        return {"jobs": self.jobs}


class FakeResponse:
    def __init__(self, body: object, status_code: int = 200) -> None:
        self.body = body
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("upstream failed", request=httpx.Request("GET", "http://upstream/history"), response=httpx.Response(self.status_code))

    def json(self) -> object:
        return self.body


class FakeClient:
    def __init__(self, body: object, status_code: int = 200) -> None:
        self.body = body
        self.status_code = status_code
        self.calls: list[tuple[str, dict[str, Any], float]] = []

    async def get(self, url: str, *, params: dict[str, Any], timeout: float) -> FakeResponse:
        self.calls.append((url, params, timeout))
        return FakeResponse(self.body, self.status_code)


def _managed(job_id: str, filename: str, *, session_id: str | None = "session", finished_at: str | None = "2026-01-01T00:00:00Z") -> dict[str, Any]:
    return {
        "job_id": job_id,
        "prompt_id": f"prompt-{job_id}",
        "session_id": session_id,
        "status": "succeeded",
        "finished_at": finished_at,
        "outputs": [{"node_id": "8", "index": 0, "view_url": f"/api/comfy/view?filename={filename}&subfolder=folder&type=output&t=ignored"}],
    }


def test_residual_history_deduplicates_and_probes_only_unseen_page(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeClient({
        "legacy-prompt": {
            "prompt": [5, "legacy-prompt", {}, {"client_id": "legacy-session"}],
            "outputs": {"2": {"images": [{"filename": "legacy.png"}]}},
        },
    })
    monkeypatch.setattr(residual, "get_comfy_client", lambda: client)
    active = maximum = 0
    probed: list[tuple[str, str, str]] = []

    async def probe(filename: str, subfolder: str = "", type: str = "output") -> ImageAvailability:
        nonlocal active, maximum
        active += 1
        maximum = max(maximum, active)
        probed.append((filename, subfolder, type))
        await asyncio.sleep(0)
        active -= 1
        return ImageAvailability(availability="present")

    monkeypatch.setattr(residual, "probe_image_availability", probe)
    service = FakeService([
        _managed("newer", "same.png", session_id="managed-session", finished_at="2026-01-02T00:00:00Z"),
        _managed("older", "same.png", session_id="old-session"),
        _managed("older", "known.png"),
    ])
    request = residual.ResidualHistoryRequest.model_validate({
        "known": [{"filename": "known.png", "subfolder": "folder"}],
        "examined": [],
    })

    result = asyncio.run(residual.get_residual_history(request, cast(GenerationService, service)))

    assert [item.identity.filename for item in result.items] == ["same.png", "legacy.png"]
    assert [item.session_id for item in result.items] == ["managed-session", "legacy-session"]
    assert [item.identity.filename for item in result.rejected] == []
    assert result.has_more is False
    assert probed == [("same.png", "folder", "output"), ("legacy.png", "", "output")]
    assert maximum <= 2
    assert client.calls[0][0].endswith("/history")
    assert client.calls[0][1:] == ({"max_items": 200}, 15.0)
    assert "t=" not in result.items[0].view_url


def test_residual_history_pages_ten_and_reports_missing_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeClient({})
    monkeypatch.setattr(residual, "get_comfy_client", lambda: client)
    probed: list[str] = []

    async def probe(filename: str, subfolder: str = "", type: str = "output") -> ImageAvailability:
        probed.append(filename)
        return ImageAvailability(availability="missing" if filename.endswith("0.png") else "unknown")

    monkeypatch.setattr(residual, "probe_image_availability", probe)
    jobs = [_managed(f"j{index:03}", f"file-{index}.png") for index in range(12)]
    result = asyncio.run(residual.get_residual_history(residual.ResidualHistoryRequest(known=[], examined=[]), cast(GenerationService, FakeService(jobs))))

    assert len(probed) == 10
    assert result.items == []
    assert len(result.rejected) == 10
    assert {item.availability for item in result.rejected} == {"missing", "unknown"}
    assert result.has_more is True


def test_known_and_examined_identities_are_never_probed(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeClient({})
    monkeypatch.setattr(residual, "get_comfy_client", lambda: client)
    probed: list[str] = []

    async def probe(filename: str, subfolder: str = "", type: str = "output") -> ImageAvailability:
        probed.append(filename)
        return ImageAvailability(availability="present")

    monkeypatch.setattr(residual, "probe_image_availability", probe)
    payload = residual.ResidualHistoryRequest(
        known=[residual.ImageIdentity(filename="known.png", subfolder="folder")],
        examined=[residual.ImageIdentity(filename="examined.png", subfolder="folder")],
    )
    result = asyncio.run(residual.get_residual_history(payload, cast(GenerationService, FakeService([
        _managed("1", "known.png"), _managed("2", "examined.png"),
    ]))))

    assert result.items == []
    assert result.rejected == []
    assert result.has_more is False
    assert probed == []


def test_managed_identity_uses_legacy_client_id_when_managed_session_is_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeClient({
        "legacy": {
            "prompt": [9, "legacy", {}, {"client_id": "legacy-client"}],
            "outputs": {"8": {"images": [{"filename": "shared.png", "subfolder": "folder", "type": "output"}]}},
        },
    })
    monkeypatch.setattr(residual, "get_comfy_client", lambda: client)

    async def probe(filename: str, subfolder: str = "", type: str = "output") -> ImageAvailability:
        return ImageAvailability(availability="present")

    monkeypatch.setattr(residual, "probe_image_availability", probe)
    result = asyncio.run(residual.get_residual_history(
        residual.ResidualHistoryRequest(known=[], examined=[]),
        cast(GenerationService, FakeService([_managed("managed", "shared.png", session_id=None)])),
    ))

    assert len(result.items) == 1
    assert result.items[0].session_id == "legacy-client"


def test_upstream_history_failures_are_typed_503(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeClient({}, status_code=502)
    monkeypatch.setattr(residual, "get_comfy_client", lambda: client)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(residual.get_residual_history(
            residual.ResidualHistoryRequest(known=[], examined=[]), cast(GenerationService, FakeService([]))
        ))
    assert exc.value.status_code == 503


def test_residual_route_validates_payload_and_returns_typed_upstream_error(monkeypatch: pytest.MonkeyPatch) -> None:
    app = FastAPI()
    app.include_router(router)
    service = object.__new__(GenerationService)
    service.snapshot = lambda: {"jobs": []}  # type: ignore[method-assign]
    app.state.generation_service = service
    monkeypatch.setattr(residual, "get_comfy_client", lambda: FakeClient({}, status_code=502))

    with TestClient(app) as client:
        invalid = client.post("/api/generation/history/residual", json={"known": [{"filename": ""}], "examined": []})
        unavailable = client.post("/api/generation/history/residual", json={"known": [], "examined": []})

    assert invalid.status_code == 422
    assert invalid.json()["detail"]["code"] == "validation_error"
    assert unavailable.status_code == 503
    assert unavailable.json()["detail"]["code"] == "unavailable"


def test_request_identity_defaults_deduplicate_and_limits_validate() -> None:
    request = residual.ResidualHistoryRequest.model_validate({
        "known": [{"filename": "x.png"}, {"filename": "x.png", "type": "output", "subfolder": ""}],
        "examined": [],
    })
    assert len(request.known) == 1
    assert request.known[0] == residual.ImageIdentity(filename="x.png", subfolder="", type="output")
    assert len(request.known) == 1
    with pytest.raises(ValueError):
        residual.ResidualHistoryRequest(known=[residual.ImageIdentity(filename=f"{n}.png") for n in range(1001)], examined=[])
    with pytest.raises(ValueError):
        residual.ImageIdentity(filename="")
