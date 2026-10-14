import asyncio
import json
import base64
import io
import unittest
from datetime import datetime, timezone
from PIL import Image
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
    generate_scene_script,
    extract_character_tone_samples_high_mid_low,
    extract_top3_similar_scenes,
    load_image_as_base64,
    POSITION_MAP_1024,
    SceneDraftError,
    validate_scene_vlm_completion,
)
from app.services.speech_draft_service import SceneVlmCompletion, VlmResponseShapeError

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

    def test_scene_completion_validation_accepts_valid_json_and_markdown(self):
        content = '''```json
{"scene_interpretation":"A scene","items":[{"role":"main","speaker":"Alice","text":"Hello","position":"top_left"}]}
```'''
        result = validate_scene_vlm_completion(SceneVlmCompletion(content, "stop"))
        self.assertEqual(result["items"][0]["speaker"], "Alice")

    def test_scene_completion_validation_classifies_non_json_description(self):
        with self.assertRaises(SceneDraftError) as caught:
            validate_scene_vlm_completion(
                SceneVlmCompletion("この画像には人物が写っています。", "stop")
            )
        self.assertEqual(caught.exception.code, "vlm_invalid_json")
        self.assertEqual(str(caught.exception), "vlm_invalid_json")

    def test_scene_completion_validation_classifies_finish_and_shape_errors(self):
        for reason, code in (("length", "vlm_truncated"), ("content_filter", "vlm_filtered"), (None, "vlm_empty"), ("tool_calls", "vlm_empty")):
            with self.subTest(reason=reason):
                with self.assertRaises(SceneDraftError) as caught:
                    validate_scene_vlm_completion(SceneVlmCompletion("{}", reason))
                self.assertEqual(caught.exception.code, code)
        with self.assertRaises(SceneDraftError) as caught:
            validate_scene_vlm_completion(VlmResponseShapeError())
        self.assertEqual(caught.exception.code, "vlm_empty")

    def test_scene_completion_validation_rejects_invalid_schema(self):
        invalid_payloads = [
            '{"scene_interpretation":"x","items":[]}',
            '{"scene_interpretation":"x","items":[{"role":"other","speaker":"","text":"x","position":"top_left"}]}',
            '{"scene_interpretation":"x","items":[{"role":[],"speaker":"","text":"x","position":"top_left"}]}',
            '{"scene_interpretation":"x","items":[{"role":"main","speaker":"","text":3,"position":"top_left"}]}',
            '{"scene_interpretation":"x","items":[{"role":"main","speaker":"","text":"x","position":"middle"}]}',
        ]
        for content in invalid_payloads:
            with self.subTest(content=content):
                with self.assertRaises(SceneDraftError) as caught:
                    validate_scene_vlm_completion(SceneVlmCompletion(content, "stop"))
                self.assertEqual(caught.exception.code, "vlm_schema_invalid")


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

    async def test_vram_unload_lifecycle_in_generate_scene_script(self):
        """generate_scene_script の finally 句で対象IDが解放される"""
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        # Setup dummy snapshot and image in settings.snapshot_path
        test_filename = "test_dummy_vram.png"
        test_img_path = settings.snapshot_path / test_filename
        Image.new("RGB", (16, 16)).save(test_img_path)

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
            with patch("app.services.speech_scene_service.call_scene_vlm", new_callable=AsyncMock) as mock_call_vlm, \
                 patch("app.services.speech_scene_service.acquire_model_instance", new_callable=AsyncMock) as mock_acquire, \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", new_callable=AsyncMock) as mock_unload:
                mock_acquire.return_value = "loaded-instance"
                mock_call_vlm.return_value = SceneVlmCompletion(vlm_json_output, "stop")
                mock_unload.return_value = True

                interpretation, bubbles, vram_unloaded, tone_samples, selected_id, candidates = await generate_scene_script(
                    self.db, snap.id
                )

                self.assertEqual(interpretation, "A smiling girl in a sunny room.")
                self.assertEqual(len(bubbles), 1)
                self.assertTrue(vram_unloaded)
                mock_unload.assert_called_once_with("loaded-instance")
                self.assertEqual(mock_call_vlm.call_args.args[2], "loaded-instance")
        finally:
            if test_img_path.exists():
                test_img_path.unlink()


    async def test_vram_unload_lifecycle_on_error(self):
        """generate_scene_script で VLM 推論エラーが発生しても finally 句でアンロードが発火する"""
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        test_filename = "test_dummy_vram_err.png"
        test_img_path = settings.snapshot_path / test_filename
        Image.new("RGB", (16, 16)).save(test_img_path)

        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": "1girl smiling"}),
            image_path=f"/api/snapshots/images/{test_filename}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()

        try:
            with patch("app.services.speech_scene_service.call_scene_vlm", new_callable=AsyncMock) as mock_call_vlm, \
                 patch("app.services.speech_scene_service.acquire_model_instance", new_callable=AsyncMock) as mock_acquire, \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", new_callable=AsyncMock) as mock_unload:
                mock_acquire.return_value = "loaded-instance"
                mock_call_vlm.side_effect = RuntimeError("VLM inference timeout")
                mock_unload.return_value = True

                with self.assertRaises(RuntimeError):
                    await generate_scene_script(self.db, snap.id)

                mock_unload.assert_called_once_with("loaded-instance")
        finally:
            if test_img_path.exists():
                test_img_path.unlink()

    async def test_malformed_vlm_output_raises_and_unloads(self):
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        path = settings.snapshot_path / "test_malformed_vlm.png"
        Image.new("RGB", (16, 16)).save(path)
        try:
            snap = models.Snapshot(
                workflow_id=self.workflow_id,
                params=json.dumps({"positive_prompt": "1girl smiling"}),
                image_path=f"/api/snapshots/images/{path.name}",
                created_at=datetime.now(timezone.utc),
            )
            self.db.add(snap)
            self.db.commit()
            with patch("app.services.speech_scene_service.call_scene_vlm", new_callable=AsyncMock) as call, \
                 patch("app.services.speech_scene_service.acquire_model_instance", new_callable=AsyncMock) as acquire, \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", new_callable=AsyncMock) as unload:
                acquire.return_value = "loaded-instance"
                call.return_value = SceneVlmCompletion("not JSON", "stop")
                unload.return_value = True
                with self.assertRaises(SceneDraftError) as caught:
                    await generate_scene_script(self.db, snap.id)
                self.assertEqual(caught.exception.code, "vlm_invalid_json")
                unload.assert_called_once_with("loaded-instance")
        finally:
            path.unlink(missing_ok=True)

    async def test_empty_vlm_items_raises_and_unloads(self):
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        path = settings.snapshot_path / "test_empty_vlm.png"
        Image.new("RGB", (16, 16)).save(path)
        try:
            snap = models.Snapshot(
                workflow_id=self.workflow_id,
                params=json.dumps({"positive_prompt": "1girl smiling"}),
                image_path=f"/api/snapshots/images/{path.name}",
                created_at=datetime.now(timezone.utc),
            )
            self.db.add(snap)
            self.db.commit()
            with patch("app.services.speech_scene_service.call_scene_vlm", new_callable=AsyncMock) as call, \
                 patch("app.services.speech_scene_service.acquire_model_instance", new_callable=AsyncMock) as acquire, \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", new_callable=AsyncMock) as unload:
                acquire.return_value = "loaded-instance"
                call.return_value = SceneVlmCompletion(json.dumps({"scene_interpretation": "ok", "items": []}), "stop")
                unload.return_value = True
                with self.assertRaises(SceneDraftError) as caught:
                    await generate_scene_script(self.db, snap.id)
                self.assertEqual(caught.exception.code, "vlm_schema_invalid")
                unload.assert_called_once_with("loaded-instance")
        finally:
            path.unlink(missing_ok=True)

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
        Image.new("RGB", (16, 16)).save(test_img_path)

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
            with patch("app.services.speech_scene_service.call_scene_vlm", new_callable=AsyncMock) as mock_call_vlm, \
                 patch("app.services.speech_scene_service.acquire_model_instance", new_callable=AsyncMock) as mock_acquire, \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", new_callable=AsyncMock) as mock_unload:
                mock_acquire.return_value = "loaded-instance"
                mock_call_vlm.return_value = SceneVlmCompletion(vlm_json_output, "stop")
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

    async def test_override_changes_inference_prompt_and_bubbles(self):
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        path = settings.snapshot_path / "test_override_input.png"
        Image.new("RGB", (16, 16)).save(path)
        try:
            snapshots = []
            for prompt, line in [
                ("battle angry scream victory", "Top one bubble"),
                ("battle quiet", "Chosen second bubble"),
                ("battle escape", "Third bubble"),
            ]:
                snap = models.Snapshot(
                    workflow_id=self.workflow_id,
                    params=json.dumps({"positive_prompt": prompt, "speech_bubbles": [{"text": line}]}),
                    image_path=f"/api/snapshots/images/{path.name}",
                    created_at=datetime.now(timezone.utc),
                )
                self.db.add(snap)
                self.db.commit()
                snapshots.append(snap)
            with patch("app.services.speech_scene_service.call_scene_vlm", new_callable=AsyncMock) as call, \
                 patch("app.services.speech_scene_service.acquire_model_instance", new_callable=AsyncMock) as acquire, \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", new_callable=AsyncMock) as unload:
                acquire.return_value = "loaded-instance"
                call.return_value = SceneVlmCompletion(json.dumps({"scene_interpretation": "ok", "items": [
                    {"role": "main", "speaker": "Hero", "text": "Ready", "position": "top_left"}
                ]}), "stop")
                unload.return_value = True
                result = await generate_scene_script(
                    self.db, snapshots[0].id,
                    override_similar_scene_snapshot_id=snapshots[1].id,
                )
                self.assertEqual(result[4], snapshots[1].id)
                prompt_used = call.call_args.args[1]
                self.assertIn("Reference Scene: battle quiet", prompt_used)
                self.assertIn("Chosen second bubble", prompt_used)
                self.assertNotIn("Third bubble", prompt_used)
        finally:
            path.unlink(missing_ok=True)


