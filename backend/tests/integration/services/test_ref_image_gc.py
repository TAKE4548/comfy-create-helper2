import asyncio
import contextlib
import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Callable, Iterator

import pytest
from hypothesis import given, settings as hyp_settings, strategies as st
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.database import Base
from app.services.ref_image_gc import (
    GC_GRACE_SECONDS,
    GC_MAX_DELETIONS_PER_RUN,
    REF_SCAN_RE,
    collect_db_references,
    gc_loop,
    run_gc,
)
from app.services.ref_image_store import STORE_LOCK, RefImageStore

HOUR = 3600
NOW = 2_000_000_000.0


def _sha(seed: str) -> str:
    return hashlib.sha256(seed.encode()).hexdigest()


@pytest.fixture
def store(tmp_path: Path) -> RefImageStore:
    root = tmp_path / "ref_images"
    (root / "thumbs").mkdir(parents=True)
    return RefImageStore(lambda: root)


def _put(store: RefImageStore, seed: str, age_hours: float, ext: str = "png", thumb: bool = True) -> str:
    sha = _sha(seed)
    ref_id = f"{sha}.{ext}"
    path = store.root() / ref_id
    path.write_bytes(b"x" + seed.encode())
    mtime = NOW - age_hours * HOUR
    os.utime(path, (mtime, mtime))
    if thumb:
        tpath = store.root() / "thumbs" / f"{sha}.webp"
        tpath.write_bytes(b"t")
        os.utime(tpath, (mtime, mtime))
    return ref_id


def _connector(db_session: Session) -> Callable[[], contextlib.AbstractContextManager[Connection]]:
    @contextlib.contextmanager
    def connect() -> Iterator[Connection]:
        yield db_session.connection()

    return connect


def _now() -> float:
    return NOW


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_gc_deletes_only_unreferenced_images_past_grace(store: RefImageStore, db_session: Session) -> None:
    """[REQ-427/AC-8] Old unreferenced originals and thumbnails are deleted; images within 72h are kept."""
    old = _put(store, "old", 100)
    recent = _put(store, "recent", 71)
    report = run_gc(store, _connector(db_session), now=_now)

    assert not report.aborted
    assert report.deleted == (old,)
    assert not (store.root() / old).exists()
    assert not (store.root() / "thumbs" / f"{old.split('.')[0]}.webp").exists()
    assert (store.root() / recent).exists()
    assert report.kept_recent == 1 and report.stored == 2


def _insert_workflow(db: Session, body: str = "{}", name: str = "w") -> None:
    db.execute(text("INSERT INTO workflows (id, name, json_body, created_at) VALUES (1, :n, :b, CURRENT_TIMESTAMP)"), {"n": name, "b": body})


def _loc_preset_value(db: Session, tok: str) -> None:
    db.execute(
        text("INSERT INTO workflow_preset_values (preset_id, variant_id, sub_key, value) VALUES (1, 1, '', :v)"),
        {"v": tok},
    )


