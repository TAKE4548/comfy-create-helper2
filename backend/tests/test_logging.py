import json
import logging
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
import pytest
from app.logging_config import JSONFormatter, setup_logging


def test_json_formatter_produces_valid_json():
    formatter = JSONFormatter()
    record = logging.LogRecord(
        name="test.logger",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="Test message with param: %s",
        args=("foo",),
        exc_info=None,
    )
    formatted = formatter.format(record)
    data = json.loads(formatted)
    assert data["level"] == "INFO"
    assert data["message"] == "Test message with param: foo"
    assert data["source"] == "backend"
    assert data["logger"] == "test.logger"
    assert "timestamp" in data
    assert data["error"] is None


def test_json_formatter_captures_exception():
    formatter = JSONFormatter()
    try:
        raise ValueError("Something went wrong")
    except Exception:
        import sys
        exc_info = sys.exc_info()

    record = logging.LogRecord(
        name="test.logger",
        level=logging.ERROR,
        pathname=__file__,
        lineno=25,
        msg="An error occurred",
        args=(),
        exc_info=exc_info,
    )
    formatted = formatter.format(record)
    data = json.loads(formatted)
    assert data["level"] == "ERROR"
    assert data["error"] is not None
    assert data["error"]["type"] == "ValueError"
    assert "Something went wrong" in data["error"]["message"]
    assert "Traceback" in data["error"]["stack_trace"]


def test_setup_logging_configures_handlers(tmp_path: Path):
    setup_logging(log_dir=tmp_path, log_level="INFO", retention_days=7)
    root_logger = logging.getLogger()

    file_handlers = [h for h in root_logger.handlers if isinstance(h, TimedRotatingFileHandler)]
    assert len(file_handlers) == 1
    handler = file_handlers[0]
    assert handler.backupCount == 7
    assert isinstance(handler.formatter, JSONFormatter)
    assert Path(handler.baseFilename).name == "app.jsonl"


from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_request_logging_middleware_header():
    response = client.get("/health")
    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert response.headers["X-Request-ID"].startswith("req-")


def test_client_logs_endpoint():
    payload = {
        "level": "error",
        "message": "Frontend test error",
        "component": "TestComponent",
        "stack": "Error: Frontend test error\n  at TestComponent",
    }
    response = client.post("/api/system/client-logs", json=payload)
    assert response.status_code == 204
