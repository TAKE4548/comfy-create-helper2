# REQ-154 テスト計画書: 生成キュー投入・進捗管理・Abort制御の不具合修正

## 1. 自動テスト (Unit & Integration Tests)

### テストファイル
1. `frontend/src/store/__tests/useGenerationStore.test.ts`
   - `cancelJob` で `currentPromptId` が実行中の場合にも確実に `/interrupt` が呼ばれることの検証。
   - `cancelJob` で `activeBatch` 内の対象ジョブが `failed` に更新され、全件終了時に `isGenerating` が `false` になることの検証。
2. `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`
   - `handleGenerate` で中断要求（`abort()`）時にループが即座に停止することの検証。
   - `handleGenerateSets` で既存の `activeBatch` が存在する場合、新規バッチジョブが末尾にマージされて母数 `m` が合算されることの検証。
3. `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`
   - クライアント側投入中（`pending-xxx`）のジョブが `totalQueueCount` に合算されることの検証。

### 実行コマンド
```powershell
npm --prefix frontend test -- useGenerationStore.test.ts useGenerateAction.test.ts useGeneratePageState.test.tsx
```

---

## 2. 手動検証 (Manual Verification Plan)

### 検証シナリオ 1: Abort 即時中断
1. 複数枚（例: 3枚）のバッチ生成を開始する。
2. 1枚目生成中（またはキュー投入中）にジョブ管理モーダルから実行中ジョブの「中断」をクリックする。
3. ComfyUI側で `/interrupt` が発行され、後続ジョブがキャンセルされてUIが待機状態に戻ることを確認する。

### 検証シナリオ 2: 追加投入時の進捗母数
1. セットA（2枚）を選択して「Generate Batch」を実行する（全体進捗: `1/2 枚目`）。
2. 生成中にセットB（3枚）を選択して「Generate Batch (キュー追加)」を実行する。
3. 全体進捗の母数が `5`（`x/5 枚目`）に更新され、既存の生成が継続されることを確認する。

### 検証シナリオ 3: Queue 残数と進捗「〜枚目」表示
1. 生成開始直後のComfyUI検証中（Verify中）に画面右下の Queue カウントが 0 ではなく投入中数を含めて表示されることを確認する。
2. 1枚目生成中が「全体進捗: 1/m 枚目」、2枚目生成中が「全体進捗: 2/m 枚目」と1-indexedで正しく表示されることを確認する。

