import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import GenerationJob
from app.schemas.generation import JobView
from app.services.generation_repository import GenerationRepository


def _job(metadata_json: str, set_name: str | None = "Saved set") -> GenerationJob:
    return GenerationJob(
        job_id="job-1",
        request_id="request-1",
        item_index=0,
        payload_hash="hash",
        session_id="session-1",
        scope="normal",
        batch_id="batch-1",
        set_name=set_name,
        status="queued",
        graph_json="{}",
        metadata_json=metadata_json,
        outputs_json="[]",
    )


def _snapshot(metadata_json: str, set_name: str | None = "Saved set") -> dict:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    with session_factory() as session:
        session.add(_job(metadata_json, set_name))
        session.commit()
        result = GenerationRepository(session_factory).snapshot()
    engine.dispose()
    return result["jobs"][0]


def test_snapshot_shows_persisted_set_name_and_recorded_positive_prompt_fields_only() -> None:
    record = {
        "version": 1,
        "fields": [
            {"input_type": "textarea", "recorded": True, "value": "blue sky", "role": "positive", "display_name": "Prompt", "status": "submitted"},
            {"input_type": "textarea", "recorded": True, "value": "avoid blur", "role": "negative", "display_name": "Negative prompt", "status": "submitted"},
            {"input_type": "textarea", "recorded": True, "value": "avoid noise", "role": "positive", "display_name": "ネガティブプロンプト", "status": "submitted"},
            {"input_type": "textarea", "recorded": False, "value": "not submitted", "role": "positive", "display_name": "Draft", "status": "bypassed"},
            {"input_type": "text", "recorded": True, "value": "not a prompt field", "role": "positive", "display_name": "Other", "status": "submitted"},
        ],
    }
    metadata = {
        "param_values": {
            "__prompt_surgeon_metadata_v1": json.dumps(record),
            "__private_debug": "private text",
            "model_name": "current editor must not be used",
        }
    }

    view = _snapshot(json.dumps(metadata), "Portrait set")

    assert view["set_name"] == "Portrait set"
    assert view["prompt_excerpt"] == "blue sky"
    assert JobView.model_validate(view).prompt_excerpt == "blue sky"


def test_snapshot_uses_only_explicit_legacy_positive_prompt_keys() -> None:
    metadata = {
        "param_values": {
            "prompt": "positive prompt",
            "negative_prompt": "negative prompt",
            "Prompt_Positive": "second positive",
            "model_name": "checkpoint name",
            "__debug": "private value",
        }
    }

    view = _snapshot(json.dumps(metadata), None)

    assert view["set_name"] is None
    assert view["prompt_excerpt"] == "positive prompt; second positive"


def test_snapshot_truncates_prompt_excerpt_to_160_characters() -> None:
    metadata = {"param_values": {"positive_prompt": "x" * 180}}
    view = _snapshot(json.dumps(metadata))

    assert view["prompt_excerpt"] == "x" * 160


def test_snapshot_returns_none_for_malformed_or_missing_metadata() -> None:
    assert _snapshot("not-json")["prompt_excerpt"] is None
    assert _snapshot(json.dumps({"param_values": {"model_name": "model"}}))["prompt_excerpt"] is None
