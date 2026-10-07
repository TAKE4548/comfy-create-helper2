import unittest
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app import models
from app.migrations import run_migrations
from app.schemas.dataset import (
    DatasetProjectCreate,
    DatasetProjectUpdate,
    DatasetProjectResponse,
    DatasetItemCreate,
    DatasetItemUpdate,
    DatasetItemResponse,
    OutfitMasterPresetCreate,
    OutfitMasterPresetResponse,
    LoraTrainingJobCreate,
    LoraTrainingJobResponse,
)


class TestDatasetDB(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_models_orm_crud(self):
        Base.metadata.create_all(bind=self.engine)
        session = self.SessionLocal()

        workflow = models.Workflow(
            name="Test Workflow",
            json_body="{}",
        )
        session.add(workflow)
        session.commit()
        session.refresh(workflow)

        project = models.DatasetProject(
            name="Test Character Project",
            character_trigger="test_char",
            outfit_trigger="casual_style",
            workflow_id=workflow.id,
            prompt_meta="masterpiece, best quality",
            prompt_physical="1girl, blue hair",
            prompt_exclusive_outfit="hoodie",
            prompt_negative="lowres, bad anatomy, worst quality",
            selected_alt_outfits='["casual"]',
        )
        session.add(project)
        session.commit()
        session.refresh(project)
        self.assertIsNotNone(project.id)
        self.assertEqual(project.name, "Test Character Project")
        self.assertEqual(project.prompt_negative, "lowres, bad anatomy, worst quality")

        item = models.DatasetItem(
            project_id=project.id,
            slot_index=0,
            factors_json='{"view": "front"}',
            raw_prompt="test_char, hoodie",
            caption_text="test_char standing, front view",
            image_path="/path/to/img.png",
            seed=42,
            status="APPROVED",
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        self.assertIsNotNone(item.id)
        self.assertEqual(item.slot_index, 0)

        preset = models.OutfitMasterPreset(
            name="カスタム衣装",
            category="custom",
            prompt_tags="gothic lolita dress",
            is_builtin=False,
        )
        session.add(preset)
        session.commit()
        session.refresh(preset)
        self.assertIsNotNone(preset.id)
        self.assertFalse(preset.is_builtin)

        job = models.LoraTrainingJob(
            project_id=project.id,
            lora_name="test_lora_v1",
            model_type="anima_2b",
            config_toml_content="[training]\nepochs = 10",
            epochs=10,
            repeats=2,
            batch_size=1,
            total_steps=500,
            network_dim=16,
            network_alpha=16,
            learning_rate="1e-4",
            status="IDLE",
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        self.assertIsNotNone(job.id)
        self.assertEqual(job.status, "IDLE")

        session.close()

    def test_migration_and_seed_presets(self):
        run_migrations(target_engine=self.engine)

        with self.engine.connect() as conn:
            inspector = sa.inspect(conn)
            tables = inspector.get_table_names()
            self.assertIn("dataset_projects", tables)
            self.assertIn("dataset_items", tables)
            self.assertIn("outfit_master_presets", tables)
            self.assertIn("lora_training_jobs", tables)

            rows = conn.execute(sa.text("SELECT name, category, prompt_tags, is_builtin FROM outfit_master_presets ORDER BY id")).fetchall()
            preset_dict = {row[0]: (row[1], row[2], bool(row[3])) for row in rows}

            expected = {
                "カジュアル (Casual Street)": ("casual", "casual oversized hoodie, denim jeans, sneakers", True),
                "シンプル部屋着 (Roomwear)": ("roomwear", "plain white t-shirt, gray sweatpants, bare feet", True),
                "水着 (Swimsuit)": ("swimsuit", "simple two-piece bikini, sandals", True),
                "フォーマルスーツ (Business Suit)": ("formal", "formal suit, necktie, dress shirt, slacks", True),
            }

            for name, (cat, tags, builtin) in expected.items():
                self.assertIn(name, preset_dict)
                self.assertEqual(preset_dict[name][0], cat)
                self.assertEqual(preset_dict[name][1], tags)
                self.assertEqual(preset_dict[name][2], builtin)

        run_migrations(target_engine=self.engine)

        with self.engine.connect() as conn:
            count = conn.execute(sa.text("SELECT COUNT(*) FROM outfit_master_presets WHERE is_builtin = 1")).scalar()
            self.assertEqual(count, 4)

    def test_pydantic_schemas_validation_and_from_attributes(self):
        create_payload = {
            "name": "Project 1",
            "character_trigger": "char_a",
            "outfit_trigger": "outfit_a",
            "workflow_id": 1,
            "prompt_meta": "meta",
            "prompt_physical": "physical",
            "prompt_exclusive_outfit": "outfit",
            "prompt_negative": "negative tags",
            "selected_alt_outfits": "[]",
        }
        proj_create = DatasetProjectCreate(**create_payload)
        self.assertEqual(proj_create.name, "Project 1")
        self.assertEqual(proj_create.prompt_negative, "negative tags")

        proj_update = DatasetProjectUpdate(name="Project Updated", prompt_negative="updated negative")
        self.assertEqual(proj_update.name, "Project Updated")
        self.assertEqual(proj_update.prompt_negative, "updated negative")
        self.assertIsNone(proj_update.character_trigger)

        now = datetime.now(timezone.utc)
        proj_resp = DatasetProjectResponse(
            id=1,
            created_at=now,
            updated_at=now,
            **create_payload
        )
        self.assertEqual(proj_resp.id, 1)
        self.assertEqual(proj_resp.prompt_negative, "negative tags")

        item_update = DatasetItemUpdate(caption_text="new caption", status="REJECTED")
        self.assertEqual(item_update.caption_text, "new caption")
        self.assertEqual(item_update.status, "REJECTED")

        item_resp = DatasetItemResponse(
            id=10,
            project_id=1,
            slot_index=0,
            factors_json="{}",
            raw_prompt="prompt",
            caption_text="caption",
            image_path=None,
            seed=123,
            status="APPROVED",
        )
        self.assertEqual(item_resp.seed, 123)

        preset_create = OutfitMasterPresetCreate(
            name="ゴスロリ",
            category="gothic",
            prompt_tags="gothic dress",
            is_builtin=False,
        )
        self.assertEqual(preset_create.name, "ゴスロリ")

        preset_resp = OutfitMasterPresetResponse(
            id=1,
            name="ゴスロリ",
            category="gothic",
            prompt_tags="gothic dress",
            is_builtin=False,
        )
        self.assertEqual(preset_resp.id, 1)

        job_create = LoraTrainingJobCreate(
            project_id=1,
            lora_name="test_lora",
            model_type="anima_2b",
            config_toml_content="toml",
            epochs=10,
            repeats=2,
            batch_size=1,
            total_steps=200,
            network_dim=16,
            network_alpha=16,
            learning_rate="1e-4",
        )
        self.assertEqual(job_create.lora_name, "test_lora")

        job_resp = LoraTrainingJobResponse(
            id=1,
            project_id=1,
            lora_name="test_lora",
            model_type="anima_2b",
            config_toml_content="toml",
            epochs=10,
            repeats=2,
            batch_size=1,
            total_steps=200,
            network_dim=16,
            network_alpha=16,
            learning_rate="1e-4",
            status="RUNNING",
            final_loss=0.05,
            pid=1234,
        )
        self.assertEqual(job_resp.final_loss, 0.05)
