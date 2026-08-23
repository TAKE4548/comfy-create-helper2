# PBI-164 テスト計画書

## 1. 概要
複数セッション間（PC・モバイル等）における生成進捗・キュー情報・生成履歴の同期および可視化に関する自動テストおよび検証シナリオを定義する。

---

## 2. 自動テスト計画 (Automated Unit Tests)

### 2.1 テストファイル 1: `frontend/src/store/__tests/useGenerationStore.test.ts`

#### Test 1: 他セッションのジョブ実行時におけるステート更新
- **入力**: WebSocket メッセージ `JSON.stringify({ type: 'executing', data: { node: '3', prompt_id: 'prompt-123' } })`
- **事前状態**: `queueRunning = [[1, 'prompt-123', {}, { client_id: 'other-client-id' }, []]]`
- **期待結果（アサーション）**:
  - `state.isGenerating === true`
  - `state.currentPromptId === 'prompt-123'`
  - `state.activeClientId === 'other-client-id'`
  - `state.currentNode?.id === '3'`

#### Test 2: ジョブ完了時における `fetchHistory` & `fetchQueue` 連動
- **入力**: WebSocket メッセージ `JSON.stringify({ type: 'executing', data: { node: null, prompt_id: 'prompt-123' } })`
- **期待結果（アサーション）**:
  - `comfyApi.getHistory` が1回以上呼び出されること（Spy検証）。
  - `comfyApi.getQueue` が1回以上呼び出されること（Spy検証）。
  - `state.currentNode === null`
  - `state.nodeProgress === null`

#### Test 3: `reconcileState` の全セッション履歴復元
- **入力**: ComfyUI `/history` レスポンス（他セッション `client_id: 'pc-client'` で完了した画像2件を含む）
- **実行**: `store.reconcileState('http://localhost:8188')` または `initialize()`
- **期待結果（アサーション）**:
  - `state.comfyHistoryImages.length === 2`
  - 全URLが `comfyHistoryImages` に含まれていること。

---

### 2.2 テストファイル 2: `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`

#### Test 1: 他セッション生成中の判定分離
- **入力**:
  - `clientId = 'mobile-client'`
  - `store.isGenerating = true`
  - `store.activeClientId = 'pc-client'`
  - `store.activeBatch = null`
- **期待結果（アサーション）**:
  - `result.current.isGeneratingHere === false`
  - `result.current.isOtherSessionGenerating === true`

#### Test 2: キュー集計とフィルタ連動
- **入力**:
  - `clientId = 'mobile-client'`
  - `store.queueRunning = [[1, 'p1', {}, { client_id: 'pc-client' }, []]]`
  - `store.queuePending = [[2, 'p2', {}, { client_id: 'pc-client' }, []]]`
- **期待結果（アサーション）**:
  - `result.current.allQueueCount === 2`
  - `store.filterOwnSession = true` のとき: `result.current.totalQueueCount === 0`
  - `store.filterOwnSession = false` のとき: `result.current.totalQueueCount === 2`

#### Test 3: 履歴表示の切替
- **入力**:
  - `store.batchImages = ['own-img-1.png']`
  - `store.comfyHistoryImages = ['pc-img-1.png', 'pc-img-2.png']`
- **期待結果（アサーション）**:
  - `store.filterOwnSession = true` のとき: `result.current.displayImages === ['own-img-1.png']`
  - `store.filterOwnSession = false` のとき: `result.current.displayImages === ['pc-img-1.png', 'pc-img-2.png']`

---

## 3. 手動検証シナリオ (Manual Verification)

### シナリオ 1: 2画面間での進捗・キュー可視化
1. ブラウザA（PC幅）とブラウザB（モバイル幅）をそれぞれ開き、異なる `clientId` を持つことを確認。
2. ブラウザAからバッチジョブ（3件）を投入。
3. **合格基準**:
   - ブラウザBのヘッダーにバッジ「他セッションで生成中...」が表示される。
   - ブラウザBのプログレスバー領域に以下が表示される：
     - テキスト: 「他セッションで生成中...」
     - 実行中ノード: 「実行中: <ノード名>」
     - キュー表示: 「Queue: 3 (他セッション)」
     - 経過時間: 「経過: X秒」

### シナリオ 2: リアルタイム完了およびリロード時の履歴反映
1. ブラウザAのバッチ生成（3件）が完了する。
2. **合格基準**:
   - ブラウザB（フィルタOFF）のフィルムストリップに3枚の画像がリアルタイム（完了後3秒以内）で自動追加される。
   - ブラウザBをF5リロードした際にも、フィルムストリップに3枚すべての画像が保持・表示される。

---

## 4. 実行コマンド (CLI Commands)

```bash
cd frontend && npx vitest run src/store/__tests/useGenerationStore.test.ts src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx
```
