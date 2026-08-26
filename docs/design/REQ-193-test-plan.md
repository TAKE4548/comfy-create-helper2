# PBI-REQ-193 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### バックエンドテスト
- **コマンド**: `pytest backend/tests/test_llm_models.py -v`
- **期待値**: 全テストケース PASS。特に新規キーに対する `PUT /api/llm-prompts/{key}` のアップサートが PASS すること。

### フロントエンドテスト
- **コマンド**: `npm run test -- TranslationSettingsSection`
- **期待値**: 全テストケース PASS。`llmPromptsApi.update` が `{ content: ... }` で呼ばれることを検証。

## 2. 手動 / API検証
- **エンドポイント**: `PUT /api/llm-prompts/translation_provider`
  - ペイロード: `{"content": "llm"}`
  - 判定基準: ステータス 200, レスポンスボディ `key: "translation_provider"`, `content: "llm"`
