import os
import sys
import pytest
import respx
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

# Ensure backend root is on sys.path for robust imports across all test runners
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.database import Base, engine
from app.main import app
from app import models  # Register all models with Base.metadata


@pytest.fixture(scope="session")
def db_engine():
    """In-memory SQLite engine with all metadata tables pre-created."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture
def db_session(db_engine):
    """Isolated DB session wrapped in a SAVEPOINT with automatic commit interceptor."""
    connection = db_engine.connect()
    transaction = connection.begin()
    nested = connection.begin_nested()
    session = Session(bind=connection)

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, trans):
        nonlocal nested
        if trans.nested and not trans._parent.nested:
            nested = connection.begin_nested()

    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(autouse=True)
def isolated_snapshot_dir(tmp_path, monkeypatch):
    """Isolate snapshot storage to a temporary directory to prevent writing to production db/snapshots."""
    test_snapshot_dir = tmp_path / "snapshots"
    test_snapshot_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "snapshot_dir", str(test_snapshot_dir))
    return test_snapshot_dir


@pytest.fixture(autouse=True)
def mock_external_services():
    """Intercept and block all unauthorized external HTTP calls (ComfyUI :8188, LM Studio :1234, etc.)."""
    with respx.mock(assert_all_called=False) as respx_router:
        yield respx_router


@pytest.fixture(autouse=True)
def clean_dependency_overrides():
    """Ensure FastAPI dependency overrides are always cleaned up after each test."""
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def verify_db_pool_clean():
    """Ensure no SQLAlchemy connection leak exists after each test execution."""
    yield
    assert engine.pool.checkedout() == 0, (
        f"DB session/connection leak detected! Checked out connections: {engine.pool.checkedout()}"
    )

