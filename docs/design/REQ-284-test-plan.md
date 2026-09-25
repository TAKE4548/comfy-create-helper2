# REQ-284 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### Gate 1: 型安全性静的検証
- **コマンド**: `cd frontend && npm run typecheck`（`tsc -b --noEmit`）
- **期待値**: エラー 0 件でクリーンパスすること。

### Gate 2: 単体テスト・フルスイート実行
- **コマンド**: `cd frontend && npx vitest run`
- **対象テストファイル**:
  - `src/pages/GeneratePage/services/__tests__/presetBulkPatcher.test.ts` (新規追加: 一括パッチ純粋計算の全ケーステスト)
  - `src/pages/GeneratePage/hooks/__tests__/usePresetHistory.test.ts` (新規追加: Undo/Redo & ショートカットテスト)
  - `src/pages/GeneratePage/hooks/__tests__/usePresetConflict.test.ts` (新規追加: 409競合検知 & 解決テスト)
  - `src/pages/GeneratePage/hooks/__tests__/usePresetAutoSave.test.ts` (新規追加: オートセーブ & 同期的フラッシュテスト)
  - `src/pages/GeneratePage/hooks/__tests__/usePresetStoreSync.test.ts` (新規追加: サーバー/Zustand同期テスト)
  - `src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts` (既存回帰テスト: 全20件PASS)
- **期待値**: 全テストファイル・全テストケース PASS。0 failures。

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: プリセット一括編集（Bulk Edit）の機械的検証
- **検証コマンド**: `cd frontend && npx vitest run src/pages/GeneratePage/services/__tests__/presetBulkPatcher.test.ts`
- **定量的合否基準**:
  - `computePresetPatch` において、`search_replace`, `remove_tags`, `paramPatch`, `loraStackOps` の入力に対して期待される出力オブジェクトが 100% 完全一致（deep equal）すること。
  - `clampedSlots` により 10 件上限でのスライスが正確に行われ、境界超過が発生しないこと。

### シナリオ 2: 409 OCC 競合解決ハンドリング (AC-4)
- **検証コマンド**: `cd frontend && npx vitest run src/pages/GeneratePage/hooks/__tests__/usePresetConflict.test.ts`
- **定量的合否基準**:
  - `updatePresetMutation` が 409 エラー（`new Error('409 Conflict')`）で reject された際、`conflictData` が non-null となり、`serverPreset` および `localDraft` のプロパティが完全保持されること。
  - 各解決アクション（`handleResolveConflictUseServer`, `handleResolveConflictOverwrite`, `handleResolveConflictSaveAsNew`）呼出時に対応する API/ハンドラが正確に 1 回呼ばれ、`conflictData` が `null` にリセットされること。

### シナリオ 3: 同期的フラッシュとパラメータ巻き戻り防止 (AC-2)
- **検証コマンド**: `cd frontend && npx vitest run src/pages/GeneratePage/hooks/__tests__/usePresetAutoSave.test.ts`
- **定量的合否基準**:
  - `flushAutoSave()` 実行時、タイマー（1000ms）の完了を待たずに同期的即座に `useGenerationStore.getState().updateActiveSet` が実行され、`sets` 配列内のアクティブセットが最新の `currentState` と等価になること。
  - タイマー完了前であっても、先行保存リクエスト完了後に最新の変更値（`paramValues`）が後続リクエストとして確実に発行されること。

### Red Teaming (境界値・異常系)
- **RT-1: キー順序が異なる等価オブジェクトでの不要オートセーブ遮断 (AC-3)**:
  - **検証コマンド**: `cd frontend && npx vitest run src/pages/GeneratePage/hooks/__tests__/usePresetAutoSave.test.ts -t "isRecordEqual"`
  - **合否基準**: `{ a: '1', b: '2' }` と `{ b: '2', a: '1' }` に対して `isRecordEqual` が `true` を返し、オートセーブタイマーの多重起動および API リクエスト発行数が 0 回であること。
- **RT-2: 不正な LoRA スタックまたは空の差分オペレーション**:
  - **検証コマンド**: `cd frontend && npx vitest run src/pages/GeneratePage/services/__tests__/presetBulkPatcher.test.ts -t "invalid slots"`
  - **合否基準**: `presetBulkPatcher` に無効なスロット（空文字 name）や空の差分配列を渡した際、例外を送出せず、既存パラメータが 100% 保持されること。
- **RT-3: INPUT/TEXTAREA フォーカス中の Ctrl+Z / Ctrl+Y の競合防止**:
  - **検証コマンド**: `cd frontend && npx vitest run src/pages/GeneratePage/hooks/__tests__/usePresetHistory.test.ts -t "input focus"`
  - **合否基準**: `document.activeElement` が `HTMLInputElement` または `HTMLTextAreaElement` の場合、Ctrl+Z / Ctrl+Y の `keydown` イベントで `undo()` / `redo()` が発火しない（呼出回数 0 回）こと。

## 3. ツール主導監査 (Tool-Driven Audit)
- **タスクカード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-284-T1.md`（PASS: Mostly Self-Contained, High Confidence）
- **テスト計画監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-284-test-plan.md`（PASS: Verified non-ambiguous metrics）
- **ガバナンス監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py .`（PASS）
- **ワークフロー検証**: `python ${GLOBAL_SCRIPTS}\workflow_validator.py design-end REQ-284`（PASS）
