# インシデントレポート: モバイル端末における生成進捗非表示・履歴同期漏れ・投入中断の不具合調査

## 概要 (Overview)
REQ-154でキュー投入・進捗管理・Abort制御の改修が行われた後、モバイル端末を中心とした利用環境において以下の3点の不具合・現象が報告された。

1. **モバイル端末から投入するとプログレスバーが表示されない**
   - 明示的にリロードすると表示されるが、現在の生成画像が終わって次のjobに移行すると、再度プログレスバーが非表示に戻る。
2. **キュー投入後に端末を離れると、その間に生成された画像がリロードしても履歴（サムネイル一覧）に出てこない**
   - ComfyUIのFEやPCなど別セッション（アクティブに保たれていた端末）では正常に表示・生成されている。
3. **プログレスバーが表示されなくても生成自体は進んでいるが、生成枚数が指定数より少ない場合がある**

コードベースの静的解析およびロジックトレースを実施し、各事象の根本原因とメカニズムを特定した。

---

## 再現手順・事象詳細 (Reproduction & Observed Symptoms)

### 事象 1: モバイル端末でのプログレスバー非表示およびジョブ移行時の再非表示
- **再現手順**:
  1. モバイル端末（または `filterOwnSession: true` が有効な環境）からバッチ生成を実行する。
  2. 生成中の画面を確認する。
  3. 途中でページをリロードする。
  4. 1枚目の生成が完了し、2枚目の生成（次ジョブ）に移行する瞬間を観察する。
- **観測結果**:
  - 生成開始直後、プログレスバーが表示されず「Ready (0%)」の表示になる。
  - ページをリロードすると、実行中ジョブの進捗バーが表示される。
  - しかし、そのジョブが完了して次のジョブの生成が始まると、再度プログレスバーが消えて「Ready (0%)」に戻ってしまう。

### 事象 2: バックグラウンド移行中に完了した生成画像の履歴（サムネイル）反映漏れ
- **再現手順**:
  1. 複数枚のバッチ生成を投入する。
  2. 投入後すぐにモバイル端末の画面をスリープにするか、別アプリに切り替える。
  3. ComfyUI側で全画像の生成が完了した後にアプリを再アクティブ化（またはリロード）する。
- **観測結果**:
  - 自セッション表示モード（`filterOwnSession: true`）において、バックグラウンド中に生成完了した画像がサムネイル一覧・履歴に表示されない。
  - バックグラウンドにならずアクティブのままであったPC側の画面やComfyUI標準UIで確認すると正常に全枚数生成されている。

### 事象 3: キュー投入直後のバックグラウンド移行による生成枚数の不足
- **再現手順**:
  1. 多数のバッチ（例: 5枚以上）を一括投入する。
  2. 投入ボタン押下直後（1〜2枚の投入完了時点）に端末をスリープまたはバックグラウンドにする。
- **観測結果**:
  - ComfyUI側で生成された画像の総数が、指定した枚数より少ない（途中で投入が打ち切られている）。

---

## 影響範囲 (Affected Area)

### フロントエンド関連ファイル
1. **`frontend/src/store/useGenerationStore.ts`**:
   - `execution_start` WebSocketハンドラ: `activeClientId` を `null` に上書き初期化している。
   - `queuePrompt` (`isBatchIntermediate: true` 時): `activeClientId` の更新がスキップされている。
   - `reconcileState`: リロード時に `localStorage.CURRENT_PROMPT_ID`（単一ID）のみを復元対象としており、バックグラウンド中に完了した複数ジョブを `/history` から取得・補完していない。
   - `batchImages` と `comfyHistoryImages` の分離: 自セッションフィルタ時に `batchImages`（リアルタイム受信分のみ）を参照する設計。
2. **`frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts`**:
   - `isGeneratingHere`: `store.activeClientId === clientId` に厳密依存しており、`activeClientId` が `null` の場合に `false` と判定される。
   - `displayImages`: `filterOwnSession` が `true` の場合に `batchImages` のみを表示し、ComfyUIの履歴データ（`comfyHistoryImages` / `/history`）と同期されない。
