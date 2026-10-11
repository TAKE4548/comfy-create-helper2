import pytest
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app import models
from app.services.workflow_scanner import scan_workflow, scan_workflow_variants


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_mapping_master_fallback_param_names_model(db_session):
    mm = models.MappingMaster(
        base_key="seed",
        name="Seed",
        param_name="seed",
        fallback_param_names=json.dumps(["noise_seed", "random_seed"]),
        input_type="int",
    )
    db_session.add(mm)
    db_session.commit()
    db_session.refresh(mm)

    assert mm.id is not None
    assert mm.param_name == "seed"
    assert json.loads(mm.fallback_param_names) == ["noise_seed", "random_seed"]


def test_workflow_scanner_resolves_fallback_parameter():
    class DummyMaster:
        id = 1
        role = "seed"
        base_key = "seed"
        computed_role = "seed"
        expected_class_types = json.dumps(["KSampler"])
        title_patterns = json.dumps(["KSampler"])
        base_title_patterns = json.dumps(["KSampler"])
        param_name = "seed"
        fallback_param_names = json.dumps(["noise_seed", "random_seed"])

    # Workflow where node 1 uses "noise_seed" instead of "seed"
    workflow = {
        "1": {
            "class_type": "KSampler",
            "_meta": {"title": "KSampler Main"},
            "inputs": {
                "noise_seed": 12345,
                "steps": 20,
            }
        }
    }

    result = scan_workflow(workflow, [DummyMaster()])
    assert len(result["matched"]) == 1
    assert result["matched"][0]["node_id"] == "1"
    assert len(result["warnings"]) == 0
