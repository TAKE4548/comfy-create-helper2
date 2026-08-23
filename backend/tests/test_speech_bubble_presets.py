import unittest
from fastapi.testclient import TestClient
import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app, run_migrations
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

    def test_create_duplicate_name_and_orientation_fails(self):
        payload = {
            "name": "Preset A",
            "shape": "rectangle",
            "orientation": "vertical",
        }
        res1 = self.client.post("/api/speech-bubble-presets", json=payload)
        self.assertEqual(res1.status_code, 201)

        res2 = self.client.post("/api/speech-bubble-presets", json=payload)
        self.assertEqual(res2.status_code, 400)
        self.assertIn("Preset with this name and orientation already exists", res2.json()["detail"])

    def test_create_same_name_different_orientation_succeeds(self):
        payload_v = {
            "name": "Preset A",
            "shape": "rectangle",
            "orientation": "vertical",
        }
        payload_h = {
            "name": "Preset A",
            "shape": "oval",
            "orientation": "horizontal",
        }
        res1 = self.client.post("/api/speech-bubble-presets", json=payload_v)
        self.assertEqual(res1.status_code, 201)

        res2 = self.client.post("/api/speech-bubble-presets", json=payload_h)
        self.assertEqual(res2.status_code, 201)
        self.assertEqual(res2.json()["name"], "Preset A")
        self.assertEqual(res2.json()["orientation"], "horizontal")

        # List should show both
        res_list = self.client.get("/api/speech-bubble-presets")
        self.assertEqual(res_list.status_code, 200)
        self.assertEqual(len(res_list.json()), 2)

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

    def test_update_duplicate_name_and_orientation_fails(self):
        self.client.post("/api/speech-bubble-presets", json={"name": "Preset 1", "orientation": "vertical"})
        res2 = self.client.post("/api/speech-bubble-presets", json={"name": "Preset 2", "orientation": "vertical"})
        preset2_id = res2.json()["id"]

        # Try to rename Preset 2 to Preset 1 with same orientation
        res_update = self.client.put(f"/api/speech-bubble-presets/{preset2_id}", json={"name": "Preset 1"})
        self.assertEqual(res_update.status_code, 400)
        self.assertIn("Preset with this name and orientation already exists", res_update.json()["detail"])

    def test_update_same_name_different_orientation_succeeds(self):
        self.client.post("/api/speech-bubble-presets", json={"name": "Preset 1", "orientation": "vertical"})
        res2 = self.client.post("/api/speech-bubble-presets", json={"name": "Preset 2", "orientation": "horizontal"})
        preset2_id = res2.json()["id"]

        # Rename Preset 2 to Preset 1 (allowed because orientation is horizontal vs vertical)
        res_update = self.client.put(f"/api/speech-bubble-presets/{preset2_id}", json={"name": "Preset 1"})
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["name"], "Preset 1")
        self.assertEqual(res_update.json()["orientation"], "horizontal")

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

    def test_create_and_update_with_effects(self):
        effects_payload = {
            "scaleCurve": "ease-in",
            "scaleStart": 1.2,
            "scaleEnd": 2.0,
            "fillMode": "gradient",
            "gradientType": "linear",
            "gradientAngle": 45,
            "gradientStops": [
                {"color": "rgba(255, 0, 0, 1)", "offset": 0},
                {"color": "rgba(0, 0, 255, 1)", "offset": 1},
            ],
            "multiStrokes": [
                {
                    "id": "stroke-1",
                    "width": 4,
                    "color": "rgba(255, 255, 255, 1)",
                    "opacity": 1.0,
                    "offsetX": 2,
                    "offsetY": 2,
                }
            ],
            "rotate90Indices": [0, 1],
        }
        create_res = self.client.post(
            "/api/speech-bubble-presets",
            json={
                "name": "Manga FX Preset",
                "shape": "burst",
                "effects": effects_payload,
            },
        )
        self.assertEqual(create_res.status_code, 201)
        created_data = create_res.json()
        self.assertEqual(created_data["name"], "Manga FX Preset")
        self.assertEqual(created_data["effects"]["scaleCurve"], "ease-in")
        self.assertEqual(created_data["effects"]["rotate90Indices"], [0, 1])
        preset_id = created_data["id"]

        # Update effects
        updated_effects = dict(effects_payload)
        updated_effects["scaleCurve"] = "bezier"
        update_res = self.client.put(
            f"/api/speech-bubble-presets/{preset_id}",
            json={"effects": updated_effects},
        )
        self.assertEqual(update_res.status_code, 200)
        updated_data = update_res.json()
        self.assertEqual(updated_data["effects"]["scaleCurve"], "bezier")

        # List presets
        list_res = self.client.get("/api/speech-bubble-presets")
        self.assertEqual(list_res.status_code, 200)
        items = list_res.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["effects"]["scaleCurve"], "bezier")

    def test_backward_compatibility_empty_effects(self):
        # Create without effects
        create_res = self.client.post(
            "/api/speech-bubble-presets",
            json={"name": "Old Style Preset"},
        )
        self.assertEqual(create_res.status_code, 201)
        created_data = create_res.json()
        self.assertEqual(created_data["effects"], {})

    def test_migration_adds_effects_json_column_to_legacy_table(self):
        legacy_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        with legacy_engine.begin() as conn:
            conn.execute(sa.text("""
                CREATE TABLE speech_bubble_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL UNIQUE,
                    shape VARCHAR NOT NULL DEFAULT 'oval',
                    orientation VARCHAR NOT NULL DEFAULT 'vertical',
                    font_family VARCHAR NOT NULL DEFAULT 'sans-serif',
                    font_size INTEGER NOT NULL DEFAULT 0,
                    text_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    background_color VARCHAR NOT NULL DEFAULT 'rgba(255, 255, 255, 0.95)',
                    border_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    border_width INTEGER NOT NULL DEFAULT 2,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(sa.text("""
                INSERT INTO speech_bubble_presets (name, shape) VALUES ('Legacy Preset', 'oval')
            """))

        # Verify column does not exist yet
        with legacy_engine.connect() as conn:
            inspector = sa.inspect(conn)
            cols = [c["name"] for c in inspector.get_columns("speech_bubble_presets")]
            self.assertNotIn("effects_json", cols)

        # Run migration
        run_migrations(target_engine=legacy_engine)

        # Verify column exists and row has default value
        with legacy_engine.connect() as conn:
            inspector = sa.inspect(conn)
            cols = [c["name"] for c in inspector.get_columns("speech_bubble_presets")]
            self.assertIn("effects_json", cols)

            row = conn.execute(sa.text("SELECT id, name, effects_json FROM speech_bubble_presets WHERE name = 'Legacy Preset'")).fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[1], "Legacy Preset")
            self.assertEqual(row[2], "{}")

    def test_create_and_get_preset_with_text(self):
        payload = {
            "name": "SE Preset Boom",
            "shape": "burst",
            "text": "ドォォン！",
        }
        res_create = self.client.post("/api/speech-bubble-presets", json=payload)
        self.assertEqual(res_create.status_code, 201)
        data = res_create.json()
        self.assertEqual(data["name"], "SE Preset Boom")
        self.assertEqual(data["text"], "ドォォン！")

        res_list = self.client.get("/api/speech-bubble-presets")
        self.assertEqual(res_list.status_code, 200)
        items = res_list.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["text"], "ドォォン！")

    def test_update_preset_text(self):
        create_res = self.client.post(
            "/api/speech-bubble-presets",
            json={"name": "Text Update Preset", "text": "初期テキスト"},
        )
        self.assertEqual(create_res.status_code, 201)
        preset_id = create_res.json()["id"]

        # Update text
        update_res = self.client.put(
            f"/api/speech-bubble-presets/{preset_id}",
            json={"text": "更新後テキスト"},
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["text"], "更新後テキスト")

        # Clear text with null
        clear_res = self.client.put(
            f"/api/speech-bubble-presets/{preset_id}",
            json={"text": None},
        )
        self.assertEqual(clear_res.status_code, 200)
        self.assertIsNone(clear_res.json()["text"])

    def test_migration_adds_text_column_to_legacy_table(self):
        legacy_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        with legacy_engine.begin() as conn:
            conn.execute(sa.text("""
                CREATE TABLE speech_bubble_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL UNIQUE,
                    shape VARCHAR NOT NULL DEFAULT 'oval',
                    effects_json TEXT DEFAULT '{}'
                )
            """))
            conn.execute(sa.text("""
                INSERT INTO speech_bubble_presets (name, shape) VALUES ('No Text Preset', 'oval')
            """))

        # Verify column does not exist yet
        with legacy_engine.connect() as conn:
            inspector = sa.inspect(conn)
            cols = [c["name"] for c in inspector.get_columns("speech_bubble_presets")]
            self.assertNotIn("text", cols)

        # Run migration
        run_migrations(target_engine=legacy_engine)

        # Verify column exists
        with legacy_engine.connect() as conn:
            inspector = sa.inspect(conn)
            cols = [c["name"] for c in inspector.get_columns("speech_bubble_presets")]
            self.assertIn("text", cols)

            row = conn.execute(sa.text("SELECT id, name, text FROM speech_bubble_presets WHERE name = 'No Text Preset'")).fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[1], "No Text Preset")
            self.assertIsNone(row[2])

    def test_migration_relaxes_unique_constraint_on_legacy_table(self):
        legacy_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        with legacy_engine.begin() as conn:
            conn.execute(sa.text("""
                CREATE TABLE speech_bubble_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL UNIQUE,
                    shape VARCHAR NOT NULL DEFAULT 'oval',
                    orientation VARCHAR NOT NULL DEFAULT 'vertical',
                    font_family VARCHAR NOT NULL DEFAULT 'sans-serif',
                    font_size INTEGER NOT NULL DEFAULT 0,
                    text_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    background_color VARCHAR NOT NULL DEFAULT 'rgba(255, 255, 255, 0.95)',
                    border_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    border_width INTEGER NOT NULL DEFAULT 2,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    effects_json TEXT DEFAULT '{}',
                    text TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(sa.text("""
                INSERT INTO speech_bubble_presets (name, orientation) VALUES ('Dual Preset', 'vertical')
            """))

        # Run migration
        run_migrations(target_engine=legacy_engine)

        # Now inserting same name with 'horizontal' should succeed
        with legacy_engine.begin() as conn:
            conn.execute(sa.text("""
                INSERT INTO speech_bubble_presets (name, orientation) VALUES ('Dual Preset', 'horizontal')
            """))

        with legacy_engine.connect() as conn:
            rows = conn.execute(sa.text("SELECT name, orientation FROM speech_bubble_presets WHERE name = 'Dual Preset'")).fetchall()
            self.assertEqual(len(rows), 2)
            self.assertEqual({r[1] for r in rows}, {"vertical", "horizontal"})

    def test_migration_preserves_text_and_effects_data_when_relaxing_constraint(self):
        legacy_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        with legacy_engine.begin() as conn:
            conn.execute(sa.text("""
                CREATE TABLE speech_bubble_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL UNIQUE,
                    shape VARCHAR NOT NULL DEFAULT 'oval',
                    orientation VARCHAR NOT NULL DEFAULT 'vertical',
                    font_family VARCHAR NOT NULL DEFAULT 'sans-serif',
                    font_size INTEGER NOT NULL DEFAULT 0,
                    text_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    background_color VARCHAR NOT NULL DEFAULT 'rgba(255, 255, 255, 0.95)',
                    border_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    border_width INTEGER NOT NULL DEFAULT 2,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    effects_json TEXT DEFAULT '{}',
                    text TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(sa.text("""
                INSERT INTO speech_bubble_presets (name, orientation, text, effects_json)
                VALUES ('Boom Preset', 'vertical', 'ドォォン！', '{"scaleCurve":"ease-in"}')
            """))

        # Run migration
        run_migrations(target_engine=legacy_engine)

        with legacy_engine.connect() as conn:
            row = conn.execute(sa.text("SELECT name, orientation, text, effects_json FROM speech_bubble_presets WHERE name = 'Boom Preset'")).fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "Boom Preset")
            self.assertEqual(row[1], "vertical")
            self.assertEqual(row[2], "ドォォン！")
            self.assertEqual(row[3], '{"scaleCurve":"ease-in"}')


