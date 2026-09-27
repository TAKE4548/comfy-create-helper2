import json
import unittest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app import models
from app.services.speech_scene_service import (
    extract_character_tone_samples,
    extract_best_similar_scene_samples,
    build_dual_track_prompt,
    parse_vlm_json_with_fallback,
    resolve_bubble_style,
    convert_items_to_bubbles,
    unload_vlm_model_with_retry,
    generate_scene_script,
    POSITION_MAP_1024,
)

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class TestSpeechSceneServiceDualTrackAndParse(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = TestingSessionLocal()
        # Seed workflow needed for foreign key
        wf = models.Workflow(name="test_wf", json_body="{}")
        self.db.add(wf)
        self.db.commit()
        self.workflow_id = wf.id

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)

    def test_dual_track_and_parse(self):
        # 1. 系統A: 同キャラ確定セリフ抽出 (speaker_tag_set_id 一致かつ not is_se)
        # Snapshot 1: 該当セリフ 2件 + SE 1件
        snap1 = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({
                "speech_bubbles": [
                    {"speaker_tag_set_id": 10, "text": "こんにちは！", "is_se": False},
                    {"speaker_tag_set_id": 10, "text": "ドカーン", "is_se": True},
                    {"speaker_tag_set_id": 10, "text": "今日もいい天気ですね。", "is_se": False},
                ]
            }),
            created_at=datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        )
        # Snapshot 2: 他キャラセリフ + 該当セリフ 1件
        snap2 = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({
                "speech_bubbles": [
                    {"speaker_tag_set_id": 99, "text": "関係ないセリフ", "is_se": False},
                    {"speaker_tag_set_id": 10, "text": "また明日会いましょう！", "is_se": False},
                ]
            }),
            created_at=datetime(2026, 1, 1, 11, 0, 0, tzinfo=timezone.utc),
        )
        self.db.add_all([snap1, snap2])
        self.db.commit()

        samples = extract_character_tone_samples(self.db, target_tag_set_id=10)
        self.assertEqual(len(samples), 3)
        self.assertIn("こんにちは！", samples)
        self.assertIn("今日もいい天気ですね。", samples)
        self.assertIn("また明日会いましょう！", samples)
        self.assertNotIn("ドカーン", samples)

        # 系統A フォールバック: セリフ0件時に SpeechTonePreset へフォールバック
        tone_preset = models.SpeechTonePreset(
            name="tsundere",
            prompt="ツンツンした態度で話し、語尾に『〜べ、べつに！』をつける口調。",
        )
        self.db.add(tone_preset)
        self.db.flush()

        bubble_preset = models.SpeechBubblePreset(
            name="heroine_preset",
            tag_set_id=20,
            tone_preset_id=tone_preset.id,
            is_default=True,
        )
        self.db.add(bubble_preset)
        self.db.commit()

        fallback_samples = extract_character_tone_samples(self.db, target_tag_set_id=20)
        self.assertEqual(len(fallback_samples), 1)
        self.assertEqual(fallback_samples[0], tone_preset.prompt)

        # target_tag_set_id が None のときは空リスト
        self.assertEqual(extract_character_tone_samples(self.db, None), [])

        # 2. 系統B: SnowballStemmer による最類似シーン抽出 (感情語+5, 状況語+2)
        # Scene 1: battle, crying (+2 +5 = 7)
        snap_scene1 = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({
                "positive_prompt": "1girl, crying in intense battle, dramatic scene",
                "speech_bubbles": [
                    {"speaker_name": "Hero", "text": "諦めるな！", "is_se": False},
                    {"speaker_name": "SE", "text": "ゴオオオ", "is_se": True},
                ]
            }),
            created_at=datetime(2026, 1, 2, 10, 0, 0, tzinfo=timezone.utc),
        )
        # Scene 2: school, classroom, smile (+2 +0 +5 = 7... wait: let's test higher score)
        # Scene 2: crying, angry, scream, battle (+5 +5 +5 +2 = 17)
        snap_scene2 = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({
                "positive_prompt": "angry girl screaming and crying furiously in battle",
                "speech_bubbles": [
                    {"speaker_name": "Villain", "text": "許さない！", "is_se": False},
                ]
            }),
            created_at=datetime(2026, 1, 2, 11, 0, 0, tzinfo=timezone.utc),
        )
        self.db.add_all([snap_scene1, snap_scene2])
        self.db.commit()

        # Query matching crying & screaming & battle
        query_prompt = "crying heroine screaming in fierce battle"
        ref_prompt, ref_bubbles = extract_best_similar_scene_samples(self.db, query_prompt)
        self.assertIsNotNone(ref_prompt)
        self.assertIn("furious", ref_prompt)
        self.assertEqual(len(ref_bubbles), 1)
        self.assertEqual(ref_bubbles[0]["text"], "許さない！")

        # スコア2点未満時は (None, [])
        none_prompt, none_bubbles = extract_best_similar_scene_samples(self.db, "unrelated alien spaceship xyzabc")
        self.assertIsNone(none_prompt)
        self.assertEqual(none_bubbles, [])

        # 3. build_dual_track_prompt の検証
        built_prompt = build_dual_track_prompt(
            character_name="Alice",
            tone_samples=samples,
            similar_scene_prompt=ref_prompt,
            similar_scene_bubbles=ref_bubbles,
            scene_hint="緊張感のある対峙シーン",
        )
        self.assertIn("Alice", built_prompt)
        self.assertIn("Track A", built_prompt)
        self.assertIn("こんにちは！", built_prompt)
        self.assertIn("Track B", built_prompt)
        self.assertIn("許さない！", built_prompt)
        self.assertIn("緊張感のある対峙シーン", built_prompt)
        self.assertIn("top_right", built_prompt)
        self.assertIn("top_left", built_prompt)

        # 4. パース堅牢化仕様: <think> タグ除去 & ```json ``` マークダウン抽出
        raw_vlm_output = """<think>
Here is my chain of thought:
The scene is emotional and intense. We need a sound effect and a main dialogue.
</think>
```json
{
  "scene_interpretation": "Alice confronts the enemy with strong resolve.",
  "items": [
    {"role": "se", "speaker": "", "text": "ズドドド", "position": "center_right"},
    {"role": "main", "speaker": "Alice", "text": "もう逃げないわ！", "position": "top_left"}
  ]
}
```"""
        parsed = parse_vlm_json_with_fallback(raw_vlm_output)
        self.assertEqual(parsed["scene_interpretation"], "Alice confronts the enemy with strong resolve.")
        self.assertEqual(len(parsed["items"]), 2)
        self.assertEqual(parsed["items"][0]["text"], "ズドドド")
        self.assertEqual(parsed["items"][1]["speaker"], "Alice")

        # マークダウンなし・<think>なしのプレーンJSONもパースできること
        plain_json = '{"scene_interpretation": "Calm morning", "items": []}'
        self.assertEqual(parse_vlm_json_with_fallback(plain_json)["scene_interpretation"], "Calm morning")


