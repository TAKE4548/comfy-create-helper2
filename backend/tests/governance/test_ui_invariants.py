"""UI Invariants Governance Tests (REQ-366 AC-4).

Verifies the Gate 1 static linter (scripts/verify_ui_invariants.py):
- RT-1: Global font floor (font-size: 11px) detection.
- RT-2: Raw 100vh unit detection in CSS and TSX/JSX.
- RT-3: !important abuse detection in CSS and ignore comments override.
- CLI exit code (1 on violations, 0 on clean code).
"""

import importlib.util
from pathlib import Path
import subprocess
import sys
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
VERIFY_SCRIPT_PATH = REPO_ROOT / "scripts" / "verify_ui_invariants.py"

spec = importlib.util.spec_from_file_location("root_verify_ui_invariants", str(VERIFY_SCRIPT_PATH))
if spec is None or spec.loader is None:
    raise ImportError(f"Cannot load spec from {VERIFY_SCRIPT_PATH}")
verify_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_mod)

RULE_NO_GLOBAL_FONT_FLOOR = verify_mod.RULE_NO_GLOBAL_FONT_FLOOR
RULE_NO_RAW_100VH = verify_mod.RULE_NO_RAW_100VH
RULE_NO_INDISCRIMINATE_IMPORTANT = verify_mod.RULE_NO_INDISCRIMINATE_IMPORTANT
Violation = verify_mod.Violation
check_content = verify_mod.check_content
check_file = verify_mod.check_file
main = verify_mod.main

pytestmark = [getattr(pytest.mark, "REQ-366"), getattr(pytest.mark, "AC-4")]


def test_ui_invariants_detects_global_font_floor() -> None:
    """[REQ-366/AC-4] Detects font-size: 11px floor on global and attribute selectors."""
    # 1. Single-line body selector
    violations = check_content("body { font-size: 11px; }", file_path="sample.css")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_GLOBAL_FONT_FLOOR
    assert violations[0].line_number == 1

    # 2. Multi-line html selector
    css_multiline = "html {\n  color: #fff;\n  font-size: 11px;\n}"
    violations = check_content(css_multiline, file_path="sample.css")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_GLOBAL_FONT_FLOOR
    assert violations[0].line_number == 3

    # 3. Attribute selector from index.css poisoned well
    css_attr = "[class~='text-[8px]'] { font-size: 11px; }"
    violations = check_content(css_attr, file_path="sample.css")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_GLOBAL_FONT_FLOOR

    # 4. Universal selector
    css_star = "* { font-size: 11px; }"
    violations = check_content(css_star, file_path="sample.css")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_GLOBAL_FONT_FLOOR

    # 5. Non-global class component selector is NOT flagged
    css_component = ".my-component { font-size: 12px; }"
    assert check_content(css_component, file_path="sample.css") == []


def test_ui_invariants_detects_raw_100vh() -> None:
    """[REQ-366/AC-4] Detects raw 100vh in CSS and TSX/JSX, but allows dvh and 100%."""
    # 1. CSS height: 100vh
    css_code = ".container {\n  height: 100vh;\n}"
    violations = check_content(css_code, file_path="sample.css")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_RAW_100VH
    assert violations[0].line_number == 2

    # 2. CSS min-height with calc
    css_calc = ".container { min-height: calc(100vh - 2rem); }"
    violations = check_content(css_calc, file_path="sample.css")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_RAW_100VH

    # 3. TSX Tailwind arbitrary class
    tsx_code = '<div className="h-[100vh] flex flex-col" />'
    violations = check_content(tsx_code, file_path="Modal.tsx")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_RAW_100VH
    assert violations[0].line_number == 1

    # 4. TSX max-h calc
    tsx_calc = '<div className="max-h-[calc(100vh-2rem)]" />'
    violations = check_content(tsx_calc, file_path="Overlay.tsx")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_RAW_100VH

    # 5. dvh and percentage are compliant
    compliant_css = ".container { height: 100dvh; min-height: 100%; }"
    assert check_content(compliant_css, file_path="sample.css") == []

    compliant_tsx = '<div className="h-[100dvh] h-screen h-full" />'
    assert check_content(compliant_tsx, file_path="Modal.tsx") == []


