"""Run a command with a given repository-relative working directory (no shell).

Usage: python scripts/run_in_dir.py <relative-dir> <command> [args...]
The verification profile (.agents/verification.json) declares argv without a shell, so
`cd frontend; <command>` from .agents/context.md is expressed through this wrapper.
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: run_in_dir.py <relative-dir> <command> [args...]", file=sys.stderr)
        return 2
    target = (ROOT / sys.argv[1]).resolve()
    if ROOT != target and ROOT not in target.parents:
        print(f"directory escapes the repository: {sys.argv[1]}", file=sys.stderr)
        return 2
    if not target.is_dir():
        print(f"directory not found: {sys.argv[1]}", file=sys.stderr)
        return 2
    return subprocess.run(sys.argv[2:], cwd=target).returncode


if __name__ == "__main__":
    sys.exit(main())
