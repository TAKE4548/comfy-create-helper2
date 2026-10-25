"""Unit tests for Settings configuration (isolated parsing & property tests)."""
import logging
from pathlib import Path
from sqlalchemy import create_engine, text
from app.config import Settings
from app.database import configure_sqlite_pragmas
from app.logging_config import setup_logging


def test_settings_default_values_and_types() -> None:
    """[REQ-356/AC-11] Settings loads default configuration with correct types."""
    settings = Settings()
    assert isinstance(settings.database_url, str)
    assert settings.database_url.startswith("sqlite:///")
    assert isinstance(settings.snapshot_dir, str)
    assert isinstance(settings.comfy_url, str)
    assert isinstance(settings.llm_base_url, str)
    assert isinstance(settings.llm_model, str)
    assert isinstance(settings.cors_origins, str)
    assert isinstance(settings.log_retention_days, int)
    assert settings.log_retention_days > 0


def test_settings_cors_origins_list_parsing() -> None:
    """[REQ-356/AC-11] Settings parses comma-separated cors_origins into trimmed list."""
    custom = Settings(cors_origins="http://localhost:5173, http://127.0.0.1:3000 , https://app.example.com")
    parsed = custom.cors_origins_list
    assert parsed == [
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "https://app.example.com",
    ]


def test_settings_cors_origins_single_entry() -> None:
    """[REQ-356/AC-11] Settings handles single CORS origin without comma."""
    custom = Settings(cors_origins="http://example.com")
    assert custom.cors_origins_list == ["http://example.com"]


def test_settings_custom_overrides() -> None:
    """[REQ-356/AC-11] Settings accepts custom constructor overrides."""
    custom = Settings(
        database_url="sqlite:///custom.db",
        comfy_url="http://remote-gpu:8188",
        log_level="DEBUG",
    )
    assert custom.database_url == "sqlite:///custom.db"
    assert custom.comfy_url == "http://remote-gpu:8188"
    assert custom.log_level == "DEBUG"


def test_settings_snapshot_path_resolves(tmp_path: Path) -> None:
    """[REQ-356/AC-11] snapshot_path property returns created directory Path object."""
    target_dir = tmp_path / "custom_snapshots"
    custom = Settings(snapshot_dir=str(target_dir))
    path = custom.snapshot_path
    assert isinstance(path, Path)
    assert path == target_dir
    assert path.is_dir()


def test_req387_ac7_sqlite_file_engine_uses_wal_and_busy_timeout(tmp_path: Path) -> None:
    """[REQ-387/AC-7] SQLite file engine gets WAL journal mode and busy_timeout=5000 on connect."""
    engine = create_engine(f"sqlite:///{tmp_path / 't.db'}")
    configure_sqlite_pragmas(engine)
    try:
        with engine.connect() as conn:
            assert conn.execute(text("PRAGMA journal_mode")).scalar() == "wal"
            assert conn.execute(text("PRAGMA busy_timeout")).scalar() == 5000
    finally:
        engine.dispose()

    memory_engine = create_engine("sqlite:///:memory:")
    configure_sqlite_pragmas(memory_engine)
    try:
        with memory_engine.connect() as conn:
            assert conn.execute(text("SELECT 1")).scalar() == 1
    finally:
        memory_engine.dispose()


def test_req387_ac7_httpx_logger_is_warning_after_setup_logging(tmp_path: Path) -> None:
    """[REQ-387/AC-7] setup_logging raises httpx and httpcore loggers to WARNING."""
    root = logging.getLogger()
    saved_handlers = list(root.handlers)
    saved_level = root.level
    try:
        setup_logging(tmp_path, "INFO", 1)
        assert logging.getLogger("httpx").level == logging.WARNING
        assert logging.getLogger("httpcore").level == logging.WARNING
    finally:
        for handler in list(root.handlers):
            if handler not in saved_handlers:
                handler.close()
        root.handlers = saved_handlers
        root.setLevel(saved_level)
