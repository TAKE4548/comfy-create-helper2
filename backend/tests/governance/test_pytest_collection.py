"""Collection guard: the root pytest run must skip docs/logs (git-ignored evidence copies)."""
from __future__ import annotations

import configparser
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
ROOT_INI = REPO_ROOT / "pytest.ini"
PYTEST_DEFAULTS = {".*", "build", "dist", "node_modules", "venv", "*.egg", "_darcs", "CVS", "{arch}"}
PROBE = "def test_probe() -> None:\n    assert True\n"


def _norecursedirs() -> list[str]:
    parser = configparser.ConfigParser(interpolation=None)
    assert parser.read(ROOT_INI, encoding="utf-8"), f"missing {ROOT_INI}"
    return parser.get("pytest", "norecursedirs").split()


def _write(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(PROBE, encoding="utf-8", newline="\n")


def _collect(cwd: Path) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if not k.startswith("PYTEST_")}
    return subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider"],
        cwd=cwd, env=env, capture_output=True, text=True, timeout=120,
    )


def test_root_pytest_ini_excludes_docs_logs_and_keeps_pytest_defaults() -> None:
    """norecursedirs replaces pytest defaults; dropping them would collect .venv/node_modules."""
    patterns = set(_norecursedirs())
    assert "docs/logs" in patterns
    assert PYTEST_DEFAULTS <= patterns


@pytest.mark.parametrize("with_ini", [True, False])
def test_collection_skips_docs_logs_copies_with_duplicate_basenames(tmp_path: Path, with_ini: bool) -> None:
    """Behavioural: same-basename copies under docs/logs, .venv, node_modules must not be collected.
    The no-ini control proves the probe really reproduces the 'import file mismatch' failure."""
    if with_ini:
        shutil.copy(ROOT_INI, tmp_path / "pytest.ini")
    _write(tmp_path / "tests" / "test_dup.py")
    for ignored in ("docs/logs/x/tests", ".venv/lib", "node_modules/pkg"):
        _write(tmp_path / ignored / "test_dup.py")
    proc = _collect(tmp_path)
    out = (proc.stdout + proc.stderr).replace("\\", "/")
    if with_ini:
        assert proc.returncode == 0, out
        assert "tests/test_dup.py::test_probe" in out
        assert "docs/logs" not in out
        assert "1 test collected" in out
    else:
        assert proc.returncode != 0, out  # control: duplicates collide without the ini


def test_docs_logs_has_no_tracked_files() -> None:
    """Anything tracked under docs/logs would be silently excluded from collection."""
    git = shutil.which("git")
    if git is None:
        pytest.skip("git is not available")
    proc = subprocess.run(
        [git, "-C", str(REPO_ROOT), "ls-files", "--", "docs/logs"],
        capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == ""
