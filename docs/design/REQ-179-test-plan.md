# REQ-179: テスト計画書

## 1. ユニットテスト (Automated Tests)

### Frontend (Vitest)
```bash
npm run test frontend/src/pages/GeneratePage/hooks/__tests__/usePromptTranslation.test.ts
npm run test frontend/src/pages/__tests__/SettingsPage.test.tsx
```
- [x] イベントオブジェクト（非文字列）が渡された場合でも `sourceText` を使って正常に翻訳が実行されること。
- [x] API例外発生時に `error` state が更新され、ローディングが解除されること。
- [x] 空文字または空白のみの場合は API を呼ばずに `translatedText` をクリアすること。
- [x] `SettingsPage` で `google_free` が排除され、`google_cloud` / `deepl` / `llm` が正常に表示されること。

### Backend (Pytest)
```bash
pytest backend/tests/test_translation_proxy.py
```
- [x] `POST /api/translate/prompt` が `google_cloud`（APIキー設定時）で正常に翻訳結果を返すこと。
- [x] `google_cloud` で API キー未設定時に明確なエラーが返ること。
- [x] `POST /api/translate/test` で `google_cloud` / `deepl` / `llm` の接続テストが動作すること。

## 2. 手動検証 (Manual Verification)
1. **プロンプト翻訳モーダルの動作確認**:
   - Generate画面でプロンプト翻訳モーダルを開く。
   - 「翻訳する」をクリックし、TypeError が発生せず処理が実行されることを確認。
2. **設定画面の表示確認**:
   - SettingsPage の Translation Settings を開き、`google_free` の選択肢が無く、`google_cloud` がデフォルトになっていることを確認。
   - 特定プロバイダへの「推奨」表記が存在しないことを確認。
