# REQ-277: テスト計画書 (Test Plan) - 第2版 (抜け道防止・厳格検証版)

- **PBI**: REQ-277
- **改訂日**: 2026-09-18
- **作成者**: Architect / QA
- **ステータス**: テスト計画改訂完了 (Test Plan Overhauled with Anti-Loophole Guard)

---

## 1. 検証ゲート概要 (3-Gate Baseline)

### Gate 1: 静的解析・型チェック
- **フロントエンド**: `npx tsc -p tsconfig.app.json --noEmit`
  - 判定基準: 0 errors
- **バックエンド**: 構文チェック
  - 判定基準: 0 errors

### Gate 2: フルテストスイート自動ディスカバリ実行
- **フロントエンド**: `npm test` (Vitest ディスカバリ実行)
  - `useGenerateAction.test.ts`, `multiSetSlice.test.ts`, `usePresetState.test.ts`, `useGeneratePageState.test.tsx` を含む全ユニット・結合テストの自動発見実行
  - 判定基準: 0 failures (全テスト PASS)

### Gate 3: 結合シナリオ & 厳格な抜け道防止ペイロード検証 (True Positive Verification)
- **判定基準**:
  - `queuePrompt(wfJson, metadata)` の **第1引数 `wfJson` の各ノード inputs** に、画面上で変更した最新パラメータ（ステップ数、CFG、スケジューラ等）が 100% 確実に注入されていること。
  - **抜け道防止 5 大ルールの完全準拠**（第2節参照）。

---

## 2. 抜け道防止 5 大ルール (Anti-Loophole Rules)

`tmp/REQ-277_test_gap_analysis_report.md` の偽陽性分析に基づき、テストコード作成時に以下のルールを強制する：

| ルール ID | 名称 | 必須条件 | 遮断する抜け道 |
|---|---|---|---|
| **AL-1** | **実ストア遷移の義務化** | テスト内のプレーンオブジェクトへの直接プロパティ代入（`mockStore.paramValues = ...`）を禁止し、**実ストアのアクション（`setParamValues` / `updateActiveSet`）を呼び出して状態遷移を起こすこと**。 | ストア内部同期やデバウンス副作用をスキップする抜け道 |
| **AL-2** | **初期値乖離の義務化** | テスト入力値は、ワークフロー初期値（例: steps=20, cfg=7.0）と**100% 乖離した値（例: steps=40, cfg=8.5）を指定すること**。アサーションで `not.toBe(初期値)` かつ `toBe(最新値)` を二重検証する。 | インジェクター失敗時に初期値にフォールバックして PASS してしまう抜け道 |
| **AL-3** | **正確な Mapping Role 名の強制** | テストデータのキー名は `mappings` の正確な `role` 名（`Sampler_Steps`, `Sampler_cfg`, `Sampler_Scheduler`）と完全一致させる。 | ロール名不一致でパラメータ注入が無視されデフォルト値になる抜け道 |
| **AL-4** | **先行オートセーブ協調検証** | `options.onBeforeGenerate`（`flushAutoSave` 相当）を呼び出すシナリオにおいて、先行処理が実行された直後でも最新入力値が破棄・巻き戻されずに `wfJson` に渡ることを検証する。 | 実機バグの根本原因（先行オートセーブによるインメモリ上書き）を見逃す抜け道 |
| **AL-5** | **非アクティブセット汚染防止** | 複数セット運用時、アクティブセットの最新入力値が、非アクティブセットの独自パラメータを上書き・汚染していないことをアサートする。 | セット間の意図しないパラメータリークを見逃す抜け道 |

---

## 3. テスト用ワークフロー設計 (`realisticWorkflow`)

実際の ComfyUI ノード構成および mapping を忠実に再現する：
```typescript
const realisticWorkflow: Workflow = {
  id: 1,
  name: 'Realistic KSampler Workflow',
  created_at: '',
  json_body: {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: 1000,
        steps: 20,
        cfg: 7.0,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1.0,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: 'original prompt',
      },
    },
  },
  mappings: [
    { id: 1, master_id: 1, node_id: '3', role: 'Sampler_Seed', param_name: 'seed', input_type: 'int', display_name: 'Seed' },
    { id: 2, master_id: 2, node_id: '3', role: 'Sampler_Steps', param_name: 'steps', input_type: 'int', display_name: 'Steps' },
    { id: 3, master_id: 3, node_id: '3', role: 'Sampler_cfg', param_name: 'cfg', input_type: 'float', display_name: 'CFG' },
    { id: 4, master_id: 4, node_id: '3', role: 'Sampler_Scheduler', param_name: 'scheduler', input_type: 'select_scheduler', display_name: 'Scheduler' },
    { id: 5, master_id: 5, node_id: '3', role: 'Sampler_Sampler', param_name: 'sampler_name', input_type: 'select_sampler', display_name: 'Sampler' },
    { id: 6, master_id: 6, node_id: '6', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Prompt' },
  ],
};
```

