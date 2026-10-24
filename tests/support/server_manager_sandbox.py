"""Ephemeral Manager + fake ComfyUI servers for browser integration tests."""
from __future__ import annotations

import json
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[2]
MANAGER_MODULE = ROOT / "tools" / "server-manager"
sys.path.insert(0, str(MANAGER_MODULE))


class FakeComfyHandler(BaseHTTPRequestHandler):
    state = {"running": [], "pending": [], "free_delay": 0.0, "free_status": 200,
             "free_count": 0, "native_payloads": [], "queue_mode": "normal",
             "comfy_stopped": False, "active_free": 0}
    lock = threading.Lock()
    free_started = threading.Event()
    release_free = threading.Event()
    shutdown_event = threading.Event()

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def send_json(self, value: object, status: int = 200) -> None:
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        with self.lock:
            if path == "/queue":
                mode = self.state["queue_mode"]
                response = {"queue_running": list(self.state["running"]),
                            "queue_pending": list(self.state["pending"])}
            elif path == "/control/metrics":
                response = {key: value for key, value in self.state.items()
                            if key in {"free_count", "native_payloads", "active_free"}}
            else:
                response = {"error": "not found"}
        if path == "/queue" and mode == "http-error":
            self.send_json({"error": "fake queue failure"}, 500)
        elif path == "/queue" and mode == "malformed":
            self.send_response(200)
            self.send_header("Content-Length", "1")
            self.end_headers()
            self.wfile.write(b"{")
        else:
            self.send_json(response, 200 if path in {"/queue", "/control/metrics"} else 404)

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        if path == "/control/state":
            try:
                value = json.loads(raw or b"{}")
                with self.lock:
                    if "running" in value:
                        self.state["running"] = value["running"]
                    if "pending" in value:
                        self.state["pending"] = value["pending"]
                    if "free_delay" in value:
                        self.state["free_delay"] = float(value["free_delay"])
                    if "free_status" in value:
                        self.state["free_status"] = int(value["free_status"])
                    if "queue_mode" in value:
                        self.state["queue_mode"] = value["queue_mode"]
                    if "comfy_stopped" in value:
                        self.state["comfy_stopped"] = bool(value["comfy_stopped"])
                        if getattr(self, "config_path", None):
                            config = json.loads(self.config_path.read_text(encoding="utf-8"))
                            config["wsl"]["port"] = 0 if self.state["comfy_stopped"] else self.server.server_address[1]
                            self.config_path.write_text(json.dumps(config), encoding="utf-8")
                    self.state["free_count"] = 0
                    self.state["native_payloads"] = []
                    self.free_started.clear()
                    self.release_free.clear()
                invalidate = getattr(self, "invalidate_status", None)
                if invalidate:
                    invalidate()
                self.send_json({"status": "ok"})
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                self.send_json({"error": f"invalid control payload: {exc}"}, 400)
            return
        if path == "/control/release":
            self.release_free.set()
            self.send_json({"status": "ok"})
            return
        if path == "/control/shutdown":
            self.shutdown_event.set()
            self.send_json({"status": "ok"})
            return
        if path != "/free":
            self.send_json({"error": "not found"}, 404)
            return
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            payload = None
        with self.lock:
            self.state["free_count"] += 1
            self.state["active_free"] += 1
            self.state["native_payloads"].append(payload)
            delay = self.state["free_delay"]
            status = self.state["free_status"]
        self.free_started.set()
        if delay:
            self.release_free.wait(timeout=delay)
        body = b"" if status == 200 else b'{"error":"fake failure"}'
        self.send_response(status)
        if body:
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
        else:
            self.send_header("Content-Length", "0")
        self.end_headers()
        if body:
            self.wfile.write(body)
        with self.lock:
            self.state["active_free"] -= 1


def main() -> int:
    import server_api

    production_config = (MANAGER_MODULE / "config.json").resolve()
    temporary = tempfile.TemporaryDirectory(prefix="manager-e2e-")
    config_path = Path(temporary.name) / "config.json"
    try:
        comfy = ThreadingHTTPServer(("127.0.0.1", 0), FakeComfyHandler)
        comfy.daemon_threads = True
        comfy_port = comfy.server_address[1]
        if config_path.resolve() == production_config:
            raise RuntimeError("sandbox config must not be production config")
        config_path.write_text(json.dumps({
            "wsl": {"port": comfy_port},
            "backend": {"port": 0},
            "frontend": {"port": 0},
        }), encoding="utf-8")
        FakeComfyHandler.config_path = config_path
        FakeComfyHandler.shutdown_event = threading.Event()
        server_api.CONFIG_FILE = config_path
        FakeComfyHandler.invalidate_status = lambda _handler: setattr(server_api, "_last_status_cache", None)
        # Manager requests must not write to the production rotating log.
        for handler in list(server_api._logger.handlers):
            server_api._logger.removeHandler(handler)
            handler.close()
        server_api._logger.addHandler(__import__("logging").NullHandler())

        manager = server_api.ThreadedTCPServer(("127.0.0.1", 0), server_api.ManagerHandler)
        manager.daemon_threads = True
        fake_thread = threading.Thread(target=comfy.serve_forever, daemon=True)
        manager_thread = threading.Thread(target=manager.serve_forever, daemon=True)
        fake_thread.start()
        manager_thread.start()
        host, port = manager.server_address[:2]
        print(json.dumps({"manager_url": f"http://{host}:{port}",
                          "control_url": f"http://127.0.0.1:{comfy_port}"}), flush=True)
        FakeComfyHandler.shutdown_event.wait()
    except KeyboardInterrupt:
        return 0
    finally:
        if "manager" in locals():
            manager.shutdown()
            manager.server_close()
        if "comfy" in locals():
            comfy.shutdown()
            comfy.server_close()
        temporary.cleanup()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