def _loc_preset_params(db: Session, tok: str) -> None:
    db.execute(
        text(
            "INSERT INTO workflow_presets (workflow_id, name, param_values, applied_assets, batch_size, seed_mode,"
            " seed, sort_order, created_at, updated_at) VALUES (1, 'p', :v, '{}', 1, 'fixed', 0, 0,"
            " CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ),
        {"v": json.dumps({"ref": tok})},
    )


def _loc_snapshot_params(db: Session, tok: str) -> None:
    nested = json.dumps({"ref": tok})
    params = json.dumps({"__prompt_surgeon_metadata_v1": nested})
    db.execute(text("INSERT INTO snapshots (workflow_id, params, created_at) VALUES (1, :v, CURRENT_TIMESTAMP)"), {"v": params})


def _loc_prompt_metadata(db: Session, tok: str) -> None:
    db.execute(
        text("INSERT INTO prompt_metadata (prompt_id, param_values, created_at) VALUES ('pid', :v, CURRENT_TIMESTAMP)"),
        {"v": json.dumps({"k": tok})},
    )


def _loc_generation_job(db: Session, tok: str) -> None:
    db.execute(
        text(
            "INSERT INTO generation_jobs (job_id, request_id, item_index, payload_hash, session_id, scope, batch_id,"
            " graph_json) VALUES ('j', 'r', 0, 'h', 's', 'normal', 'b', :v)"
        ),
        {"v": json.dumps({"1": {"inputs": {"image": tok}}})},
    )


def _loc_workflow_body(db: Session, tok: str) -> None:
    db.execute(text("UPDATE workflows SET json_body = :v WHERE id = 1"), {"v": json.dumps({"n": tok})})


def _loc_workflow_history(db: Session, tok: str) -> None:
    db.execute(
        text("INSERT INTO workflow_history (workflow_id, json_body, mappings, created_at) VALUES (1, :v, '[]', CURRENT_TIMESTAMP)"),
        {"v": json.dumps({"n": tok})},
    )


_LOCATIONS = [
    ("workflow_preset_values.value", _loc_preset_value),
    ("workflow_presets.param_values", _loc_preset_params),
    ("snapshots.params", _loc_snapshot_params),
    ("prompt_metadata.param_values", _loc_prompt_metadata),
    ("generation_jobs.graph_json", _loc_generation_job),
    ("workflows.json_body", _loc_workflow_body),
    ("workflow_history.json_body", _loc_workflow_history),
]


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
@pytest.mark.parametrize("insert", [loc[1] for loc in _LOCATIONS], ids=[loc[0] for loc in _LOCATIONS])
def test_gc_keeps_images_referenced_from_each_storage_location(
    store: RefImageStore, db_session: Session, insert: Callable[[Session, str], None]
) -> None:
    """[REQ-427/AC-8] A token stored in any known location protects an image past the grace period."""
    ref_id = _put(store, "protected", 500)
    unreferenced = _put(store, "free", 500)
    _insert_workflow(db_session)
    insert(db_session, f"refimg:{ref_id}")

    report = run_gc(store, _connector(db_session), now=_now)

    assert not report.aborted, report.reason
    assert (store.root() / ref_id).exists()
    assert report.deleted == (unreferenced,)
    assert report.kept_referenced == 1


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_gc_scans_every_table_including_future_ones(store: RefImageStore, db_session: Session) -> None:
    """[REQ-427/AC-8] tables_scanned covers all model tables and an ad-hoc table is scanned too."""
    ref_id = _put(store, "future", 500)
    db_session.execute(text("CREATE TABLE future_x(data TEXT)"))
    db_session.execute(text("INSERT INTO future_x(data) VALUES (:v)"), {"v": f"prefix refimg:{ref_id} suffix"})

    report = run_gc(store, _connector(db_session), now=_now)

    assert not report.aborted, report.reason
    assert set(Base.metadata.tables) <= set(report.tables_scanned)
    assert "future_x" in report.tables_scanned
    assert report.deleted == ()
    assert (store.root() / ref_id).exists()


_JSON_LEAF = st.recursive(
    st.none() | st.booleans() | st.integers() | st.text(),
    lambda inner: st.lists(inner, max_size=3) | st.dictionaries(st.text(max_size=5), inner, max_size=3),
    max_leaves=6,
)


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
@hyp_settings(max_examples=100, deadline=None)
@given(sha=st.text(alphabet="0123456789abcdef", min_size=64, max_size=64), ext=st.sampled_from(["png", "jpg", "webp"]),
       other=_JSON_LEAF, depth=st.integers(1, 3), bad=st.integers(0, 1))
def test_scan_pattern_survives_nested_json_encoding(sha: str, ext: str, other: object, depth: int, bad: int) -> None:
    """[REQ-427/AC-8] Tokens embedded in JSON re-encoded 1-3 times are always found; mutated tokens are not."""
    good = f"refimg:{sha}.{ext}"
    mutated = f"refimg:{sha.upper()}.{ext}" if bad == 0 else f"refimg:{sha[:63]}.{ext}"
    if sha.upper() == sha:
        mutated = f"refimg:{sha[:63]}.{ext}"

    def encode(token: str) -> str:
        value: object = {"payload": other, "t": token}
        out = ""
        for _ in range(depth):
            out = json.dumps(value)
            value = out
        return out

    found = {f"{m.group(1)}.{m.group(2)}" for m in REF_SCAN_RE.finditer(encode(good))}
    assert f"{sha}.{ext}" in found
    assert not any(m.group(0) == mutated for m in REF_SCAN_RE.finditer(encode(mutated)))


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_gc_failsafe_when_collection_or_root_fails(store: RefImageStore, db_session: Session) -> None:
    """[REQ-427/AC-8] Any collection failure or missing root aborts without deleting or raising."""
    old = _put(store, "victim", 500)
    good = _connector(db_session)

    @contextlib.contextmanager
    def always_fail() -> Iterator[Connection]:
        raise RuntimeError("db down")
        yield  # pragma: no cover

    calls = {"n": 0}

    @contextlib.contextmanager
    def fail_second() -> Iterator[Connection]:
        calls["n"] += 1
        if calls["n"] >= 2:
            raise RuntimeError("db down on second")
        with good() as conn:
            yield conn

    first = run_gc(store, always_fail, now=_now)
    assert first.aborted and first.deleted == ()
    second = run_gc(store, fail_second, now=_now)
    assert second.aborted and second.deleted == ()
    missing_root = RefImageStore(lambda: store.root() / "does_not_exist")
    third = run_gc(missing_root, good, now=_now)
    assert third.aborted and third.deleted == ()
    assert (store.root() / old).exists()


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_gc_keeps_image_referenced_between_collections(store: RefImageStore, db_session: Session) -> None:
    """[REQ-427/AC-8] A reference added after the first scan is caught by the second scan."""
    ref_id = _put(store, "late", 500)
    good = _connector(db_session)
    calls = {"n": 0}

    @contextlib.contextmanager
    def connect() -> Iterator[Connection]:
        calls["n"] += 1
        if calls["n"] == 2:
            db_session.execute(text("CREATE TABLE late_refs(data TEXT)"))
            db_session.execute(text("INSERT INTO late_refs VALUES (:v)"), {"v": f"refimg:{ref_id}"})
        with good() as conn:
            yield conn

    report = run_gc(store, connect, now=_now)
    assert not report.aborted, report.reason
    assert report.deleted == ()
    assert (store.root() / ref_id).exists()


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_gc_keeps_image_touched_after_candidate_selection(store: RefImageStore, db_session: Session) -> None:
    """[REQ-427/AC-8] touch between candidate selection and deletion is honored by the locked recheck."""
    ref_id = _put(store, "touched", 500)
    good = _connector(db_session)
    calls = {"n": 0}

    @contextlib.contextmanager
    def connect() -> Iterator[Connection]:
        calls["n"] += 1
        if calls["n"] == 2:
            os.utime(store.root() / ref_id, (NOW, NOW))
        with good() as conn:
            yield conn

    report = run_gc(store, connect, now=_now)
    assert not report.aborted, report.reason
    assert report.deleted == ()
    assert (store.root() / ref_id).exists()


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_gc_touches_only_designated_names(store: RefImageStore, db_session: Session) -> None:
    """[REQ-427/AC-8] Foreign names, uppercase hex, nested thumbs and fresh tmp are kept; stale tmp is removed."""
    root = store.root()
    old = NOW - 500 * HOUR
    keep = [
        root / "README.txt",
        root / f"{_sha('u').upper()}.png",
        root / "thumbs" / "sub" / "x.webp",
        root / ".tmp_x",
    ]
    (root / "thumbs" / "sub").mkdir()
    for path in keep:
        path.write_bytes(b"k")
        os.utime(path, (old, old) if path.name != ".tmp_x" else (NOW - 60, NOW - 60))
    stale = root / ".tmp_y"
    stale.write_bytes(b"s")
    os.utime(stale, (NOW - 2 * HOUR, NOW - 2 * HOUR))

    report = run_gc(store, _connector(db_session), now=_now)

    assert not report.aborted, report.reason
    assert all(p.exists() for p in keep)
    assert not stale.exists()


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_gc_removes_orphan_thumbnails_past_grace_only(store: RefImageStore, db_session: Session) -> None:
    """[REQ-427/AC-8] Thumbnails without an original are removed after grace, kept within grace."""
    root = store.root()
    old_thumb = root / "thumbs" / f"{_sha('o')}.webp"
    new_thumb = root / "thumbs" / f"{_sha('n')}.webp"
    for path, age in ((old_thumb, 100), (new_thumb, 1)):
        path.write_bytes(b"t")
        os.utime(path, (NOW - age * HOUR, NOW - age * HOUR))

    run_gc(store, _connector(db_session), now=_now)

    assert not old_thumb.exists()
    assert new_thumb.exists()


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_gc_caps_deletions_per_run(store: RefImageStore, db_session: Session) -> None:
    """[REQ-427/AC-8] 501 candidates: first run deletes 500, second run deletes the remaining one."""
    total = GC_MAX_DELETIONS_PER_RUN + 1
    for i in range(total):
        _put(store, f"bulk{i}", 100, thumb=False)

    first = run_gc(store, _connector(db_session), now=_now)
    second = run_gc(store, _connector(db_session), now=_now)

    assert len(first.deleted) == GC_MAX_DELETIONS_PER_RUN
    assert len(second.deleted) == 1
    assert not [p for p in store.root().iterdir() if re.fullmatch(r"[0-9a-f]{64}\.png", p.name)]


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_gc_loop_survives_errors_and_stops_on_cancel(
    store: RefImageStore, caplog: pytest.LogCaptureFixture
) -> None:
    """[REQ-427/AC-8] gc_loop keeps running when every run fails and terminates on cancellation."""
    attempts = {"n": 0}

    @contextlib.contextmanager
    def failing() -> Iterator[Connection]:
        attempts["n"] += 1
        raise RuntimeError("boom")
        yield  # pragma: no cover

    async def scenario() -> None:
        task = asyncio.create_task(gc_loop(store, failing, initial_delay=0, interval=0))
        for _ in range(200):
            if attempts["n"] >= 2:
                break
            await asyncio.sleep(0.01)
        assert attempts["n"] >= 2
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    with caplog.at_level(logging.WARNING, logger="app.services.ref_image_gc"):
        asyncio.run(scenario())
    assert any("aborted" in r.getMessage() for r in caplog.records)


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-8")
def test_store_claim_and_touch_are_atomic_with_gc_lock(store: RefImageStore) -> None:
    """[REQ-427/AC-8] claim touches existing ids, reports missing ones, and uses the shared store lock."""
    present = _put(store, "claimed", 500)
    missing = f"{_sha('absent')}.png"
    before = time.time()
    with STORE_LOCK:
        result = store.claim([present, missing, "../bad"])
    assert result == [missing, "../bad"]
    assert (store.root() / present).stat().st_mtime >= before - 1
    assert collect_db_references is not None
