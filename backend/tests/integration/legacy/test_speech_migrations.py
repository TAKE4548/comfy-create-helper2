import json
import unittest
import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app import models
from app.migrations import run_migrations
from app.migrations.steps import step_012_speech_bubble_presets_tag_set_id
from tools.migrate_speech_speakers import migrate_existing_bubbles


class TestSpeechMigrations(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        self.Session = sessionmaker(bind=self.engine)

    def test_step_012_migration_adds_columns(self):
        """step_012 により speech_bubble_presets に tag_set_id, is_default, tone_preset_id が追加されること"""
        with self.engine.begin() as conn:
            # tag_sets と speech_tone_presets も事前作成
            conn.execute(sa.text("""
                CREATE TABLE tag_sets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL,
                    tags TEXT NOT NULL,
                    sort_order INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.execute(sa.text("""
                CREATE TABLE speech_tone_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL UNIQUE,
                    prompt TEXT NOT NULL,
                    sort_order INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            # 旧スキーマの speech_bubble_presets (tag_set_id, is_default, tone_preset_id 無し)
            conn.execute(sa.text("""
                CREATE TABLE speech_bubble_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL,
                    shape VARCHAR NOT NULL DEFAULT 'oval',
                    orientation VARCHAR NOT NULL DEFAULT 'vertical',
                    font_family VARCHAR NOT NULL DEFAULT 'sans-serif',
                    font_size INTEGER NOT NULL DEFAULT 0,
                    text_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    background_color VARCHAR NOT NULL DEFAULT 'rgba(255, 255, 255, 0.95)',
                    border_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    border_width INTEGER NOT NULL DEFAULT 2,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.execute(sa.text("INSERT INTO speech_bubble_presets (name) VALUES ('Preset1');"))

        # step_012 実行
        with self.engine.begin() as conn:
            inspector = sa.inspect(conn)
            step_012_speech_bubble_presets_tag_set_id(conn, inspector)

        # カラム検証
        with self.engine.connect() as conn:
            inspector = sa.inspect(conn)
            cols = [c["name"] for c in inspector.get_columns("speech_bubble_presets")]
            self.assertIn("tag_set_id", cols)
            self.assertIn("is_default", cols)
            self.assertIn("tone_preset_id", cols)

            row = conn.execute(sa.text("SELECT id, name, is_default, tag_set_id, tone_preset_id FROM speech_bubble_presets WHERE name = 'Preset1'")).fetchone()
            self.assertEqual(row[1], "Preset1")
            self.assertEqual(row[2], 1)  # is_default boolean default 1
            self.assertIsNone(row[3])
            self.assertIsNone(row[4])

    def test_migration_and_backfill(self):
        """TEST-MIG-05: 短文オノマトペ判定、長文モノローグ判定、文字色からのキャラID付与"""
        Base.metadata.create_all(bind=self.engine)
        session = self.Session()

        # ワークフロー作成 (FK用)
        wf = models.Workflow(name="W1", json_body="{}")
        session.add(wf)
        session.flush()

        # TagSet作成
        tagset1 = models.TagSet(name="CharacterA", tags="[]")
        tagset2 = models.TagSet(name="CharacterB", tags="[]")
        session.add_all([tagset1, tagset2])
        session.flush()

        # スナップショットデータ準備
        bubbles_data = [
            # 1. カタカナ短文オノマトペ (tail=None, len<=6) -> is_se = True
            {"text": "ドクン", "shape": "oval", "tail": None, "style": {"textColor": "#FF0000"}},
            # 2. ひらがな感嘆符オノマトペ -> is_se = True
            {"text": "ハッ！", "shape": "oval", "tail": None, "textColor": "#00FF00"},
            # 3. shape=none -> is_se = True
            {"text": "ゴオオオ", "shape": "none", "tail": None},
            # 4. 長文モノローグ (7文字以上、感嘆符なし) -> is_se = False, textColor=#FF0000 -> tagset1
            {
                "text": "今日もいい天気だといいな",
                "shape": "oval",
                "tail": {"x": 10, "y": 10},
                "style": {"textColor": "#FF0000"}
            },
            # 5. セリフ (短文だが漢字含み感嘆符なし、tailあり) -> is_se = False, textColor=#00FF00 -> tagset2
            {
                "text": "私は行く",
                "shape": "oval",
                "tail": {"x": 20, "y": 20},
                "textColor": "#00FF00"
            },
            # 6. 既に speaker_tag_set_id が設定済みの吹き出し -> 上書きされないこと
            {
                "text": "既に設定済み",
                "shape": "oval",
                "tail": {"x": 30, "y": 30},
                "textColor": "#FF0000",
                "speaker_tag_set_id": 999
            }
        ]

        snapshot = models.Snapshot(
            workflow_id=wf.id,
            params=json.dumps({"speech_bubbles": bubbles_data}, ensure_ascii=False)
        )
        session.add(snapshot)
        session.commit()

        # バックフィル実行
        color_map = {
            "#FF0000": tagset1.id,
            "#00FF00": tagset2.id,
        }
        updated = migrate_existing_bubbles(color_map, session=session)
        self.assertEqual(updated, 1)

        # 結果検証
        session.refresh(snapshot)
        res_params = json.loads(snapshot.params)
        res_bubbles = res_params["speech_bubbles"]

        # 1. ドクン -> is_se=True, speaker_tag_set_id 付与されない
        self.assertTrue(res_bubbles[0]["is_se"])
        self.assertNotIn("speaker_tag_set_id", res_bubbles[0])

        # 2. ハッ！ -> is_se=True, speaker_tag_set_id 付与されない
        self.assertTrue(res_bubbles[1]["is_se"])
        self.assertNotIn("speaker_tag_set_id", res_bubbles[1])

        # 3. shape=none -> is_se=True
        self.assertTrue(res_bubbles[2]["is_se"])

        # 4. 長文モノローグ -> is_se=False, speaker_tag_set_id=tagset1.id
        self.assertFalse(res_bubbles[3]["is_se"])
        self.assertEqual(res_bubbles[3]["speaker_tag_set_id"], tagset1.id)

        # 5. セリフ -> is_se=False, speaker_tag_set_id=tagset2.id
        self.assertFalse(res_bubbles[4]["is_se"])
        self.assertEqual(res_bubbles[4]["speaker_tag_set_id"], tagset2.id)

        # 6. 既設定 -> 999のまま
        self.assertEqual(res_bubbles[5]["speaker_tag_set_id"], 999)

        # べき等性テスト: 再実行しても正常に動作すること
        updated2 = migrate_existing_bubbles(color_map, session=session)
        self.assertEqual(updated2, 0)
        session.close()

    def test_orm_relationships(self):
        """SpeechBubblePreset と TagSet, SpeechTonePreset のリレーション検証"""
        Base.metadata.create_all(bind=self.engine)
        session = self.Session()

        tag_set = models.TagSet(name="Hero", tags="[]")
        tone_preset = models.SpeechTonePreset(name="Heroic", prompt="Speak boldly")
        session.add_all([tag_set, tone_preset])
        session.commit()

        preset = models.SpeechBubblePreset(
            name="HeroBubble",
            tag_set_id=tag_set.id,
            is_default=True,
            tone_preset_id=tone_preset.id,
        )
        session.add(preset)
        session.commit()

        # リレーションから参照できること
        session.refresh(tag_set)
        self.assertEqual(len(tag_set.presets), 1)
        self.assertEqual(tag_set.presets[0].name, "HeroBubble")

        session.refresh(preset)
        self.assertEqual(preset.tag_set.name, "Hero")
        self.assertEqual(preset.tone_preset.name, "Heroic")

        session.close()
