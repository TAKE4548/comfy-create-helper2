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
    def test_list_albums_includes_items_and_image_paths(self):
        # 既存アルバムを用意
        album = models.Album(name="Test Album")
        self.db.add(album)
        self.db.commit()

        # スナップショットを関連付ける
        snap = models.Snapshot(
            workflow_id=self.workflow.id,
            image_path="test_album_img.png",
            params="{}"
        )
        self.db.add(snap)
        self.db.commit()

        item = models.AlbumItem(
            album_id=album.id,
            snapshot_id=snap.id,
            sequence_order=0
        )
        self.db.add(item)
        self.db.commit()

        response = self.client.get("/api/albums")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # アルバムリストをアサート
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Test Album")
        self.assertEqual(len(data[0]["items"]), 1)
        self.assertEqual(data[0]["items"][0]["snapshot_id"], snap.id)
        self.assertEqual(data[0]["items"][0]["image_path"], "test_album_img.png")

    def test_create_snapshot_downloads_image(self):
        # ダミー画像を提供する外部 URL を指定してスナップショットを作成
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png",
            "params": {},
            "loras": [],
            "tag_sets": []
        }
        import urllib.request
        from unittest.mock import patch, MagicMock
        
        mock_response = MagicMock()
        mock_response.read.return_value = b"fake image content"
        mock_response.__enter__.return_value = mock_response
        
        with patch('urllib.request.urlopen', return_value=mock_response):
            response = self.client.post("/api/snapshots", json=payload)
            self.assertEqual(response.status_code, 201)
            data = response.json()
            
            # 相対パスへの変換アサーション
            self.assertTrue(data["image_path"].startswith("/api/snapshots/images/"))
            self.assertTrue(data["image_path"].endswith(".png"))

    def test_create_snapshot_with_duplicate_lora_different_roles(self):
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "test_dup_lora.png",
            "params": {},
            "loras": [
                {"lora_id": self.lora.id, "strength": 0.8, "role": "positive"},
                {"lora_id": self.lora.id, "strength": -0.5, "role": "negative"}
            ],
            "tag_sets": []
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        snapshot_id = data["id"]

        # 中間テーブルに2つのレコードが保存されていることを確認
        snap_loras = self.db.query(models.SnapshotLora).filter(models.SnapshotLora.snapshot_id == snapshot_id).all()
        self.assertEqual(len(snap_loras), 2)
        roles = {sl.role: sl.strength for sl in snap_loras}
        self.assertIn("positive", roles)
        self.assertIn("negative", roles)
        self.assertAlmostEqual(roles["positive"], 0.8)
        self.assertAlmostEqual(roles["negative"], -0.5)

    def test_create_snapshot_with_duplicate_tag_set_different_roles(self):
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "test_dup_tag.png",
            "params": {},
            "loras": [],
            "tag_sets": [
                {"tag_set_id": self.tag_set.id, "role": "positive"},
                {"tag_set_id": self.tag_set.id, "role": "negative"}
            ]
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        snapshot_id = data["id"]

        # 中間テーブルに2つのレコードが保存されていることを確認
        snap_tag_sets = self.db.query(models.SnapshotTagSet).filter(models.SnapshotTagSet.snapshot_id == snapshot_id).all()
        self.assertEqual(len(snap_tag_sets), 2)
        roles = {st.role for st in snap_tag_sets}
        self.assertIn("positive", roles)
        self.assertIn("negative", roles)


    def test_patch_snapshot_assets(self):
        # 1. 初期状態でLoRAとタグセットを持つスナップショットを作成
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "test.png",
            "params": {"prompt": "1girl"},
            "loras": [{"lora_id": self.lora.id, "strength": 0.8}],
            "tag_sets": [{"tag_set_id": self.tag_set.id}]
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 201)
        snapshot_id = response.json()["id"]

        # 別のLoRAとタグセットを作成
        another_lora = models.Lora(model_name="another_lora.safetensors")
        self.db.add(another_lora)
        another_tag_set = models.TagSet(name="another_tags", tags='["boy"]')
        self.db.add(another_tag_set)
        self.db.commit()

        # 2. PATCH API で更新 (紐付けを変更)
        patch_payload = {
            "lora_ids": [another_lora.id],
            "tag_set_ids": [another_tag_set.id]
        }
        patch_response = self.client.patch(f"/api/snapshots/{snapshot_id}", json=patch_payload)
        self.assertEqual(patch_response.status_code, 200)

        # 3. 更新結果の確認
        data = patch_response.json()
        self.assertEqual(len(data["loras"]), 1)
        self.assertEqual(data["loras"][0]["lora_id"], another_lora.id)
        self.assertEqual(data["loras"][0]["strength"], 1.0)
        self.assertEqual(data["loras"][0]["role"], "positive")
        self.assertEqual(len(data["tag_sets"]), 1)
        self.assertEqual(data["tag_sets"][0]["tag_set_id"], another_tag_set.id)
        self.assertEqual(data["tag_sets"][0]["role"], "positive")

        # 旧関係が消え、新関係がデータベースに登録されているか直接確認
        snap_loras = self.db.query(models.SnapshotLora).filter(models.SnapshotLora.snapshot_id == snapshot_id).all()
        self.assertEqual(len(snap_loras), 1)
        self.assertEqual(snap_loras[0].lora_id, another_lora.id)

        snap_tags = self.db.query(models.SnapshotTagSet).filter(models.SnapshotTagSet.snapshot_id == snapshot_id).all()
        self.assertEqual(len(snap_tags), 1)
        self.assertEqual(snap_tags[0].tag_set_id, another_tag_set.id)

    def test_get_snapshots_filter_by_assets(self):
        # 1. 2つの異なるスナップショットを作成
        payload_1 = {
            "workflow_id": self.workflow.id,
            "params": {},
            "loras": [{"lora_id": self.lora.id, "strength": 0.8}],
            "tag_sets": []
        }
        payload_2 = {
            "workflow_id": self.workflow.id,
            "params": {},
            "loras": [],
            "tag_sets": [{"tag_set_id": self.tag_set.id}]
        }
        resp1 = self.client.post("/api/snapshots", json=payload_1)
        resp2 = self.client.post("/api/snapshots", json=payload_2)
        id1 = resp1.json()["id"]
        id2 = resp2.json()["id"]

        # 2. フィルタなしで全件取得できるか確認
        response = self.client.get("/api/snapshots")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.json()), 2)

        # 3. lora_id でフィルタ
        response_lora = self.client.get(f"/api/snapshots?lora_id={self.lora.id}")
        self.assertEqual(response_lora.status_code, 200)
        lora_snaps = response_lora.json()
        self.assertTrue(any(s["id"] == id1 for s in lora_snaps))
        self.assertFalse(any(s["id"] == id2 for s in lora_snaps))

        # 4. tag_set_id でフィルタ
        response_tag = self.client.get(f"/api/snapshots?tag_set_id={self.tag_set.id}")
        self.assertEqual(response_tag.status_code, 200)
        tag_snaps = response_tag.json()
        self.assertFalse(any(s["id"] == id1 for s in tag_snaps))
        self.assertTrue(any(s["id"] == id2 for s in tag_snaps))

    def test_patch_snapshot_not_found(self):
        # 存在しないスナップショットIDに対してPATCHを実行して404が返ることを確認
        response = self.client.patch("/api/snapshots/99999", json={"lora_ids": [], "tag_set_ids": []})
        self.assertEqual(response.status_code, 404)

    def test_patch_snapshot_invalid_lora(self):
        # 初期スナップショットを作成
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "test.png",
            "params": {"prompt": "1girl"},
            "loras": [],
            "tag_sets": []
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 201)
        snapshot_id = response.json()["id"]

        # 存在しないLora IDを渡した場合、バリデーションエラー(400)になることを確認
        response_patch = self.client.patch(f"/api/snapshots/{snapshot_id}", json={"lora_ids": [99999], "tag_set_ids": []})
        self.assertEqual(response_patch.status_code, 400)

    def test_patch_snapshot_invalid_tag_set(self):
        # 初期スナップショットを作成
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "test.png",
            "params": {"prompt": "1girl"},
            "loras": [],
            "tag_sets": []
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 201)
        snapshot_id = response.json()["id"]

        # 存在しないTagSet IDを渡した場合、バリデーションエラー(400)になることを確認
        response_patch = self.client.patch(f"/api/snapshots/{snapshot_id}", json={"lora_ids": [], "tag_set_ids": [99999]})
        self.assertEqual(response_patch.status_code, 400)

    def test_create_snapshot_db_error_deletes_downloaded_image(self):
        # 画像ダウンロードを伴う作成処理で、DBの追加/コミット時にエラーを起こさせる
        from unittest.mock import patch, MagicMock
        from sqlalchemy.exc import SQLAlchemyError
        import os
        from pathlib import Path
        from app.config import settings

        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png",
            "params": {},
            "loras": [],
            "tag_sets": []
        }
        
        mock_response = MagicMock()
        mock_response.read.return_value = b"fake image content"
        mock_response.__enter__.return_value = mock_response

        # 保存されるファイルのパスをキャプチャする
        saved_paths = []
        original_open = open
        
        def mock_open_fn(file, mode):
            p = Path(file)
            if p.parent == settings.snapshot_path:
                saved_paths.append(p)
            return original_open(file, mode)

        # override_get_db 用のカスタム Session セッションファクトリ
        def custom_get_db():
            db = TestingSessionLocal()
            original_add = db.add
            
            def raise_db_err(instance):
                if isinstance(instance, models.Snapshot):
                    raise SQLAlchemyError("Fake DB Error")
                original_add(instance)
                
            db.add = raise_db_err
            try:
                yield db
            finally:
                db.close()

        # テスト用に get_db を一時差し替え
        app.dependency_overrides[get_db] = custom_get_db
        
        try:
            with patch('urllib.request.urlopen', return_value=mock_response):
                with patch('builtins.open', mock_open_fn):
                    try:
                        self.client.post("/api/snapshots", json=payload)
                    except SQLAlchemyError:
                        pass
                    
                    # 保存されたはずの画像ファイルパスが存在しない（クリーンアップで削除された）ことを検証
                    self.assertTrue(len(saved_paths) > 0)
                    for path in saved_paths:
                        self.assertFalse(path.exists())
        finally:
            # get_db オーバーライドを元に戻す
            app.dependency_overrides[get_db] = override_get_db

    def test_snapshot_images_cache_header(self):
        import os
        from app.config import settings
        test_file_path = settings.snapshot_path / "test_cache.png"
        with open(test_file_path, "w") as f:
            f.write("dummy content")
        try:
            res = self.client.get("/api/snapshots/images/test_cache.png")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.headers.get("cache-control"), "public, max-age=31536000, immutable")
        finally:
            if os.path.exists(test_file_path):
                os.remove(test_file_path)


if __name__ == "__main__":
    unittest.main()


