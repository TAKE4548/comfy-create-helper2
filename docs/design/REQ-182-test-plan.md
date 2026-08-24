# REQ-182: テスト計画書 (Test Plan)

## 1. ユニットテスト (Unit Tests)
- **対象**: `frontend/src/store/__tests/useGenerationStore.test.ts`
- **検証項目**:
  1. `queuePrompt` が Abort された場合に `isGenerating: true` に更新されないこと。
  2. `cancelAllJobs()` が `deleteQueue({ clear: true })` と `interrupt()` の両方を確実に実行すること。
  3. `client.ts` の `request()` が空ボディ 200 レスポンスを安全に処理できること。

### 実行コマンド
```bash
npm test -- src/store/__tests/useGenerationStore.test.ts
```

## 2. 統合・全体回帰テスト (Regression Tests)
- **コマンド**:
```bash
npm test
```