class TestSpeechSceneSelection(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = TestingSessionLocal()
        wf = models.Workflow(name="selection", json_body="{}")
        self.db.add(wf)
        self.db.commit()
        self.workflow_id = wf.id

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)

    async def test_generate_scene_script_reports_real_progress_boundaries(self):
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        path = settings.snapshot_path / "test_progress_scene.png"
        Image.new("RGB", (16, 16)).save(path)
        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": "1girl smiling"}),
            image_path=f"/api/snapshots/images/{path.name}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()
        events = []
        entered_vlm = asyncio.Event()
        release_vlm = asyncio.Event()

        async def call_vlm(*_args):
            entered_vlm.set()
            await release_vlm.wait()
            return SceneVlmCompletion(json.dumps({"scene_interpretation": "ok", "items": [
                {"role": "main", "speaker": "Hero", "text": "Ready", "position": "top_left"}
            ]}), "stop")

        async def unload(_instance_id):
            events.append(("vram", "unload_started"))
            return True

        async def progress(step, status):
            events.append((step, status))

        try:
            with patch("app.services.speech_scene_service.call_scene_vlm", side_effect=call_vlm), \
                 patch("app.services.speech_scene_service.acquire_model_instance", new=AsyncMock(return_value="loaded-instance")), \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", side_effect=unload):
                task = asyncio.create_task(generate_scene_script(self.db, snap.id, progress_callback=progress))
                await entered_vlm.wait()
                self.assertEqual(events, [
                    ("reference", "active"), ("reference", "done"), ("vlm", "active")
                ])
                release_vlm.set()
                result = await task

            self.assertEqual(result[0], "ok")
            self.assertTrue(result[2])
            self.assertEqual(events, [
                ("reference", "active"), ("reference", "done"),
                ("vlm", "active"), ("vlm", "done"),
                ("style", "active"), ("style", "done"),
                ("vram", "active"), ("vram", "unload_started"), ("vram", "done"),
            ])
        finally:
            path.unlink(missing_ok=True)

    async def test_progress_reports_vlm_error_and_unloads_before_returning(self):
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        path = settings.snapshot_path / "test_progress_error.png"
        Image.new("RGB", (16, 16)).save(path)
        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": "1girl smiling"}),
            image_path=f"/api/snapshots/images/{path.name}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()
        events = []

        async def progress(step, status):
            events.append((step, status))

        async def unload(_instance_id):
            events.append(("unload", "completed"))
            return True

        try:
            with patch("app.services.speech_scene_service.call_scene_vlm", side_effect=RuntimeError("inference failed")), \
                 patch("app.services.speech_scene_service.acquire_model_instance", new=AsyncMock(return_value="loaded-instance")), \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", side_effect=unload):
                with self.assertRaisesRegex(RuntimeError, "inference failed"):
                    await generate_scene_script(self.db, snap.id, progress_callback=progress)
            self.assertEqual(events, [
                ("reference", "active"), ("reference", "done"),
                ("vlm", "active"), ("vlm", "error"),
                ("vram", "active"), ("unload", "completed"), ("vram", "done"),
            ])
        finally:
            path.unlink(missing_ok=True)

    async def test_cancellation_reports_error_and_waits_for_vram_unload(self):
        from unittest.mock import patch, AsyncMock
        from app.config import settings

        path = settings.snapshot_path / "test_progress_cancel.png"
        Image.new("RGB", (16, 16)).save(path)
        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": "1girl smiling"}),
            image_path=f"/api/snapshots/images/{path.name}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()
        events = []
        entered_vlm = asyncio.Event()
        unload_started = asyncio.Event()
        release_unload = asyncio.Event()

        async def call_vlm(*_args):
            entered_vlm.set()
            await asyncio.Future()

        async def progress(step, status):
            events.append((step, status))

        async def unload(_instance_id):
            events.append(("unload", "completed"))
            unload_started.set()
            await release_unload.wait()
            return True

        try:
            with patch("app.services.speech_scene_service.call_scene_vlm", side_effect=call_vlm), \
                 patch("app.services.speech_scene_service.acquire_model_instance", new=AsyncMock(return_value="loaded-instance")), \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", side_effect=unload):
                task = asyncio.create_task(
                    generate_scene_script(self.db, snap.id, progress_callback=progress)
                )
                await entered_vlm.wait()
                task.cancel()
                await unload_started.wait()
                self.assertFalse(task.done())
                release_unload.set()
                with self.assertRaises(asyncio.CancelledError):
                    await task
            self.assertEqual(events, [
                ("reference", "active"), ("reference", "done"),
                ("vlm", "active"), ("vlm", "error"),
                ("vram", "active"), ("unload", "completed"), ("vram", "done"),
            ])
        finally:
            path.unlink(missing_ok=True)

    async def test_instance_rejection_unload_failure_preserves_generation_error(self):
        from unittest.mock import AsyncMock, patch
        from app.config import settings

        path = settings.snapshot_path / "test_instance_rejection.png"
        Image.new("RGB", (16, 16)).save(path)
        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": "1girl smiling"}),
            image_path=f"/api/snapshots/images/{path.name}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()
        events = []

        async def progress(step, status):
            events.append((step, status))

        try:
            with patch("app.services.speech_scene_service.acquire_model_instance", new=AsyncMock(return_value="alias-instance")) as acquire, \
                 patch("app.services.speech_scene_service.call_scene_vlm", new=AsyncMock(side_effect=RuntimeError("private ID rejection"))) as call, \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", new=AsyncMock(side_effect=RuntimeError("private unload failure"))) as unload:
                with self.assertLogs("app.services.speech_scene_service", level="WARNING") as captured:
                    with self.assertRaisesRegex(RuntimeError, "private ID rejection"):
                        await generate_scene_script(self.db, snap.id, progress_callback=progress)

            self.assertEqual(acquire.call_count, 1)
            self.assertEqual(call.call_args.args[2], "alias-instance")
            self.assertEqual(unload.call_args.args, ("alias-instance",))
            self.assertEqual(events[-1], ("vram", "error"))
            self.assertNotIn("private ID rejection", " ".join(captured.output))
            self.assertNotIn("private unload failure", " ".join(captured.output))
        finally:
            path.unlink(missing_ok=True)

    async def test_same_model_scene_requests_do_not_overlap_instance_lifecycle(self):
        from unittest.mock import AsyncMock, patch
        from app.config import settings

        path = settings.snapshot_path / "test_instance_concurrency.png"
        Image.new("RGB", (16, 16)).save(path)
        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": "1girl smiling"}),
            image_path=f"/api/snapshots/images/{path.name}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()
        first_call_entered = asyncio.Event()
        release_first_call = asyncio.Event()
        acquisition_ids = []
        unload_ids = []
        active_inferences = 0
        max_active_inferences = 0

        async def acquire(model_key):
            acquisition_ids.append(model_key)
            return "alias-instance"

        async def infer(_image, _prompt, instance_id):
            nonlocal active_inferences, max_active_inferences
            self.assertEqual(instance_id, "alias-instance")
            active_inferences += 1
            max_active_inferences = max(max_active_inferences, active_inferences)
            if len(acquisition_ids) == 1:
                first_call_entered.set()
                await release_first_call.wait()
            active_inferences -= 1
            return SceneVlmCompletion(json.dumps({
                "scene_interpretation": "ok",
                "items": [{"role": "main", "speaker": "Hero", "text": "Ready", "position": "top_left"}],
            }), "stop")

        async def unload(instance_id):
            unload_ids.append(instance_id)
            return True

        try:
            with patch("app.services.speech_scene_service.acquire_model_instance", side_effect=acquire), \
                 patch("app.services.speech_scene_service.call_scene_vlm", side_effect=infer), \
                 patch("app.services.speech_scene_service.unload_model_instance_with_retry", side_effect=unload):
                first = asyncio.create_task(generate_scene_script(self.db, snap.id))
                await first_call_entered.wait()
                second = asyncio.create_task(generate_scene_script(self.db, snap.id))
                await asyncio.sleep(0)
                self.assertEqual(len(acquisition_ids), 1)
                release_first_call.set()
                await asyncio.gather(first, second)

            self.assertEqual(len(acquisition_ids), 2)
            self.assertEqual(len(unload_ids), 2)
            self.assertEqual(unload_ids, ["alias-instance", "alias-instance"])
            self.assertEqual(max_active_inferences, 1)
        finally:
            path.unlink(missing_ok=True)

    def add_snapshot(self, prompt, lines):
        snap = models.Snapshot(
            workflow_id=self.workflow_id,
            params=json.dumps({"positive_prompt": prompt, "speech_bubbles": [
                {"speaker_tag_set_id": 10, "text": line, "is_se": False}
                for line in lines
            ]}),
            image_path="sample.png",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snap)
        self.db.commit()
        return snap

    def test_tone_tiers_have_distinct_snapshots(self):
        self.add_snapshot("battle angry", ["battle angry one", "battle angry two", "battle angry three"])
        self.add_snapshot("battle", ["battle phrase here"])
        self.add_snapshot("quiet", ["quiet phrase here"])
        items = extract_character_tone_samples_high_mid_low(self.db, 10, "battle angry")
        self.assertEqual([item.similarity_tier for item in items], ["high", "mid", "low"])
        self.assertEqual(len({item.snapshot_id for item in items}), 3)

    def test_invalid_override_is_rejected(self):
        selected = self.add_snapshot("battle angry", ["selected bubble"])
        with self.assertRaises(ValueError):
            extract_top3_similar_scenes(self.db, "battle angry", override_snapshot_id=999999)
        with self.assertRaises(ValueError):
            extract_top3_similar_scenes(self.db, "battle angry", exclude_snapshot_id=selected.id,
                                        override_snapshot_id=selected.id)

    def test_image_is_scaled_and_jpeg_encoded(self):
        from tempfile import TemporaryDirectory
        from pathlib import Path
        with TemporaryDirectory() as folder:
            path = Path(folder) / "large.png"
            Image.new("RGB", (2000, 1000)).save(path)
            encoded = load_image_as_base64(path)
            with Image.open(io.BytesIO(base64.b64decode(encoded))) as image:
                self.assertEqual(image.format, "JPEG")
                self.assertEqual(image.size, (1024, 512))