3. **`frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts`**:
   - `handleGenerateSets`: クライアント側の逐次 `async for` ループ内で `await queuePrompt()` を実行しているため、モバイルOSによるJS実行サスペンド時に後続ジョブの投入が中断される。

---

## 原因分類 (Root Cause Classification)

- **総合分類**: **Type A (実装不備) 60% ＋ Type B (クライアント・サーバー状態同期・バックグラウンド耐性の設計不備) 40%**
- **各項目の詳細原因**:

| # | 報告事象 | 分類 | 該当コード / 根本原因 |
|---|---|---|---|
| 1 | プログレスバーが表示されない / 次ジョブで消える | **Type A** (実装不備) | ① `useGenerationStore.ts` (L637-652): WebSocketの `execution_start` 受信時に `activeClientId: null` で上書きリセットしている。<br>② `useGenerationStore.ts` (L1018-1023): バッチ投入時（`isBatchIntermediate: true`）に `activeClientId` をセットしていない。<br>③ `useGeneratePageState.ts` (L818): `isGeneratingHere = store.isGenerating && (!store.filterOwnSession \|\| store.activeClientId === clientId)` の判定で、`activeClientId` が `null` のため常に `false` となりプログレスバーが非表示化される。<br>※リロード時は `reconcileState` が `/queue` の `client_id` を復元するため一時的に表示されるが、次ジョブの `execution_start` で再び `null` にリセットされる。 |
| 2 | バックグラウンド中の生成画像が履歴に出ない | **Type A** + **Type B** | ① `useGeneratePageState.ts` (L356): `filterOwnSession ? batchImages : comfyHistoryImages` となっており、自セッションモード時は `batchImages` のみ表示される。<br>② `useGenerationStore.ts` (L681-725): `batchImages` はWebSocketの `executed` イベント受信時のみ追加されるため、スリープ等でWSが切断・停止していた間の画像が含まれない。<br>③ `useGenerationStore.ts` (L289-327): リロード時の `reconcileState` も単一の `currentPromptId` しか検証せず、自セッションの過去完了ジョブを `/history` から取得・マージする仕組みがない。 |
| 3 | 端末を離れると生成枚数が少ない | **Type B** (仕様・構造) | `useGenerateAction.ts` (L247-301): バッチキュー投入がクライアント側の直列 `for` ループ（`await queuePrompt()`）で実行されているため、投入途中でモバイルOSによりブラウザがバックグラウンド休止／サスペンドされると、残りのジョブがComfyUIに送信されない。 |

---

## 調査詳細 (Deep Dive Analysis)

### 1. `execution_start` による `activeClientId` の消失と判定不整合
`frontend/src/store/useGenerationStore.ts` (L637-652):
```typescript
case 'execution_start': {
  const promptId = data.prompt_id as string
  if (get().activeBatch) {
    get().updateBatchJobStatus(promptId, 'generating')
  }
  set({
    isGenerating: true,
    progress: null,
    currentPromptId: promptId,
    activeClientId: null, // ← ここで null に初期化されてしまう
    generationStartTime: Date.now(),
    currentNode: null,
    nodeProgress: null,
  })
  get().fetchQueue()
  break
}
```
`frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` (L818):
```typescript
const isGeneratingHere = store.isGenerating && (!store.filterOwnSession || store.activeClientId === clientId)
```
- **メカニズム**:
  - `filterOwnSession` が `true` の場合、`isGeneratingHere` は `store.activeClientId === clientId` を要求します。
  - バッチ投入時（`handleGenerateSets`）、`isBatchIntermediate: true` により `activeClientId` は更新されず、さらにComfyUIから `execution_start` を受信した瞬間に `activeClientId: null` にリセットされます。
  - この結果、`isGeneratingHere` が `false` となり、UI上は「Ready (0%)」として描画されます。
  - ページをリロードすると `reconcileState` が `/queue` APIのレスポンスから `activeJob[3]?.client_id` を読み取って `activeClientId` に設定するため、一時的にプログレスバーが復活します。
  - しかし現在のジョブが完了して次のジョブが始まると、再び `execution_start` が飛んできて `activeClientId: null` にリセットされ、プログレスバーが再度非表示になります。

