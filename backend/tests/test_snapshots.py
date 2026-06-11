import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models

# テスト用のインメモリデータベースを設定
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


# get_db依存性のオーバーライド
app.dependency_overrides[get_db] = override_get_db


class TestSnapshotsAPI(unittest.TestCase):
    def setUp(self):
        # 毎回テーブルを作成
        models.Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()
        
        # 必要なシードデータ投入
        # Workflow
        self.workflow = models.Workflow(name="test_wf", json_body="{}")
        self.db.add(self.workflow)
        
        # Lora
        self.lora = models.Lora(model_name="test_lora.safetensors")
        self.db.add(self.lora)
        
        # TagSet
        self.tag_set = models.TagSet(name="test_tags", tags='["1girl"]')
        self.db.add(self.tag_set)
        
        self.db.commit()

    def tearDown(self):
        # テーブルを削除してクリーンアップ
        self.db.close()
        models.Base.metadata.drop_all(bind=connection)

    def test_create_snapshot_with_assets_and_new_album(self):
        # 新規アルバム名指定、LoRA/タグセット指定
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "test.png",
            "params": {"prompt": "1girl"},
            "new_album_name": "New Album",
            "loras": [{"lora_id": self.lora.id, "strength": 0.8}],
            "tag_sets": [{"tag_set_id": self.tag_set.id}]
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        snapshot_id = data["id"]

        # アルバムが作成されたか確認
        album = self.db.query(models.Album).filter(models.Album.name == "New Album").first()
        self.assertIsNotNone(album)
        
        # アルバムアイテムが作成されたか確認
        item = self.db.query(models.AlbumItem).filter(models.AlbumItem.album_id == album.id).first()
        self.assertIsNotNone(item)
        self.assertEqual(item.snapshot_id, snapshot_id)
        self.assertEqual(item.sequence_order, 0)

        # 中間テーブルの確認
        snap_lora = self.db.query(models.SnapshotLora).filter(models.SnapshotLora.snapshot_id == snapshot_id).first()
        self.assertIsNotNone(snap_lora)
        self.assertEqual(snap_lora.lora_id, self.lora.id)
        self.assertEqual(snap_lora.strength, 0.8)

        snap_tag = self.db.query(models.SnapshotTagSet).filter(models.SnapshotTagSet.snapshot_id == snapshot_id).first()
        self.assertIsNotNone(snap_tag)
        self.assertEqual(snap_tag.tag_set_id, self.tag_set.id)

        # GET API で取得できるか確認
        get_response = self.client.get(f"/api/snapshots/{snapshot_id}")
        self.assertEqual(get_response.status_code, 200)
        get_data = get_response.json()
        self.assertEqual(len(get_data["loras"]), 1)
        self.assertEqual(get_data["loras"][0]["lora_id"], self.lora.id)
        self.assertEqual(get_data["loras"][0]["strength"], 0.8)
        self.assertEqual(len(get_data["tag_sets"]), 1)
        self.assertEqual(get_data["tag_sets"][0]["tag_set_id"], self.tag_set.id)

    def test_create_snapshot_with_existing_album_order(self):
        # 既存アルバムの用意
        album = models.Album(name="Existing Album")
        self.db.add(album)
        self.db.commit()

        # スナップショット1つ目を追加 (order = 0)
        p1 = {
            "workflow_id": self.workflow.id,
            "image_path": "t1.png",
            "params": {},
            "album_id": album.id
        }
        r1 = self.client.post("/api/snapshots", json=p1)
        self.assertEqual(r1.status_code, 201)

        # スナップショット2つ目を追加 (order = 1)
        p2 = {
            "workflow_id": self.workflow.id,
            "image_path": "t2.png",
            "params": {},
            "album_id": album.id
        }
        r2 = self.client.post("/api/snapshots", json=p2)
        self.assertEqual(r2.status_code, 201)
        snap2_id = r2.json()["id"]

        # sequence_order が 1 になっているかアサート
        item2 = self.db.query(models.AlbumItem).filter(
            models.AlbumItem.album_id == album.id,
            models.AlbumItem.snapshot_id == snap2_id
        ).first()
        self.assertIsNotNone(item2)
        self.assertEqual(item2.sequence_order, 1)

    def test_create_snapshot_with_non_existent_album(self):
        # 存在しない album_id を指定して 404 エラーになることを確認
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "t_fail.png",
            "params": {},
            "album_id": 99999
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 404)
        self.assertIn("Album not found", response.json()["detail"])

    def test_list_snapshots_includes_params(self):
        # スナップショットをDBに直接作成し、list_snapshots APIを実行
        params_data = {"Sampler_Seed": 12345, "positive_prompt": "1girl, solo"}
        import json
        snap = models.Snapshot(
            workflow_id=self.workflow.id,
            image_path="test_list.png",
            params=json.dumps(params_data)
        )
        self.db.add(snap)
        self.db.commit()

        response = self.client.get(f"/api/snapshots?workflow_id={self.workflow.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(len(data) >= 1)
        
        # 作成したスナップショットの params がデシリアライズされているか検証
        target_snap = next(s for s in data if s["id"] == snap.id)
        self.assertIsNotNone(target_snap.get("params"))
        self.assertEqual(target_snap["params"]["Sampler_Seed"], 12345)
        self.assertEqual(target_snap["params"]["positive_prompt"], "1girl, solo")


if __name__ == "__main__":
    unittest.main()
