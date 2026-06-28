# PBI-REQ-091 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npx vitest run src/pages/GeneratePage/hooks/__tests__/useAuditAction.test.ts`
- **期待値**: 追加されたすべてのユニットテストケースが正常に PASS すること。

### 実行予定のテストケース:
1. `initial state` (AC-1):
   - フック初期化時の各状態（`auditOpen`, `auditIntent`, `auditTypes`, `auditStatus`, `auditResult`）の初期値が正しいことを検証。
2. `supports multi-select audit types` (AC-2):
   - 監査タイプの複数選択および更新が正常に行えることを検証。
3. `correctly extracts prompts and sends request` (AC-3):
   - ポジティブプロンプト抽出条件において、`Negative_Prompt` やその他 `negative` を含むキーが除外され、ポジティブプロンプトのみが正しく結合されて `auditApi.run` へ送信されることを検証。
4. `handles loading and done status transition during API calls` (AC-4):
   - APIコールの成功時、`auditStatus` が `loading` から `done` へ遷移し、`auditResult` が更新されることを検証。
5. `handles error status transition during failed API calls` (AC-4):
   - APIコールの失敗時、`auditStatus` が `loading` から `error` へ正しく遷移することを検証。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py` による監査（実装後の verification フェーズで実行）

## 3. 手動・ブラウザ検証 (Browser Agent Verification)
本要件はカスタムフックのバグ修正および新規ユニットテストの実装であり、挙動が自動テスト（`vitest`）のみで完全に検証可能なため、手動ブラウザ検証は不要と判断します。
変更箇所の動作確認は、追加したユニットテストの実行結果をもって完了とします。
