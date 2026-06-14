import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import get_db
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

class TestAlbumsAPI(unittest.TestCase):
    def setUp(self):
        # Set dependency override dynamically and save the old one
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db

        models.Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()
        
        # テストデータの投入
        self.workflow = models.Workflow(name="test_wf", json_body="{}")
        self.db.add(self.workflow)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)
        # Restore the old dependency override
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_delete_album_items(self):
        # 1. アルバムを作成
        album = models.Album(name="test_album")
        self.db.add(album)
        self.db.commit()
        self.db.refresh(album)

        # 2. スナップショットを3つ作成
        snapshot1 = models.Snapshot(workflow_id=self.workflow.id, params="{}")
        snapshot2 = models.Snapshot(workflow_id=self.workflow.id, params="{}")
        snapshot3 = models.Snapshot(workflow_id=self.workflow.id, params="{}")
        self.db.add_all([snapshot1, snapshot2, snapshot3])
        self.db.commit()
        self.db.refresh(snapshot1)
        self.db.refresh(snapshot2)
        self.db.refresh(snapshot3)

        # 3. アルバムにアイテムを追加 (sequence_order は 0, 1, 2)
        item1 = models.AlbumItem(album_id=album.id, snapshot_id=snapshot1.id, sequence_order=0)
        item2 = models.AlbumItem(album_id=album.id, snapshot_id=snapshot2.id, sequence_order=1)
        item3 = models.AlbumItem(album_id=album.id, snapshot_id=snapshot3.id, sequence_order=2)
        self.db.add_all([item1, item2, item3])
        self.db.commit()

        # 4. snapshot1.id と snapshot3.id を一括削除する
        response = self.client.post(
            f"/api/albums/{album.id}/items/delete",
            json={"snapshot_ids": [snapshot1.id, snapshot3.id]}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # 削除後、残るアイテムは1つ (snapshot2)
        self.assertEqual(len(data["items"]), 1)
        # 残ったアイテムの sequence_order が 0 に再割り当てされているか検証
        self.assertEqual(data["items"][0]["snapshot_id"], snapshot2.id)
        self.assertEqual(data["items"][0]["sequence_order"], 0)
        # created_at フィールドが存在するか検証
        self.assertIn("created_at", data["items"][0])

    def test_delete_album_items_not_found(self):
        # 存在しないアルバムに対する削除リクエストが404を返すことを検証
        response = self.client.post(
            "/api/albums/99999/items/delete",
            json={"snapshot_ids": [1]}
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Album not found")
