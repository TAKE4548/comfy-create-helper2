"""Fast static linter script for UI invariant verification (Gate 1).

Enforces:
1. rule-no-global-font-floor: No font-size: 11px floor on global/blanket selectors in CSS.
2. rule-no-raw-100vh: No raw '100vh' units (dvh or 100% recommended) in CSS and TSX/JSX.
3. rule-no-indiscriminate-important: No !important usage in CSS.

Allows explicit inline exceptions:
- /* ui-invariant-ignore: <rule-id> reason: <reason> */
- // ui-invariant-ignore: <rule-id> reason: <reason>
"""

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
import re
import sys
from typing import Dict, List, Optional, Set, Tuple


@dataclass
class Violation:
    file_path: str
    line_number: int
    rule_id: str
    message: str
    line_content: str


RULE_NO_GLOBAL_FONT_FLOOR = "rule-no-global-font-floor"
RULE_NO_RAW_100VH = "rule-no-raw-100vh"
RULE_NO_INDISCRIMINATE_IMPORTANT = "rule-no-indiscriminate-important"

ALL_RULES = {
    RULE_NO_GLOBAL_FONT_FLOOR,
    RULE_NO_RAW_100VH,
    RULE_NO_INDISCRIMINATE_IMPORTANT,
}

IGNORE_PATTERN = re.compile(
    r"/\*\s*ui-invariant-ignore:\s*([\w\-]+|\*)(?:\s+reason:\s*([^*]+?))?\s*\*/|"
    r"//\s*ui-invariant-ignore:\s*([\w\-]+|\*)(?:\s+reason:\s*(.*?))?$"
)

GLOBAL_SELECTOR_PATTERN = re.compile(
    r"(?:^|[\s,>+~])(?:html|body|\*|:root)(?:[\s,:>+~.{]|$)|\[class[~*^$]?="
)

RAW_100VH_PATTERN = re.compile(r"\b100vh\b")
IMPORTANT_PATTERN = re.compile(r"!\s*important\b")
FONT_SIZE_11PX_PATTERN = re.compile(r"font-size\s*:\s*11px\b")

SUPPORTED_EXTENSIONS = {".css", ".tsx", ".ts", ".jsx", ".js"}
EXCLUDED_DIRS = {".git", "node_modules", "dist", "build", "__pycache__", ".venv"}


def strip_comments(line: str, in_multiline: bool) -> Tuple[str, bool]:
    """Strip CSS / JS comments from line while tracking multiline comment state."""
    result = []
    i = 0
    n = len(line)
    while i < n:
        if in_multiline:
            end_idx = line.find("*/", i)
            if end_idx != -1:
                in_multiline = False
                i = end_idx + 2
            else:
                break
        else:
            if line[i : i + 2] == "/*":
                end_idx = line.find("*/", i + 2)
                if end_idx != -1:
                    i = end_idx + 2
                else:
                    in_multiline = True
                    break
            elif line[i : i + 2] == "//":
                break
            else:
                result.append(line[i])
                i += 1
    return "".join(result), in_multiline


def extract_ignore_directives(lines: List[str]) -> Dict[int, Set[str]]:
    """Extract rule ids to ignore per line (1-indexed)."""
    line_ignores: Dict[int, Set[str]] = defaultdict(set)
    for line_idx, line in enumerate(lines):
        line_num = line_idx + 1
        for match in IGNORE_PATTERN.finditer(line):
            rule_id = match.group(1) or match.group(3)
            if rule_id:
                line_ignores[line_num].add(rule_id.strip())
    return line_ignores


def is_rule_ignored(
    line_ignores: Dict[int, Set[str]], line_num: int, rule_id: str
) -> bool:
    """Check if rule_id is ignored on line_num or immediately preceding line_num - 1."""
    for target_line in (line_num, line_num - 1):
        ignored = line_ignores.get(target_line, set())
        if rule_id in ignored or "*" in ignored or "all" in ignored:
            return True
    return False


