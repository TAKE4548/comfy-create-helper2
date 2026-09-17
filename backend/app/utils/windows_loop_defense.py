"""Windows Asyncio EventLoop defense module.

Protects FastAPI / Uvicorn against listener socket collapse caused by
transient Windows Proactor connection reset errors (e.g. WinError 64, 1236, 10053, 10054).
Also configures WindowsSelectorEventLoopPolicy where appropriate.
"""

import asyncio
import logging
import sys
from typing import Set

logger = logging.getLogger(__name__)

TRANSIENT_WINERRORS: Set[int] = {64, 1236, 10053, 10054}

_PATCH_APPLIED = False


def patch_proactor_start_serving() -> bool:
    """Safely monkey-patch BaseProactorEventLoop._start_serving to ignore transient
    connection reset errors without closing the listener socket.
    """
    try:
        import asyncio.proactor_events as proactor_events

        if not hasattr(proactor_events, "BaseProactorEventLoop"):
            return False

        target_cls = proactor_events.BaseProactorEventLoop
        if getattr(target_cls, "_windows_defense_patched", False):
            return True

        def patched_start_serving(
            self,
            protocol_factory,
            sock,
            sslcontext=None,
            server=None,
            backlog=100,
            ssl_handshake_timeout=None,
            ssl_shutdown_timeout=None,
        ):
            extra_kwargs = {}
            if ssl_handshake_timeout is not None:
                extra_kwargs["ssl_handshake_timeout"] = ssl_handshake_timeout
            if ssl_shutdown_timeout is not None:
                extra_kwargs["ssl_shutdown_timeout"] = ssl_shutdown_timeout

            def loop(f=None):
                try:
                    if f is not None:
                        conn, addr = f.result()
                        if self._debug:
                            logger.debug(
                                "%r got a new connection from %r: %r", server, addr, conn
                            )
                        protocol = protocol_factory()
                        if sslcontext is not None:
                            self._make_ssl_transport(
                                conn,
                                protocol,
                                sslcontext,
                                server_side=True,
                                extra={"peername": addr},
                                server=server,
                                **extra_kwargs,
                            )
                        else:
                            self._make_socket_transport(
                                conn, protocol, extra={"peername": addr}, server=server
                            )
                    if self.is_closed():
                        return
                    f = self._proactor.accept(sock)
                except OSError as exc:
                    winerr = getattr(exc, "winerror", None)
                    if winerr in TRANSIENT_WINERRORS:
                        logger.warning(
                            "Ignored transient Windows accept error [WinError %s]. Preserving listener socket.",
                            winerr,
                        )
                        if not self.is_closed() and sock.fileno() != -1:
                            try:
                                f = self._proactor.accept(sock)
                                f.add_done_callback(loop)
                            except Exception as retry_exc:
                                logger.error(
                                    "Failed to re-issue accept after transient error: %s",
                                    retry_exc,
                                )
                        return
                    if sock.fileno() != -1:
                        self.call_exception_handler(
                            {
                                "message": "Accept failed on a socket",
                                "exception": exc,
                                "socket": sock,
                            }
                        )
                        sock.close()
                    elif self._debug:
                        logger.debug("Accept failed on socket %r", sock, exc_info=True)
                except asyncio.CancelledError:
                    sock.close()
                else:
                    f.add_done_callback(loop)

            self.call_soon(loop)

        target_cls._start_serving = patched_start_serving
        target_cls._windows_defense_patched = True
        return True
    except Exception as e:
        logger.warning("Failed to apply proactor start_serving monkeypatch: %s", e)
        return False


def apply_windows_loop_defense(force: bool = False) -> bool:
    """Windows環境においてSelectorEventLoopPolicyの設定および

    ProactorEventLoopの一時的切断エラー([WinError 64, 1236, 10054]等)による
    リスナーソケットcloseクラッシュを防御するモンキーパッチを適用する。
    """
    global _PATCH_APPLIED
    if sys.platform != "win32" and not force:
        return True

    # 1. SelectorEventLoopPolicy
    if hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
            logger.info("Applied WindowsSelectorEventLoopPolicy.")
        except Exception as e:
            logger.warning("Could not set WindowsSelectorEventLoopPolicy: %s", e)

    # 2. Proactor monkeypatch
    patch_proactor_start_serving()

    _PATCH_APPLIED = True
    return True
