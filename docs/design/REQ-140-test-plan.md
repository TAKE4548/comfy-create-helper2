# REQ-140 テスト計画書: モバイルモードにおけるバッチ・複数プリセット生成のキュー登録高速化および取り消しレスポンス改善

## 1. 単体テスト計画 (Unit Tests)

### テスト対象ファイル
1. `frontend/src/store/__tests/useGenerationStore.test.ts`
   - `queuePrompt` で `{ skipQueueFetch: true }` を指定した際、`fetchQueue` が呼び出されない（呼び出し回数 0 回）こと。
   - `queuePrompt` 実行時に `localStorage` のメタデータ走査が非同期（`setTimeout`）で実行され、エラーが発生してもプロンプト投入が正常完了すること。
   - `cancelAllJobs` または `cancelJob` を呼び出した際に `abortSubmission` が連動実行され、中断シグナルが発火すること。
2. `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`
   - `handleGenerateSets` 実行時、全ジョブに対して `skipQueueFetch: true` で `queuePrompt` が呼ばれ、ループ完了後に 1 回のみ `fetchQueue` が呼ばれること。
   - ループ処理中に `AbortSignal.aborted` が true の場合、後続のジョブの `queuePrompt` が呼ばれずループが即座に中断されること。
   - 生成開始時に `activeBatch` が初期化（`status: 'pending'`）され、ジョブ投入ごとに実 `promptId` が反映されること。

### 実行コマンド
```bash
npm --prefix frontend test -- src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts
npm --prefix frontend test -- src/store/__tests/useGenerationStore.test.ts
```

---

## 2. 結合・手動テスト計画 (Integration & Manual Verification)

### 手動テストケース
1. **複数プリセット・バッチ生成の登録高速化検証**:
   - 3〜5個のプリセットをチェックし、各バッチサイズを2〜4に設定（計6〜20ジョブ）。
   - 「Generate Batch」を押下し、個別の中間 `GET /queue` が発生せずキュー登録が直列ブロッキングなしで即時完了することを確認。
2. **キャンセル時の即時中断検証（Red Teaming 失敗シナリオ）**:
   - 複数プリセット・バッチ生成（10ジョブ以上）の投入ループ実行中（1〜2ジョブ投入直後）に「一括キャンセル」を実行。
   - 投入ループが即座に中断され、残りの未投入ジョブがComfyUIへ投入されないこと（投入済みジョブのみキャンセル処理が行われること）を確認。
3. **モバイル・通常モード両立検証**:
   - モバイルビュー（幅 < 768px）およびデスクトップビュー（幅 >= 768px）の双方で、バッチ生成およびキャンセル機能が正常に機能することを確認。

