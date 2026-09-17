"""Unit tests for Windows EventLoop defense module."""

import asyncio
from unittest.mock import MagicMock, patch
import pytest

from app.utils.windows_loop_defense import (
    TRANSIENT_WINERRORS,
    apply_windows_loop_defense,
    patch_proactor_start_serving,
)


def test_apply_windows_loop_defense_returns_true():
    """Verify apply_windows_loop_defense runs and returns True."""
    result = apply_windows_loop_defense(force=True)
    assert result is True


def test_patch_proactor_start_serving():
    """Verify patch_proactor_start_serving marks the class as patched."""
    import asyncio.proactor_events as proactor_events

    success = patch_proactor_start_serving()
    assert success is True
    assert getattr(proactor_events.BaseProactorEventLoop, "_windows_defense_patched", False) is True


def test_transient_winerror_does_not_close_sock():
    """Verify transient winerrors (e.g. 64, 1236, 10054) do not close listener socket."""
    import asyncio.proactor_events as proactor_events

    patch_proactor_start_serving()

    # Create a mock loop instance mimicking BaseProactorEventLoop
    loop_inst = object.__new__(proactor_events.BaseProactorEventLoop)
    loop_inst._thread_id = None
    loop_inst._closed = True
    loop_inst._accept_futures = {}
    loop_inst._debug = False
    loop_inst.is_closed = MagicMock(return_value=False)
    loop_inst.call_exception_handler = MagicMock()

    scheduled_callbacks = []
    loop_inst.call_soon = MagicMock(side_effect=lambda cb: scheduled_callbacks.append(cb))

    mock_proactor = MagicMock()
    next_future = MagicMock()
    mock_proactor.accept.return_value = next_future
    loop_inst._proactor = mock_proactor

    mock_sock = MagicMock()
    mock_sock.fileno.return_value = 10

    # Call patched _start_serving
    protocol_factory = MagicMock()
    loop_inst._start_serving(protocol_factory, mock_sock)

    assert len(scheduled_callbacks) == 1
    inner_loop_func = scheduled_callbacks[0]

    # Test each transient error
    for win_err in (64, 1236, 10053, 10054):
        mock_sock.close.reset_mock()
        mock_proactor.accept.reset_mock()
        loop_inst.call_exception_handler.reset_mock()

        err_future = MagicMock()
        exc = OSError(f"Windows transient error {win_err}")
        exc.winerror = win_err
        err_future.result.side_effect = exc

        # Execute the inner loop with the transient error future
        inner_loop_func(err_future)

        # Ensure sock was NOT closed
        mock_sock.close.assert_not_called()
        # Ensure exception handler was NOT called
        loop_inst.call_exception_handler.assert_not_called()
        # Ensure accept was re-issued to keep listener alive
        mock_proactor.accept.assert_called_once_with(mock_sock)
        next_future.add_done_callback.assert_called_once_with(inner_loop_func)
    loop_inst.is_closed.return_value = True


def test_fatal_oserror_closes_sock():
    """Verify non-transient fatal OSError triggers exception handler and closes sock."""
    import asyncio.proactor_events as proactor_events

    patch_proactor_start_serving()

    loop_inst = object.__new__(proactor_events.BaseProactorEventLoop)
    loop_inst._thread_id = None
    loop_inst._closed = True
    loop_inst._accept_futures = {}
    loop_inst._debug = False
    loop_inst.is_closed = MagicMock(return_value=False)
    loop_inst.call_exception_handler = MagicMock()

    scheduled_callbacks = []
    loop_inst.call_soon = MagicMock(side_effect=lambda cb: scheduled_callbacks.append(cb))

    mock_proactor = MagicMock()
    loop_inst._proactor = mock_proactor

    mock_sock = MagicMock()
    mock_sock.fileno.return_value = 10

    protocol_factory = MagicMock()
    loop_inst._start_serving(protocol_factory, mock_sock)

    inner_loop_func = scheduled_callbacks[0]

    fatal_future = MagicMock()
    exc = OSError("Fatal socket error")
    exc.winerror = 5  # Access denied, not transient
    fatal_future.result.side_effect = exc

    inner_loop_func(fatal_future)

    # Must call exception handler and close socket
    loop_inst.call_exception_handler.assert_called_once()
    mock_sock.close.assert_called_once()
    loop_inst.is_closed.return_value = True


def test_cancelled_error_closes_sock():
    """Verify CancelledError closes sock cleanly."""
    import asyncio.proactor_events as proactor_events

    patch_proactor_start_serving()

    loop_inst = object.__new__(proactor_events.BaseProactorEventLoop)
    loop_inst._thread_id = None
    loop_inst._closed = True
    loop_inst._accept_futures = {}
    loop_inst._debug = False
    loop_inst.is_closed = MagicMock(return_value=False)
    loop_inst.call_exception_handler = MagicMock()

    scheduled_callbacks = []
    loop_inst.call_soon = MagicMock(side_effect=lambda cb: scheduled_callbacks.append(cb))

    mock_proactor = MagicMock()
    loop_inst._proactor = mock_proactor

    mock_sock = MagicMock()
    mock_sock.fileno.return_value = 10

    protocol_factory = MagicMock()
    loop_inst._start_serving(protocol_factory, mock_sock)

    inner_loop_func = scheduled_callbacks[0]

    cancel_future = MagicMock()
    cancel_future.result.side_effect = asyncio.CancelledError()

    inner_loop_func(cancel_future)

    mock_sock.close.assert_called_once()
    loop_inst.is_closed.return_value = True

