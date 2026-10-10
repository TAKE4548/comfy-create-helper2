from __future__ import annotations

import importlib.util
import json
import os
import locale
import stat
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest


MANAGER_PATH = Path(__file__).resolve().parents[2] / "tools" / "server-manager" / "server_api.py"
sys.path.insert(0, str(MANAGER_PATH.parent))
spec = importlib.util.spec_from_file_location("server_api_req333", MANAGER_PATH)
assert spec is not None and spec.loader is not None
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)


@pytest.fixture
def server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), manager.ManagerHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=2)
        httpd.server_close()


def request(server: str, path: str, *, method: str = "GET", origin: str | None = None, body: dict | None = None):
    headers = {}
    data = None
    if origin is not None:
        headers["Origin"] = origin
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = Request(server + path, data=data, headers=headers, method=method)
    try:
        return urlopen(req, timeout=3)
    except HTTPError as exc:
        return exc


@pytest.mark.parametrize("origin", [
    "http://localhost:5173",
    "http://127.0.0.1:8000",
    "http://192.168.4.23:5173",
    "http://10.20.30.40:8000",
])
def test_allowed_app_origins_are_exact_local_addresses(origin: str) -> None:
    assert manager.is_allowed_app_origin(origin)


@pytest.mark.parametrize("origin", [
    "http://localhost:8080",
    "http://192.168.1.1.attacker.test:5173",
    "http://192.168.999.1:5173",
    "http://127.0.0.2:5173",
    "http://172.16.0.1:5173",
    "http://10.20.0.1:8080",
    "http://user@localhost:5173",
    "http://localhost:5173/path",
    "null",
])
def test_invalid_and_non_app_origins_are_rejected(origin: str) -> None:
    assert not manager.is_allowed_app_origin(origin)


def test_options_returns_exact_allow_origin_and_vary(server: str) -> None:
    response = request(server, "/api/action", method="OPTIONS", origin="http://localhost:8000")
    assert response.status == 204
    assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:8000"
    assert response.headers["Access-Control-Allow-Methods"] == "GET, POST, OPTIONS"
    assert response.headers["Vary"] == "Origin"


def test_same_origin_manager_html_remains_available(server: str) -> None:
    origin = server
    response = request(server, "/", origin=origin)
    assert response.status == 200
    assert response.headers["Content-Type"].startswith("text/html")
    assert response.headers["Access-Control-Allow-Origin"] == origin


def test_disallowed_origin_is_rejected_before_action(server: str, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []
    monkeypatch.setattr(manager.subprocess, "run", lambda *args, **kwargs: calls.append(args))
    response = request(server, "/api/action", method="POST", origin="http://localhost:8080", body={"action": "stop"})
    assert response.status == 403
    assert not calls
    assert response.headers.get("Access-Control-Allow-Origin") is None
    assert response.headers["Vary"] == "Origin"


def test_action_enum_and_nonzero_exit_are_reported_as_failure(server: str, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def run(*args, **kwargs):
        calls.append((args, kwargs))
        assert kwargs["stdout"] is not manager.subprocess.PIPE
        assert kwargs["stderr"] is not manager.subprocess.PIPE
        assert stat.S_ISREG(os.fstat(kwargs["stdout"].fileno()).st_mode)
        assert stat.S_ISREG(os.fstat(kwargs["stderr"].fileno()).st_mode)
        kwargs["stdout"].write("partial".encode(locale.getpreferredencoding(False)))
        kwargs["stderr"].write("failed".encode(locale.getpreferredencoding(False)))
        return SimpleNamespace(returncode=7)

    monkeypatch.setattr(manager.subprocess, "run", run)
    invalid = request(server, "/api/action", method="POST", body={"action": "delete-everything"})
    assert invalid.status == 400
    assert not calls

    failed = request(server, "/api/action", method="POST", body={"action": "restart", "service": "backend"})
    data = json.loads(failed.read())
    assert failed.status == 502
    assert data["status"] == "error"
    assert data["returncode"] == 7
    assert data["output"] == "partialfailed"
    assert calls[0][0][0][0] == "powershell.exe"


def test_action_output_read_is_limited_to_the_file_size_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    with manager.tempfile.TemporaryFile(mode="w+b") as output:
        output.write(b"snapshot-and-later")
        output.flush()
        original_fstat = os.fstat
        monkeypatch.setattr(manager.os, "fstat", lambda fd: SimpleNamespace(st_size=8) if fd == output.fileno() else original_fstat(fd))

        assert manager._read_action_output_snapshot(output) == "snapshot"


def test_action_output_decode_replaces_invalid_local_bytes_without_dropping_output(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(manager.locale, "getpreferredencoding", lambda _do_setlocale=False: "utf-8")
    with manager.tempfile.TemporaryFile(mode="w+b") as output:
        output.write(b"before-\xff-after")

        assert manager._read_action_output_snapshot(output) == "before-\ufffd-after"


def test_action_timeout_is_truthful_and_invalidates_status_cache(server: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(manager, "_last_status_cache", {"stale": True})
    monkeypatch.setattr(manager, "_last_status_time", 9999999999.0)
    monkeypatch.setattr(manager.server_status, "get_server_status", lambda _config: {"fresh": True})

    def run(*args, **kwargs):
        assert stat.S_ISREG(os.fstat(kwargs["stdout"].fileno()).st_mode)
        assert stat.S_ISREG(os.fstat(kwargs["stderr"].fileno()).st_mode)
        raise manager.subprocess.TimeoutExpired(args[0], kwargs["timeout"])

    monkeypatch.setattr(manager.subprocess, "run", run)
    failed = request(server, "/api/action", method="POST", body={"action": "start", "service": "frontend"})
    assert failed.status == 504
    assert json.loads(failed.read())["status"] == "timeout"

    status = request(server, "/api/status")
    status_data = json.loads(status.read())
    assert status_data == {"fresh": True, "action_in_progress": None}


def test_status_exposes_transient_action_flag_and_rejects_concurrent_control(server: str, monkeypatch: pytest.MonkeyPatch) -> None:
    started = threading.Event()
    release = threading.Event()
    calls = []
    service_status = {"fe": {"status": "LISTEN", "running": True}, "be": {"status": "LISTEN"}, "comfy": {"status": "LISTEN"}}
    monkeypatch.setattr(manager.server_status, "get_server_status", lambda _config: dict(service_status))

    def run(*args, **kwargs):
        calls.append(args)
        started.set()
        assert release.wait(timeout=3)
        return SimpleNamespace(returncode=0, stdout="accepted", stderr="")

    monkeypatch.setattr(manager.subprocess, "run", run)
    result = []
    action_thread = threading.Thread(
        target=lambda: result.append(request(server, "/api/action", method="POST", body={"action": "start", "service": "backend"})),
        daemon=True,
    )
    action_thread.start()
    assert started.wait(timeout=2)

    status = json.loads(request(server, "/api/status").read())
    assert status["action_in_progress"] == {"service": "backend", "action": "start"}
    assert {key: status[key] for key in service_status} == service_status
    conflict = request(server, "/api/action", method="POST", body={"action": "stop", "service": "comfy"})
    assert conflict.status == 409
    assert len(calls) == 1

    release.set()
    action_thread.join(timeout=3)
    assert not action_thread.is_alive()
    assert result[0].status == 200
    final_status = json.loads(request(server, "/api/status").read())
    assert final_status["action_in_progress"] is None
    assert "if (!['fe', 'be', 'comfy'].includes(key) || !s || typeof s !== 'object') continue;" in manager.HTML_TEMPLATE
