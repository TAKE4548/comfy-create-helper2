import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


class TestParamSyncGroupsAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        self.workflow = models.Workflow(name="test_wf", json_body="{}")
        self.db.add(self.workflow)
        self.db.commit()
        self.db.refresh(self.workflow)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_create_param_sync_group(self):
        payload = {
            "name": "Sync Group 1",
            "master_role": "ckpt_name",
            "slave_roles": ["refiner_ckpt_name", "vae_name"],
            "is_enabled": True
        }
        response = self.client.post(f"/api/workflows/{self.workflow.id}/param-sync-groups", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["id"] is not None
        assert data["workflow_id"] == self.workflow.id
        assert data["name"] == "Sync Group 1"
        assert data["master_role"] == "ckpt_name"
        assert data["slave_roles"] == ["refiner_ckpt_name", "vae_name"]
        assert data["is_enabled"] is True
        assert "created_at" in data

        # Test 404 when workflow not found
        response_bad = self.client.post("/api/workflows/9999/param-sync-groups", json=payload)
        assert response_bad.status_code == 404

    def test_list_param_sync_groups(self):
        g1 = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="Group A",
            master_role="seed",
            slave_roles='["subseed"]',
            is_enabled=True
        )
        g2 = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="Group B",
            master_role="cfg",
            slave_roles='["refiner_cfg"]',
            is_enabled=False
        )
        self.db.add_all([g1, g2])
        self.db.commit()

        response = self.client.get(f"/api/workflows/{self.workflow.id}/param-sync-groups")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Group A"
        assert data[0]["master_role"] == "seed"
        assert data[0]["slave_roles"] == ["subseed"]
        assert data[0]["is_enabled"] is True

        assert data[1]["name"] == "Group B"
        assert data[1]["master_role"] == "cfg"
        assert data[1]["slave_roles"] == ["refiner_cfg"]
        assert data[1]["is_enabled"] is False

        # Test 404 when workflow not found
        response_bad = self.client.get("/api/workflows/9999/param-sync-groups")
        assert response_bad.status_code == 404

    def test_update_param_sync_group(self):
        g = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="Orig Name",
            master_role="master1",
            slave_roles='["slave1"]',
            is_enabled=False
        )
        self.db.add(g)
        self.db.commit()
        self.db.refresh(g)

        payload = {"name": "New Name", "is_enabled": True, "slave_roles": ["slave1", "slave2"]}
        response = self.client.put(f"/api/param-sync-groups/{g.id}", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Name"
        assert data["master_role"] == "master1"
        assert data["slave_roles"] == ["slave1", "slave2"]
        assert data["is_enabled"] is True

        response_bad = self.client.put("/api/param-sync-groups/9999", json=payload)
        assert response_bad.status_code == 404

    def test_delete_param_sync_group(self):
        g = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="ToDelete",
            master_role="master1",
            slave_roles='[]',
            is_enabled=False
        )
        self.db.add(g)
        self.db.commit()
        self.db.refresh(g)

        response = self.client.delete(f"/api/param-sync-groups/{g.id}")
        assert response.status_code == 204

        db_g = self.db.query(models.ParamSyncGroup).filter(models.ParamSyncGroup.id == g.id).first()
        assert db_g is None

        response_bad = self.client.delete("/api/param-sync-groups/9999")
        assert response_bad.status_code == 404
