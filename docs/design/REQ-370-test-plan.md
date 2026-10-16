# REQ-370 実行可能テスト計画: 複数端末における生成履歴同期抜けの修正

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **Frontend コマンド**: `npm --prefix frontend run typecheck`
- **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Focused Suite Baseline)
- **Frontend コマンド**:
  ```bash
  npm --prefix frontend test -- connectionSlice.test.ts residualHistory.test.ts useGenerateDisplayState.residual.test.tsx
  ```
- **期待値**: 全テスト PASS (Exit code 0)。脳内推論代用は厳禁。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 テスト配置計画 (Test Placement Plan)
- チケット番号付きテストファイル（`*req370*` 等）の新規作成は禁止（Testing Rules 準拠）。以下の既存テストファイルを拡張する。

| AC | 追記先既存テストファイル | ケース名タグ・フィルタ |
| :--- | :--- | :--- |
| `AC-1` | `frontend/src/store/__tests__/slices/connectionSlice.test.ts` | `[REQ-370/AC-1]`<br>`npm --prefix frontend test -- connectionSlice.test.ts -t "REQ-370/AC-1"` |
| `AC-2` | `frontend/src/services/__tests__/residualHistory.test.ts` | `[REQ-370/AC-2]`<br>`npm --prefix frontend test -- residualHistory.test.ts -t "REQ-370/AC-2"` |
| `AC-3` | `frontend/src/services/__tests__/residualHistory.test.ts` | `[REQ-370/AC-3]`<br>`npm --prefix frontend test -- residualHistory.test.ts -t "REQ-370/AC-3"` |
| `AC-4` | `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx` | `[REQ-370/AC-4]`<br>`npm --prefix frontend test -- useGenerateDisplayState.residual.test.tsx -t "REQ-370/AC-4"` |

### 2.2 Seam Map (結合境界定義)
1. **Integrated (本物のコードとして結合実行する層)**:
   - **Frontend Store**: `createConnectionSlice` ⇄ `mergeManagedHistory` ⇄ `mergeImagesByIdentity` ⇄ `useGenerationStore`（実本番実装）。
   - **Frontend Services**: `collectDisplayedIdentities`, `insertAfterPrior`, `mergeResidualHistory`（実本番実装）。
   - **Frontend Hook**: `useGenerateDisplayState` ⇄ TanStack Query (`queryClient.setQueryData`) ⇄ `trialAvailability`。
2. **Severed (外部 I/O 切断境界)**:
   - **WebSocket Transport**: `systemWsService` をテスト内シミュレータ（`MockWebSocket`）で切断。
   - **HTTP Client**: `generationApi.getState()`, `generationApi.residualHistory()` を Vitest モック（`vi.mock` / `vi.spyOn`）で切断。
3. **Mock Level**:
   - 内部ビジネスロジック（`mergeImagesByIdentity`, `insertAfterPrior`, `mergeResidualHistory`）のモンキーパッチは厳禁。外部 I/O のみ切断する。
4. **PBT Decision**:
   - `mergeResidualHistory` のスロット上限と挿入順序は、入力配列長（0件, 199件, 200件, 205件）および候補件数（1〜10件）の組み合わせ境界値テストで網羅する。
5. **Fault Injection**:
   - `generationApi.getState()` の通信エラー（500/ネットワーク切断）発生時、`loadSnapshot` が既存スナップショットを破壊せず同期エラー状態（`generationSyncIssue`）を適切にハンドリングすることを検証。

### 2.3 受入シナリオ詳細
- **シナリオ 1 (`[REQ-370/AC-1]` - スナップショット完了ジョブの包括マージ)**:
  - **Given**: 直前のスナップショットが存在しない（`previous == null`）状態、または直前と異なる epoch のスナップショットを受信した状態。
  - **When**: 既に `status === 'succeeded'` かつ `outputs` を持つジョブを含むスナップショットを `applyGenerationSnapshot` に適用したとき。
  - **Then**: 状態遷移イベントを経由していなくても `mergeManagedHistory` が呼び出され、他セッション・自セッションの画像 URL が `comfyHistoryImages` / `batchImages` にマージされること。
  - **検証コマンド**: `npm --prefix frontend test -- connectionSlice.test.ts -t "REQ-370/AC-1"`
  - **検証アサーション**:
    - `expect(useGenerationStore.getState().comfyHistoryImages).toContain(foreignImageUrl)`
    - `expect(useGenerationStore.getState().batchImages).toContain(ownImageUrl)`
    - `expect(dispatch.mock.calls.some(([e]) => e.type === 'comfy-job-event')).toBe(false)`（不要なリアルタイム通知は非発火）

- **シナリオ 2 (`[REQ-370/AC-2]` - 200件保持時の新規差分受容とFIFO最古追い出し上限維持)**:
  - **Given**: 閲覧端末側の `history.all` に既に 200 件の履歴画像が存在する状態。
  - **When**: `mergeResidualHistory` に他端末で生成された新規差分アイテム（例: 2 件）が渡されたとき。
  - **Then**: 差分が 0 件に切り捨てられることなくマージされ、マージ後の配列総数が 200 件に維持され、最古の 2 件が末尾から押し出される（FIFO Eviction）こと。
  - **検証コマンド**: `npm --prefix frontend test -- residualHistory.test.ts -t "REQ-370/AC-2"`
  - **検証アサーション**:
    - `expect(result.all).toHaveLength(200)`
    - `expect(result.added).toHaveLength(2)`
    - `expect(result.all).toContain(newCandidateUrl1)`
    - `expect(result.all).not.toContain(oldestPushedOutUrl)`

