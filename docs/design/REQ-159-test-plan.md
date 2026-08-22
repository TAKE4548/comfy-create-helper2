# REQ-159: テスト計画書 (Test Plan)

## 1. 自動テスト仕様 (Automated Test Specifications)

```bash
# フロントエンドの単体テスト実行コマンド
npm --prefix frontend test -- src/store/__tests/useGenerationStore.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx --run
```

### 対象テストファイルおよびアサーション仕様

#### 1. `frontend/src/store/__tests/useGenerationStore.test.ts`
- **AC-1-1 / AC-1-2 (activeBatch 実行中の activeClientId 保持)**:
  - `execution_start` イベント受信時に `activeBatch` 内に未完了ジョブ（`pending` または `generating`）が存在する場合、`activeClientId` がリセットされず自クライアントID（`clientId`）に維持されることを検証。
- **AC-2-2 (自セッション履歴抽出とマージ)**:
  - `fetchHistory` 実行時に、ComfyUIの `/history` エントリ群から `prompt[3]?.client_id === clientId` に合致する画像のみが抽出され、既存の `batchImages` へ重複なくマージ・先頭格納されることを検証。

#### 2. `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`
- **AC-1-2 (isGeneratingHere 判定)**:
  - `filterOwnSession: true` 有効時、`activeClientId` が一時的に `null` であっても `activeBatch` 内に未完了ジョブが存在する場合に `isGeneratingHere === true` が維持されることを検証。
- **AC-3-2 (totalQueueCount 集計)**:
  - クライアント側の未送信ダミーを加算せず、純粋にComfyUI側の `/queue` レスポンス（`queueRunning` + `queuePending`）の実数が表示されることを検証。

#### 3. `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`
- **AC-3-1 (全体進捗母数 M の一貫保持)**:
  - `handleGenerateSets` でバッチ投入時、全予定枚数が `activeBatch` に一括初期化され、完了/失敗に関わらず母数 `M` が維持されることを検証。

---

## 2. 手動検証シナリオ (Manual Verification Protocol)

### シナリオ 1: プログレスバーの連続表示・ジョブ移行検証 (AC-1-1, AC-1-2)
- **前提条件**: `localStorage.getItem('prompt-surgeon-filter-own-session') === 'true'`
- **手順**:
  1. 2セット（計2枚）の「Generate Batch」を実行。
  2. 1枚目生成中、DOM上のプログレスバー要素（`div.bg-accent-green`）が存在し、「全体進捗: 1/2 枚目」が表示されていることを確認。
  3. 1枚目完了後、2枚目生成へ移行した際、プログレスバーが「Ready (0%)」にリセット・非表示化されることなく「全体進捗: 2/2 枚目」へシームレスに継続表示されることを確認。

### シナリオ 2: バックグラウンド生成後の履歴自動同期検証 (AC-2-1, AC-2-2, AC-2-3)
- **前提条件**: `filterOwnSession: true`、3枚のバッチ生成を投入。
- **手順**:
  1. 投入完了後、ブラウザタブをバックグラウンドに切り替える（または画面ロック）。
  2. ComfyUI側で3枚の生成完了後、ブラウザをアクティブ復帰（`visibilitychange` イベント発火）。
  3. サムネイル一覧および履歴に、バックグラウンド中に生成された3枚の画像が欠落なく全件自動反映されることを確認。

### シナリオ 3: 投入中の確定反映とスリープ離脱検証 (AC-3-1, AC-3-2, AC-3-3)
- **前提条件**: 5枚のバッチ生成を投入。
- **手順**:
  1. 「Generate Batch」を押下。
  2. 画面上の全体進捗母数が `M=5` として即座にセットされることを確認。
  3. 画面右下の `Queue: X` の表示が、ComfyUIの受理に伴い `0 → 1 → 2 → 3 → 4 → 5` とリアルタイムにカウントアップすることを確認。
  4. `Queue: 5` の表示を確認した直後に画面をロック・離脱し、ComfyUI側で全5枚が正常に生成完了することを確認。
