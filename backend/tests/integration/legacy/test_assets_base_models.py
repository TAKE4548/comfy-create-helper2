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

class TestAssetsBaseModels(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        # Seed default base models
        self.illus = models.BaseModel(name="Illus")
        self.noob = models.BaseModel(name="Noob")
        self.anima = models.BaseModel(name="Anima")
        self.db.add_all([self.illus, self.noob, self.anima])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_lora_creation_and_update_with_base_models(self):
        # Create
        payload = {
            "model_name": "Test Lora A",
            "target_base_model_ids": [self.illus.id, self.noob.id]
        }
        response = self.client.post("/api/loras", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(sorted(data["target_base_model_ids"]), sorted([self.illus.id, self.noob.id]))

        # Update
        payload_update = {
            "model_name": "Test Lora A",
            "target_base_model_ids": [self.noob.id, self.anima.id]
        }
        response = self.client.put(f"/api/loras/{data['id']}", json=payload_update)
        self.assertEqual(response.status_code, 200)
        data_update = response.json()
        self.assertEqual(sorted(data_update["target_base_model_ids"]), sorted([self.noob.id, self.anima.id]))

    def test_lora_listing_filters(self):
        # Create Loras with different base models
        lora1 = models.Lora(model_name="Lora Illus")
        lora1.base_models.append(self.illus)
        
        lora2 = models.Lora(model_name="Lora Noob")
        lora2.base_models.append(self.noob)
        
        lora3 = models.Lora(model_name="Lora Both")
        lora3.base_models.append(self.illus)
        lora3.base_models.append(self.noob)

        self.db.add_all([lora1, lora2, lora3])
        self.db.commit()

        # 1. Filter by Illus only
        response = self.client.get(f"/api/loras?base_model_ids={self.illus.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [l["model_name"] for l in data]
        self.assertEqual(len(names), 2)
        self.assertIn("Lora Illus", names)
        self.assertIn("Lora Both", names)

        # 2. Filter by both Illus and Noob (OR filter, distinct check)
        response = self.client.get(f"/api/loras?base_model_ids={self.illus.id},{self.noob.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [l["model_name"] for l in data]
        self.assertEqual(len(names), 3) # distinct ensures size is 3, not 4 (Lora Both shouldn't duplicate)
        self.assertIn("Lora Illus", names)
        self.assertIn("Lora Noob", names)
        self.assertIn("Lora Both", names)

        # 3. Filter by Anima (empty result)
        response = self.client.get(f"/api/loras?base_model_ids={self.anima.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 0)

    def test_tag_set_creation_and_update_with_base_models(self):
        # Create
        payload = {
            "name": "Test TagSet A",
            "tags": ["tag1", "tag2"],
            "target_base_model_ids": [self.illus.id, self.noob.id]
        }
        response = self.client.post("/api/tag-sets", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(sorted(data["target_base_model_ids"]), sorted([self.illus.id, self.noob.id]))

        # Update
        payload_update = {
            "name": "Test TagSet A",
            "tags": ["tag1", "tag2"],
            "target_base_model_ids": [self.noob.id, self.anima.id]
        }
        response = self.client.put(f"/api/tag-sets/{data['id']}", json=payload_update)
        self.assertEqual(response.status_code, 200)
        data_update = response.json()
        self.assertEqual(sorted(data_update["target_base_model_ids"]), sorted([self.noob.id, self.anima.id]))

    def test_tag_set_listing_filters(self):
        # Create TagSets with different base models
        ts1 = models.TagSet(name="TagSet Illus", tags="[]")
        ts1.base_models.append(self.illus)
        
        ts2 = models.TagSet(name="TagSet Noob", tags="[]")
        ts2.base_models.append(self.noob)
        
        ts3 = models.TagSet(name="TagSet Both", tags="[]")
        ts3.base_models.append(self.illus)
        ts3.base_models.append(self.noob)

        self.db.add_all([ts1, ts2, ts3])
        self.db.commit()

        # 1. Filter by Illus only
        response = self.client.get(f"/api/tag-sets?base_model_ids={self.illus.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [t["name"] for t in data]
        self.assertEqual(len(names), 2)
        self.assertIn("TagSet Illus", names)
        self.assertIn("TagSet Both", names)

        # 2. Filter by both Illus and Noob (OR filter, distinct check)
        response = self.client.get(f"/api/tag-sets?base_model_ids={self.illus.id},{self.noob.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [t["name"] for t in data]
        self.assertEqual(len(names), 3)
        self.assertIn("TagSet Illus", names)
        self.assertIn("TagSet Noob", names)
        self.assertIn("TagSet Both", names)