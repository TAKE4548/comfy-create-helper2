import sqlalchemy as sa
from sqlalchemy import create_engine

from app import models
from app.database import Base
from app.migrations import run_migrations


def _sqlite_engine():
    return create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})


def test_registered_migration_adds_nullable_thumbnail_and_preserves_legacy_rows():
    engine = _sqlite_engine()
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE tag_subsets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"))
        conn.execute(sa.text("INSERT INTO tag_subsets (id, name) VALUES (7, 'Legacy subset')"))

    run_migrations(target_engine=engine)
    run_migrations(target_engine=engine)

    with engine.connect() as conn:
        columns = {column["name"]: column for column in sa.inspect(conn).get_columns("tag_subsets")}
        assert "thumbnail_path" in columns
        assert columns["thumbnail_path"]["nullable"] is True
        assert conn.execute(sa.text("SELECT id, name, thumbnail_path FROM tag_subsets")).one() == (
            7,
            "Legacy subset",
            None,
        )
    engine.dispose()


def test_fresh_model_database_has_nullable_thumbnail_and_runs_registered_migrations():
    # Importing models registers their tables on Base.metadata.
    assert models is not None
    engine = _sqlite_engine()
    Base.metadata.create_all(bind=engine)

    run_migrations(target_engine=engine)

    with engine.connect() as conn:
        columns = {column["name"]: column for column in sa.inspect(conn).get_columns("tag_subsets")}
        assert "thumbnail_path" in columns
        assert columns["thumbnail_path"]["nullable"] is True
    engine.dispose()
