import os
import sys
import pytest

# Ensure backend root is on sys.path for robust imports across all test runners
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import engine

@pytest.fixture(autouse=True)
def verify_db_pool_clean():
    """Ensure no SQLAlchemy connection leak exists after each test execution."""
    yield
    assert engine.pool.checkedout() == 0, (
        f"DB session/connection leak detected! Checked out connections: {engine.pool.checkedout()}"
    )
