import json
import pytest
from pathlib import Path
import sys

# Import server_api functions
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "tools" / "server-manager"))
import server_api


def test_read_log_file_non_existent(tmp_path, monkeypatch):
    monkeypatch.setattr(server_api, "LOGS_DIR", tmp_path)
    exists, content, total_lines = server_api.read_log_file("not_found.log", 100)
    assert exists is False
    assert "まだ生成されていません" in content
    assert total_lines == 0


def test_read_log_file_existing(tmp_path, monkeypatch):
    monkeypatch.setattr(server_api, "LOGS_DIR", tmp_path)
    log_file = tmp_path / "backend.log"
    test_lines = [f"Log line {i}\n" for i in range(1, 251)]
    log_file.write_text("".join(test_lines), encoding="utf-8")

    # Read last 50 lines
    exists, content, total_lines = server_api.read_log_file("backend.log", 50)
    assert exists is True
    assert total_lines == 250
    lines = content.strip().split("\n")
    assert len(lines) == 50
    assert lines[-1] == "Log line 250"
    assert lines[0] == "Log line 201"


def test_read_log_file_cp932_fallback(tmp_path, monkeypatch):
    monkeypatch.setattr(server_api, "LOGS_DIR", tmp_path)
    log_file = tmp_path / "frontend.log"
    text_cp932 = "テストログ 1行目\nテストログ 2行目\n"
    log_file.write_bytes(text_cp932.encode("cp932"))

    exists, content, total_lines = server_api.read_log_file("frontend.log", 10)
    assert exists is True
    assert total_lines == 2
    assert "テストログ" in content


def test_create_no_window_constant():
    if sys.platform == "win32":
        assert server_api.CREATE_NO_WINDOW == 0x08000000
    else:
        assert server_api.CREATE_NO_WINDOW == 0