class TestSpeechSceneServiceStyleAndCoords(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = TestingSessionLocal()
        # Seed workflow
        wf = models.Workflow(name="test_wf2", json_body="{}")
        self.db.add(wf)
        self.db.commit()

        # Seed TagSet and SpeechBubblePresets
        ts_main = models.TagSet(name="MainChar", tags="[]")
        ts_sub = models.TagSet(name="SubChar", tags="[]")
        self.db.add_all([ts_main, ts_sub])
        self.db.commit()
        self.ts_main_id = ts_main.id
        self.ts_sub_id = ts_sub.id

        # Preset for main
        preset_main = models.SpeechBubblePreset(
            name="MainDefaultPreset",
            shape="oval",
            text_color="#111111",
            background_color="#EEEEEE",
            border_color="#CCCCCC",
            border_width=3,
            font_family="Noto Sans JP",
            font_size=18,
            tag_set_id=self.ts_main_id,
            is_default=True,
        )
        # Explicit preset (not default)
        preset_explicit = models.SpeechBubblePreset(
            name="MainExplicitPreset",
            shape="burst",
            text_color="#990000",
            background_color="#FFEEEE",
            border_color="#FF0000",
            border_width=4,
            font_family="Noto Sans JP",
            font_size=20,
            tag_set_id=self.ts_main_id,
            is_default=False,
        )
        # Preset for sub
        preset_sub = models.SpeechBubblePreset(
            name="SubDefaultPreset",
            shape="rounded-rect",
            text_color="#002200",
            background_color="#E0FFE0",
            border_color="#00AA00",
            border_width=2,
            font_family="Noto Sans JP",
            font_size=16,
            tag_set_id=self.ts_sub_id,
            is_default=True,
        )
        self.db.add_all([preset_main, preset_explicit, preset_sub])
        self.db.commit()
        self.preset_main_id = preset_main.id
        self.preset_explicit_id = preset_explicit.id
        self.preset_sub_id = preset_sub.id

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)

    def test_style_and_coords(self):
        # 1. 座標マッピング定義 (POSITION_MAP_1024) の確認
        self.assertEqual(POSITION_MAP_1024['top_right'].x, 700.0)
        self.assertEqual(POSITION_MAP_1024['top_right'].y, 90.0)
        self.assertEqual(POSITION_MAP_1024['top_right'].w, 230.0)
        self.assertEqual(POSITION_MAP_1024['top_right'].h, 110.0)

        self.assertEqual(POSITION_MAP_1024['center_right'].x, 550.0)
        self.assertEqual(POSITION_MAP_1024['center_right'].y, 350.0)
        self.assertEqual(POSITION_MAP_1024['center'].x, 550.0)
        self.assertEqual(POSITION_MAP_1024['center'].y, 350.0)

        self.assertEqual(POSITION_MAP_1024['top_left'].x, 120.0)
        self.assertEqual(POSITION_MAP_1024['top_left'].y, 120.0)
        self.assertEqual(POSITION_MAP_1024['top_left'].w, 240.0)
        self.assertEqual(POSITION_MAP_1024['top_left'].h, 120.0)

        self.assertEqual(POSITION_MAP_1024['bottom_left'].x, 140.0)
        self.assertEqual(POSITION_MAP_1024['bottom_left'].y, 700.0)

        # 2. resolve_bubble_style のテスト
        # 2a. role='main' with target_tag_set_id default preset
        item_main = {"role": "main", "speaker": "MainChar", "text": "いくわよ！", "position": "top_left"}
        ts_id, is_se, style = resolve_bubble_style(self.db, item_main, self.ts_main_id, None)
        self.assertEqual(ts_id, self.ts_main_id)
        self.assertFalse(is_se)
        self.assertEqual(style.shape, "oval")
        self.assertEqual(style.textColor, "#111111")
        self.assertEqual(style.backgroundColor, "#EEEEEE")
        self.assertEqual(style.borderWidth, 3.0)

        # 2b. role='main' with explicit_preset_id
        ts_id, is_se, style = resolve_bubble_style(self.db, item_main, self.ts_main_id, self.preset_explicit_id)
        self.assertEqual(ts_id, self.ts_main_id)
        self.assertFalse(is_se)
        self.assertEqual(style.shape, "burst")
        self.assertEqual(style.textColor, "#990000")
        self.assertEqual(style.backgroundColor, "#FFEEEE")
        self.assertEqual(style.borderWidth, 4.0)

        # 2c. role='sub' matching TagSet by name
        item_sub = {"role": "sub", "speaker": "SubChar", "text": "気をつけて！", "position": "top_right"}
        ts_id, is_se, style = resolve_bubble_style(self.db, item_sub, self.ts_main_id, None)
        self.assertEqual(ts_id, self.ts_sub_id)
        self.assertFalse(is_se)
        self.assertEqual(style.shape, "rounded-rect")
        self.assertEqual(style.textColor, "#002200")
        self.assertEqual(style.backgroundColor, "#E0FFE0")

        # 2d. role='sub' with unmatched speaker name (fallback style)
        item_sub_unknown = {"role": "sub", "speaker": "UnknownMob", "text": "わー！", "position": "top_right"}
        ts_id, is_se, style = resolve_bubble_style(self.db, item_sub_unknown, self.ts_main_id, None)
        self.assertIsNone(ts_id)
        self.assertFalse(is_se)
        self.assertEqual(style.backgroundColor, "#FFFFFF")
        self.assertEqual(style.textColor, "#1A202C")

        # 2e. role='se' (枠なし装飾)
        item_se = {"role": "se", "speaker": "", "text": "ドドド", "position": "center_right"}
        ts_id, is_se, style = resolve_bubble_style(self.db, item_se, self.ts_main_id, None)
        self.assertIsNone(ts_id)
        self.assertTrue(is_se)
        self.assertEqual(style.shape, "none")
        self.assertEqual(style.backgroundColor, "transparent")
        self.assertEqual(style.borderColor, "transparent")
        self.assertEqual(style.textColor, "#FFCC00")

        # 3. convert_items_to_bubbles のテスト (UUID付与, 1024px座標変換, しっぽ初期配置)
        items = [
            {"role": "main", "speaker": "MainChar", "text": "行くわよ！", "position": "top_left"},
            {"role": "sub", "speaker": "SubChar", "text": "待って！", "position": "top_right"},
            {"role": "se", "speaker": "", "text": "ゴオオオ", "position": "center_right"},
        ]
        bubbles = convert_items_to_bubbles(
            self.db, items, target_tag_set_id=self.ts_main_id, explicit_preset_id=None
        )
        self.assertEqual(len(bubbles), 3)

        # Bubble 0 (main)
        b0 = bubbles[0]
        self.assertIsNotNone(b0.id)
        self.assertEqual(len(b0.id), 36)  # UUID format
        self.assertEqual(b0.text, "行くわよ！")
        self.assertEqual(b0.role, "main")
        self.assertEqual(b0.speaker_name, "MainChar")
        self.assertEqual(b0.speaker_tag_set_id, self.ts_main_id)
        self.assertFalse(b0.is_se)
        self.assertEqual(b0.position.x, 120.0)
        self.assertEqual(b0.position.y, 120.0)
        self.assertEqual(b0.position.w, 240.0)
        self.assertEqual(b0.position.h, 120.0)
        self.assertIsNotNone(b0.tail)
        self.assertEqual(b0.tail.direction, "bottom")
        self.assertEqual(b0.tail.tip_x, 120.0 + 240.0 / 2.0)
        self.assertEqual(b0.tail.tip_y, 120.0 + 120.0 + 20.0)

        # Bubble 1 (sub)
        b1 = bubbles[1]
        self.assertEqual(b1.role, "sub")
        self.assertEqual(b1.speaker_tag_set_id, self.ts_sub_id)
        self.assertFalse(b1.is_se)
        self.assertEqual(b1.position.x, 700.0)
        self.assertEqual(b1.position.y, 90.0)
        self.assertIsNotNone(b1.tail)

        # Bubble 2 (se) - tail is None for SE
        b2 = bubbles[2]
        self.assertEqual(b2.role, "se")
        self.assertTrue(b2.is_se)
        self.assertIsNone(b2.speaker_tag_set_id)
        self.assertEqual(b2.position.x, 550.0)
        self.assertEqual(b2.position.y, 350.0)
        self.assertEqual(b2.style.shape, "none")
        self.assertIsNone(b2.tail)


