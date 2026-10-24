import json
import locale
import os
import socket
import subprocess
import stat
import shutil
import threading
import time
import hashlib
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch, MagicMock
import pytest
import sys
from pathlib import Path

# Add tools/server-manager to sys.path
SM_DIR = Path(__file__).resolve().parent.parent.parent / "tools" / "server-manager"
if str(SM_DIR) not in sys.path:
    sys.path.insert(0, str(SM_DIR))

import server_api


@pytest.mark.parametrize("queue_body,native_status,expected_status,expected_outcome,free_count", [
    (b'{"queue_running":[],"queue_pending":[]}', 200, 200, "accepted", 1),
    (b'{"queue_running":[],"queue_pending":[]}', 404, 502, None, 1),
    (b'{"queue_running":[],"queue_pending":[]}', 500, 502, None, 1),
    (b'{"queue_running":[],"queue_pending":[]}', 302, 502, None, 1),
    (b'{"queue_running":[{}],"queue_pending":[]}', 200, 409, None, 0),
    (b'{"queue_running":[],"queue_pending":[{}]}', 200, 409, None, 0),
    (b'{"queue_running":[],"queue_pending":null}', 200, 503, None, 0),
], ids=["[REQ-380/AC-2]-idle-empty-200", "[REQ-380/AC-2]-native-404", "[REQ-380/AC-2]-native-500",
        "[REQ-380/AC-2]-native-redirect", "[REQ-380/AC-2]-executing", "[REQ-380/AC-2]-queued", "[REQ-380/AC-2]-unknown"])
