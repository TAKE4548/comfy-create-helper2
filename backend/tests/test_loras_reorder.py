import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import get_db
from app import models

# In-memory test database
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


class TestLorasReorderAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db

        models.Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        # Seed categories
        self.cat1 = models.LoraCategory(name="Category A", sort_order=0)
        self.cat2 = models.LoraCategory(name="Category B", sort_order=1)
        self.db.add_all([self.cat1, self.cat2])
        self.db.commit()
        self.db.refresh(self.cat1)
        self.db.refresh(self.cat2)

        # Seed LoRAs:
        # lora1, lora2 in cat1
        # lora3 in cat2
        # lora4, lora5 uncategorized (category_id=None)
        self.lora1 = models.Lora(model_name="lora1.safetensors", file_path="p1", category_id=self.cat1.id, sort_order=0)
        self.lora2 = models.Lora(model_name="lora2.safetensors", file_path="p2", category_id=self.cat1.id, sort_order=1)
        self.lora3 = models.Lora(model_name="lora3.safetensors", file_path="p3", category_id=self.cat2.id, sort_order=0)
        self.lora4 = models.Lora(model_name="lora4.safetensors", file_path="p4", category_id=None, sort_order=0)
        self.lora5 = models.Lora(model_name="lora5.safetensors", file_path="p5", category_id=None, sort_order=1)
        self.db.add_all([self.lora1, self.lora2, self.lora3, self.lora4, self.lora5])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_reorder_with_category_id_scoped(self):
        # 1. category_id 指定時のカテゴリ内並び替えと他カテゴリカードへの非干渉
        # Reorder lora2, lora1 within cat1
        payload = {
            "category_id": self.cat1.id,
            "ordered_ids": [self.lora2.id, self.lora1.id]
        }
        res = self.client.put("/api/loras/reorder", json=payload)
        self.assertEqual(res.status_code, 204)
        self.db.expire_all()

        l1 = self.db.query(models.Lora).filter(models.Lora.id == self.lora1.id).first()
        l2 = self.db.query(models.Lora).filter(models.Lora.id == self.lora2.id).first()
        l3 = self.db.query(models.Lora).filter(models.Lora.id == self.lora3.id).first()

        self.assertIsNotNone(l1)
        self.assertIsNotNone(l2)
        self.assertIsNotNone(l3)
        self.assertEqual(l2.sort_order, 0)
        self.assertEqual(l2.category_id, self.cat1.id)
        self.assertEqual(l1.sort_order, 1)
        self.assertEqual(l1.category_id, self.cat1.id)

        # Other category should be unaffected
        self.assertEqual(l3.sort_order, 0)
        self.assertEqual(l3.category_id, self.cat2.id)

    def test_reorder_with_category_id_null(self):
        # 2. category_id: null 指定による未分類アイテムの並び替え
        payload = {
            "category_id": None,
            "ordered_ids": [self.lora5.id, self.lora4.id]
        }
        res = self.client.put("/api/loras/reorder", json=payload)
        self.assertEqual(res.status_code, 204)
        self.db.expire_all()

        l4 = self.db.query(models.Lora).filter(models.Lora.id == self.lora4.id).first()
        l5 = self.db.query(models.Lora).filter(models.Lora.id == self.lora5.id).first()

        self.assertIsNotNone(l4)
        self.assertIsNotNone(l5)
        self.assertEqual(l5.sort_order, 0)
        self.assertIsNone(l5.category_id)
        self.assertEqual(l4.sort_order, 1)
        self.assertIsNone(l4.category_id)

    def test_reorder_cross_category_move(self):
        # 3. 別カテゴリから移動してきたLoRAの category_id 更新と順序反映
        # Move lora3 (from cat2) into cat1 and reorder [lora1, lora3, lora2]
        payload = {
            "category_id": self.cat1.id,
            "ordered_ids": [self.lora1.id, self.lora3.id, self.lora2.id]
        }
        res = self.client.put("/api/loras/reorder", json=payload)
        self.assertEqual(res.status_code, 204)
        self.db.expire_all()

        l1 = self.db.query(models.Lora).filter(models.Lora.id == self.lora1.id).first()
        l3 = self.db.query(models.Lora).filter(models.Lora.id == self.lora3.id).first()
        l2 = self.db.query(models.Lora).filter(models.Lora.id == self.lora2.id).first()

        self.assertIsNotNone(l1)
        self.assertIsNotNone(l3)
        self.assertIsNotNone(l2)
        self.assertEqual(l1.sort_order, 0)
        self.assertEqual(l1.category_id, self.cat1.id)
        self.assertEqual(l3.sort_order, 1)
        self.assertEqual(l3.category_id, self.cat1.id)
        self.assertEqual(l2.sort_order, 2)
        self.assertEqual(l2.category_id, self.cat1.id)

    def test_reorder_legacy_without_category_id(self):
        # 4. レガシーリクエスト（category_id なし）の後方互換性
        # Reorder [lora2, lora1] without category_id in payload
        payload = {
            "ordered_ids": [self.lora2.id, self.lora1.id]
        }
        res = self.client.put("/api/loras/reorder", json=payload)
        self.assertEqual(res.status_code, 204)
        self.db.expire_all()

        l1 = self.db.query(models.Lora).filter(models.Lora.id == self.lora1.id).first()
        l2 = self.db.query(models.Lora).filter(models.Lora.id == self.lora2.id).first()

        self.assertIsNotNone(l1)
        self.assertIsNotNone(l2)
        self.assertEqual(l2.sort_order, 0)
        self.assertEqual(l2.category_id, self.cat1.id)
        self.assertEqual(l1.sort_order, 1)
        self.assertEqual(l1.category_id, self.cat1.id)
