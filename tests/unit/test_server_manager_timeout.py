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


def test_api_status_powershell_timeout():
    handler = server_api.ManagerHandler.__new__(server_api.ManagerHandler)
    handler.path = "/api/status"
    sent_responses = []

    def fake_send_json(data, status=200):
        sent_responses.append((data, status))

    handler._send_json = fake_send_json

    # Mock subprocess.run raising TimeoutExpired
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=["powershell.exe"], timeout=6)):
        # Also mock check_port_listening to return True for FE/BE and False for Comfy
        def fake_check_port(port, timeout=0.5):
            if port == 8000:
                return True
            if port == 5173:
                return False
            return False

        with patch.object(server_api, "check_port_listening", side_effect=fake_check_port):
            # Reset cache if any
            server_api._last_status_cache = None
            server_api._last_status_time = 0.0

            handler.do_GET()

    assert len(sent_responses) == 1
    data, status_code = sent_responses[0]
    assert status_code == 200
    assert "fe" in data
    assert "be" in data
    assert "comfy" in data

    assert data["comfy"]["status"] == "TIMEOUT"
    assert data["comfy"]["running"] is False
    assert "タイムアウト" in data["comfy"].get("error", "")

    assert data["be"]["running"] is True
    assert data["be"]["status"] == "LISTEN"
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
    # Test that concurrent requests do not spawn multiple concurrent powershell processes
    # and either use cache or wait on the lock
    concurrent_calls = 0
    max_concurrent_calls = 0
    lock = threading.Lock()

    def fake_run(*args, **kwargs):
        nonlocal concurrent_calls, max_concurrent_calls
        with lock:
            concurrent_calls += 1
            if concurrent_calls > max_concurrent_calls:
                max_concurrent_calls = concurrent_calls
        time.sleep(0.05)
        with lock:
            concurrent_calls -= 1
        res = MagicMock()
        res.stdout = json.dumps({
            "fe": {"name": "React FE", "port": 5173, "running": False, "status": "STOPPED", "pids": []},
            "be": {"name": "Win BE", "port": 8000, "running": True, "status": "LISTEN", "pids": [1234]},
            "comfy": {"name": "WSL ComfyUI", "port": 8188, "running": True, "status": "LISTEN", "pids": [5678]}
        })
        res.stderr = ""
        return res

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

    with patch("subprocess.run", side_effect=fake_run):
        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    assert len(errors) == 0
    assert max_concurrent_calls <= 1