def test_req380_free_memory_manager_http_sandbox(tmp_path, monkeypatch, queue_body,
                                                 native_status, expected_status, expected_outcome, free_count):
    class ComfyHandler(BaseHTTPRequestHandler):
        free_calls = 0

        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(queue_body)

        def do_POST(self):
            type(self).free_calls += 1
            assert self.path == "/free"
            assert json.loads(self.rfile.read(int(self.headers["Content-Length"]))) == {
                "unload_models": True, "free_memory": True}
            self.send_response(native_status)
            if native_status == 302:
                self.send_header("Location", "http://127.0.0.1:1/redirect-target")
            self.end_headers()  # Native ComfyUI may return an empty body.

        def log_message(self, *_args):
            pass

    comfy = ThreadingHTTPServer(("127.0.0.1", 0), ComfyHandler)
    comfy_thread = threading.Thread(target=comfy.serve_forever, daemon=True)
    comfy_thread.start()
    production_config = server_api.CONFIG_FILE
    before = hashlib.sha256(production_config.read_bytes()).hexdigest()
    test_config = tmp_path / "manager-test-config.json"
    test_config.write_text(json.dumps({"wsl": {"port": comfy.server_address[1]}}), encoding="utf-8")
    assert test_config.resolve() != production_config.resolve()
    monkeypatch.setattr(server_api, "CONFIG_FILE", test_config)
    manager = ThreadingHTTPServer(("127.0.0.1", 0), server_api.ManagerHandler)
    manager_thread = threading.Thread(target=manager.serve_forever, daemon=True)
    manager_thread.start()
    try:
        assert server_api.check_port_listening(comfy.server_address[1])
        assert server_api.check_port_listening(manager.server_address[1])
        request = urllib.request.Request(
            f"http://127.0.0.1:{manager.server_address[1]}/api/action",
            data=json.dumps({"action": "free-memory", "service": "comfy"}).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with patch.object(server_api.subprocess, "run", side_effect=AssertionError(
                "free-memory must not invoke subprocesses")):
            try:
                response = urllib.request.urlopen(request, timeout=5)
                status = response.status
                payload = json.loads(response.read())
            except urllib.error.HTTPError as exc:
                status = exc.code
                payload = json.loads(exc.read())
        assert status == expected_status
        assert payload.get("outcome") == expected_outcome
        assert ComfyHandler.free_calls == free_count
        if status in {409, 503}:
            assert payload.get("request_sent") is False
        assert server_api.check_port_listening(comfy.server_address[1])
        assert server_api.check_port_listening(manager.server_address[1])
    finally:
        manager.shutdown()
        manager.server_close()
        manager_thread.join()
        comfy.shutdown()
        comfy.server_close()
        comfy_thread.join()
    assert hashlib.sha256(production_config.read_bytes()).hexdigest() == before


@pytest.mark.parametrize("_case", [pytest.param(None, id="[REQ-380/AC-2]-wrong-target")])
def test_REQ_380_free_memory_wrong_target_and_process_lock(monkeypatch, _case):
    handler = server_api.ManagerHandler.__new__(server_api.ManagerHandler)
    handler.path = "/api/action"
    handler.headers = {"Content-Length": "47"}
    payloads = []
    handler._send_json = lambda data, status=200: payloads.append((data, status))
    handler.rfile = __import__("io").BytesIO(b'{"action":"free-memory","service":"backend"}')
    handler.do_POST()
    assert payloads[0][1] == 400
    assert payloads[0][0]["request_sent"] is False
    assert "free-memory" in server_api.HTML_TEMPLATE
    assert "解放要求を受け付けました" in server_api.HTML_TEMPLATE


@pytest.mark.parametrize("_case", [pytest.param(None, id="[REQ-380/AC-2]-cross-client-lock")])
def test_REQ_380_two_manager_clients_share_action_lock(tmp_path, monkeypatch, _case):
    started = threading.Event()
    release = threading.Event()

    class ComfyHandler(BaseHTTPRequestHandler):
        free_calls = 0

        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"queue_running":[],"queue_pending":[]}')

        def do_POST(self):
            type(self).free_calls += 1
            started.set()
            release.wait(3)
            self.send_response(200)
            self.end_headers()

        def log_message(self, *_args):
            pass

    comfy = ThreadingHTTPServer(("127.0.0.1", 0), ComfyHandler)
    comfy_thread = threading.Thread(target=comfy.serve_forever, daemon=True)
    comfy_thread.start()
    production_config = server_api.CONFIG_FILE
    test_config = tmp_path / "manager-lock-test-config.json"
    test_config.write_text(json.dumps({"wsl": {"port": comfy.server_address[1]}}), encoding="utf-8")
    assert test_config.resolve() != production_config.resolve()
    monkeypatch.setattr(server_api, "CONFIG_FILE", test_config)
    manager = ThreadingHTTPServer(("127.0.0.1", 0), server_api.ManagerHandler)
    manager_thread = threading.Thread(target=manager.serve_forever, daemon=True)
    manager_thread.start()
    endpoint = f"http://127.0.0.1:{manager.server_address[1]}/api/action"
    body = json.dumps({"action": "free-memory", "service": "comfy"}).encode()
    responses = []

    def first_client():
        request = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=5) as response:
            responses.append((response.status, json.loads(response.read())))

    thread = threading.Thread(target=first_client)
    thread.start()
    try:
        assert started.wait(2)
        second_request = urllib.request.Request(endpoint, data=body,
            headers={"Content-Type": "application/json"}, method="POST")
        with pytest.raises(urllib.error.HTTPError) as rejected:
            urllib.request.urlopen(second_request, timeout=2)
        payload = json.loads(rejected.value.read())
        assert rejected.value.code == 409
        assert payload["code"] == "ACTION_BUSY"
        assert payload["request_sent"] is False
        release.set()
        thread.join(5)
        assert responses[0][0] == 200 and responses[0][1]["outcome"] == "accepted"
        assert ComfyHandler.free_calls == 1
    finally:
        release.set()
        manager.shutdown()
        manager.server_close()
        manager_thread.join()
        comfy.shutdown()
        comfy.server_close()
        comfy_thread.join()


def test_check_port_listening():
    # Test on an open local port
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    sock.listen(1)
    port = sock.getsockname()[1]

    try:
        t0 = time.time()
        assert server_api.check_port_listening(port, timeout=0.5) is True
        elapsed = time.time() - t0
        assert elapsed < 0.1
    finally:
        sock.close()

    # Test on an unused port
    # After close, connecting should fail quickly
    assert server_api.check_port_listening(port, timeout=0.1) is False



