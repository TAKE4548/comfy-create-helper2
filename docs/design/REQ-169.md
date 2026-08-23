# REQ-169 詳細設計書: セリフ装飾プリセットのDBマイグレーション修復

## 1. 概要・背景
`models.SpeechBubblePreset` において `effects_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="{}")` が追加定義されているが、`backend/app/main.py` のマイグレーションおよび初期作成スクリプトに `effects_json` カラムが存在しないため、`GET /api/speech-bubble-presets` で 500 エラーが発生している。
本設計では、既存テーブルへのカラム追加および新規作成スクリプトの整合性を確保する。

## 2. アーキテクチャ・設計詳細

### 2.1 マイグレーションロジック (`backend/app/main.py`)
```python
        # Check and alter speech_bubble_presets table for effects_json column
        if "speech_bubble_presets" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("speech_bubble_presets")]
            if "effects_json" not in columns:
                conn.execute(sa.text("ALTER TABLE speech_bubble_presets ADD COLUMN effects_json TEXT DEFAULT '{}'"))
                logger.info("Migrated: Added 'effects_json' column to 'speech_bubble_presets' table.")

        # Create speech_bubble_presets table if not exists
        if "speech_bubble_presets" not in inspector.get_table_names():
            conn.execute(sa.text("""
                CREATE TABLE speech_bubble_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL UNIQUE,
                    shape VARCHAR NOT NULL DEFAULT 'oval',
                    orientation VARCHAR NOT NULL DEFAULT 'vertical',
                    font_family VARCHAR NOT NULL DEFAULT 'sans-serif',
                    font_size INTEGER NOT NULL DEFAULT 0,
                    text_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    background_color VARCHAR NOT NULL DEFAULT 'rgba(255, 255, 255, 0.95)',
                    border_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    border_width INTEGER NOT NULL DEFAULT 2,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    effects_json TEXT DEFAULT '{}',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("Migrated: Created 'speech_bubble_presets' table.")
```

### 2.2 テスト設計 (`backend/tests/test_speech_bubble_presets.py`)
- 旧スキーマ（`effects_json` なし）テーブル作成からのマイグレーション検証テストを追加。
- 既存データ保持およびマイグレーション後のデータ取得検証。
