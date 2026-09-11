# REQ-249 実行可能テスト計画 (Test Plan)

## 1. 自動テスト (CLI Verification)

### 1-1. 新設単体テストの実行 (Targeted Run)
- **合否判定コマンド**:
  ```bash
  npm --prefix frontend test -- src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx --run
  ```
- **機械的合否判定基準 (AI「脳内テスト」抑止)**:
  1. シェル終了コードが `0`（正常終了）であること。
  2. Vitest 出力に `Test Files  1 passed (1)` が含まれること。
  3. 標準出力および標準エラー出力に `FAIL` または `failed` 文字列が一切含まれないこと（`0 failed`）。

### 1-2. 関連コンポーネント・マルチデバイス E2E 回帰検証 (Regression Verification)
- **合否判定コマンド**:
  ```bash
  npm --prefix frontend test -- src/test/e2e_req240_multidevice.test.ts src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx --run
  ```
- **機械的合否判定基準**:
  1. シェル終了コードが `0` であること。
  2. Vitest 出力に `Test Files  2 passed (2)` が含まれること。
  3. `0 failed` であり既存の REQ-240 マルチデバイス同期および PageState 挙動にリグレッションがないこと。

---

## 2. 結合・耐障害性検証 (Integration & Red Teaming Verification)

### 2-1. シナリオ検証（定量的アサーション基準）

- **シナリオ 1 (TanStack Query SSoT キャッシュ同期 - AC-1)**:
  - `renderHook` で `useGenerateDisplayState` をマウント。
  - `queryClient.setQueryData(['generateDisplayImages', { filterOwnSession: false }], ['cached_img_1.png', 'cached_img_2.png'])` を実行。
  - **定量的判定**: `expect(result.current.sortedDisplayImages).toEqual(['cached_img_1.png', 'cached_img_2.png'])` が同期待機なし（0ms）で成立すること。
  - `sortOrder` を `'asc'` に変更した際、`expect(result.current.sortedDisplayImages).toEqual(['cached_img_2.png', 'cached_img_1.png'])` に反転すること。

- **シナリオ 2 (モーダルプレビュー閲覧中のリアルタイム画像挿入保護 - AC-2)**:
  - 初期履歴 `['img_A.png', 'img_B.png', 'img_C.png']` でモーダルを開き、`img_B.png`（index 1）を選択。
  - 事前検証: `expect(result.current.isModalPreviewOpen).toBe(true)` かつ `expect(result.current.modalPreviewIndex).toBe(1)`.
  - `act(() => { result.current.addHistoryImage('img_NEW.png', false) })` を実行。
  - **定量的判定（中間レンダリングを含む完全一致）**:
    1. `expect(result.current.sortedDisplayImages[0]).toBe('img_NEW.png')`
    2. `expect(result.current.sortedDisplayImages[2]).toBe('img_B.png')`
    3. `expect(result.current.effectiveModalIndex).toBe(2)`（同期即時算出）
    4. `expect(result.current.sortedDisplayImages[result.current.effectiveModalIndex]).toBe('img_B.png')`
    5. `expect(result.current.modalPreviewIndex).toBe(2)`

- **シナリオ 3 (単一アクションによるリアルタイム同期 - AC-3)**:
  - 外部端末から画像完了イベントが届いた際、`result.current.addHistoryImage('external_job_1.png', false)` を呼び出す。
  - **定量的判定**:
    1. `filterOwnSession: false` 時: `expect(result.current.sortedDisplayImages[0]).toBe('external_job_1.png')`
    2. `useGenerationStore.getState().batchImages`（自セッション配列）に `'external_job_1.png'` が含まれないこと（`expect.not.toContain`）。
  - 自端末生成時（`result.current.addHistoryImage('my_job_1.png', true)`）:
    1. `useGenerationStore.getState().batchImages[0]` が `'my_job_1.png'` であること。
    2. `useGenerationStore.getState().selectedImg` が `'my_job_1.png'` に更新されること。

- **シナリオ 4 (Red Teaming / 境界値・異常系)**:
  - 空文字列 `""` を `addHistoryImage` に渡した場合、配列長が増加しないこと（`expect(length).toBe(prevLength)`）。
  - 既存画像 URL と同一の文字列を `addHistoryImage` に渡した場合、重複して 2 件にならず、1件のみが先頭に移動すること（`expect(result.current.sortedDisplayImages.filter(x => x === duplicateUrl).length).toBe(1)`）。
  - `snapshots` クエリがエラーまたは空配列を返した場合、`expect(result.current.sortedDisplayImages.length).toBeGreaterThan(0)` かつ `expect(result.current.snapshotIdsForDisplay.every(id => id === null)).toBe(true)` であること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-249-test-plan.md` を実行し、客観的証明を得ること。