### 2. 自セッション履歴（`batchImages`）とサーバー履歴（`/history`）の乖離
`frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` (L356):
```typescript
const displayImages = store.filterOwnSession ? batchImages : comfyHistoryImages
```
- **メカニズム**:
  - `filterOwnSession` が有効な場合、サムネイル一覧に表示されるのは `batchImages`（ローカルステート/LocalStorage保持）です。
  - `batchImages` への追加は、WebSocketの `executed` イベントを受け取った時のみ行われます。
  - モバイル端末をスリープさせたり画面をロックすると、OSがWebSocket通信やJavaScriptの実行を停止します。
  - この間にComfyUI側で生成が完了した画像はWebSocket経由で受信できず、`batchImages` に追加されません。
  - 復帰・リロード時に `fetchHistory()` は呼ばれるものの、これは `comfyHistoryImages` に格納されるだけであり、`filterOwnSession: true` では無視されます。また `reconcileState` も直前の1件（`currentPromptId`）しかチェックしません。
  - 結果として、バックグラウンド中に生成された画像が自端末の履歴に一切表示されなくなります。

### 3. クライアント直列投入ループによるバックグラウンド中断
`frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` (L247-301):
```typescript
for (const setItem of checkedSets) {
  for (let i = 0; i < setItem.batchSize; i++) {
    // ...
    promptId = await queuePrompt(wfJson, ...)
    // ...
  }
}
```
- **メカニズム**:
  - 5枚や10枚などの複数枚生成は、ComfyUIに「10枚生成」という1つの命令を送っているのではなく、フロントエンドが1枚ずつループを回して `POST /prompt` を直列に送信しています。
  - ユーザーが投入ボタンを押してすぐにアプリを離れると、モバイルOS（iOS Safari / Android Chrome）が省電力のためにバックグラウンドのタイマーや非同期処理を数秒以内に凍結します。
  - そのため、ループの途中で `POST /prompt` の送信が止まり、ComfyUIには最初の数枚分しか届きません。
  - これが「枚数が少ないときがある」原因です。

---

## 改善方針（技術的考察・次期設計への示唆）

1. **進捗表示・アクティブ判定の修正**:
   - `execution_start` 時に `activeBatch` 内に当該 `promptId` が存在する場合、あるいは自セッションで投入したジョブである場合は `activeClientId` を `clientId` に維持または自セッション判定を正しく行う。
   - `isGeneratingHere` の判定条件において、`activeBatch` に実行中ジョブが存在するかどうかも加味する。
2. **履歴同期の堅牢化 (Reconciliation)**:
   - `filterOwnSession: true` の場合でも、ComfyUIの `/history` から `item.prompt[3].client_id === clientId` に該当する画像を抽出して `displayImages` または `batchImages` に自動マージ・同期する。
   - アプリ復帰時（`visibilitychange` イベント等）およびリロード時に、未取得の自セッション履歴を自動で完全同期する。
3. **バッチキュー投入の高速化・耐サスペンド化**:
   - 投入ループにおける不要な待ち時間を排除し、極力素早く全ジョブをComfyUIへ一括投入（または並列/連続投入）してサーバー側キューに登録しきる。

---

## 次のステップ提案 (Next Action)

本インシデントは **Type A (実装不備) ＋ Type B (モバイル・バックグラウンド耐性設計)** の複合要因です。
調査結果をご確認の上、本件の修正設計およびタスク作成を進めるため、`/dev-design` へ移行することを提案します。
