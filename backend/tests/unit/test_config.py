"""Unit tests for Settings configuration (isolated parsing & property tests)."""
from pathlib import Path
from app.config import Settings


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