def _make_status_bundled(be_running=True):
    """Helper: return a get_server_status result in BUNDLED mode."""
    return {
        "fe": {"name": "React FE (Bundled on 8000)", "port": 5173,
               "running": be_running, "status": "BUNDLED", "pids": []},
        "be": {"name": "Win BE", "port": 8000,
               "running": be_running, "status": "LISTEN" if be_running else "STOPPED", "pids": []},
        "comfy": {"name": "WSL ComfyUI", "port": 8188,
                  "running": False, "status": "STOPPED", "pids": []},
    }


def test_api_status_bundled_mode():
    """
    REQ-262 BUNDLED mode: when backend is running and frontend is bundled,
    fe.running should equal be.running (True) and fe.status == "BUNDLED".
    """
    import server_status as ss

    handler = server_api.ManagerHandler.__new__(server_api.ManagerHandler)
    handler.path = "/api/status"
    handler.headers = {}
    sent_responses = []

    def fake_send_json(data, status=200):
        sent_responses.append((data, status))

    handler._send_json = fake_send_json

    with patch.object(ss, "get_server_status", return_value=_make_status_bundled(be_running=True)):
        server_api._last_status_cache = None
        server_api._last_status_time = 0.0
        handler.do_GET()

    assert len(sent_responses) == 1
    data, status_code = sent_responses[0]
    assert status_code == 200
    assert data["fe"]["status"] == "BUNDLED"
    assert data["fe"]["running"] is True      # inherits be_running=True
    assert data["be"]["running"] is True
    assert data["be"]["status"] == "LISTEN"


def test_api_status_standalone_mode():
    """
    Standalone (non-BUNDLED) mode: all services stopped.
    fe.running should be False and fe.status == "STOPPED".
    """
    import server_status as ss

    handler = server_api.ManagerHandler.__new__(server_api.ManagerHandler)
    handler.path = "/api/status"
    handler.headers = {}
    sent_responses = []

    def fake_send_json(data, status=200):
        sent_responses.append((data, status))

    handler._send_json = fake_send_json

    stopped_status = {
        "fe": {"name": "React FE", "port": 5173, "running": False, "status": "STOPPED", "pids": []},
        "be": {"name": "Win BE", "port": 8000, "running": False, "status": "STOPPED", "pids": []},
        "comfy": {"name": "WSL ComfyUI", "port": 8188, "running": False, "status": "STOPPED", "pids": []},
    }

    with patch.object(ss, "get_server_status", return_value=stopped_status):
        server_api._last_status_cache = None
        server_api._last_status_time = 0.0
        handler.do_GET()

    assert len(sent_responses) == 1
    data, status_code = sent_responses[0]
    assert status_code == 200
    assert data["fe"]["running"] is False
    assert data["fe"]["status"] == "STOPPED"




def test_api_action_timeout():
    handler = server_api.ManagerHandler.__new__(server_api.ManagerHandler)
    handler.path = "/api/action"
    sent_responses = []

    def fake_send_json(data, status=200):
        sent_responses.append((data, status))

    handler._send_json = fake_send_json
    handler.headers = {"Content-Length": "30"}
    mock_rfile = MagicMock()
    mock_rfile.read.return_value = json.dumps({"action": "start", "service": "comfy"}).encode("utf-8")
    handler.rfile = mock_rfile

    output_files = []

    def timeout_run(*args, **kwargs):
        for name in ("stdout", "stderr"):
            output_file = kwargs[name]
            assert output_file is not subprocess.PIPE
            assert stat.S_ISREG(os.fstat(output_file.fileno()).st_mode)
            output_files.append(output_file)
        raise subprocess.TimeoutExpired(cmd=["powershell.exe"], timeout=35)

    with patch("subprocess.run", side_effect=timeout_run):
        handler.do_POST()

    assert len(sent_responses) == 1
    data, status_code = sent_responses[0]
    assert status_code == 504
    assert data.get("status") == "timeout"
    assert "timed out after 35s" in data.get("error", "").lower() or "timed out" in data.get("error", "").lower()
    assert all(output_file.closed for output_file in output_files)


