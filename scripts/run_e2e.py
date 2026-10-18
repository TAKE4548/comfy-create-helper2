"""Gate 3 wrapper: start the Vite dev server, run the Playwright E2E suite, then stop the server.

Declared as a fixed Gate 3 command in .agents/verification.json. playwright.config.ts has no
webServer entry and expects http://localhost:5173, so this wrapper owns the server lifecycle.
Exit code is Playwright's, or 1 if the server never became ready.
"""

import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
PORT = 5173
READY_TIMEOUT_SECONDS = 90
WORKERS = 2


def port_open() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        return probe.connect_ex(("127.0.0.1", PORT)) == 0


def stop_tree(server: subprocess.Popen) -> None:
    subprocess.run(["taskkill", "/T", "/F", "/PID", str(server.pid)],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> int:
    if port_open():
        print(f"port {PORT} is already in use; stop the other server first", file=sys.stderr)
        return 1
    server = subprocess.Popen(
        ["npm.cmd", "run", "dev", "--", "--port", str(PORT), "--strictPort"],
        cwd=FRONTEND, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + READY_TIMEOUT_SECONDS
        while not port_open():
            if server.poll() is not None or time.monotonic() > deadline:
                print("dev server did not become ready", file=sys.stderr)
                return 1
            time.sleep(0.5)
        extra = sys.argv[1:]  # optional Playwright arguments, e.g. a spec path for a focused run
        # Few workers: the Vite dev server compiles on demand, and many parallel workers push
        # the hover/overlay specs past their 10 s timeout (observed with the default worker count).
        argv = ["npm.cmd", "exec", "--", "playwright", "test", f"--workers={WORKERS}", *extra]
        return subprocess.run(argv, cwd=FRONTEND).returncode
    finally:
        stop_tree(server)


if __name__ == "__main__":
    sys.exit(main())
