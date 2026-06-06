from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    database_url: str = "sqlite:///../db/prompt_surgeon.db"
    snapshot_dir: str = "../db/snapshots"
    llm_base_url: str = "http://localhost:1234/v1"
    llm_model: str = "qwen3.5-9b-sushi-coder-rl"
    comfy_url: str = "http://localhost:8188"
    cors_origins: str = "http://localhost:5173,http://localhost:4173"

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def snapshot_path(self) -> Path:
        p = Path(self.snapshot_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