def test_get_action_timeout_matrix():
    # restart / reboot-service
    assert server_api.get_action_timeout("restart", "backend") == 60
    assert server_api.get_action_timeout("reboot-service", "be") == 60
    assert server_api.get_action_timeout("restart", "backend", {"backend": {"wait_timeout_sec": 45}}) == 80
    assert server_api.get_action_timeout("restart", "comfy") == 50
    assert server_api.get_action_timeout("reboot-service", "wsl") == 50
    assert server_api.get_action_timeout("restart", "frontend") == 35
    assert server_api.get_action_timeout("reboot-service", "fe") == 35
    assert server_api.get_action_timeout("restart", "") == 90
    assert server_api.get_action_timeout("reboot-service", "all") == 90

    # start
    assert server_api.get_action_timeout("start", "backend") == 25
    assert server_api.get_action_timeout("start", "be") == 25
    assert server_api.get_action_timeout("start", "frontend") == 25
    assert server_api.get_action_timeout("start", "fe") == 25
    assert server_api.get_action_timeout("start", "comfy") == 35
    assert server_api.get_action_timeout("start", "wsl") == 35
    assert server_api.get_action_timeout("start", "") == 60
    assert server_api.get_action_timeout("start", "all") == 60

    # stop
    assert server_api.get_action_timeout("stop", "") == 25
    assert server_api.get_action_timeout("stop", "all") == 25
    assert server_api.get_action_timeout("stop", "backend") == 15
    assert server_api.get_action_timeout("stop", "comfy") == 15

    # default / other
    assert server_api.get_action_timeout("unknown", "backend") == 30


def test_api_action_reboot_backend_timeout_used(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps({"backend": {"wait_timeout_sec": 45}}), encoding="utf-8")
    monkeypatch.setattr(server_api, "CONFIG_FILE", config_path)
    handler = server_api.ManagerHandler.__new__(server_api.ManagerHandler)
    handler.path = "/api/action"
    sent_responses = []

    def fake_send_json(data, status=200):
        sent_responses.append((data, status))

    handler._send_json = fake_send_json
    payload = json.dumps({"action": "reboot-service", "service": "backend"}).encode("utf-8")
    handler.headers = {"Content-Length": str(len(payload))}
    mock_rfile = MagicMock()
    mock_rfile.read.return_value = payload
    handler.rfile = mock_rfile

    def successful_run(*args, **kwargs):
        for name in ("stdout", "stderr"):
            assert stat.S_ISREG(os.fstat(kwargs[name].fileno()).st_mode)
        kwargs["stdout"].write("ok".encode(locale.getpreferredencoding(False)))
        return MagicMock(returncode=0)

    with patch("subprocess.run", side_effect=successful_run) as mock_run:
        handler.do_POST()

    assert mock_run.called
    assert mock_run.call_args.kwargs.get("timeout") == 80
    assert len(sent_responses) == 1
    data, status_code = sent_responses[0]
    assert status_code == 200
    assert data["status"] == "ok"


