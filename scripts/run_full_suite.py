"""Gate 2 wrapper: run the frontend and backend full suites; exit non-zero if any part fails.

Declared as the single Gate 2 command in .agents/verification.json. Both parts always run, so
one failure cannot hide the other. Commands mirror .agents/context.md (Gate 2).
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_PYTHON = str(ROOT / "backend" / ".venv" / "Scripts" / "python.exe")

SUITES = (
    ("frontend full suite", ["npm.cmd", "--prefix", "frontend", "test"]),
    ("backend full suite (parallel)", [BACKEND_PYTHON, "-m", "pytest", "-n", "auto"]),
)


def main() -> int:
    failed = []
    for label, argv in SUITES:
        print(f"== {label}: {' '.join(argv)}", flush=True)
        code = subprocess.run(argv, cwd=ROOT).returncode
        print(f"== {label}: exit {code}", flush=True)
        if code != 0:
            failed.append(label)
    if failed:
        print("FAILED: " + ", ".join(failed), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
