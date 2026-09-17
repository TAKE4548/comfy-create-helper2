import json
import socket
import subprocess
import threading
import time
from unittest.mock import patch, MagicMock
import pytest
import sys
from pathlib import Path

# Add tools/server-manager to sys.path
SM_DIR = Path(__file__).resolve().parent.parent.parent / "tools" / "server-manager"
if str(SM_DIR) not in sys.path:
    sys.path.insert(0, str(SM_DIR))

import server_api


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

    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=["powershell.exe"], timeout=35)):
        handler.do_POST()

    assert len(sent_responses) == 1
    data, status_code = sent_responses[0]
    assert status_code == 504
    assert data.get("status") == "timeout"
    assert "timed out after 35s" in data.get("error", "").lower() or "timed out" in data.get("error", "").lower()


def test_get_action_timeout_matrix():
    # restart / reboot-service
    assert server_api.get_action_timeout("restart", "backend") == 35
    assert server_api.get_action_timeout("reboot-service", "be") == 35
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


def test_api_action_reboot_backend_timeout_used():
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

    mock_res = MagicMock(stdout="ok", stderr="")
    with patch("subprocess.run", return_value=mock_res) as mock_run:
        handler.do_POST()

    assert mock_run.called
    assert mock_run.call_args.kwargs.get("timeout") == 35
    assert len(sent_responses) == 1
    data, status_code = sent_responses[0]
    assert status_code == 200
    assert data["status"] == "ok"


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


