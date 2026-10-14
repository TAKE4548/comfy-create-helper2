"""Directory hierarchy and test naming governance tests (REQ-356 AC-1, AC-2)."""
import pathlib
import re
import pytest


def test_backend_tests_hierarchy_and_no_req_naming() -> None:
    """[REQ-356/AC-1][REQ-356/AC-2] backend/tests only contains conftest.py, unit/, integration/, governance/."""
    root = pathlib.Path(__file__).resolve().parents[1]
    allowed_dirs = {"unit", "integration", "governance", "__pycache__"}
    for item in root.iterdir():
        if item.is_file():
            assert item.name == "conftest.py", f"Unexpected file in backend/tests root: {item.name}"
        elif item.is_dir():
            assert item.name in allowed_dirs, f"Unexpected directory in backend/tests root: {item.name}"
        assert not re.search(r"req\d+", item.name, re.IGNORECASE), f"REQ ticket in name: {item.name}"


def test_no_req_files_in_backend_tests() -> None:
    """[REQ-356/AC-1] No test files in backend/tests contain req[0-9]+ or REQ-[0-9]+ in their path."""
    root = pathlib.Path(__file__).resolve().parents[1]
    pattern = re.compile(r"req[-_]?\d+", re.IGNORECASE)
    for p in root.rglob("*.py"):
        if "__pycache__" in p.parts:
            continue
        if "test_no_req" in p.name:
            continue
        assert not pattern.search(p.as_posix()), f"Forbidden REQ in test path: {p.as_posix()}"
