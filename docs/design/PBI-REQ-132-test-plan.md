# PBI-REQ-132 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **バックエンドテスト**:
  - `cd backend && pytest tests/test_snapshots_webp.py`
  - 期待値: WebP変換、サムネイル生成、ダウンロード形式変換APIがすべて PASS。
- **フロントエンドテスト**:
  - `cd frontend && npm run test`
  - 期待値: フロントエンドのコンポーネントおよびAPI型定義の全テストが PASS。

## 2. ツール主導監査 (Tool-Driven Audit)
- **API検証**: `python ${GLOBAL_SCRIPTS}\openapi_parser.py backend/openapi.json list`
- **セキュリティ監査**: `python ${GLOBAL_SCRIPTS}\pre_commit_linter.py`

## 3. 手動 / マイグレーション検証
- マイグレーションスクリプト `python backend/scripts/migrate_images_to_webp.py` を実行し、既存画像のWebP化・サムネイル生成・DB更新が正しく行われることを確認。
