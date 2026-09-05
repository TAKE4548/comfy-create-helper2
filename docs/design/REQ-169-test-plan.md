# PBI-REQ-169 実行可能テスト計画書

## 1. CLI自動テスト (CLI Verification)
- **コマンド**: `pytest backend/tests/test_speech_bubble_presets.py -v`
- **期待値**: 全テストケース PASS。旧スキーマからのマイグレーションテスト、新規作成テーブル検証、CRUD 操作が全て正常終了すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **実DBマイグレーション実行**:
  `python -c "from app.main import run_migrations; run_migrations()"`
- **実DBクエリ確認**:
  `python -c "from app.database import SessionLocal; from app import models; db = SessionLocal(); print(db.query(models.SpeechBubblePreset).all())"`
- **期待値**: `sqlite3.OperationalError` が発生せず、保存済みプリセット（2件）が正常取得できること。

## 3. 手動確認 (Manual Verification)
- **対象URL**: `http://localhost:5173`
- **手順**:
  1. 履歴画面などからセリフ編集モーダル（`SpeechBubbleEditorModal`）を開く。
  2. 吹き出しを作成・選択する。
  3. コントロールパネルの「修飾プリセット」に保存済みプリセット（「手書き」「思考」など）が表示されることを確認。
  4. プリセットをクリックして装飾設定が適用されることを確認。
- **基準**: 500エラーとならず、保存済みプリセットがロード・適用できること。