---

## 4. 統合シナリオテスト (Integration Scenarios)

### シナリオ 1: パラメータ変更直後（即時・先行オートセーブ実行時）の ComfyUI 投入ワークフロー検証 [AL-1, AL-2, AL-3, AL-4]
- **手順**:
  1. `realisticWorkflow` を用いて、初期ステップ数 `20`, CFG `7.0`, スケジューラ `'normal'` のセットを用意。
  2. ストアアクション `setParamValues({ Sampler_Steps: '40', Sampler_cfg: '8.5', Sampler_Scheduler: 'karras' })` を実行。
  3. `onBeforeGenerate`（最新ストアから `currentState` を取得して `updateActiveSet` を呼ぶ先行オートセーブ処理）を渡して `handleGenerateSets` を呼び出す。
- **検証アサーション**:
  - `expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);`
  - **第1引数 `wfJson['3'].inputs.steps`: `not.toBe(20)` かつ `toBe(40)` (数値型変換検証)**
  - **第1引数 `wfJson['3'].inputs.cfg`: `not.toBe(7.0)` かつ `toBe(8.5)` (浮動小数点数型変換検証)**
  - **第1引数 `wfJson['3'].inputs.scheduler`: `not.toBe('normal')` かつ `toBe('karras')` (文字列型検証)**
  - **第2引数 `metadata.paramValues.Sampler_Steps`: `toBe('40')`**

### シナリオ 2: 単一セット運用時の `activeSetId` 未確定フォールバックにおける `wfJson` 検証 [AL-1, AL-2]
- **手順**:
  1. `sets` に単一セットのみが存在し、`activeSetId` が `null` の状態。
  2. ストアの `setParamValues` で `Sampler_Steps: '35'` に変更し、`handleGenerateSets` を呼び出す。
- **検証アサーション**:
  - 第1引数 `wfJson['3'].inputs.steps`: `not.toBe(20)` かつ `toBe(35)`
  - 単一セット時に `activeSetId` が未確定でも画面の編集値が確実にジョブへ注入されること。

### シナリオ 3: 複数セット運用時の個別保持とアクティブセット反映検証 [AL-5]
- **手順**:
  1. `Set 1`（アクティブ、初期 steps: 20）と `Set 2`（非アクティブ、初期 steps: 50）が両方 checked。
  2. 画面で `setParamValues` により `Sampler_Steps` を `35` に変更して `handleGenerateSets` を呼び出す。
- **検証アサーション**:
  - `mockStore.queuePrompt` の 1 回目（Set 1）: `wfJson['3'].inputs.steps === 35` (アクティブセット反映)
  - `mockStore.queuePrompt` の 2 回目（Set 2）: `wfJson['3'].inputs.steps === 50` (非アクティブセット保持・35 や 20 への汚染なし)

---

## 5. Red Teaming (境界値・異常系テスト)

### RT-1: `activeSetId` と `setItem.id` の型不一致（string "1506" vs number 1506）における `wfJson` 注入検証
- **内容**: ID の型が異なっていても確実に同一と判定され、`wfJson` のノード入力に変更後パラメータが反映されること。

### RT-2: `flushAutoSave` 先行実行時のクロージャ上書き耐性テスト [AL-4]
- **内容**: 生成直前に先行呼び出しされる `flushAutoSave` 内で、フックのクロージャ変数を参照せず `useGenerationStore.getState()` を取得することにより、入力直後の最新値が破壊されずに維持されること。

### RT-3: 単一チェック時（`checkedSets.length === 1` だが `sets.length > 1`）の最新値マージ保証
- **内容**: 複数セット存在下で特定の1セットのみチェックを入れて生成した際、アクティブタブの選択状態に関わらず、画面で編集された最新パラメータが確実にそのチェック済みセットに反映されること。

---

## 6. フック結合テスト (`useGeneratePageState.test.tsx`)

単一フックのモックテストにとどまらず、`useGeneratePageState` を通したフック間の協調動作を検証する：
- **対象**: `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`
- **内容**:
  - `usePresetState` の `flushAutoSave` と `useGenerateAction` の `onBeforeGenerate` が正しく接続（wire-up）されていること。
  - パラメータ入力から即時生成ボタン押下までの一連の流れで、`queuePrompt` に最新パラメータが正しく渡ることを確認。


