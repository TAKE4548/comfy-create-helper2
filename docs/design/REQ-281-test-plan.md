# REQ-281 実行可能テスト計画

<!-- [LLM Audit Trace: Action=qa-audit | Model=qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored | Domain=reasoning | Params=9.0B | Quant=Q6_K] -->

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm test -- src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts` (Working Directory: `frontend`)
- **合否判定基準 (定量メトリクス)**:
  - Vitest 終了コード: `0` (FAIL 0 件)
  - テスト総数: 最低 20 件以上（既存 14 件 + 本是正で新規追加 6 件以上）
  - 各 AC に対応するテストケース名が完全に一致して実行・成功すること。
  - テスト結果サマリーに `Test Files 1 passed (1), Tests XX passed (XX)` が出力されること。

---

## 2. 結合・シナリオ検証 (Vitest ハーネスによる機械的検証)

### シナリオ 1: 新規プリセット作成時の前プリセット保護 (AC-1)
- **テスト関数名**: `it('REQ-281 AC-1: creating a new preset does not overwrite the previously active preset in sets or db', async () => ...)`
- **検証手順**:
  1. Preset A（ID: 101, prompt: "Preset A Original"）を開いた状態で `renderHook`。
  2. `createPresetMutation.mutate({ name: "Preset B", paramValues: { prompt: "Preset B New" } })` を実行。
  3. API から Preset B（ID: 102）が返却された直後のストア状態を検証。
- **機械的判定アサーション**:
  - `const setA = useGenerationStore.getState().sets.find(s => s.id === 101)`
  - `expect(setA?.paramValues.prompt).toBe('Preset A Original')`
  - `expect(workflowPresetsApi.update).not.toHaveBeenCalledWith(101, expect.anything())`
  - `expect(useGenerationStore.getState().activeSetId).toBe(102)`
  - `expect(useGenerationStore.getState().paramValues.prompt).toBe('Preset B New')`

### シナリオ 2: タブ切替時の未保存変更フラッシュ保存 (AC-2)
- **テスト関数名**: `it('REQ-281 AC-2: tab switch synchronously flushes in-flight draft to API before switching', async () => ...)`
- **検証手順**:
  1. Preset A（ID: 101）を開き、`act(() => { useGenerationStore.getState().setParamValues({ prompt: 'Preset A Draft In Flight' }) })` を実行（1000ms タイマー動作中）。
  2. 200ms 未満のタイミングで `act(() => { result.current.handleSelectPresetTab(102) })` を実行。
- **機械的判定アサーション**:
  - `expect(workflowPresetsApi.update).toHaveBeenCalledTimes(1)`
  - `expect(workflowPresetsApi.update).toHaveBeenCalledWith(101, expect.objectContaining({ param_values: expect.objectContaining({ prompt: 'Preset A Draft In Flight' }) }))`
  - `expect(useGenerationStore.getState().activeSetId).toBe(102)`

### シナリオ 3: 他端末での非アクティブプリセット更新の検知と切替時反映 (AC-3)
- **テスト関数名**: `it('REQ-281 AC-3: switching to inactive preset updated by another device loads latest server params', async () => ...)`
- **シミュレーション手法**:
  - 端末 2 による更新を `vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA, { ...presetB, param_values: { prompt: 'Preset B Updated by Device 2' }, updated_at: '2026-09-23T12:05:00Z' }])` で再現。
  - `act(() => { result.current.handleSelectPresetTab(102) })` を実行。
- **機械的判定アサーション**:
  - `expect(useGenerationStore.getState().activeSetId).toBe(102)`
  - `expect(useGenerationStore.getState().paramValues.prompt).toBe('Preset B Updated by Device 2')`
  - `expect(result.current.conflictData).toBeNull()`

### シナリオ 4: 定期ポーリングによる未編集プリセットの SSoT 再同期 (AC-4)
- **テスト関数名**: `it('REQ-281 AC-4: background polling reconciles clean presets with server SSoT without in-memory stale overwrite', async () => ...)`
- **シミュレーション手法**:
  - 自端末未編集の状態で、`vi.mocked(workflowPresetsApi.list).mockResolvedValue([{ ...presetA, param_values: { prompt: 'Preset A Remote Fix' }, updated_at: '2026-09-23T12:10:00Z' }])` を返却。
  - `await act(async () => { await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] }) })`
- **機械的判定アサーション**:
  - `await waitFor(() => { expect(useGenerationStore.getState().paramValues.prompt).toBe('Preset A Remote Fix') })`
  - `const setA = useGenerationStore.getState().sets.find(s => s.id === 101)`
  - `expect(setA?.paramValues.prompt).toBe('Preset A Remote Fix')`

### シナリオ 5: プリセット管理パネルからの安全な更新 (AC-5)
- **テスト関数名**: `it('REQ-281 AC-5: updating an inactive preset does not apply active preset params', async () => ...)`
- **検証手順**:
  - Preset A（ID: 101, prompt: "Active Prompt A"）がアクティブな状態で、Preset B（ID: 102, prompt: "Inactive Prompt B"）に対して `updatePresetMutation.mutate({ id: 102, name: 'Renamed B' })` を実行。
- **機械的判定アサーション**:
  - `expect(workflowPresetsApi.update).toHaveBeenCalledWith(102, expect.not.objectContaining({ param_values: expect.objectContaining({ prompt: 'Active Prompt A' }) }))`

---

## 3. Red Teaming (境界値・異常系テスト)

### 境界・失敗テスト 1: 高速連続タブ切替時のフラッシュ整合性
- **テスト関数名**: `it('REQ-281 RedTeam-1: rapid tab switching (A -> B -> C) flushes dirty draft without race condition', async () => ...)`
- **検証手順**:
  - Preset A を編集直後に `handleSelectPresetTab(102)`、その直後に `handleSelectPresetTab(103)` を連続実行。
- **期待値**:
  - Preset A の保留中変更が確実に 1 度だけフラッシュされ、API 呼び出しの競合や状態消失がないこと。

### 境界・失敗テスト 2: タブ切替フラッシュ時の 409 Conflict 発生
- **テスト関数名**: `it('REQ-281 RedTeam-2: 409 conflict during tab switch flush triggers conflict resolution state', async () => ...)`
- **検証手順**:
  - Preset A のフラッシュ保存時に API が 409 Conflict を返却するようにモック。
- **期待値**:
  - サイレントにエラーを破棄せず、`result.current.conflictData` に適切な競合データが格納されること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コード・テスト実行監査**: `local_model_adapter.py qa-audit` を実行し、PASS 基準を満たすこと。
