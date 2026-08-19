import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db

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


class TestSpeechBubblePresetsAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)

    def tearDown(self):
        Base.metadata.drop_all(bind=connection)
        if self.old_override:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_list_presets_empty(self):
        response = self.client.get("/api/speech-bubble-presets")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_create_and_get_preset(self):
        payload = {
            "name": "Default Comic",
            "shape": "oval",
            "orientation": "vertical",
            "font_family": "sans-serif",
            "font_size": 24,
            "text_color": "rgba(0, 0, 0, 1)",
            "background_color": "rgba(255, 255, 255, 0.95)",
            "border_color": "rgba(0, 0, 0, 1)",
            "border_width": 3,
            "sort_order": 1,
        }
        res_create = self.client.post("/api/speech-bubble-presets", json=payload)
        self.assertEqual(res_create.status_code, 201)
        data = res_create.json()
        self.assertEqual(data["name"], "Default Comic")
        self.assertEqual(data["shape"], "oval")
        self.assertEqual(data["orientation"], "vertical")
        self.assertEqual(data["font_family"], "sans-serif")
        self.assertEqual(data["font_size"], 24)
        self.assertEqual(data["border_width"], 3)
        self.assertEqual(data["sort_order"], 1)
        self.assertIn("id", data)
        self.assertIn("created_at", data)
        preset_id = data["id"]

        # List
        res_list = self.client.get("/api/speech-bubble-presets")
        self.assertEqual(res_list.status_code, 200)
        items = res_list.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], preset_id)
        self.assertEqual(items[0]["name"], "Default Comic")

    def test_create_duplicate_name_fails(self):
        payload = {
            "name": "Preset A",
            "shape": "rectangle",
        }
        res1 = self.client.post("/api/speech-bubble-presets", json=payload)
        self.assertEqual(res1.status_code, 201)

        res2 = self.client.post("/api/speech-bubble-presets", json=payload)
        self.assertEqual(res2.status_code, 400)
        self.assertIn("Preset with this name already exists", res2.json()["detail"])

    def test_list_presets_ordering(self):
        p1 = {"name": "Preset Order 2", "sort_order": 2}
        p2 = {"name": "Preset Order 1", "sort_order": 1}
        p3 = {"name": "Preset Order 0", "sort_order": 0}
        self.client.post("/api/speech-bubble-presets", json=p1)
        self.client.post("/api/speech-bubble-presets", json=p2)
        self.client.post("/api/speech-bubble-presets", json=p3)

        res = self.client.get("/api/speech-bubble-presets")
        self.assertEqual(res.status_code, 200)
        names = [item["name"] for item in res.json()]
        self.assertEqual(names, ["Preset Order 0", "Preset Order 1", "Preset Order 2"])

    def test_update_preset(self):
        payload = {
            "name": "Original Name",
            "shape": "oval",
            "font_size": 20,
        }
        res_create = self.client.post("/api/speech-bubble-presets", json=payload)
        self.assertEqual(res_create.status_code, 201)
        preset_id = res_create.json()["id"]

        # Update partial
        update_payload = {
            "name": "Updated Name",
            "shape": "shout",
            "font_size": 30,
            "border_color": "rgba(255, 0, 0, 1)",
        }
        res_update = self.client.put(f"/api/speech-bubble-presets/{preset_id}", json=update_payload)
        self.assertEqual(res_update.status_code, 200)
        updated = res_update.json()
        self.assertEqual(updated["name"], "Updated Name")
        self.assertEqual(updated["shape"], "shout")
        self.assertEqual(updated["font_size"], 30)
        self.assertEqual(updated["border_color"], "rgba(255, 0, 0, 1)")

    def test_update_duplicate_name_fails(self):
        self.client.post("/api/speech-bubble-presets", json={"name": "Preset 1"})
        res2 = self.client.post("/api/speech-bubble-presets", json={"name": "Preset 2"})
        preset2_id = res2.json()["id"]

        # Try to rename Preset 2 to Preset 1
        res_update = self.client.put(f"/api/speech-bubble-presets/{preset2_id}", json={"name": "Preset 1"})
        self.assertEqual(res_update.status_code, 400)
        self.assertIn("Preset with this name already exists", res_update.json()["detail"])

    def test_update_not_found(self):
        res = self.client.put("/api/speech-bubble-presets/9999", json={"name": "New Name"})
        self.assertEqual(res.status_code, 404)

    def test_delete_preset(self):
        res_create = self.client.post("/api/speech-bubble-presets", json={"name": "To Delete"})
        self.assertEqual(res_create.status_code, 201)
        preset_id = res_create.json()["id"]

        res_del = self.client.delete(f"/api/speech-bubble-presets/{preset_id}")
        self.assertEqual(res_del.status_code, 204)

        # Ensure deleted
        res_list = self.client.get("/api/speech-bubble-presets")
        self.assertEqual(len(res_list.json()), 0)

    def test_delete_not_found(self):
        res = self.client.delete("/api/speech-bubble-presets/9999")
        self.assertEqual(res.status_code, 404)
