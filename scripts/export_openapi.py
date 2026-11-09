import argparse
import difflib
import json
from pathlib import Path
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Export or check FastAPI OpenAPI JSON without side effects.")
    parser.add_argument("--output", type=Path, default=Path("backend/openapi.json"), help="Output JSON path")
    parser.add_argument("--check", action="store_true", help="Check if output is up-to-date without modifying file")
    parser.add_argument("--indent", type=int, default=2, help="JSON indentation level")
    args = parser.parse_args()

    # Import app without triggering lifespan
    sys.path.insert(0, str(Path("backend").resolve()))
    from app.main import app

    schema = app.openapi()
    generated_json = json.dumps(schema, indent=args.indent, ensure_ascii=False) + "\n"

    target_path = args.output
    if args.check:
        if not target_path.exists():
            print(f"Error: Target file {target_path} does not exist.")
            sys.exit(1)
        current_json = target_path.read_text(encoding="utf-8")
        if current_json != generated_json:
            print(f"Drift detected in {target_path}!")
            diff = difflib.unified_diff(
                current_json.splitlines(), generated_json.splitlines(),
                fromfile="current", tofile="generated", lineterm=""
            )
            print("\n".join(diff))
            sys.exit(1)
        print(f"OpenAPI schema {target_path} is up-to-date.")
        sys.exit(0)
    else:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(generated_json, encoding="utf-8", newline="\n")
        print(f"Successfully exported OpenAPI JSON to {target_path}")


if __name__ == "__main__":
    main()
