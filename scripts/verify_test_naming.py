#!/usr/bin/env python3
r"""scripts/verify_test_naming.py

Test naming convention verification and baseline mapping extraction tool (REQ-356).
Enforces:
- Test files must not contain 'req\d+' or 'REQ-\d+' in their path (AC-1)
- PBI-linked test cases must follow '[REQ-xxx/AC-n]' convention (AC-15)
- Non-PBI test cases are permitted and tracked without error (AC-15)
"""

from __future__ import annotations

import argparse
import ast
from dataclasses import dataclass
import os
from pathlib import Path
import re
import sys
from typing import List, Optional, Tuple

PBI_PATTERN = re.compile(r"\[(REQ-\d+)/(AC-\d+)\]")
PBI_RAW_PATTERN = re.compile(r"(?<![a-zA-Z])(?:REQ-(\d+)|req[-_]?(\d+))\b", re.IGNORECASE)
FORBIDDEN_FILENAME_PATTERN = re.compile(r"req[-_]?\d+", re.IGNORECASE)


@dataclass
class TestCaseInfo:
    file_path: str
    test_name: str
    pbi_id: Optional[str]  # e.g., "REQ-350"
    ac_id: Optional[str]   # e.g., "AC-1"
    is_valid_format: bool
    __test__ = False


def validate_test_name(name: str) -> bool:
    """Validate whether a test name conforms to [REQ-xxx/AC-n] if it refers to a PBI."""
    # AC-15 governance paradox prevention:
    # Generic tests like 'test_no_req_naming' or terms like 'request', 'require' are not PBI references.
    if "no_req" in name.lower():
        return True

    # Check if this name contains an actual PBI identifier (e.g., REQ-350, req336, test_req350)
    has_pbi_ref = bool(
        re.search(r"REQ-\d+", name) or
        re.search(r"(?<![a-zA-Z])req[-_]?\d+", name, re.IGNORECASE)
    )
    if has_pbi_ref:
        return bool(PBI_PATTERN.search(name))

    # Non-PBI test cases are strictly allowed
    return True


def extract_python_tests(file_path: Path, workspace_root: Path) -> List[TestCaseInfo]:
    """Extract test functions from a Python test file."""
    rel_path = file_path.relative_to(workspace_root).as_posix()
    results: List[TestCaseInfo] = []

    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        tree = ast.parse(content, filename=str(file_path))
    except Exception as e:
        print(f"Warning: Failed to parse Python file {rel_path}: {e}", file=sys.stderr)
        return results

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if not node.name.startswith("test"):
                continue

            docstring = ast.get_docstring(node) or ""
            doc_first_line = docstring.strip().splitlines()[0] if docstring.strip() else ""

            # Check for PBI format in docstring or function name
            match = PBI_PATTERN.search(docstring) or PBI_PATTERN.search(node.name)
            if match:
                pbi_id = match.group(1)
                ac_id = match.group(2)
                display_name = f"{node.name}: {doc_first_line}" if doc_first_line else node.name
                results.append(TestCaseInfo(
                    file_path=rel_path,
                    test_name=display_name,
                    pbi_id=pbi_id,
                    ac_id=ac_id,
                    is_valid_format=True,
                ))
            else:
                combined = f"{node.name} {doc_first_line}"
                if validate_test_name(combined):
                    results.append(TestCaseInfo(
                        file_path=rel_path,
                        test_name=node.name,
                        pbi_id=None,
                        ac_id=None,
                        is_valid_format=True,
                    ))
                else:
                    raw_m = PBI_RAW_PATTERN.search(combined)
                    pbi_num = (raw_m.group(1) or raw_m.group(2)) if raw_m else None
                    results.append(TestCaseInfo(
                        file_path=rel_path,
                        test_name=node.name,
                        pbi_id=f"REQ-{pbi_num}" if pbi_num else "UNKNOWN",
                        ac_id=None,
                        is_valid_format=False,
                    ))

    return results


TS_TEST_PATTERN = re.compile(
    r"""(?:\b(?:it|test)(?:\.(?:only|skip|concurrent|todo))?\s*\(\s*(?P<quote>['"`])(?P<title>(?:(?!(?P=quote)|\\).|\\.)*?)(?P=quote))""",
    re.DOTALL
)


