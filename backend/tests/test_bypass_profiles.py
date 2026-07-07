import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models

# Set up in-memory DB for testing
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


class TestBypassProfilesAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        # Create all tables
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        # Create a test workflow
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

    def test_create_bypass_profile(self):
        payload = {
            "name": "Bypass A",
            "bypassed_node_ids": ["1", "2", "3"]
        }
        response = self.client.post(f"/api/workflows/{self.workflow.id}/bypass-profiles", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["id"] is not None
        assert data["workflow_id"] == self.workflow.id
        assert data["name"] == "Bypass A"
        assert data["bypassed_node_ids"] == ["1", "2", "3"]
        assert data["is_enabled"] is True
        assert "created_at" in data

        # Test error when workflow not found
        response_bad = self.client.post("/api/workflows/9999/bypass-profiles", json=payload)
        assert response_bad.status_code == 404

    def test_list_bypass_profiles(self):
        # Add bypass profiles directly
        p1 = models.BypassProfile(
            workflow_id=self.workflow.id,
            name="Profile 1",
            bypassed_node_ids='["10", "11"]',
            is_enabled=True
        )
        p2 = models.BypassProfile(
            workflow_id=self.workflow.id,
            name="Profile 2",
            bypassed_node_ids='["20"]',
            is_enabled=False
        )
        self.db.add_all([p1, p2])
        self.db.commit()

        response = self.client.get(f"/api/workflows/{self.workflow.id}/bypass-profiles")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Profile 1"
        assert data[0]["bypassed_node_ids"] == ["10", "11"]
        assert data[0]["is_enabled"] is True
        assert data[1]["name"] == "Profile 2"
        assert data[1]["bypassed_node_ids"] == ["20"]
        assert data[1]["is_enabled"] is False

        # Test error when workflow not found
        response_bad = self.client.get("/api/workflows/9999/bypass-profiles")
        assert response_bad.status_code == 404

    def test_update_bypass_profile(self):
        p = models.BypassProfile(
            workflow_id=self.workflow.id,
            name="Original",
            bypassed_node_ids='["1"]',
            is_enabled=True
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        # Update name
        payload = {"name": "Updated Name"}
        response = self.client.put(f"/api/bypass-profiles/{p.id}", json=payload)
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"
        assert response.json()["bypassed_node_ids"] == ["1"]
        assert response.json()["is_enabled"] is True

        # Update bypassed_node_ids and is_enabled
        payload = {"bypassed_node_ids": ["5", "6"], "is_enabled": False}
        response = self.client.put(f"/api/bypass-profiles/{p.id}", json=payload)
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"
        assert response.json()["bypassed_node_ids"] == ["5", "6"]
        assert response.json()["is_enabled"] is False

        # Test error when not found
        response_bad = self.client.put("/api/bypass-profiles/9999", json=payload)
        assert response_bad.status_code == 404

    def test_delete_bypass_profile(self):
        p = models.BypassProfile(
            workflow_id=self.workflow.id,
            name="ToDelete",
            bypassed_node_ids='[]',
            is_enabled=True
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        response = self.client.delete(f"/api/bypass-profiles/{p.id}")
        assert response.status_code == 204

        # Verify deletion in DB
        db_p = self.db.query(models.BypassProfile).filter(models.BypassProfile.id == p.id).first()
        assert db_p is None

        # Test error when not found
        response_bad = self.client.delete("/api/bypass-profiles/9999")
        assert response_bad.status_code == 404
