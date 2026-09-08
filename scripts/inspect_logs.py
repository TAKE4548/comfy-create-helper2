#!/usr/bin/env python3
"""inspect_logs.py - Utility to inspect, filter, and summarize Prompt Surgeon logs (app.jsonl).

Usage examples:
    python scripts/inspect_logs.py --tail 30
    python scripts/inspect_logs.py --level ERROR
    python scripts/inspect_logs.py --source frontend
    python scripts/inspect_logs.py --request-id req-40efe77e4029
    python scripts/inspect_logs.py --grep "database"
    python scripts/inspect_logs.py --since-minutes 15
    python scripts/inspect_logs.py --summary
    python scripts/inspect_logs.py --clean-check 10
"""

import argparse
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import re
import sys
from typing import Any, Generator, Optional


def find_log_file(custom_path: Optional[str] = None) -> Path:
    if custom_path:
        p = Path(custom_path)
        if p.is_file():
            return p
        print(f"Error: Specified log file not found: {custom_path}", file=sys.stderr)
        sys.exit(1)

    # Search in default project locations
    candidates = [
        Path(__file__).resolve().parent.parent / "logs" / "app.jsonl",
        Path("logs/app.jsonl").resolve(),
        Path("../logs/app.jsonl").resolve(),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    print(f"Error: Log file not found in candidates: {[str(c) for c in candidates]}", file=sys.stderr)
    sys.exit(1)


def parse_iso_timestamp(ts_str: str) -> Optional[datetime]:
    if not ts_str:
        return None
    try:
        # Handles ISO strings like 2026-09-08T00:15:54.081+09:00
        return datetime.fromisoformat(ts_str)
    except Exception:
        return None


def iter_logs(file_path: Path) -> Generator[dict[str, Any], None, None]:
    """Stream json objects from file, ignoring malformed lines."""
    with file_path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def format_log_entry(entry: dict[str, Any], show_stack: bool = True) -> str:
    ts = entry.get("timestamp", "")
    level = entry.get("level", "INFO").upper()
    source = entry.get("source", "unknown")
    logger_name = entry.get("logger", "")
    message = entry.get("message", "")
    req_id = entry.get("request_id")
    http = entry.get("http")
    error = entry.get("error")

    parts = [f"[{ts}]", f"[{level:<5}]", f"[{source:<8}]"]
    if req_id:
        parts.append(f"[{req_id}]")
    if http:
        m = http.get("method", "")
        p = http.get("path", "")
        s = http.get("status_code", "")
        dur = http.get("duration_ms", "")
        parts.append(f"{m} {p} -> {s} ({dur}ms)")
    else:
        parts.append(f"[{logger_name}] {message}")

    output = " ".join(parts)

    if error and isinstance(error, dict):
        err_type = error.get("type", "Error")
        err_msg = error.get("message", "")
        output += f"\n    --> ERROR: {err_type}: {err_msg}"
        stack = error.get("stack_trace")
        if show_stack and stack:
            # indent stack trace lines
            stack_lines = stack.strip().splitlines()
            if len(stack_lines) > 10:
                stack_lines = stack_lines[:5] + ["    ... (truncated) ..."] + stack_lines[-5:]
            for s_line in stack_lines:
                output += f"\n        {s_line}"

    return output


def run_summary(file_path: Path) -> None:
    total_count = 0
    level_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    recent_errors: list[dict[str, Any]] = []

    for entry in iter_logs(file_path):
        total_count += 1
        lvl = entry.get("level", "UNKNOWN").upper()
        level_counts[lvl] = level_counts.get(lvl, 0) + 1

        src = entry.get("source", "unknown").lower()
        source_counts[src] = source_counts.get(src, 0) + 1

        if lvl in ("ERROR", "CRITICAL") or entry.get("error"):
            recent_errors.append(entry)
            if len(recent_errors) > 5:
                recent_errors.pop(0)

    print("========================================")
    print(f"Log Summary: {file_path}")
    print(f"Total Entries: {total_count}")
    print("----------------------------------------")
    print("By Level:")
    for lvl, cnt in sorted(level_counts.items(), key=lambda x: -x[1]):
        print(f"  {lvl:<10}: {cnt}")
    print("----------------------------------------")
    print("By Source:")
    for src, cnt in sorted(source_counts.items(), key=lambda x: -x[1]):
        print(f"  {src:<10}: {cnt}")
    print("----------------------------------------")
    if recent_errors:
        print(f"Recent Errors ({len(recent_errors)}):")
        for err in recent_errors:
            print(f"  - [{err.get('timestamp')}] [{err.get('source')}] {err.get('message')}")
    else:
        print("Recent Errors: None")
    print("========================================")


def run_clean_check(file_path: Path, minutes: int) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    culprits: list[dict[str, Any]] = []

    for entry in iter_logs(file_path):
        ts = parse_iso_timestamp(entry.get("timestamp", ""))
        if ts and ts.astimezone(timezone.utc) < cutoff:
            continue

        lvl = entry.get("level", "INFO").upper()
        if lvl in ("ERROR", "CRITICAL", "WARNING") or entry.get("error"):
            culprits.append(entry)

    if not culprits:
        print(f"[CLEAN LOG] No errors or warnings found in the last {minutes} minutes.")
        sys.exit(0)
    else:
        print(f"[DIRTY LOG] Found {len(culprits)} error/warning entries in the last {minutes} minutes:", file=sys.stderr)
        for c in culprits[-10:]:
            print(format_log_entry(c, show_stack=False), file=sys.stderr)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect Prompt Surgeon jsonl logs.")
    parser.add_argument("--file", help="Path to app.jsonl file")
    parser.add_argument("--tail", "-n", type=int, default=20, help="Number of records to show (default: 20)")
    parser.add_argument("--level", "-l", help="Filter by level (ERROR, WARNING, INFO, etc.)")
    parser.add_argument("--source", "-s", help="Filter by source (backend, frontend)")
    parser.add_argument("--request-id", "-r", help="Filter by request_id")
    parser.add_argument("--grep", "-g", help="Search pattern in message or error")
    parser.add_argument("--since-minutes", "-m", type=int, help="Only entries from the last M minutes")
    parser.add_argument("--errors", action="store_true", help="Shortcut for --level ERROR")
    parser.add_argument("--warnings", action="store_true", help="Shortcut for --level WARNING")
    parser.add_argument("--summary", action="store_true", help="Show summary report")
    parser.add_argument("--clean-check", type=int, metavar="MINUTES", help="Verify no errors/warnings within last N minutes")
    parser.add_argument("--raw-json", action="store_true", help="Output raw JSON instead of formatted text")
    parser.add_argument("--no-stack", action="store_true", help="Do not print stack trace")

    args = parser.parse_args()
    log_file = find_log_file(args.file)

    if args.summary:
        run_summary(log_file)
        return

    if args.clean_check is not None:
        run_clean_check(log_file, args.clean_check)
        return

    target_level = "ERROR" if args.errors else ("WARNING" if args.warnings else (args.level.upper() if args.level else None))
    target_source = args.source.lower() if args.source else None
    target_req_id = args.request_id if args.request_id else None
    grep_pat = re.compile(args.grep, re.IGNORECASE) if args.grep else None

    cutoff = None
    if args.since_minutes:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=args.since_minutes)

    matched: list[dict[str, Any]] = []

    for entry in iter_logs(log_file):
        # Time filter
        if cutoff:
            ts = parse_iso_timestamp(entry.get("timestamp", ""))
            if ts and ts.astimezone(timezone.utc) < cutoff:
                continue

        # Level filter
        if target_level and entry.get("level", "").upper() != target_level:
            continue

        # Source filter
        if target_source and entry.get("source", "").lower() != target_source:
            continue

        # Request ID filter
        if target_req_id and entry.get("request_id") != target_req_id:
            continue

        # Grep filter
        if grep_pat:
            text_corpus = f"{entry.get('message', '')} {json.dumps(entry.get('error', ''))}"
            if not grep_pat.search(text_corpus):
                continue

        matched.append(entry)

    # Apply tail
    if args.tail > 0 and len(matched) > args.tail:
        matched = matched[-args.tail:]

    if not matched:
        print(f"No matching log entries found in {log_file}.")
        return

    for entry in matched:
        if args.raw_json:
            print(json.dumps(entry, ensure_ascii=False))
        else:
            print(format_log_entry(entry, show_stack=not args.no_stack))


if __name__ == "__main__":
    main()
