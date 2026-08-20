# インシデントレポート: バッチ生成キュー登録時の不要オーバーヘッドおよびキャンセル時の状態復活（デグレ）不具合

## 概要 (Overview)
バッチ生成（複数プリセット・複数枚生成）の投入時およびジョブ管理モーダル等からのキャンセル操作において、レスポンスの悪化やキャンセル後の進捗表示の不整合（キャンセルしたはずのジョブ枠が残る・復活する）が発生している。
調査の結果、REQ-141で行われた `activeBatch` のインプレース更新処理の導入に伴い、キャンセル中断時のクリーンアップ処理において深刻なデグレ（状態復活バグ）が生じていること、および逐次投入時の多重状態更新・通信オーバーヘッドが残存していることが判明した。

---

## 再現手順 (Reproduction Steps)
1. 複数の生成プリセットまたはバッチ数（例: 2プリセット × 4枚 = 8件）を選択し、「Generate Batch」ボタンを押下する。
2. キュー投入中（1〜2件目が投入された段階）に、キューカウントをクリックして「ジョブ管理」モーダルを開き、「一括キャンセル」または個別ジョブの「キャンセル」を実行する。
3. **観測事象**:
   - キャンセル操作（`cancelAllJobs` / `cancelJob`）により一度ステートが初期化（`activeBatch: null`, `isGenerating: false`）されるが、直後に投入ループ側の `finally` 句が走り、未投入のダミー `pending` ジョブを含んだ `activeBatch` でストアが上書きされ、生成中ステータスが復活してしまう。
   - `fetch(/prompt)` の通信自体に AbortSignal が伝播していないため、進行中のHTTPリクエストがComfyUIへ届いてキューに登録されてしまう。
   - また、キュー投入中にもWebSocket経由の `status` イベント等によって多重の `fetchQueue()` と再レンダリングが連続発生し、UI応答性が悪化する。

---

## 影響範囲 (Affected Area)
- **フロントエンド アクションフック**:
  - `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` (`handleGenerateSets`, `handleGenerate`)
- **フロントエンド グローバルストア**:
  - `frontend/src/store/useGenerationStore.ts` (`queuePrompt`, `cancelJob`, `cancelAllJobs`, `cancelGeneration`, WebSocketメッセージハンドラ)

---

## 原因分類 (Root Cause Classification)
- **分類**: **Type A (実装不備 / Implementation Bug - 回帰・デグレ)**
- **理由**:
  - REQ-141で `currentBatch` を固定長配列として保持・更新する仕組みを入れた際、`handleGenerateSets` の `finally` ブロックで `abortController.signal.aborted` の判定を行わずに無条件で `setActiveBatch([...currentBatch])` および `fetchQueue()` を呼び出していたため、キャンセル処理完了後にバッチステートが上書き復活する回帰が発生している。
  - 加えて、`queuePrompt` に `AbortSignal` が渡されておらず、投入ループ中の中断シグナルが `fetch` レベルで即時遮断されていない。

---

## 調査詳細 (Deep Dive Analysis)

### 1. `handleGenerateSets` におけるキャンセル中断時のステート上書き復活（デグレ）
- `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` L225-L273:
  - ユーザーがキャンセルボタンを押すと、`cancelAllJobs` / `cancelJob` が `get().abortSubmission()` を実行し、ストアの `activeBatch` を `null` にリセットする。
  - `handleGenerateSets` のループは `if (abortController.signal.aborted) return` で離脱するが、**JavaScriptの仕様上 `finally` ブロックが必ず実行される**。
  - `finally` 内で無条件に `setActiveBatch([...currentBatch])` が実行されるため、未投入の仮ID（`pending-Set-0-...`）を含むバッチ配列でストアが上書きされ、直後の `fetchQueue()` によって `isGenerating: true` が再点灯してしまう。
  - また、`await queuePrompt` の完了直後にも `abortController.signal.aborted` のチェックがないため、通信待ちの間にキャンセルされた場合でも `setActiveBatch` が呼ばれてしまう。

### 2. `queuePrompt` における AbortSignal の非連動
- `frontend/src/store/useGenerationStore.ts` L915-L991:
  - `queuePrompt` 内の `fetch(`${activeUrl}/prompt`, ...)` に `signal` オプションが指定されていない。
  - そのため、ComfyUIへの投入HTTPリクエストが進行している最中にキャンセルを押してもネットワークリクエストが即時Abortされず、ComfyUI側でキュー登録が完了してしまう。

### 3. キュー逐次投入時の多重状態更新と不要通信の発生
- `queuePrompt` が1件完了するたびに以下の処理が同期的に走る：
  - `useGenerationStore` の `set({ isGenerating: true, currentPromptId, currentWorkflow })`（全画面再レンダリング）
  - `handleGenerateSets` の `setActiveBatch([...currentBatch])`（再レンダリング）
  - ComfyUIからのWebSocket `status` メッセージ受信による `fetchQueue()`（GET `/queue` 通信と再レンダリング）
  - これらがバッチ件数分（8〜20回）高速で連続実行されるため、メインスレッドおよびReactのレンダリングパイプラインが飽和し、ボタン操作やキャンセルのUI応答が遅延する。

---

## 次のステップ提案 (Next Action)
本インシデントは **Type A（実装不備・デグレ）** です。
調査結果の承認後、`/dev-design` ワークフローへ進み、以下の修正を行う設計・実装タスク（PBI）を作成することを推奨します：
1. `handleGenerateSets` の `finally` 句における `abortController.signal.aborted` ガードの追加（中断時は `activeBatch` 上書きと `fetchQueue` を抑止）。
2. `queuePrompt` への `AbortSignal` 伝播と `fetch` 即時中断の対応。
3. 逐次投入中の中間ステート更新の軽量化（バッチ投入中の冗長な `set()` や WebSocket `status` 経由の過剰フェッチ抑制）。
