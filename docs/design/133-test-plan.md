# PBI-133 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `cd backend && pytest tests/test_migrate_images_to_webp.py`
- **期待値**: 全テストケースの PASS。`Snapshot` に加えて `Lora` および `TagSet` の `thumbnail_path` が WebP パスへ正しく変換されていることを検証。

## 2. スクリプト手動実行テスト (Manual Migration Verification)
- **コマンド**: `python backend/scripts/migrate_images_to_webp.py`
- **期待値**: スクリプトがエラーなく正常終了し、DB内の既存 LoRA / TagSet の `thumbnail_path` が WebP に更新されること。

## 3. 画面表示検証 (UI Verification)
- **対象画面**: LoRA一覧 (`/loras`)、TagSet一覧 (`/tag-sets`)
- **判定基準 (Assertion)**:
  - カバー画像が明示的に設定されている LoRA / TagSet のサムネイル画像が 404 エラーとならず正常に表示されること。
