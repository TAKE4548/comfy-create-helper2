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

    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=["powershell.exe"], timeout=15)):
        handler.do_POST()

    assert len(sent_responses) == 1
    data, status_code = sent_responses[0]
    assert status_code == 504
    assert data.get("status") == "timeout"
    assert "timed out" in data.get("error", "").lower() or "タイムアウト" in data.get("error", "")


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

