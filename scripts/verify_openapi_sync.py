import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    py_exec = sys.executable

    print("[1/2] Checking Backend OpenAPI JSON sync (FastAPI -> backend/openapi.json)...")
    res_be = subprocess.run([py_exec, "scripts/export_openapi.py", "--check"], cwd=root)
    if res_be.returncode != 0:
        print("Backend OpenAPI sync check failed! Run 'python scripts/export_openapi.py' to update.")
        sys.exit(1)

    print("[2/2] Checking Frontend TypeScript types sync (backend/openapi.json -> frontend/src/api/schema.ts)...")
    fe_dir = root / "frontend"
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    res_fe = subprocess.run([npm_cmd, "run", "openapi:check"], cwd=fe_dir)
    if res_fe.returncode != 0:
        print("Frontend OpenAPI types sync check failed! Run 'npm run openapi:generate' in frontend/ to update.")
        sys.exit(1)

    print("All OpenAPI contracts are completely in sync!")
    sys.exit(0)


if __name__ == "__main__":
    main()
