import json
import os
import shutil
import tempfile
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


class TestDatasetRouter(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        # Seed workflow
        self.workflow = models.Workflow(
            name="Default SDHL",
            json_body="{}",
        )
        self.db.add(self.workflow)

        # Seed outfit presets
        self.outfit1 = models.OutfitMasterPreset(
            name="Casual Hoodie",
            category="casual",
            prompt_tags="casual hoodie, denim shorts",
            is_builtin=True,
        )
        self.outfit2 = models.OutfitMasterPreset(
            name="Swimsuit",
            category="swimwear",
            prompt_tags="swimsuit, bikini",
            is_builtin=True,
        )
        self.db.add_all([self.outfit1, self.outfit2])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_project_crud(self):
        payload = {
            "name": "Test Character Project",
            "character_trigger": "test_char",
            "outfit_trigger": "school_uniform",
            "workflow_id": self.workflow.id,
            "prompt_meta": "masterpiece, best quality",
            "prompt_physical": "1girl, silver hair, blue eyes",
            "prompt_exclusive_outfit": "school uniform, pleated skirt",
            "selected_alt_outfits": json.dumps([self.outfit1.id, self.outfit2.id]),
        }
        # Create
        res = self.client.post("/api/dataset/projects", json=payload)
        self.assertEqual(res.status_code, 200)
        proj_data = res.json()
        proj_id = proj_data["id"]
        self.assertEqual(proj_data["name"], "Test Character Project")

        # List
        res = self.client.get("/api/dataset/projects")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(any(p["id"] == proj_id for p in res.json()))

        # Get
        res = self.client.get(f"/api/dataset/projects/{proj_id}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["character_trigger"], "test_char")


        # Update
        res = self.client.put(
            f"/api/dataset/projects/{proj_id}",
            json={"name": "Renamed Project", "character_trigger": "renamed_char"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["name"], "Renamed Project")
        self.assertEqual(res.json()["character_trigger"], "renamed_char")

        # Delete
        res = self.client.delete(f"/api/dataset/projects/{proj_id}")
        self.assertEqual(res.status_code, 200)

        # 404 after delete
        res = self.client.get(f"/api/dataset/projects/{proj_id}")
        self.assertEqual(res.status_code, 404)

    def test_get_outfits(self):
        res = self.client.get("/api/dataset/outfits")
        self.assertEqual(res.status_code, 200)
        outfits = res.json()
        self.assertGreaterEqual(len(outfits), 2)
        names = [o["name"] for o in outfits]
        self.assertIn("Casual Hoodie", names)
        self.assertIn("Swimsuit", names)

    def test_generate_matrix(self):
        project = models.DatasetProject(
            name="Matrix Test Project",
            character_trigger="char_a",
            outfit_trigger="outfit_a",
            workflow_id=self.workflow.id,
            prompt_meta="masterpiece",
            prompt_physical="1girl",
            prompt_exclusive_outfit="sailor suit",
            selected_alt_outfits=json.dumps([
                {"id": self.outfit1.id, "prompt_tags": self.outfit1.prompt_tags},
                {"id": self.outfit2.id, "prompt_tags": self.outfit2.prompt_tags},
            ]),
        )
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)

        res = self.client.post(f"/api/dataset/projects/{project.id}/matrix")
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertEqual(len(items), 20)

        default_count = 0
        alt_count = 0
        for item in items:
            self.assertEqual(item["project_id"], project.id)
            self.assertEqual(item["status"], "APPROVED")
            factors = json.loads(item["factors_json"])
            if factors["outfit_type"] == "default":
                default_count += 1
            else:
                alt_count += 1
        self.assertEqual(default_count, 15)
        self.assertEqual(alt_count, 5)

    def test_patch_item(self):
        project = models.DatasetProject(
            name="Item Patch Project",
            character_trigger="char_b",
            outfit_trigger="outfit_b",
            workflow_id=self.workflow.id,
            prompt_meta="masterpiece",
            prompt_physical="1girl",
            prompt_exclusive_outfit="maid dress",
            selected_alt_outfits="[]",
        )
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)

        item = models.DatasetItem(
            project_id=project.id,
            slot_index=1,
            factors_json="{}",
            raw_prompt="initial prompt",
            caption_text="initial caption",
            seed=123,
            status="APPROVED",
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)

        res = self.client.patch(
            f"/api/dataset/items/{item.id}",
            json={"caption_text": "modified caption", "status": "REJECTED"},
        )
        self.assertEqual(res.status_code, 200)
        updated = res.json()
        self.assertEqual(updated["caption_text"], "modified caption")
        self.assertEqual(updated["status"], "REJECTED")

    def test_export_project(self):
        temp_dir = tempfile.mkdtemp()
        try:
            project = models.DatasetProject(
                name="Export Test Project",
                character_trigger="char_c",
                outfit_trigger="outfit_c",
                workflow_id=self.workflow.id,
                prompt_meta="masterpiece",
                prompt_physical="1girl",
                prompt_exclusive_outfit="kimono",
                selected_alt_outfits="[]",
            )
            self.db.add(project)
            self.db.commit()
            self.db.refresh(project)

            dummy_img = os.path.join(temp_dir, "source_001.png")
            with open(dummy_img, "wb") as f:
                f.write(b"FAKE_PNG_DATA")

            item = models.DatasetItem(
                project_id=project.id,
                slot_index=1,
                factors_json="{}",
                raw_prompt="kimono prompt",
                caption_text="kimono, beautiful scenery",
                image_path=dummy_img,
                seed=456,
                status="APPROVED",
            )
            self.db.add(item)
            self.db.commit()

            export_dest = os.path.join(temp_dir, "exported")
            res = self.client.post(
                f"/api/dataset/projects/{project.id}/export",
                json={"export_dir": export_dest},
            )
            self.assertEqual(res.status_code, 200)

            dest_img = os.path.join(export_dest, "source_001.png")
            dest_txt = os.path.join(export_dest, "source_001.txt")
            self.assertTrue(os.path.exists(dest_img))
            self.assertTrue(os.path.exists(dest_txt))
            with open(dest_txt, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertEqual(content, "kimono, beautiful scenery")
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