- **シナリオ 3 (`[REQ-370/AC-3]` - 初回差分画像の先頭側挿入)**:
  - **Given**: 残存履歴の初回ページ（`priorAddedIdentities` が空）から新規差分画像を取得した状態。
  - **When**: 既存履歴配列とマージされたとき。
  - **Then**: 差分画像が配列の最古末尾ではなく、最新バッチと整合する先頭側（インデックス 0〜）に配置されること。
  - **検証コマンド**: `npm --prefix frontend test -- residualHistory.test.ts -t "REQ-370/AC-3"`
  - **検証アサーション**:
    - `expect(result.all.slice(0, 2)).toEqual([newCandidateUrl1, newCandidateUrl2])`

- **シナリオ 4 (`[REQ-370/AC-4]` - タブ復帰時のスナップショット再同期とギャラリー反映)**:
  - **Given**: 閲覧端末のタブが非表示（バックグラウンド）中に、他端末で画像生成が完了した状態。
  - **When**: 閲覧端末のタブがフォアグラウンドに復帰（`visibilitychange` / `document.visibilityState === 'visible'`）したとき。
  - **Then**: `store.loadSnapshot()`（`generationApi.getState()`）が呼び出され、取得した最新スナップショットから未同期の画像が履歴ギャラリーにリロードなしで反映されること。
  - **検証コマンド**: `npm --prefix frontend test -- useGenerateDisplayState.residual.test.tsx -t "REQ-370/AC-4"`
  - **検証アサーション**:
    - `expect(generationApi.getState).toHaveBeenCalled()`
    - `expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toContain(newImageUrl)`

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### 3.1 異常系シナリオ 1: タブ復帰時のスナップショット API 障害注入
- **手順**:
  1. `generationApi.getState` が 500 エラーまたはネットワークタイムアウトで拒否（Reject）されるようモック。
  2. `document.dispatchEvent(new Event('visibilitychange'))` を発火。
- **期待結果**:
  - `store.loadSnapshot()` がクラッシュせず安全に catch すること。
  - `generationSyncIssue` が設定され、既存の表示画像やキュー状態が破棄・初期化されないこと。

### 3.2 境界値シナリオ 2: 既存 200 件 + 差分 10 件の FIFO 境界値検証
- **手順**:
  1. 既存 `history.all` に 200 件の画像を設定。
  2. `mergeResidualHistory` に 10 件の新規差分アイテムを渡す。
- **期待結果**:
  - `result.all.length === 200` が厳密に維持されること。
  - 先頭 10 件に新規アイテムが順序通り配置され、末尾の 10 件が欠落なく切り落とされていること。

### 3.3 冪等性シナリオ 3: 同一スナップショットの重複受信
- **手順**:
  1. 既に完了したジョブを含むスナップショットを `applyGenerationSnapshot` に適用。
  2. 同一のジョブ構成を持つスナップショットを再度 `applyGenerationSnapshot` に適用。
- **期待結果**:
  - `mergeManagedHistory` 内のシグネチャ照合により 2 回目の更新がスキップされ、Zustand の State 参照（`comfyHistoryImages` / `batchImages`）が変化せず不要な再レンダリングが発生しないこと。

### 3.4 競合系シナリオ 4: WebSocket Push と HTTP loadSnapshot の同時発火
- **手順**:
  1. `visibilitychange` に伴い HTTP `loadSnapshot` がリクエストを発行。
  2. その直後に WebSocket 経由で同一またはより新しい revision のスナップショットが到着し `applyGenerationSnapshot` が実行される。
  3. 遅れて到着した HTTP `loadSnapshot` のレスポンスが解決される。
- **期待結果**:
  - `httpRequestSequence` および `snapshotSequenceAtStart !== snapshotApplySequence` のチェックにより古い HTTP 応答が安全に破棄され、WebSocket の新しい状態がロールバック・上書きされないこと。

---

## 4. ツール主導監査 (Tool-Driven Audit)

```bash
# BA Audit (Step 3 実行)
python C:\Users\audih\.agent-tooling\releases\f93fa85ae12d940a605d9b389d6b17d8511159f14123c61c020807b1243dc830\helpers\local_model_adapter.py --context-length 32768 ba-audit docs/design/REQ-370.md docs/design/REQ-370-test-plan.md docs/backlog/task/active/REQ-370-T1.md docs/backlog/task/active/REQ-370-T2.md docs/backlog/task/active/REQ-370-T3.md

# VRAM 解放
python C:\Users\audih\.agent-tooling\releases\f93fa85ae12d940a605d9b389d6b17d8511159f14123c61c020807b1243dc830\helpers\local_model_adapter.py unload
```
