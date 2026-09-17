"""
tests/unit/test_server_status.py
Unit tests for tools/server-manager/server_status.py (REQ-246)
"""

import socket
import sys
import threading
import time
from pathlib import Path
from unittest.mock import patch

import pytest

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

    with patch.object(server_status, "check_port_listening", side_effect=fake_check):
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

    with patch.object(server_status, "check_port_listening", side_effect=fake_check):
        with patch.object(server_status, "is_frontend_bundled", return_value=False):
            result = server_status.get_server_status(dist_index_path=non_existent)

    assert result["fe"]["status"] == "LISTEN"
    assert result["fe"]["running"] is True
    assert result["fe"]["name"] == "React FE (Dev: 5173)"
    assert result["comfy"]["status"] == "STOPPED"
    assert result["comfy"]["running"] is False


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