@pytest.mark.parametrize(
    ("scenario", "expected", "should_throw"),
    [
        ("normal", "stop,closed,start,ready", False),
        ("stop-fails", "stop,closed,stop,closed", True),
        ("ready-fails", "stop,closed,start,ready", True),
    ],
)
def test_backend_restart_requires_close_and_readiness(scenario, expected, should_throw):
    powershell = shutil.which("powershell.exe")
    if not powershell:
        pytest.skip("PowerShell is required for the controlled restart harness")
    ps_script = Path(__file__).resolve().parent.parent.parent / "tools" / "server-manager" / "server-manager.ps1"
    escaped = str(ps_script).replace("'", "''")
    script = rf'''
$ErrorActionPreference = "Stop"
. '{escaped}' -Action none
$script:events = [System.Collections.Generic.List[string]]::new()
$script:closeResults = if ("{scenario}" -eq "stop-fails") {{ @($false, $false) }} else {{ @($true) }}
function Stop-BackendProcess {{ $script:events.Add("stop") }}
function Wait-For-Port-Closed ([int]$port, [int]$timeoutSec, [string]$serviceName) {{
  $script:events.Add("closed")
  $value = $script:closeResults[0]
  if ($script:closeResults.Count -gt 1) {{ $script:closeResults = @($script:closeResults | Select-Object -Skip 1) }}
  return $value
}}
function Start-BackendProcess ([bool]$asBackground) {{ $script:events.Add("start") }}
function Wait-For-Port ([int]$port, [int]$timeoutSec, [string]$serviceName) {{
  $script:events.Add("ready")
  return ("{scenario}" -ne "ready-fails")
}}
try {{ Invoke-BackendRestart $true; "RESULT=OK" }} catch {{ "RESULT=ERROR" }}
"EVENTS=$($script:events -join ',')"
'''
    result = subprocess.run(
        [powershell, "-NoProfile", "-NonInteractive", "-Command", script],
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
    assert f"EVENTS={expected}" in result.stdout
    assert f"RESULT={'ERROR' if should_throw else 'OK'}" in result.stdout


def test_status_concurrency_lock():
    """
    Concurrent requests should not invoke get_server_status more than once
    within the 2-second cache window; the lock prevents parallel calls.
    """
    import server_status as ss

    call_count = 0
    max_concurrent = 0
    concurrent_now = 0
    lock = threading.Lock()

    def fake_get_status(*args, **kwargs):
        nonlocal call_count, max_concurrent, concurrent_now
        with lock:
            concurrent_now += 1
            if concurrent_now > max_concurrent:
                max_concurrent = concurrent_now
            call_count += 1
        time.sleep(0.05)
        with lock:
            concurrent_now -= 1
        return {
            "fe": {"name": "React FE", "port": 5173, "running": False, "status": "STOPPED", "pids": []},
            "be": {"name": "Win BE", "port": 8000, "running": True, "status": "LISTEN", "pids": []},
            "comfy": {"name": "WSL ComfyUI", "port": 8188, "running": True, "status": "LISTEN", "pids": []},
        }

    server_api._last_status_cache = None
    server_api._last_status_time = 0.0

    errors = []

    def worker():
        handler = server_api.ManagerHandler.__new__(server_api.ManagerHandler)
        handler.path = "/api/status"
        handler.headers = {}
        local_responses = []
        handler._send_json = lambda d, status=200: local_responses.append((d, status))
        try:
            handler.do_GET()
            if not local_responses or local_responses[0][1] != 200:
                errors.append("Invalid response")
        except Exception as e:
            errors.append(str(e))

    with patch.object(ss, "get_server_status", side_effect=fake_get_status):
        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    assert len(errors) == 0
    assert max_concurrent <= 1


def test_read_log_file_tail_seek(tmp_path, monkeypatch):
    monkeypatch.setattr(server_api, "LOGS_DIR", tmp_path)
    
    # 1. Non-existent file
    exists, content, lines = server_api.read_log_file("nonexistent.log", tail_lines=10)
    assert not exists
    assert "未起動" in content
    assert lines == 0

    # 2. Small file (< 256KB)
    small_file = tmp_path / "small.log"
    small_lines = [f"line {i}\n" for i in range(50)]
    small_file.write_text("".join(small_lines), encoding="utf-8")
    exists, content, lines = server_api.read_log_file("small.log", tail_lines=10)
    assert exists
    assert lines == 50
    ret_lines = content.splitlines(keepends=True)
    assert len(ret_lines) == 10
    assert ret_lines == small_lines[-10:]

    # 3. Large file (> 256KB)
    large_file = tmp_path / "large.log"
    # Each line ~100 chars, write 4000 lines (~400KB)
    large_lines = [f"log entry number {i:06d} padding " + "x" * 70 + "\n" for i in range(4000)]
    large_file.write_bytes("".join(large_lines).encode("utf-8"))
    exists, content, lines = server_api.read_log_file("large.log", tail_lines=15)
    assert exists
    ret_lines = content.splitlines(keepends=True)
    assert len(ret_lines) == 15
    assert ret_lines == large_lines[-15:]


def test_manager_handler_log_message():
    handler = server_api.ManagerHandler.__new__(server_api.ManagerHandler)
    handler.client_address = ("127.0.0.1", 12345)

    with patch.object(server_api._logger, "info") as mock_logger:
        handler.log_message("Test message %s %d", "foo", 42)
        assert mock_logger.called
        msg = mock_logger.call_args[0][0]
        assert "Test message foo 42" in msg
        assert "127.0.0.1" in msg
