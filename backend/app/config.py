from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///../db/prompt_surgeon.db"
    snapshot_dir: str = "../db/snapshots"
    llm_base_url: str = "http://localhost:1234/v1"
    llm_model: str = "qwen3.5-9b-sushi-coder-rl"
    comfy_url: str = "http://localhost:8188"
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    log_dir: str = "../logs"
    log_level: str = "INFO"
    log_retention_days: int = 7
    frontend_dist_dir: str = "../frontend/dist"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def snapshot_path(self) -> Path:
        p = Path(self.snapshot_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def log_path(self) -> Path:
        p = Path(self.log_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def frontend_dist_path(self) -> Path:
        p = Path(self.frontend_dist_dir)
        if p.exists():
            return p.resolve()
        alt = Path("frontend/dist")
        if alt.exists():
            return alt.resolve()
        alt_parent = Path("../frontend/dist")
        if alt_parent.exists():
            return alt_parent.resolve()
        return p.resolve()


settings = Settings()
