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


def test_read_log_file_tail_seek(tmp_path, monkeypatch):
    monkeypatch.setattr(server_api, "LOGS_DIR", tmp_path)
    log_file = tmp_path / "backend.log"
    # Create a dummy log file larger than 256KB (e.g. ~500KB)
    line_pattern = "2026-09-17 12:00:00 [INFO] Processing request id {:07d} with payload details and metrics\n"
    # ~80 bytes per line * 7000 lines = ~560KB (> 256KB seek_size)
    lines_data = [line_pattern.format(i) for i in range(1, 7001)]
    log_file.write_text("".join(lines_data), encoding="utf-8")

    assert log_file.stat().st_size > 256 * 1024

    # Request last 20 lines
    exists, content, total_chunk_lines = server_api.read_log_file("backend.log", 20)
    assert exists is True
    result_lines = content.strip().split("\n")
    assert len(result_lines) == 20
    assert "0007000" in result_lines[-1]
    assert "0006981" in result_lines[0]


def test_web_manager_rotating_logger(tmp_path, monkeypatch):
    import logging
    from logging.handlers import RotatingFileHandler

    test_logs_dir = tmp_path / "logs"
    test_logs_dir.mkdir(parents=True, exist_ok=True)
    log_path = test_logs_dir / "web_manager.log"

    logger = logging.getLogger("test_server_manager_rotating")
    logger.setLevel(logging.INFO)
    rf_handler = RotatingFileHandler(
        str(log_path),
        maxBytes=1024,  # 1KB threshold for fast rotation testing
        backupCount=5,
        encoding="utf-8"
    )
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s")
    rf_handler.setFormatter(formatter)
    logger.addHandler(rf_handler)

    try:
        # Write enough lines to cause multiple rotations
        for i in range(100):
            logger.info(f"Rotating log entry #{i:04d} - padding to ensure file size exceeds threshold quickly")

        rf_handler.flush()
        rf_handler.close()

        # Check log file exists
        assert log_path.exists()
        # Check that rotated generation files exist
        assert (test_logs_dir / "web_manager.log.1").exists()
    finally:
        logger.removeHandler(rf_handler)