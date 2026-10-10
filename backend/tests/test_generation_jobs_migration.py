import sqlalchemy as sa
import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError

from app.migrations.steps import ALL_MIGRATION_STEPS, step_027_generation_jobs
from app.models import GenerationJob


def apply_generation_jobs_migration(engine) -> None:
    with engine.begin() as conn:
        step_027_generation_jobs(conn, sa.inspect(conn))


def test_step_027_is_registered_and_creates_expected_schema_idempotently():
    assert [step.step_id for step in ALL_MIGRATION_STEPS].count("027") == 1
    engine = create_engine("sqlite:///:memory:")
    try:
        apply_generation_jobs_migration(engine)
        apply_generation_jobs_migration(engine)

        inspector = sa.inspect(engine)
        assert "generation_jobs" in inspector.get_table_names()
        columns = {column["name"]: column for column in inspector.get_columns("generation_jobs")}
        assert set(columns) == {
            "job_id", "request_id", "item_index", "payload_hash", "prompt_id",
            "session_id", "scope", "batch_id", "normal_group_id", "project_id",
            "set_name", "status", "graph_json", "metadata_json", "outputs_json",
            "node_json", "accepted_at", "started_at", "finished_at", "failure_json",
            "cancel_requested",
        }
        assert columns["prompt_id"]["nullable"] is True
        assert columns["graph_json"]["nullable"] is True
        assert columns["metadata_json"]["nullable"] is False
        assert columns["outputs_json"]["nullable"] is False
        assert columns["status"]["default"] == "'queued'"
        assert columns["cancel_requested"]["default"] in ("0", "false")
        assert columns["accepted_at"]["default"] == "CURRENT_TIMESTAMP"
        assert {index["name"] for index in inspector.get_indexes("generation_jobs")} >= {
            "ix_generation_jobs_batch_id",
            "ix_generation_jobs_normal_group_id",
            "ix_generation_jobs_status",
        }
    finally:
        engine.dispose()


def test_migration_preserves_existing_legacy_rows_and_existing_generation_rows():
    engine = create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as conn:
            conn.execute(sa.text("CREATE TABLE prompt_metadata (prompt_id TEXT PRIMARY KEY, param_values TEXT NOT NULL)"))
            conn.execute(sa.text("CREATE TABLE snapshots (id INTEGER PRIMARY KEY, image_path TEXT NOT NULL)"))
            conn.execute(
                sa.text("INSERT INTO prompt_metadata VALUES (:prompt_id, :params)"),
                {"prompt_id": "old-prompt", "params": '{"x":1}'},
            )
            conn.execute(sa.text("INSERT INTO snapshots VALUES (1, 'legacy/image.png')"))
        apply_generation_jobs_migration(engine)
        with engine.begin() as conn:
            conn.execute(sa.text(
                "INSERT INTO generation_jobs "
                "(job_id, request_id, item_index, payload_hash, session_id, scope, batch_id, "
                "metadata_json, outputs_json) "
                "VALUES ('job-old', 'req-old', 0, 'hash', 'session', 'normal', 'batch', '{}', '[]')"
            ))

        apply_generation_jobs_migration(engine)
        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT param_values FROM prompt_metadata WHERE prompt_id='old-prompt'")).scalar_one() == '{"x":1}'
            assert conn.execute(sa.text("SELECT image_path FROM snapshots WHERE id=1")).scalar_one() == "legacy/image.png"
            assert conn.execute(sa.text("SELECT job_id FROM generation_jobs")).scalar_one() == "job-old"
    finally:
        engine.dispose()


def test_schema_enforces_request_item_and_non_null_prompt_uniqueness_but_allows_null_prompt_ids():
    engine = create_engine("sqlite:///:memory:")
    try:
        apply_generation_jobs_migration(engine)
        with engine.begin() as conn:
            conn.execute(sa.text(
                "INSERT INTO generation_jobs "
                "(job_id, request_id, item_index, payload_hash, session_id, scope, batch_id, "
                "metadata_json, outputs_json) VALUES "
                "('j1','r1',0,'h','s','normal','b1','{}','[]'), "
                "('j2','r2',0,'h','s','studio','b2','{}','[]')"
            ))
            conn.execute(sa.text(
                "INSERT INTO generation_jobs "
                "(job_id, request_id, item_index, payload_hash, prompt_id, session_id, scope, batch_id, "
                "metadata_json, outputs_json) VALUES "
                "('j3','r3',0,'h','prompt-1','s','normal','b3','{}','[]')"
            ))

        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(sa.text(
                    "INSERT INTO generation_jobs "
                    "(job_id, request_id, item_index, payload_hash, session_id, scope, batch_id, "
                    "metadata_json, outputs_json) VALUES ('j4','r1',0,'h','s','normal','b4','{}','[]')"
                ))
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(sa.text(
                    "INSERT INTO generation_jobs "
                    "(job_id, request_id, item_index, payload_hash, prompt_id, session_id, scope, batch_id, "
                    "metadata_json, outputs_json) VALUES ('j5','r5',0,'h','prompt-1','s','normal','b5','{}','[]')"
                ))
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(sa.text(
                    "INSERT INTO generation_jobs "
                    "(job_id, request_id, item_index, payload_hash, session_id, scope, batch_id, "
                    "metadata_json, outputs_json) VALUES ('j6','r6',0,'h','s','other','b6','{}','[]')"
                ))
    finally:
        engine.dispose()


def test_orm_model_matches_persisted_contract():
    table = GenerationJob.__table__
    assert set(table.columns.keys()) == {
        "job_id", "request_id", "item_index", "payload_hash", "prompt_id",
        "session_id", "scope", "batch_id", "normal_group_id", "project_id",
        "set_name", "status", "graph_json", "metadata_json", "outputs_json",
        "node_json", "accepted_at", "started_at", "finished_at", "failure_json",
        "cancel_requested",
    }
    assert table.c.job_id.primary_key
    assert table.c.prompt_id.unique
    assert table.c.prompt_id.nullable
    assert any(
        constraint.name == "uq_generation_jobs_request_item"
        and {column.name for column in constraint.columns} == {"request_id", "item_index"}
        for constraint in table.constraints
    )