class TestSpeechSceneServiceVramUnload(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = TestingSessionLocal()
        wf = models.Workflow(name="test_wf_vram", json_body="{}")
        self.db.add(wf)
        self.db.commit()
        self.workflow_id = wf.id

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)

    async def test_vram_unload_success(self):
        """CRIT-05 / TEST-VRAM-01: 正常系アンロード (200 OK)"""
        from unittest.mock import patch, AsyncMock
        import httpx

        mock_resp = httpx.Response(200, json={"status": "ok"})
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            result = await unload_vlm_model_with_retry(max_retries=1)
            self.assertTrue(result)
            self.assertEqual(mock_post.call_count, 1)

    async def test_vram_unload_retry_and_success(self):
        """CRIT-05 / TEST-VRAM-01: 初回失敗・リトライ成功 (1回リトライ付き)"""
        from unittest.mock import patch, AsyncMock
        import httpx

        fail_resp = httpx.Response(500, text="Internal Server Error")
        success_resp = httpx.Response(200, json={"status": "ok"})
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = [httpx.ConnectError("Connection refused"), success_resp]
            result = await unload_vlm_model_with_retry(max_retries=1)
            self.assertTrue(result)
            self.assertEqual(mock_post.call_count, 2)

    async def test_vram_unload_failure_returns_false(self):
        """CRIT-05 / TEST-VRAM-01: 全試行失敗時は False を返却しエラーログ"""
        from unittest.mock import patch, AsyncMock
        import httpx

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = httpx.ConnectError("Connection refused")
            result = await unload_vlm_model_with_retry(max_retries=1)
            self.assertFalse(result)
            self.assertEqual(mock_post.call_count, 2)

    async def test_vram_unload_lifecycle_in_generate_scene_script(self):
        """generate_scene_script の finally 句で確実に unload_vlm_model_with_retry が実行される"""
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        # Setup dummy snapshot and image in settings.snapshot_path
        test_filename = "test_dummy_vram.png"
        test_img_path = settings.snapshot_path / test_filename
        test_img_path.write_bytes(b"dummy image bytes")

        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": "1girl smiling"}),
            image_path=f"/api/snapshots/images/{test_filename}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()

        vlm_json_output = json.dumps({
            "scene_interpretation": "A smiling girl in a sunny room.",
            "items": [
                {"role": "main", "speaker": "Heroine", "text": "ヤッホー！", "position": "top_left"}
            ]
        })

        try:
            with patch("app.services.speech_scene_service.call_vlm", new_callable=AsyncMock) as mock_call_vlm, \
                 patch("app.services.speech_scene_service.unload_vlm_model_with_retry", new_callable=AsyncMock) as mock_unload:
                mock_call_vlm.return_value = vlm_json_output
                mock_unload.return_value = True

                interpretation, bubbles, vram_unloaded, tone_char, scene_prompt = await generate_scene_script(
                    self.db, snap.id
                )

                self.assertEqual(interpretation, "A smiling girl in a sunny room.")
                self.assertEqual(len(bubbles), 1)
                self.assertTrue(vram_unloaded)
                mock_unload.assert_called_once()
        finally:
            if test_img_path.exists():
                test_img_path.unlink()

    async def test_vram_unload_lifecycle_on_error(self):
        """generate_scene_script で VLM 推論エラーが発生しても finally 句でアンロードが発火する"""
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        test_filename = "test_dummy_vram_err.png"
        test_img_path = settings.snapshot_path / test_filename
        test_img_path.write_bytes(b"dummy image bytes")

        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": "1girl smiling"}),
            image_path=f"/api/snapshots/images/{test_filename}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()

        try:
            with patch("app.services.speech_scene_service.call_vlm", new_callable=AsyncMock) as mock_call_vlm, \
                 patch("app.services.speech_scene_service.unload_vlm_model_with_retry", new_callable=AsyncMock) as mock_unload:
                mock_call_vlm.side_effect = RuntimeError("VLM inference timeout")
                mock_unload.return_value = True

                with self.assertRaises(RuntimeError):
                    await generate_scene_script(self.db, snap.id)

                mock_unload.assert_called_once()
        finally:
            if test_img_path.exists():
                test_img_path.unlink()

    async def test_endpoint_scene_draft(self):
        """POST /api/speech/scene-draft のエンドポイント統合テスト"""
        from unittest.mock import patch, AsyncMock
        from fastapi.testclient import TestClient
        from app.main import app
        from app.database import get_db
        from app.config import settings

        app.dependency_overrides[get_db] = lambda: self.db

        test_filename = "test_dummy_endpoint.png"
        test_img_path = settings.snapshot_path / test_filename
        test_img_path.write_bytes(b"dummy image bytes")

        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": "1girl battle"}),
            image_path=f"/api/snapshots/images/{test_filename}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()

        vlm_json_output = json.dumps({
            "scene_interpretation": "Epic battle scene.",
            "items": [
                {"role": "main", "speaker": "Hero", "text": "負けない！", "position": "top_left"}
            ]
        })

        try:
            with patch("app.services.speech_scene_service.call_vlm", new_callable=AsyncMock) as mock_call_vlm, \
                 patch("app.services.speech_scene_service.unload_vlm_model_with_retry", new_callable=AsyncMock) as mock_unload:
                mock_call_vlm.return_value = vlm_json_output
                mock_unload.return_value = True

                client = TestClient(app)
                res = client.post(
                    "/api/speech/scene-draft",
                    json={"snapshot_id": snap.id}
                )
                self.assertEqual(res.status_code, 200)
                data = res.json()
                self.assertEqual(data["scene_interpretation"], "Epic battle scene.")
                self.assertTrue(data["vram_unloaded"])
                self.assertEqual(len(data["bubbles"]), 1)
                self.assertEqual(data["bubbles"][0]["text"], "負けない！")
        finally:
            app.dependency_overrides.clear()
            if test_img_path.exists():
                test_img_path.unlink()


