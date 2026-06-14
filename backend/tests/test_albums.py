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
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_delete_album_items(self):
        # 1. アルバム作成
        album = models.Album(name="test_album")
        self.db.add(album)
        self.db.commit()
        
        # 2. スナップショットを3つ作成
        snap1 = models.Snapshot(workflow_id=self.workflow.id, params="{}")
        snap2 = models.Snapshot(workflow_id=self.workflow.id, params="{}")
        snap3 = models.Snapshot(workflow_id=self.workflow.id, params="{}")
        self.db.add_all([snap1, snap2, snap3])
        self.db.commit()
        
        # 3. アルバムアイテムを登録（順番 0, 1, 2）
        item1 = models.AlbumItem(album_id=album.id, snapshot_id=snap1.id, sequence_order=0)
        item2 = models.AlbumItem(album_id=album.id, snapshot_id=snap2.id, sequence_order=1)
        item3 = models.AlbumItem(album_id=album.id, snapshot_id=snap3.id, sequence_order=2)
        self.db.add_all([item1, item2, item3])
        self.db.commit()
        
        # 4. 一括削除API呼び出し (snap2 を削除)
        payload = {"snapshot_ids": [snap2.id]}
        response = self.client.post(f"/api/albums/{album.id}/items/delete", json=payload)
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # 5. 検証: レスポンスのアイテム数、シーケンス順序の再割り当ての確認
        items = data["items"]
        self.assertEqual(len(items), 2)
        
        # 残ったアイテムは snap1 と snap3
        # sequence_order が 0 と 1 になっているはず
        self.assertEqual(items[0]["snapshot_id"], snap1.id)
        self.assertEqual(items[0]["sequence_order"], 0)
        
        self.assertEqual(items[1]["snapshot_id"], snap3.id)
        self.assertEqual(items[1]["sequence_order"], 1)
        
        # DB上のデータも検証
        db_items = self.db.query(models.AlbumItem).filter(models.AlbumItem.album_id == album.id).order_by(models.AlbumItem.sequence_order).all()
        self.assertEqual(len(db_items), 2)
        self.assertEqual(db_items[0].snapshot_id, snap1.id)
        self.assertEqual(db_items[0].sequence_order, 0)
        self.assertEqual(db_items[1].snapshot_id, snap3.id)
        self.assertEqual(db_items[1].sequence_order, 1)