def extract_frontend_tests(file_path: Path, workspace_root: Path) -> List[TestCaseInfo]:
    """Extract test blocks (it / test) from a TypeScript / TSX test file."""
    rel_path = file_path.relative_to(workspace_root).as_posix()
    results: List[TestCaseInfo] = []

    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        print(f"Warning: Failed to read Frontend test file {rel_path}: {e}", file=sys.stderr)
        return results

    for m in TS_TEST_PATTERN.finditer(content):
        title = m.group("title").strip()
        title = title.replace(r"\'", "'").replace(r'\"', '"').replace(r"\`", "`")

        match = PBI_PATTERN.search(title)
        if match:
            results.append(TestCaseInfo(
                file_path=rel_path,
                test_name=title,
                pbi_id=match.group(1),
                ac_id=match.group(2),
                is_valid_format=True,
            ))
        else:
            if validate_test_name(title):
                results.append(TestCaseInfo(
                    file_path=rel_path,
                    test_name=title,
                    pbi_id=None,
                    ac_id=None,
                    is_valid_format=True,
                ))
            else:
                raw_m = PBI_RAW_PATTERN.search(title)
                pbi_num = (raw_m.group(1) or raw_m.group(2)) if raw_m else None
                results.append(TestCaseInfo(
                    file_path=rel_path,
                    test_name=title,
                    pbi_id=f"REQ-{pbi_num}" if pbi_num else "UNKNOWN",
                    ac_id=None,
                    is_valid_format=False,
                ))

    return results


