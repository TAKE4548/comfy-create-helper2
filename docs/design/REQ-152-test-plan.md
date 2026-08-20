# REQ-152 実行可能テスト計画

## 1. ユニットテスト (Unit Tests)

### テスト実行コマンド
```bash
npm test -- src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/store/__tests/useGenerationStore.test.ts
```

### テスト検証項目
1. **`useGenerateAction.test.ts`**:
   - `handleGenerateSets` 実行中に AbortController が中断された場合、`finally` 句で `setActiveBatch` が上書きされず、`fetchQueue` も呼ばれないこと。
   - `handleGenerateSets` で `queuePrompt` 呼び出し時に `signal: abortController.signal` が渡されること。
   - 通信直後に Abort された場合でも後続ジョブの投入および `setActiveBatch` の更新が行われないこと。
   - 正常系では REQ-141 の 0ms pending 表示およびエラー時の特定通知が正しく動作すること。
2. **`useGenerationStore.test.ts`**:
   - `queuePrompt` において `options.signal` が渡された場合、`fetch` に `signal` が正しく伝播すること。
   - `options.signal` による中断時に `AbortError` が安全に処理され、エラートーストがセットされないこと。
   - `cancelGeneration` 呼び出し時に `abortSubmission` が実行されること。

---

## 2. 結合・手動テスト (Manual Verification)

### シナリオ 1: バッチ生成中の「一括キャンセル」
1. 複数プリセットまたはバッチ数（例: 4プリセット × 4枚 = 16枚）を設定。
2. 「Generate Batch」を押下。0ms で 16枚の pending 枠が表示されることを確認。
3. 2〜3枚目の投入中に「ジョブ管理」モーダルから「一括キャンセル」を実行。
4. **確認項目**:
   - キャンセル直後に画面の生成中ステータスおよび進捗バーが即座にクリアされること。
   - 投入ループの完了後にも未投入ジョブ枠が復活しないこと。

### シナリオ 2: 正常系バッチ生成とエラー通知
1. 複数プリセットでバッチ生成を実行。
2. 0ms で pending 枠が表示され、全件スムーズに ComfyUI に登録完了すること。
3. エラー発生時に該当プリセット・バッチ番号の特定エラーが表示されること。
