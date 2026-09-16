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


class TestSnapshotsAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
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
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

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


    # --- REQ-102: 重複排除テスト ---

    def test_create_snapshot_deduplicates_duplicate_loras(self):
        """同一(lora_id, role)が複数あっても1件だけDBに登録されること（後勝ち）"""
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "test_dedup_lora.png",
            "params": {},
            "loras": [
                {"lora_id": self.lora.id, "strength": 0.5, "role": "positive"},
                {"lora_id": self.lora.id, "strength": 0.9, "role": "positive"},  # 重複（後勝ち）
            ],
            "tag_sets": []
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 201)
        snapshot_id = response.json()["id"]

        snap_loras = self.db.query(models.SnapshotLora).filter(
            models.SnapshotLora.snapshot_id == snapshot_id
        ).all()
        # 重複排除により1件のみ
        self.assertEqual(len(snap_loras), 1)
        # 後から登録された strength=0.9 が残る（後勝ち）
        self.assertAlmostEqual(snap_loras[0].strength, 0.9)
        self.assertEqual(snap_loras[0].role, "positive")

    def test_create_snapshot_deduplicates_duplicate_tag_sets(self):
        """同一(tag_set_id, role)が複数あっても1件だけDBに登録されること"""
        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "test_dedup_tag.png",
            "params": {},
            "loras": [],
            "tag_sets": [
                {"tag_set_id": self.tag_set.id, "role": "positive"},
                {"tag_set_id": self.tag_set.id, "role": "positive"},  # 重複
            ]
        }
        response = self.client.post("/api/snapshots", json=payload)
        self.assertEqual(response.status_code, 201)
        snapshot_id = response.json()["id"]

        snap_tag_sets = self.db.query(models.SnapshotTagSet).filter(
            models.SnapshotTagSet.snapshot_id == snapshot_id
        ).all()
        # 重複排除により1件のみ
        self.assertEqual(len(snap_tag_sets), 1)
        self.assertEqual(snap_tag_sets[0].tag_set_id, self.tag_set.id)

    def test_update_snapshot_deduplicates_duplicate_lora_ids(self):
        """update_snapshotに重複lora_idsを渡しても1件だけDBに登録されること"""
        # 初期スナップショット作成
        init_payload = {
            "workflow_id": self.workflow.id,
            "params": {},
            "loras": [],
            "tag_sets": []
        }
        create_resp = self.client.post("/api/snapshots", json=init_payload)
        self.assertEqual(create_resp.status_code, 201)
        snapshot_id = create_resp.json()["id"]

        # 重複 lora_ids で PATCH
        patch_payload = {
            "lora_ids": [self.lora.id, self.lora.id, self.lora.id],  # 重複
            "tag_set_ids": []
        }
        patch_resp = self.client.patch(f"/api/snapshots/{snapshot_id}", json=patch_payload)
        self.assertEqual(patch_resp.status_code, 200)

        snap_loras = self.db.query(models.SnapshotLora).filter(
            models.SnapshotLora.snapshot_id == snapshot_id
        ).all()
        # 重複排除により1件のみ
        self.assertEqual(len(snap_loras), 1)
        self.assertEqual(snap_loras[0].lora_id, self.lora.id)

    def test_update_snapshot_deduplicates_duplicate_tag_set_ids(self):
        """update_snapshotに重複tag_set_idsを渡しても1件だけDBに登録されること"""
        # 初期スナップショット作成
        init_payload = {
            "workflow_id": self.workflow.id,
            "params": {},
            "loras": [],
            "tag_sets": []
        }
        create_resp = self.client.post("/api/snapshots", json=init_payload)
        self.assertEqual(create_resp.status_code, 201)
        snapshot_id = create_resp.json()["id"]

        # 重複 tag_set_ids で PATCH
        patch_payload = {
            "lora_ids": [],
            "tag_set_ids": [self.tag_set.id, self.tag_set.id]  # 重複
        }
        patch_resp = self.client.patch(f"/api/snapshots/{snapshot_id}", json=patch_payload)
        self.assertEqual(patch_resp.status_code, 200)

        snap_tag_sets = self.db.query(models.SnapshotTagSet).filter(
            models.SnapshotTagSet.snapshot_id == snapshot_id
        ).all()
        # 重複排除により1件のみ
        self.assertEqual(len(snap_tag_sets), 1)
        self.assertEqual(snap_tag_sets[0].tag_set_id, self.tag_set.id)

    def test_create_snapshot_with_source_snapshot_id(self):
        # 1. 最初のスナップショットを作成
        payload_1 = {
            "workflow_id": self.workflow.id,
            "image_path": "parent.png",
            "params": {"prompt": "1girl"}
        }
        res1 = self.client.post("/api/snapshots", json=payload_1)
        self.assertEqual(res1.status_code, 201)
        parent_id = res1.json()["id"]

        # 2. source_snapshot_idを指定して2つ目のスナップショットを作成
        payload_2 = {
            "workflow_id": self.workflow.id,
            "image_path": "child.png",
            "params": {"prompt": "1girl, speech bubble"},
            "source_snapshot_id": parent_id
        }
        res2 = self.client.post("/api/snapshots", json=payload_2)
        self.assertEqual(res2.status_code, 201)
        data = res2.json()
        self.assertEqual(data["source_snapshot_id"], parent_id)

        # 3. GET API で取得時にも source_snapshot_id が返却されるか検証
        get_res = self.client.get(f"/api/snapshots/{data['id']}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["source_snapshot_id"], parent_id)

        # 4. list_snapshots でも source_snapshot_id が返却されるか検証
        list_res = self.client.get(f"/api/snapshots?workflow_id={self.workflow.id}")
        self.assertEqual(list_res.status_code, 200)
        target = next(s for s in list_res.json() if s["id"] == data["id"])
        self.assertEqual(target["source_snapshot_id"], parent_id)

    def test_detect_bubble_endpoints(self):
        import cv2
        import numpy as np
        import os
        from app.config import settings

        # 1. 200x200の黒い画像を作成し、中央に100x100の白い正方形（吹き出しのダミー）を描画
        img = np.zeros((200, 200, 3), dtype=np.uint8)
        cv2.rectangle(img, (50, 50), (150, 150), (255, 255, 255), -1)

        filename = "test_bubble_detect.png"
        image_path = settings.snapshot_path / filename
        cv2.imwrite(str(image_path), img)

        try:
            # 2. スナップショットを作成
            payload = {
                "workflow_id": self.workflow.id,
                "image_path": f"/api/snapshots/images/{filename}",
                "params": {}
            }
            res = self.client.post("/api/snapshots", json=payload)
            self.assertEqual(res.status_code, 201)
            snapshot_id = res.json()["id"]

            # 3. detect-bubble エンドポイントを呼び出し
            detect_res = self.client.post(f"/api/snapshots/{snapshot_id}/detect-bubble")
            self.assertEqual(detect_res.status_code, 200)
            data = detect_res.json()
            self.assertIsNotNone(data["bounding_box"])
            self.assertTrue(98 <= data["bounding_box"]["w"] <= 102)
            self.assertTrue(98 <= data["bounding_box"]["h"] <= 102)

            # 4. ROI指定で呼び出し
            roi_payload = {
                "roi": {"x": 40, "y": 40, "w": 120, "h": 120}
            }
            roi_res = self.client.post(f"/api/snapshots/{snapshot_id}/detect-bubble-roi", json=roi_payload)
            self.assertEqual(roi_res.status_code, 200)
            roi_data = roi_res.json()
            self.assertIsNotNone(roi_data["bounding_box"])
            self.assertTrue(98 <= roi_data["bounding_box"]["w"] <= 102)
            self.assertTrue(98 <= roi_data["bounding_box"]["h"] <= 102)

            # 4-1. ROIを小さく指定（例: 50x50px）、中心点(100, 100)を含む範囲
            roi_payload_small = {
                "roi": {"x": 75, "y": 75, "w": 50, "h": 50}
            }
            roi_res_small = self.client.post(f"/api/snapshots/{snapshot_id}/detect-bubble-roi", json=roi_payload_small)
            self.assertEqual(roi_res_small.status_code, 200)
            roi_data_small = roi_res_small.json()
            self.assertIsNotNone(roi_data_small["bounding_box"])
            self.assertTrue(98 <= roi_data_small["bounding_box"]["w"] <= 102)
            self.assertTrue(98 <= roi_data_small["bounding_box"]["h"] <= 102)

            # 4-2. ROIの境界が吹き出しを一部カットする状態で、中心点(100, 100)を含む
            roi_payload_cut = {
                "roi": {"x": 80, "y": 80, "w": 40, "h": 40}
            }
            roi_res_cut = self.client.post(f"/api/snapshots/{snapshot_id}/detect-bubble-roi", json=roi_payload_cut)
            self.assertEqual(roi_res_cut.status_code, 200)
            roi_data_cut = roi_res_cut.json()
            self.assertIsNotNone(roi_data_cut["bounding_box"])
            self.assertTrue(98 <= roi_data_cut["bounding_box"]["w"] <= 102)
            self.assertTrue(98 <= roi_data_cut["bounding_box"]["h"] <= 102)

            # 4-3. ROIが吹き出し領域から完全に外れている場合（結果は None になるべき）
            roi_payload_out = {
                "roi": {"x": 0, "y": 0, "w": 30, "h": 30}
            }
            roi_res_out = self.client.post(f"/api/snapshots/{snapshot_id}/detect-bubble-roi", json=roi_payload_out)
            self.assertEqual(roi_res_out.status_code, 200)
            roi_data_out = roi_res_out.json()
            self.assertIsNone(roi_data_out["bounding_box"])

            # 5. パラメータの動的変更を適用して検出動作の閾値変更を検証
            from app.models import LlmPrompt
            
            param_record = self.db.query(LlmPrompt).filter(LlmPrompt.key == "bubble_detection_params").first()
            if not param_record:
                param_record = LlmPrompt(
                    key="bubble_detection_params",
                    description="吹き出し自動検出用画像処理パラメータ",
                    content='{"min_area": 1000, "min_brightness": 150}'
                )
                self.db.add(param_record)
                self.db.commit()

            original_content = param_record.content
            
            try:
                # 吹き出し(100x100px = 10000画素)に対して、閾値を 15000画素 にして検出されないことを検証
                param_record.content = '{"min_area": 15000, "min_brightness": 150}'
                self.db.commit()
                
                res_fail = self.client.post(f"/api/snapshots/{snapshot_id}/detect-bubble")
                self.assertEqual(res_fail.status_code, 200)
                self.assertIsNone(res_fail.json()["bounding_box"])
                
            finally:
                # 元に戻す
                param_record.content = original_content
                self.db.commit()

            # 6. detect-bubble-debug エンドポイントの検証
            debug_res = self.client.post(f"/api/snapshots/{snapshot_id}/detect-bubble-debug", json={})
            self.assertEqual(debug_res.status_code, 200)
            candidates = debug_res.json()["candidates"]
            self.assertGreater(len(candidates), 0)
            
            pass_candidates = [c for c in candidates if c["status"] == "PASS"]
            self.assertGreater(len(pass_candidates), 0)
            
            # ROI指定ありでのデバッグ
            debug_roi_res = self.client.post(
                f"/api/snapshots/{snapshot_id}/detect-bubble-debug",
                json={"roi": {"x": 40, "y": 40, "w": 120, "h": 120}}
            )
            self.assertEqual(debug_roi_res.status_code, 200)
            roi_candidates = debug_roi_res.json()["candidates"]
            self.assertGreater(len(roi_candidates), 0)

        finally:
            if image_path.exists():
                os.remove(image_path)

    def test_patch_snapshot_image_and_params(self):
        # 1. 初期スナップショットを作成
        init_payload = {
            "workflow_id": self.workflow.id,
            "image_path": "original.png",
            "thumbnail_path": "thumb_original.png",
            "params": {"prompt": "1girl", "seed": 123},
            "loras": [],
            "tag_sets": []
        }
        create_resp = self.client.post("/api/snapshots", json=init_payload)
        self.assertEqual(create_resp.status_code, 201)
        snapshot_id = create_resp.json()["id"]

        # 2. PATCH API で image_path, thumbnail_path, params を上書き
        patch_payload = {
            "image_path": "updated.png",
            "thumbnail_path": "thumb_updated.png",
            "params": {"prompt": "1girl, speech bubble", "seed": 123, "speech_bubbles": [{"text": "hello"}]}
        }
        patch_resp = self.client.patch(f"/api/snapshots/{snapshot_id}", json=patch_payload)
        self.assertEqual(patch_resp.status_code, 200)
        data = patch_resp.json()
        self.assertEqual(data["image_path"], "updated.png")
        self.assertEqual(data["thumbnail_path"], "thumb_updated.png")
        self.assertEqual(data["params"]["speech_bubbles"][0]["text"], "hello")

        # 3. GET API でも更新が永続化されていることを確認
        get_resp = self.client.get(f"/api/snapshots/{snapshot_id}")
        self.assertEqual(get_resp.status_code, 200)
        get_data = get_resp.json()
        self.assertEqual(get_data["image_path"], "updated.png")
        self.assertEqual(get_data["thumbnail_path"], "thumb_updated.png")
        self.assertEqual(get_data["params"]["speech_bubbles"][0]["text"], "hello")


    def test_resolve_internal_comfy_url(self):
        from app.services.snapshot_service import resolve_internal_comfy_url
        base_url = "http://localhost:8188"

        # External IP with /view query parameters
        ext1 = "http://192.168.3.13:8188/view?filename=test.png&subfolder=&type=temp"
        self.assertEqual(
            resolve_internal_comfy_url(ext1, base_url),
            "http://localhost:8188/view?filename=test.png&subfolder=&type=temp"
        )

        # Base URL with trailing slash
        self.assertEqual(
            resolve_internal_comfy_url(ext1, "http://localhost:8188/"),
            "http://localhost:8188/view?filename=test.png&subfolder=&type=temp"
        )

        # /view as subpath
        ext2 = "http://192.168.3.13:8188/view/subfolder/test.png"
        self.assertEqual(
            resolve_internal_comfy_url(ext2, base_url),
            "http://localhost:8188/view/subfolder/test.png"
        )

        # General external non-comfy URL
        ext3 = "https://example.com/images/sample.png"
        self.assertEqual(resolve_internal_comfy_url(ext3, base_url), ext3)

        # Empty or None inputs
        self.assertEqual(resolve_internal_comfy_url("", base_url), "")
        self.assertEqual(resolve_internal_comfy_url(None, base_url), "")

    def test_create_snapshot_from_external_comfy_url_success(self):
        import io
        from unittest.mock import patch, MagicMock
        from PIL import Image
        from app.config import settings

        img = Image.new("RGB", (64, 64), color="blue")
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format="PNG")
        dummy_bytes = img_byte_arr.getvalue()

        mock_response = MagicMock()
        mock_response.read.return_value = dummy_bytes
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = None

        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "http://192.168.3.13:8188/view?filename=ComfyUI_0001_.png&subfolder=&type=temp",
            "params": {"prompt": "1girl"}
        }

        with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen, \
             patch.object(settings, "comfy_url", "http://localhost:8188"):
            res = self.client.post("/api/snapshots", json=payload)
            self.assertEqual(res.status_code, 201)
            data = res.json()
            self.assertTrue(data["image_path"].startswith("/api/snapshots/images/"))
            self.assertTrue(data["thumbnail_path"].startswith("/api/snapshots/images/thumb_"))

            called_req = mock_urlopen.call_args[0][0]
            called_url = called_req.full_url if hasattr(called_req, "full_url") else called_req
            self.assertTrue(called_url.startswith("http://localhost:8188/view?"))

    def test_create_snapshot_from_comfy_url_failure_raises_502(self):
        import urllib.error
        from unittest.mock import patch
        from app.config import settings

        payload = {
            "workflow_id": self.workflow.id,
            "image_path": "http://192.168.3.13:8188/view?filename=ComfyUI_missing.png&subfolder=&type=temp",
            "params": {"prompt": "1girl"}
        }

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("Connection refused")), \
             patch.object(settings, "comfy_url", "http://localhost:8188"):
            res = self.client.post("/api/snapshots", json=payload)
            self.assertEqual(res.status_code, 502)
            self.assertIn("Failed to download snapshot image from ComfyUI", res.json()["detail"])

            # Verify no snapshot record created in DB
            self.assertEqual(self.db.query(models.Snapshot).count(), 0)


if __name__ == "__main__":
    unittest.main()



