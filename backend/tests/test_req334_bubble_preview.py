import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.config import settings
from app.routers import snapshots


class FakeQuery:
    def __init__(self, setting: Any):
        self.setting = setting

    def filter(self, *_args: object) -> "FakeQuery":
        return self

    def first(self) -> Any:
        return self.setting


class FakeDB:
    def __init__(self, setting: Any):
        self.setting = setting
        self.commits = 0

    def query(self, *_args: object) -> FakeQuery:
        return FakeQuery(self.setting)

    def commit(self) -> None:
        self.commits += 1


def _setup(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, saved_params: dict[str, object] | None = None):
    image_path = tmp_path / "saved-image.png"
    image_path.write_bytes(b"image")
    monkeypatch.setattr(settings, "snapshot_dir", str(tmp_path))
    monkeypatch.setattr(
        snapshots.SnapshotService,
        "get_snapshot",
        lambda _db, _snapshot_id: SimpleNamespace(image_path="/old/path/saved-image.png"),
    )
    db = FakeDB(SimpleNamespace(content=json.dumps(saved_params)) if saved_params is not None else None)
    return image_path, db


def test_preview_uses_unsaved_overrides_and_returns_candidates_without_writes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    image_path, db = _setup(monkeypatch, tmp_path, {"min_area": 420, "min_brightness": 190})
    seen: dict[str, object] = {}
    candidate = {"id": 1, "x": 2, "y": 3, "w": 40, "h": 30, "area": 1200,
                 "aspect_ratio": 1.33, "mean_brightness": 222.0, "status": "PASS"}

    def fake_detect(path: str, **kwargs: object) -> list[dict[str, object]]:
        seen.update(path=path, **kwargs)
        return [candidate]

    monkeypatch.setattr("app.services.bubble_detector.detect_bubble_candidates", fake_detect)
    response = snapshots.detect_bubble_debug_endpoint(
        7, snapshots.BubbleDebugRequest(min_area=200, min_brightness=12), db  # type: ignore[call-arg]
    )

    assert seen == {
        "path": str(image_path), "roi": None, "min_area": 200, "min_brightness": 12,
    }
    assert response == {"candidates": [candidate]}
    assert db.commits == 0


def test_omitted_preview_settings_use_saved_defaults(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _image_path, db = _setup(monkeypatch, tmp_path, {"min_area": 350, "min_brightness": 80})
    seen: dict[str, object] = {}

    def fake_detect(_path: str, **kwargs: object) -> list[dict[str, object]]:
        seen.update(kwargs)
        return []

    monkeypatch.setattr("app.services.bubble_detector.detect_bubble_candidates", fake_detect)
    response = snapshots.detect_bubble_debug_endpoint(7, snapshots.BubbleDebugRequest(), db)  # type: ignore[call-arg]

    assert seen == {"roi": None, "min_area": 350, "min_brightness": 80}
    assert response == {"candidates": []}
    assert db.commits == 0


@pytest.mark.parametrize("field,value", [
    ("min_area", 49), ("min_area", 5001), ("min_brightness", -1), ("min_brightness", 256),
])
def test_preview_rejects_out_of_bounds_sensitivity(field: str, value: int) -> None:
    with pytest.raises(ValidationError):
        snapshots.BubbleDebugRequest.model_validate({field: value})


def test_preview_returns_404_when_saved_image_is_unavailable(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "snapshot_dir", str(tmp_path))
    monkeypatch.setattr(
        snapshots.SnapshotService,
        "get_snapshot",
        lambda _db, _snapshot_id: SimpleNamespace(image_path="/missing/image.png"),
    )

    with pytest.raises(HTTPException) as exc_info:
        snapshots.detect_bubble_debug_endpoint(
            7, snapshots.BubbleDebugRequest(), FakeDB(None)  # type: ignore[arg-type]
        )
    assert exc_info.value.status_code == 404
