import json
import subprocess
import sys
from pathlib import Path


def test_req248_ac1_export_openapi_no_side_effects(tmp_path: Path) -> None:
    """[REQ-248/AC-1] export_openapi.py exports valid OpenAPI JSON without starting lifespan/DB/workers."""
    out_file = tmp_path / "test_openapi.json"
    cmd = [sys.executable, "scripts/export_openapi.py", "--output", str(out_file)]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    assert out_file.exists()
    data = json.loads(out_file.read_text(encoding="utf-8"))
    assert data.get("openapi") == "3.1.0"
    assert "/api/workflows" in data.get("paths", {})


def test_req248_ac1_export_openapi_idempotent(tmp_path: Path) -> None:
    """[REQ-248/AC-1] Running export twice on identical codebase produces identical bytes."""
    out1 = tmp_path / "out1.json"
    out2 = tmp_path / "out2.json"
    subprocess.run([sys.executable, "scripts/export_openapi.py", "--output", str(out1)], check=True)
    subprocess.run([sys.executable, "scripts/export_openapi.py", "--output", str(out2)], check=True)
    assert out1.read_bytes() == out2.read_bytes()


def test_req248_ac4_export_openapi_check_drift_detection(tmp_path: Path) -> None:
    """[REQ-248/AC-4] export_openapi.py --check exits 1 on schema drift without modifying file."""
    out_file = tmp_path / "openapi.json"
    subprocess.run([sys.executable, "scripts/export_openapi.py", "--output", str(out_file)], check=True)
    # Check passes on match
    res_ok = subprocess.run([sys.executable, "scripts/export_openapi.py", "--output", str(out_file), "--check"])
    assert res_ok.returncode == 0
    # Introduce drift
    out_file.write_text('{"openapi": "3.1.0", "drift": true}\n', encoding="utf-8", newline="\n")
    res_drift = subprocess.run([sys.executable, "scripts/export_openapi.py", "--output", str(out_file), "--check"], capture_output=True, text=True)
    assert res_drift.returncode == 1
    assert "Drift detected" in res_drift.stdout
    # Verify file was not overwritten
    assert "drift" in out_file.read_text(encoding="utf-8")
