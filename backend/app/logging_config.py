import json
import logging
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects for autonomous AI analysis."""

    def format(self, record: logging.LogRecord) -> str:
        # Generate ISO 8601 timestamp with timezone
        now = datetime.fromtimestamp(record.created, tz=timezone.utc).astimezone()
        log_entry = {
            "timestamp": now.isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "source": getattr(record, "source", "backend"),
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
            "http": getattr(record, "http", None),
            "error": None,
            "extra": getattr(record, "extra", None),
        }

        # Error details & stack trace
        if record.exc_info:
            exc_type, exc_val, _ = record.exc_info
            log_entry["error"] = {
                "type": exc_type.__name__ if exc_type else "Exception",
                "message": str(exc_val),
                "stack_trace": self.formatException(record.exc_info),
            }
        elif getattr(record, "error", None):
            log_entry["error"] = getattr(record, "error")

        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging(log_dir: Path, log_level: str = "INFO", retention_days: int = 7) -> None:
    """Configures root logger with Console (human text) and File (JSON Lines) handlers."""
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "app.jsonl"

    level = getattr(logging, log_level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.handlers.clear()

    # 1. Console Handler (Human-readable)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(console_handler)

    # 2. File Handler (JSON Lines with TimedRotatingFileHandler)
    file_handler = TimedRotatingFileHandler(
        filename=str(log_file),
        when="midnight",
        interval=1,
        backupCount=retention_days,
        encoding="utf-8",
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(file_handler)

    # Mute overly verbose third-party loggers if necessary
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
