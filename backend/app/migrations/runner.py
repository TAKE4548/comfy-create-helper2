from typing import Callable, List, Optional
import logging
from sqlalchemy import inspect
from sqlalchemy.engine import Engine, Connection
from app.database import engine as default_engine
from app.migrations.steps import ALL_MIGRATION_STEPS, MigrationStep

logger = logging.getLogger(__name__)


class MigrationRunner:
    """マイグレーションステップを順序制御して実行するランナー"""

    def __init__(self, steps: Optional[List[MigrationStep]] = None):
        self.steps: List[MigrationStep] = steps or list(ALL_MIGRATION_STEPS)

    def register(self, step: MigrationStep) -> None:
        self.steps.append(step)

    def run(self, target_engine: Optional[Engine] = None) -> None:
        """指定された Engine（未指定時はデフォルト DB engine）に対してマイグレーションを実行"""
        eng = target_engine if target_engine is not None else default_engine
        with eng.begin() as conn:
            inspector = inspect(conn)
            for step in self.steps:
                try:
                    step.apply(conn, inspector)
                except Exception as e:
                    logger.error(f"Migration step failed [{step.step_id} - {step.name}]: {e}")
                    raise


def run_migrations(target_engine: Optional[Engine] = None) -> None:
    """FastAPI の lifespan やスクリプト、テストから呼び出されるマイグレーション実行エントリーポイント"""
    runner = MigrationRunner()
    runner.run(target_engine=target_engine)
