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

    def test_add_album_items(self):
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
        
        # 3. アルバムアイテムを登録（最初に snap1 のみ、順番 0）
        item1 = models.AlbumItem(album_id=album.id, snapshot_id=snap1.id, sequence_order=0)
        self.db.add(item1)
        self.db.commit()
        
        # 4. 追加API呼び出し (snap2 と snap3 を追加)
        payload = {"snapshot_ids": [snap2.id, snap3.id]}
        response = self.client.post(f"/api/albums/{album.id}/items", json=payload)
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # 5. 検証: レスポンスのアイテム数とシーケンス順序
        items = data["items"]
        self.assertEqual(len(items), 3)
        self.assertEqual(items[0]["snapshot_id"], snap1.id)
        self.assertEqual(items[0]["sequence_order"], 0)
        
        self.assertEqual(items[1]["snapshot_id"], snap2.id)
        self.assertEqual(items[1]["sequence_order"], 1)
        
        self.assertEqual(items[2]["snapshot_id"], snap3.id)
        self.assertEqual(items[2]["sequence_order"], 2)
        
        # 重複追加の防止をテスト (snap2 を再度追加しようとする)
        payload2 = {"snapshot_ids": [snap2.id]}
        response2 = self.client.post(f"/api/albums/{album.id}/items", json=payload2)
        self.assertEqual(response2.status_code, 200)
        data2 = response2.json()
        self.assertEqual(len(data2["items"]), 3)

    def test_list_and_create_album_sort_order(self):
        # アルバム作成: 自動的に sort_order が割り振られることを検証
        res1 = self.client.post("/api/albums", json={"name": "Album A"})
        self.assertEqual(res1.status_code, 201)
        a1_data = res1.json()
        self.assertEqual(a1_data["sort_order"], 0)

        res2 = self.client.post("/api/albums", json={"name": "Album B"})
        self.assertEqual(res2.status_code, 201)
        a2_data = res2.json()
        self.assertEqual(a2_data["sort_order"], 1)

        # 一覧取得: sort_order 昇順で返されること
        list_res = self.client.get("/api/albums")
        self.assertEqual(list_res.status_code, 200)
        albums = list_res.json()
        self.assertEqual(len(albums), 2)
        self.assertEqual(albums[0]["name"], "Album A")
        self.assertEqual(albums[1]["name"], "Album B")

    def test_reorder_albums(self):
        # 3つのアルバム作成
        a1 = self.client.post("/api/albums", json={"name": "A"}).json()
        a2 = self.client.post("/api/albums", json={"name": "B"}).json()
        a3 = self.client.post("/api/albums", json={"name": "C"}).json()

        # 並び替え: C (a3), A (a1), B (a2)
        reorder_payload = {"ordered_ids": [a3["id"], a1["id"], a2["id"]]}
        reorder_res = self.client.put("/api/albums/reorder", json=reorder_payload)
        self.assertEqual(reorder_res.status_code, 204)

        # 一覧取得で順序が反映されていること
        list_res = self.client.get("/api/albums")
        albums = list_res.json()
        self.assertEqual([a["name"] for a in albums], ["C", "A", "B"])
        self.assertEqual([a["sort_order"] for a in albums], [0, 1, 2])

    def test_update_album_rename_and_sort_order(self):
        a1 = self.client.post("/api/albums", json={"name": "Original Name"}).json()
        a2 = self.client.post("/api/albums", json={"name": "Other Name"}).json()

        # リネーム
        update_res = self.client.put(f"/api/albums/{a1['id']}", json={"name": "Renamed Album"})
        self.assertEqual(update_res.status_code, 200)
        updated = update_res.json()
        self.assertEqual(updated["name"], "Renamed Album")

        # 空白文字のみの名前への変更は 400 エラー
        empty_res = self.client.put(f"/api/albums/{a1['id']}", json={"name": "   "})
        self.assertEqual(empty_res.status_code, 400)

        # 既存の名前への重複変更は 400 エラー
        dup_res = self.client.put(f"/api/albums/{a1['id']}", json={"name": "Other Name"})
        self.assertEqual(dup_res.status_code, 400)

        # 存在しないアルバムの更新は 404 エラー
        not_found_res = self.client.put("/api/albums/99999", json={"name": "New"})
        self.assertEqual(not_found_res.status_code, 404)