def scan_test_files(workspace_root: Path) -> Tuple[List[Path], List[Path]]:
    """Scan and return backend test files and frontend test files."""
    backend_root = workspace_root / "backend" / "tests"
    frontend_src = workspace_root / "frontend" / "src"
    frontend_e2e = workspace_root / "frontend" / "e2e"

    backend_files: List[Path] = []
    if backend_root.exists():
        for p in backend_root.rglob("*.py"):
            if "__pycache__" not in p.parts:
                backend_files.append(p)

    frontend_files: List[Path] = []
    for base in (frontend_src, frontend_e2e):
        if base.exists():
            for p in base.rglob("*"):
                if p.is_file() and any(p.name.endswith(ext) for ext in (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
                    frontend_files.append(p)

    return sorted(backend_files), sorted(frontend_files)


def extract_test_mapping(workspace_root: Path) -> Tuple[List[TestCaseInfo], List[str]]:
    """Extract all test cases and check for forbidden filename violations."""
    backend_files, frontend_files = scan_test_files(workspace_root)
    all_cases: List[TestCaseInfo] = []
    file_violations: List[str] = []

    all_files = backend_files + frontend_files
    for f in all_files:
        rel_posix = f.relative_to(workspace_root).as_posix()
        if "test_no_req" not in f.name and FORBIDDEN_FILENAME_PATTERN.search(rel_posix):
            file_violations.append(rel_posix)

    for bf in backend_files:
        all_cases.extend(extract_python_tests(bf, workspace_root))

    for ff in frontend_files:
        all_cases.extend(extract_frontend_tests(ff, workspace_root))

    return all_cases, file_violations


def generate_mapping_markdown(
    test_cases: List[TestCaseInfo],
    file_violations: List[str],
    backend_file_count: int,
    frontend_file_count: int,
) -> str:
    """Generate Markdown representation of existing test mapping baseline."""
    pbi_linked = [tc for tc in test_cases if tc.pbi_id is not None]
    non_pbi = [tc for tc in test_cases if tc.pbi_id is None]
    invalid_cases = [tc for tc in test_cases if not tc.is_valid_format]

    lines: List[str] = [
        "# REQ-356 既存テスト検証項目対応表 (移行前ベースライン)",
        "",
        "本ドキュメントは REQ-356 (テスト再構成および高速化・Seam Map 準拠) の移行前ベースラインとして、",
        "リファクタ前の全テスト（Backend / Frontend）が担保している検証項目を機械抽出した対応表である。",
        "",
        "## 1. 全体サマリー",
        "",
        "| 項目 | 件数 | 備考 |",
        "|---|---|---|",
        f"| Backend テストファイル数 | {backend_file_count} | `backend/tests/**/*.py` |",
        f"| Frontend テストファイル数 | {frontend_file_count} | `frontend/src/**/*.{{test,spec}}.{{ts,tsx}}` |",
        f"| 抽出テストケース総数 | {len(test_cases)} | Python 関数 + TS it/test |",
        f"| PBI 紐づけありテスト数 | {len(pbi_linked)} | `REQ-xxx` 関連 |",
        f"| PBI 紐づけなしテスト数 | {len(non_pbi)} | 汎用ユニット・ガバナンステスト (AC-15準拠) |",
        f"| ファイル名規約違反数 (AC-1) | {len(file_violations)} | `req\\d+` をパスに含むファイル |",
        f"| テスト名規約違反数 (AC-15) | {len(invalid_cases)} | `[REQ-xxx/AC-n]` 未準拠 |",
        "",
        "## 2. ファイル名規約違反一覧 (移行対象: AC-1)",
        "",
    ]

    if file_violations:
        lines.append("| No | ファイルパス | 移行計画 (REQ-356 タスク) |")
        lines.append("|---|---|---|")
        for i, fv in enumerate(file_violations, 1):
            lines.append(f"| {i} | `{fv}` | ドメイン別機能名へ統合リネーム (T2〜T10) |")
    else:
        lines.append("違反なし（全テストファイル名が規約に準拠しています）。")

    lines.append("")
    lines.append("## 3. PBI別テストケース対応一覧 (トレーサビリティ基準)")
    lines.append("")

    pbi_groups: dict[str, List[TestCaseInfo]] = {}
    for tc in test_cases:
        key = tc.pbi_id or "PBI紐づけなし (汎用/ガバナンス)"
        pbi_groups.setdefault(key, []).append(tc)

    def sort_key(k: str) -> Tuple[int, str]:
        if k.startswith("REQ-"):
            try:
                return (0, f"{int(k.split('-')[1]):05d}")
            except Exception:
                return (0, k)
        return (1, k)

    sorted_pbis = sorted(pbi_groups.keys(), key=sort_key)

    for pbi in sorted_pbis:
        cases = pbi_groups[pbi]
        lines.append(f"### {pbi} (計 {len(cases)} 件)")
        lines.append("")
        lines.append("| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |")
        lines.append("|---|---|---|---|")
        for c in cases[:100]:
            clean_name = c.test_name.replace("|", "\\|").replace("\n", " ")
            ac_str = c.ac_id or "-"
            status_str = "PASS" if c.is_valid_format else "VIOLATION"
            lines.append(f"| `{c.file_path}` | {clean_name} | {ac_str} | {status_str} |")
        if len(cases) > 100:
            lines.append(f"| ... | *(他 {len(cases) - 100} 件割愛)* | - | - |")
        lines.append("")

    return "\n".join(lines) + "\n"


def run_full_verification(workspace_root: Optional[Path] = None, strict: bool = False) -> int:
    """Run full verification across the repository."""
    if workspace_root is None:
        workspace_root = Path(__file__).resolve().parent.parent

    backend_files, frontend_files = scan_test_files(workspace_root)
    all_cases, file_violations = extract_test_mapping(workspace_root)

    pbi_linked = [tc for tc in all_cases if tc.pbi_id is not None]
    non_pbi = [tc for tc in all_cases if tc.pbi_id is None]
    invalid_cases = [tc for tc in all_cases if not tc.is_valid_format]

    total_violations = len(file_violations) + len(invalid_cases)

    print("================================================================================")
    print("Test Naming & Structure Verification (REQ-356)")
    print("================================================================================")
    print(f"Backend test files:     {len(backend_files)}")
    print(f"Frontend test files:    {len(frontend_files)}")
    print(f"Total test cases:       {len(all_cases)}")
    print(f"PBI-linked test cases:  {len(pbi_linked)}")
    print(f"Non-PBI test cases:     {len(non_pbi)} (Allowed, AC-15 compliant)")
    print("--------------------------------------------------------------------------------")
    print(f"File path violations:   {len(file_violations)} (AC-1: req\\d+ in filename)")
    print(f"Test naming violations: {len(invalid_cases)} (AC-15: [REQ-xxx/AC-n] missing)")
    print("================================================================================")

    mapping_path = workspace_root / "docs" / "design" / "REQ-356-test-mapping.md"
    mapping_path.parent.mkdir(parents=True, exist_ok=True)
    mapping_content = generate_mapping_markdown(
        all_cases, file_violations, len(backend_files), len(frontend_files)
    )
    mapping_path.write_text(mapping_content, encoding="utf-8", newline="\n")
    print(f"[Mapping Baseline Updated] -> {mapping_path.relative_to(workspace_root).as_posix()}")

    if total_violations == 0:
        print("SUCCESS: 0 violations. All PBI tests strictly formatted and files compliant.")
        return 0

    if strict:
        print(f"FAILED: {total_violations} violations found (strict mode enforced).", file=sys.stderr)
        return 1
    else:
        print(f"REPORT: {total_violations} legacy items identified for migration.")
        print("Note: To enforce 0 violations check (e.g. CI / post-migration), use --strict.")
        return 0


# Backwards-compatible aliases
verify_test_naming = run_full_verification


def verify_all_tests(workspace_root: Optional[Path] = None, strict: bool = True) -> int:
    """Entry point for full automated audit per REQ-356-T11."""
    return run_full_verification(workspace_root=workspace_root, strict=strict)


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify test naming and extract test mapping.")
    parser.add_argument(
        "--strict",
        action="store_true",
        default=bool(os.environ.get("STRICT_TEST_NAMING", "") == "1"),
        help="Exit with code 1 if violations are found (enforced post-migration).",
    )
    args = parser.parse_args()

    workspace_root = Path(__file__).resolve().parent.parent
    exit_code = run_full_verification(workspace_root, strict=args.strict)
    sys.exit(exit_code)


# ----------------------------------------------------------------------
# Unit Tests (Self-Verification for TDD & Pre-commit)
# ----------------------------------------------------------------------

def test_validate_test_name() -> None:
    """Verify test name validation according to [REQ-xxx/AC-n] conventions."""
    # Compliant PBI tests
    assert validate_test_name("[REQ-350/AC-1] valid format") is True
    assert validate_test_name("test_something: [REQ-356/AC-15] verified") is True

    # Legacy / invalid PBI tests
    assert validate_test_name("REQ-350 invalid format") is False
    assert validate_test_name("test_req350_invalid") is False
    assert validate_test_name("test_req_045_function") is False

    # Non-PBI tests (must pass without violation per AC-15)
    assert validate_test_name("test_regular_calculation") is True
    assert validate_test_name("test_no_req_naming") is True
    assert validate_test_name("test_request_timeout_handling") is True
    assert validate_test_name("test_required_fields_validator") is True
    assert validate_test_name("test_prerequisite_check") is True


def test_pbi_pattern_matching() -> None:
    """Verify PBI_PATTERN regex captures REQ and AC identifiers."""
    m = PBI_PATTERN.search("[REQ-356/AC-15] Test naming verification")
    assert m is not None
    assert m.group(1) == "REQ-356"
    assert m.group(2) == "AC-15"

    m_none = PBI_PATTERN.search("REQ-356: Missing bracket format")
    assert m_none is None


def test_forbidden_filename_pattern() -> None:
    """Verify FORBIDDEN_FILENAME_PATTERN detects req\\d+ while permitting no_req."""
    assert FORBIDDEN_FILENAME_PATTERN.search("test_req350_api.py") is not None
    assert FORBIDDEN_FILENAME_PATTERN.search("test_req_045.py") is not None
    assert FORBIDDEN_FILENAME_PATTERN.search("SettingsPage.req334.test.tsx") is not None

    # Permitted files
    assert FORBIDDEN_FILENAME_PATTERN.search("test_no_req_naming.py") is None
    assert FORBIDDEN_FILENAME_PATTERN.search("test_workflows.py") is None
    assert FORBIDDEN_FILENAME_PATTERN.search("verify_test_naming.py") is None


def test_run_full_verification_interface() -> None:
    """Verify run_full_verification and verify_all_tests interfaces exist and are callable."""
    assert callable(run_full_verification)
    assert callable(verify_all_tests)
    assert verify_test_naming is run_full_verification


if __name__ == "__main__":
    main()