def test_ui_invariants_detects_important_abuse() -> None:
    """[REQ-366/AC-4] Detects !important in CSS declarations, ignores in comments."""
    # 1. Direct !important
    css_code = "button {\n  color: red !important;\n}"
    violations = check_content(css_code, file_path="sample.css")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_INDISCRIMINATE_IMPORTANT
    assert violations[0].line_number == 2

    # 2. !important inside comment is ignored
    comment_css = "/* note: do not use !important here */\nbutton { color: red; }"
    assert check_content(comment_css, file_path="sample.css") == []

    # 3. Compliant CSS
    compliant = "button { color: red; font-weight: 600; }"
    assert check_content(compliant, file_path="sample.css") == []


def test_ui_invariants_honors_ignore_comments() -> None:
    """[REQ-366/AC-4] Inline comments on the same or preceding line suppress violations."""
    # 1. Same-line block comment
    same_line_css = "color: red !important; /* ui-invariant-ignore: rule-no-indiscriminate-important reason: legacy override */"
    assert check_content(same_line_css, file_path="sample.css") == []

    # 2. Preceding line block comment
    preceding_css = (
        "/* ui-invariant-ignore: rule-no-indiscriminate-important reason: third-party lib */\n"
        "color: red !important;"
    )
    assert check_content(preceding_css, file_path="sample.css") == []

    # 3. TSX same-line // comment
    tsx_same = '<div className="h-[100vh]" /> // ui-invariant-ignore: rule-no-raw-100vh reason: canvas full height'
    assert check_content(tsx_same, file_path="Canvas.tsx") == []

    # 4. TSX preceding line // comment
    tsx_prec = (
        "// ui-invariant-ignore: rule-no-raw-100vh reason: special fullscreen\n"
        '<div className="h-[100vh]" />'
    )
    assert check_content(tsx_prec, file_path="Canvas.tsx") == []

    # 5. Global font floor ignore on selector
    font_floor_ignore = (
        "/* ui-invariant-ignore: rule-no-global-font-floor reason: legacy baseline */\n"
        "body { font-size: 11px; }"
    )
    assert check_content(font_floor_ignore, file_path="sample.css") == []

    # 6. Unrelated rule ignore does NOT suppress different violation
    wrong_ignore = (
        "/* ui-invariant-ignore: rule-no-raw-100vh reason: irrelevant */\n"
        "color: red !important;"
    )
    violations = check_content(wrong_ignore, file_path="sample.css")
    assert len(violations) == 1
    assert violations[0].rule_id == RULE_NO_INDISCRIMINATE_IMPORTANT


def test_ui_invariants_allowlist() -> None:
    """[REQ-366/AC-4] Allowlisted paths are skipped without violations."""
    code = "body { font-size: 11px; }\n.box { height: 100vh; }"
    allowlist = {"sample.css", "legacy/old.css"}
    violations = check_content(code, file_path="sample.css", allowlist=allowlist)
    assert violations == []

    # Non-allowlisted file still fails
    violations2 = check_content(code, file_path="other.css", allowlist=allowlist)
    assert len(violations2) == 2


def test_ui_invariants_cli_exit_code(tmp_path: Path) -> None:
    """[REQ-366/AC-4] CLI exits with code 1 on violations and code 0 when clean."""
    # Clean file
    clean_file = tmp_path / "clean.css"
    clean_file.write_text(".container { height: 100dvh; }", encoding="utf-8")
    assert main([str(clean_file)]) == 0

    # Violating file
    dirty_file = tmp_path / "dirty.css"
    dirty_file.write_text("body { font-size: 11px; }", encoding="utf-8")
    assert main([str(dirty_file)]) == 1

    # Violating file with ignore comment passes
    ignored_file = tmp_path / "ignored.css"
    ignored_file.write_text(
        "/* ui-invariant-ignore: rule-no-global-font-floor reason: ok */\nbody { font-size: 11px; }",
        encoding="utf-8",
    )
    assert main([str(ignored_file)]) == 0


def test_ui_invariants_clean_on_compliant_code() -> None:
    """[REQ-366/AC-4] Fully compliant CSS and TSX return 0 violations."""
    clean_css = """
    :root {
      --ux-font-size: 14px;
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      height: 100dvh;
      touch-action: pan-y;
    }
    .text-helper {
      font-size: 0.875rem;
    }
    """
    assert check_content(clean_css, file_path="clean.css") == []

    clean_tsx = """
    export function Modal() {
      return (
        <div className="fixed inset-0 h-[100dvh] flex items-center justify-center">
          <p className="text-xs text-muted">Compliant content</p>
        </div>
      );
    }
    """
    assert check_content(clean_tsx, file_path="Modal.tsx") == []
