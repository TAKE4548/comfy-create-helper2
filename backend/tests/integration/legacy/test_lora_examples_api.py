from datetime import datetime, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.routers.loras import create_lora, update_lora


def make_database():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    models.Base.metadata.create_all(engine)
    return engine


def test_lora_examples_create_update_preserve_clear_and_keep_generated_snapshots():
    engine = make_database()
    with Session(engine) as db:
        payload = schemas.LoraCreate(
            model_name="example-lora.safetensors",
            example_paths=["/uploads/one.png", "/uploads/one.png", "/uploads/two.png"],
        )
        created = create_lora(payload, db)
        assert created.example_paths == ["/uploads/one.png", "/uploads/two.png"]

        workflow = models.Workflow(name="example-workflow", json_body="{}")
        generated = models.Snapshot(workflow=workflow, params="{}", image_path="/snapshots/generated.png")
        duplicate_generated = models.Snapshot(workflow=workflow, params="{}", image_path="/uploads/one.png")
        db.add_all([generated, duplicate_generated])
        db.flush()
        db.add_all([
            models.SnapshotLora(snapshot_id=generated.id, lora_id=created.id, strength=1.0),
            models.SnapshotLora(snapshot_id=duplicate_generated.id, lora_id=created.id, strength=0.9),
        ])
        db.commit()

        current = update_lora(created.id, schemas.LoraCreate(model_name=created.model_name), db)
        assert current.example_paths == ["/uploads/one.png", "/uploads/two.png"]
        assert current.snapshot_paths == ["/uploads/one.png", "/uploads/two.png", "/snapshots/generated.png"]
        assert len(current.snapshot_paths) == 3

        replaced = update_lora(created.id, schemas.LoraCreate(model_name=created.model_name, example_paths=["/uploads/new.png", "/uploads/new.png"]), db)
        assert replaced.example_paths == ["/uploads/new.png"]
        assert "/snapshots/generated.png" in replaced.snapshot_paths
        assert db.scalar(select(models.SnapshotLora).where(models.SnapshotLora.lora_id == created.id)) is not None

        cleared = update_lora(created.id, schemas.LoraCreate(model_name=created.model_name, example_paths=[]), db)
        assert cleared.example_paths == []
        assert cleared.snapshot_paths == ["/uploads/one.png", "/snapshots/generated.png"]
        db.expire_all()
        assert db.scalar(select(models.LoraExampleImage).where(models.LoraExampleImage.lora_id == created.id)) is None
        assert len(db.scalars(select(models.SnapshotLora).where(models.SnapshotLora.lora_id == created.id)).all()) == 2
    engine.dispose()


def test_example_paths_reject_empty_and_base64_values():
    for path in ["", "   ", "data:image/png;base64,abc"]:
        with pytest.raises(ValidationError):
            schemas.LoraCreate(model_name="invalid.safetensors", example_paths=[path])