def check_content(
    content: str,
    file_path: str = "",
    file_ext: Optional[str] = None,
    allowlist: Optional[Set[str]] = None,
) -> List[Violation]:
    """Inspect text content for UI invariant violations."""
    normalized_path = file_path.replace(chr(92), "/")
    if allowlist and any(
        normalized_path == item.replace(chr(92), "/")
        or normalized_path.endswith("/" + item.replace(chr(92), "/"))
        for item in allowlist
    ):
        return []

    if file_ext is None:
        if "." in file_path:
            file_ext = Path(file_path).suffix.lower()
        else:
            file_ext = ".css"

    lines = content.splitlines()
    line_ignores = extract_ignore_directives(lines)
    violations: List[Violation] = []

    in_multiline = False
    selector_buffer: List[str] = []
    block_stack: List[Tuple[bool, bool]] = []

    for line_idx, raw_line in enumerate(lines):
        line_num = line_idx + 1
        code, in_multiline = strip_comments(raw_line, in_multiline)
        trimmed = code.strip()

        # Rule: rule-no-raw-100vh
        if RAW_100VH_PATTERN.search(code):
            if not is_rule_ignored(line_ignores, line_num, RULE_NO_RAW_100VH):
                violations.append(
                    Violation(
                        file_path=file_path,
                        line_number=line_num,
                        rule_id=RULE_NO_RAW_100VH,
                        message="Raw '100vh' unit is forbidden. Use 'dvh' or '100%' instead.",
                        line_content=raw_line.strip(),
                    )
                )

        if file_ext == ".css":
            # Rule: rule-no-indiscriminate-important
            if IMPORTANT_PATTERN.search(code):
                if not is_rule_ignored(
                    line_ignores, line_num, RULE_NO_INDISCRIMINATE_IMPORTANT
                ):
                    violations.append(
                        Violation(
                            file_path=file_path,
                            line_number=line_num,
                            rule_id=RULE_NO_INDISCRIMINATE_IMPORTANT,
                            message="!important usage is forbidden in CSS rules.",
                            line_content=raw_line.strip(),
                        )
                    )

            # Rule: rule-no-global-font-floor
            has_open_brace = "{" in code
            has_close_brace = "}" in code

            if has_open_brace:
                brace_pos = code.find("{")
                before_brace = code[:brace_pos]
                full_selector = " ".join(selector_buffer + [before_brace]).strip()
                selector_buffer = []

                is_at_rule = full_selector.startswith("@")
                is_global = False
                block_ignored = False
                if not is_at_rule:
                    is_global = bool(GLOBAL_SELECTOR_PATTERN.search(full_selector))
                    block_ignored = is_rule_ignored(
                        line_ignores, line_num, RULE_NO_GLOBAL_FONT_FLOOR
                    )

                block_stack.append((is_global, block_ignored))

            if FONT_SIZE_11PX_PATTERN.search(code):
                is_in_global = block_stack and block_stack[-1][0]
                is_ignored_by_block = block_stack and block_stack[-1][1]
                is_ignored_direct = is_rule_ignored(
                    line_ignores, line_num, RULE_NO_GLOBAL_FONT_FLOOR
                )

                if is_in_global and not (is_ignored_by_block or is_ignored_direct):
                    violations.append(
                        Violation(
                            file_path=file_path,
                            line_number=line_num,
                            rule_id=RULE_NO_GLOBAL_FONT_FLOOR,
                            message="Global font-size floor (font-size: 11px) is forbidden on global/attribute selectors.",
                            line_content=raw_line.strip(),
                        )
                    )

            if has_close_brace:
                close_count = code.count("}")
                for _ in range(close_count):
                    if block_stack:
                        block_stack.pop()
                selector_buffer = []

            if not has_open_brace and not has_close_brace and trimmed:
                selector_buffer.append(trimmed)

    return violations


def check_file(
    path: Path, allowlist: Optional[Set[str]] = None
) -> List[Violation]:
    """Check a single file for UI invariant violations with BOM tolerance."""
    try:
        content = path.read_text(encoding="utf-8-sig")
    except Exception as exc:
        print(f"Error reading {path}: {exc}", file=sys.stderr)
        return []

    return check_content(
        content=content,
        file_path=str(path),
        file_ext=path.suffix.lower(),
        allowlist=allowlist,
    )


def collect_target_files(
    targets: List[Path], allowlist: Optional[Set[str]] = None
) -> List[Path]:
    """Collect all valid target files from paths, traversing directories."""
    files: List[Path] = []
    for target in targets:
        if not target.exists():
            continue
        if target.is_file():
            if target.suffix.lower() in SUPPORTED_EXTENSIONS:
                files.append(target)
        elif target.is_dir():
            for item in target.rglob("*"):
                if item.is_file() and item.suffix.lower() in SUPPORTED_EXTENSIONS:
                    if any(excluded in item.parts for excluded in EXCLUDED_DIRS):
                        continue
                    files.append(item)
    return files


def main(argv: Optional[List[str]] = None) -> int:
    """CLI entrypoint for UI invariant checking."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Gate 1 Static UI Invariant Checker"
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=[],
        help="Files or directories to scan (defaults to frontend/src)",
    )
    parser.add_argument(
        "--allowlist",
        nargs="*",
        default=[],
        help="Paths to exclude from checks",
    )

    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parent.parent
    if not args.paths:
        target_paths = [repo_root / "frontend" / "src"]
    else:
        target_paths = [Path(p) for p in args.paths]

    allowlist_set = set(args.allowlist)
    files_to_check = collect_target_files(target_paths, allowlist=allowlist_set)

    all_violations: List[Violation] = []
    for file_path in files_to_check:
        violations = check_file(file_path, allowlist=allowlist_set)
        all_violations.extend(violations)

    if all_violations:
        print(
            f"FAILED: Found {len(all_violations)} UI invariant violation(s):",
            file=sys.stderr,
        )
        for v in all_violations:
            print(
                f"  {v.file_path}:{v.line_number} [{v.rule_id}] {v.message}",
                file=sys.stderr,
            )
            print(f"    Line: {v.line_content}", file=sys.stderr)
        return 1

    print(
        f"SUCCESS: UI invariant check passed (0 violations across {len(files_to_check)} files)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
