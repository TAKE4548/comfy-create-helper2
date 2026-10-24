"""
tests/unit/test_server_status.py
Unit tests for tools/server-manager/server_status.py (REQ-246)
"""

import socket
import json
import sys
import threading
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from hypothesis import given, settings, strategies as st

# Add tools/server-manager to sys.path
SM_DIR = Path(__file__).resolve().parent.parent.parent / "tools" / "server-manager"
if str(SM_DIR) not in sys.path:
    sys.path.insert(0, str(SM_DIR))

import server_status


# ---------------------------------------------------------------------------
# test_check_port_listening
# ---------------------------------------------------------------------------

def test_check_port_listening():
    """Open a real local socket and verify True; closed port returns False."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    sock.listen(1)
    port = sock.getsockname()[1]

    try:
        assert server_status.check_port_listening(port, timeout=0.5) is True
    finally:
        sock.close()

    # After close the port should be unreachable
    assert server_status.check_port_listening(port, timeout=0.1) is False


def test_check_port_listening_graceful_shutdown():
    """Verify check_port_listening calls shutdown before close on successful connection."""
    from unittest.mock import MagicMock

    mock_sock = MagicMock()
    with patch("socket.create_connection", return_value=mock_sock):
        result = server_status.check_port_listening(8000, timeout=0.5)

    assert result is True
    mock_sock.shutdown.assert_called_once_with(socket.SHUT_RDWR)
    mock_sock.close.assert_called_once()


def test_check_port_listening_shutdown_oserror_suppressed():
    """Verify OSError during shutdown is safely suppressed and close is called."""
    from unittest.mock import MagicMock

    mock_sock = MagicMock()
    mock_sock.shutdown.side_effect = OSError("Connection reset by peer")
    with patch("socket.create_connection", return_value=mock_sock):
        result = server_status.check_port_listening(8000, timeout=0.5)

    assert result is True
    mock_sock.shutdown.assert_called_once_with(socket.SHUT_RDWR)
    mock_sock.close.assert_called_once()


# ---------------------------------------------------------------------------
# test_is_frontend_bundled
# ---------------------------------------------------------------------------

def test_is_frontend_bundled(tmp_path):
    """Verify is_frontend_bundled returns True only when index.html exists."""
    index_file = tmp_path / "index.html"

    assert server_status.is_frontend_bundled(index_file) is False

    index_file.touch()
    assert server_status.is_frontend_bundled(index_file) is True


# ---------------------------------------------------------------------------
# test_get_server_status_bundled
# ---------------------------------------------------------------------------

def test_get_server_status_bundled(tmp_path):
    """
    Backend running + BUNDLED mode:
      fe.status == "BUNDLED", fe.running == True (inherits be_running)
    """
    # Create frontend/dist/index.html so is_frontend_bundled returns True
    dist_index = tmp_path / "index.html"
    dist_index.touch()

    def fake_check(port, timeout=0.5):
        if port == 8000:
            return True   # backend is up
        if port == 5173:
            return False  # frontend dev server is NOT up
        if port == 8188:
            return True   # comfy is up
        return False

    with patch.object(server_status, "check_port_listening", side_effect=fake_check), \
            patch.object(server_status.comfy_memory, "get_comfy_execution_state", return_value={
                "execution_state": "idle", "queue_running": 0, "queue_pending": 0}):
        result = server_status.get_server_status(dist_index_path=dist_index)

    assert result["fe"]["status"] == "BUNDLED"
    assert result["fe"]["running"] is True        # inherits be_running (True)
    assert result["fe"]["name"] == "React FE (Bundled on 8000)"
    assert result["be"]["status"] == "LISTEN"
    assert result["be"]["running"] is True
    assert result["comfy"]["status"] == "LISTEN"
    assert result["comfy"]["running"] is True


# ---------------------------------------------------------------------------
# test_get_server_status_dev
# ---------------------------------------------------------------------------

def test_get_server_status_dev():
    """
    Frontend dev server running on 5173:
      fe.status == "LISTEN", fe.running == True
    """
    def fake_check(port, timeout=0.5):
        if port == 5173:
            return True   # dev server is up
        if port == 8000:
            return True   # backend is up
        if port == 8188:
            return False  # comfy is down
        return False

    non_existent = Path("/non/existent/index.html")

    with patch.object(server_status, "check_port_listening", side_effect=fake_check), \
            patch.object(server_status.comfy_memory, "get_comfy_execution_state", return_value={
                "execution_state": "unknown", "queue_running": None, "queue_pending": None}):
        with patch.object(server_status, "is_frontend_bundled", return_value=False):
            result = server_status.get_server_status(dist_index_path=non_existent)

    assert result["fe"]["status"] == "LISTEN"
    assert result["fe"]["running"] is True
    assert result["fe"]["name"] == "React FE (Dev: 5173)"
    assert result["comfy"]["status"] == "STOPPED"
    assert result["comfy"]["running"] is False
    assert result["comfy"]["execution_state"] == "unknown"


@pytest.mark.parametrize("body,state,running,pending", [
    (b'{"queue_running":[],"queue_pending":[]}', "idle", 0, 0),
    (b'{"queue_running":[{}],"queue_pending":[]}', "executing", 1, 0),
    (b'{"queue_running":[],"queue_pending":[{}]}', "queued", 0, 1),
], ids=["[REQ-380/AC-1]-idle", "[REQ-380/AC-1]-executing", "[REQ-380/AC-1]-queued"])
def test_req380_queue_transport_local_http(body, state, running, pending):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class QueueHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    listener = ThreadingHTTPServer(("127.0.0.1", 0), QueueHandler)
    thread = threading.Thread(target=listener.serve_forever, daemon=True)
    thread.start()
    try:
        result = server_status.comfy_memory.get_comfy_execution_state(listener.server_address[1])
    finally:
        listener.shutdown()
        listener.server_close()
        thread.join()
    assert result["execution_state"] == state
    assert result["queue_running"] == running
    assert result["queue_pending"] == pending


@pytest.mark.parametrize("body", [b"[]", b"{}", b"not-json"],
                         ids=["[REQ-380/AC-1]-wrong-shape", "[REQ-380/AC-1]-missing-arrays", "[REQ-380/AC-1]-malformed"])
def test_req380_bad_queue_fails_closed(body):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class QueueHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    listener = ThreadingHTTPServer(("127.0.0.1", 0), QueueHandler)
    thread = threading.Thread(target=listener.serve_forever, daemon=True)
    thread.start()
    try:
        result = server_status.comfy_memory.get_comfy_execution_state(listener.server_address[1])
    finally:
        listener.shutdown()
        listener.server_close()
        thread.join()
    assert result["execution_state"] == "unknown"
    assert result["queue_running"] is None and result["queue_pending"] is None
    assert result["execution_error"]


def test_REQ_380_status_keeps_fe_be_and_numeric_queue_counts(tmp_path, monkeypatch):
    config = tmp_path / "manager-config.json"
    config.write_text('{"frontend":{"port":5173},"backend":{"port":8000},"wsl":{"port":8188}}',
                      encoding="utf-8")
    monkeypatch.setattr(server_status, "check_port_listening", lambda _port, timeout=0.5: True)
    monkeypatch.setattr(server_status, "is_frontend_bundled", lambda _path=None: False)
    monkeypatch.setattr(server_status.comfy_memory, "get_comfy_execution_state", lambda _port: {
        "execution_state": "queued", "queue_running": 0, "queue_pending": 2})
    result = server_status.get_server_status(config_path=config)
    assert result["fe"]["running"] is True and result["be"]["running"] is True
    assert result["comfy"]["execution_state"] == "queued"
    assert result["comfy"]["queue_running"] == 0 and result["comfy"]["queue_pending"] == 2


_json_leaf = st.none() | st.booleans() | st.integers() | st.text(max_size=8)
_json_value = st.recursive(
    _json_leaf,
    lambda children: st.lists(children, max_size=3)
    | st.dictionaries(st.text(max_size=6), children, max_size=3),
    max_leaves=8,
)


@settings(max_examples=8, deadline=None)
@given(running=st.lists(_json_value, max_size=3), pending=st.lists(_json_value, max_size=3))
@pytest.mark.parametrize("_case", [pytest.param(None, id="[REQ-380/AC-1]-recursive-json")])
def test_REQ_380_recursive_queue_envelopes_fail_closed_only_when_busy(running, pending, _case):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    body = json.dumps({"queue_running": running, "queue_pending": pending, "unrelated": {"ignored": True}}).encode()

    class QueueHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    listener = ThreadingHTTPServer(("127.0.0.1", 0), QueueHandler)
    thread = threading.Thread(target=listener.serve_forever, daemon=True)
    thread.start()
    try:
        result = server_status.comfy_memory.get_comfy_execution_state(listener.server_address[1])
    finally:
        listener.shutdown()
        listener.server_close()
        thread.join()
    expected = "executing" if running else "queued" if pending else "idle"
    assert result["execution_state"] == expected
    assert result["queue_running"] == len(running)
    assert result["queue_pending"] == len(pending)


# ---------------------------------------------------------------------------
# test_get_server_status_all_stopped
# ---------------------------------------------------------------------------

def test_get_server_status_all_stopped(tmp_path):
    """All services down and no bundle: fe.status == STOPPED."""
    dist_index = tmp_path / "no_index.html"  # does NOT exist

    with patch.object(server_status, "check_port_listening", return_value=False):
        result = server_status.get_server_status(dist_index_path=dist_index)

    assert result["fe"]["status"] == "STOPPED"
    assert result["fe"]["running"] is False
    assert result["be"]["status"] == "STOPPED"
    assert result["comfy"]["status"] == "STOPPED"
