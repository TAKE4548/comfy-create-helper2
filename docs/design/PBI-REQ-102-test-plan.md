# PBI-REQ-102 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `.venv\Scripts\pytest tests/test_snapshots.py`
- **期待値**: 新たに追加するテストケース `test_create_snapshot_deduplicates_loras_and_tag_sets` および `test_update_snapshot_deduplicates_ids` を含む、すべてのスナップショットテストが正常に PASS すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **API検証**: `openapi_parser.py` を使用してエンドポイントの整合性を確認すること。
- **コード監査**: `local_model_adapter.py arch-audit .` を実行し、設計整合性の客観的証明を得ること。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:8000/docs` (Swagger UI) または実際のブラウザ画面 `http://localhost:5173/`
- **操作手順**:
  1. Swagger UI (`/docs`) にアクセス
  2. `POST /api/snapshots` エンドポイントを選択し、「Try it out」をクリック
  3. ペイロードの `loras` 配下に、同一 `lora_id` & `role` の重複データを含むオブジェクトをセットして送信
- **判定基準 (Assertion)**:
  - ステータスコード `201 Created` が返されること
  - データベース上にスナップショットとデデュープされたLoRAが登録されていること

