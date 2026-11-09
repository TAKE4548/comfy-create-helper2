# REQ-423 実行可能テスト計画 (Executable Test Plan)

## 0. ユーザー特別指示への回答とテスト拡充戦略 (Strategy & Special Directive)

### ユーザー特別指示 (User Special Directive)
> 「今後、デグレに気づけるようにテストの拡充も合わせて設計して」

### 戦略的テストマトリクス (4-Tier Regression Prevention Architecture)
単一の関数やコンポーネントのテストのみでは、将来のUIリファクタリングやAPI拡張時に `input_name` の伝播脱落を見逃すリスクが残る。このため、本計画では以下の4層（Unit, Component/Hook Integration, API Contract, E2E Generation Pipeline）にわたり、各層で独立して不整合・欠落を検知できる回帰防止テスト網を配備する。

```
[Tier 1: Unit Logic]
  ├── workflowParamInjector.test.ts (noise_seed/seed/value 注入 & 空時フォールバック)
  ├── generationRecord.test.ts (input_name 整合 & 記録キー検証)
  └── useMasterMappingRows.test.ts (スキャン結果/保存値からの input_name 抽出・ヒーリング)

[Tier 2: Component & Hook Integration]
  ├── WorkflowConnectionSection.test.tsx (対応付け設定保存・エクスポート時の input_name 保持)
  ├── WorkflowModalMultiStage.test.tsx (RescanModal での再スキャン・適用時の input_name 永続化)
  ├── useWorkflowManagement.seed.test.ts (ロール・マスタ更新時の input_name 欠落防止)
  ├── NodeRemapModal.test.tsx (DatasetStudio ノードリマップ保存時の input_name 保持)
  └── WorkflowAdaptiveStaging.test.tsx (AdaptiveWorkflowWiring での input_name 保持)

[Tier 3: Backend API Contract & Persistence]
  └── test_workflows.py (PUT / POST / duplicate における input_name の DB 永続化と往復取得)

[Tier 4: E2E Pipeline & Red Teaming]
  └── useGenerateAction.seed.test.ts (生成バッチ構築時に ComfyUI 送信グラフへ noise_seed が注入され、inputs.seed 誤生成が起きないことの E2E 検証)
```

---

## 1. 自動テスト Baseline 検証 (CLI Verification Commands)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **Frontend**:
  ```bash
  cd frontend; npm run typecheck
  ```
  - 期待値: Exit code 0, 型エラー 0 件
- **Backend**:
  ```bash
  mypy backend
  ```
  - 期待値: Exit code 0, 型エラー 0 件

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **Frontend Focused Suite**:
  ```bash
  cd frontend; npx vitest run src/utils/__tests__/workflowParamInjector.test.ts src/utils/__tests__/generationRecord.test.ts src/hooks/__tests__/useMasterMappingRows.test.ts src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx src/components/__tests__/WorkflowModalMultiStage.test.tsx src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts -t "REQ-423"
  ```
- **Backend Focused Suite**:
  ```bash
  backend\.venv\Scripts\python -m pytest backend/tests/integration/api/test_workflows.py -k "REQ-423"
  ```
- **Full Discovery (Baseline)**:
  - Frontend: `cd frontend; npm test`
  - Backend: `backend\.venv\Scripts\python -m pytest -n auto`
  - 期待値: 全テスト PASS (Exit code 0)。脳内推論代用・スキップ・deselectedでのごまかしは厳禁。

### Gate 3: End-to-End & シナリオ検証 (E2E Baseline)
- **E2E / Scenario Suite**:
  ```bash
  cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts -t "REQ-423"
  ```

---

## 2. 受入基準マッピング表 (AC-to-Case Mapping & Metadata)

| AC ID | 対象ファイル [W-DD-PLACE] | テストケース名 (Stable Runner ID) | 実行 Tier | 検証コマンド |
|---|---|---|---|---|
| **AC-1** | `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | `[REQ-423/AC-1] getMappings retains input_name from scan result for matched slots` | `unit` | `cd frontend; npx vitest run src/hooks/__tests__/useMasterMappingRows.test.ts -t "REQ-423/AC-1"` |
| **AC-1** | `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | `[REQ-423/AC-1] getMappings heals empty input_name from existing mappings using scan candidate` | `unit` | `cd frontend; npx vitest run src/hooks/__tests__/useMasterMappingRows.test.ts -t "REQ-423/AC-1"` |
| **AC-1** | `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | `[REQ-423/AC-1] RescanModal preserves input_name during initFromScan and passes it to getMappings` | `integration` | `cd frontend; npx vitest run src/components/__tests__/WorkflowModalMultiStage.test.tsx -t "REQ-423/AC-1"` |
| **AC-2** | `backend/tests/integration/api/test_workflows.py` | `test_req423_ac2_workflow_mappings_persist_and_roundtrip_input_name` | `integration` | `backend\.venv\Scripts\python -m pytest backend/tests/integration/api/test_workflows.py -k "REQ-423 and AC-2"` |
| **AC-2** | `backend/tests/integration/api/test_workflows.py` | `test_req423_ac2_workflow_duplicate_preserves_mapping_input_names` | `integration` | `backend\.venv\Scripts\python -m pytest backend/tests/integration/api/test_workflows.py -k "REQ-423 and AC-2"` |
| **AC-2** | `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx` | `[REQ-423/AC-2] saveWorkflowConfig retains input_name in mappings update payload` | `integration` | `cd frontend; npx vitest run src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx -t "REQ-423/AC-2"` |
| **AC-2** | `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | `[REQ-423/AC-2] handleUpdateMapping preserves input_name for unmodified and updated mappings` | `integration` | `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts -t "REQ-423/AC-2"` |
| **AC-2** | `frontend/src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx` | `[REQ-423/AC-2] handleSave preserves input_name and variant_id in remap payload` | `integration` | `cd frontend; npx vitest run src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx -t "REQ-423/AC-2"` |
| **AC-3** | `frontend/src/utils/__tests__/workflowParamInjector.test.ts` | `[REQ-423/AC-3] injectWorkflowParams injects seed into noise_seed with seedOptions and prevents bogus inputs.seed` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/workflowParamInjector.test.ts -t "REQ-423/AC-3"` |
| **AC-3** | `frontend/src/utils/__tests__/generationRecord.test.ts` | `[REQ-423/AC-3] buildGenerationRecord records noise_seed value matching ComfyUI injected graph` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/generationRecord.test.ts -t "REQ-423/AC-3"` |
| **AC-3** | `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts` | `[REQ-423/AC-3] generation action builds batch payload with noise_seed injected and no bogus seed key` | `e2e` | `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts -t "REQ-423/AC-3"` |
| **AC-4** | `frontend/src/utils/__tests__/workflowParamInjector.test.ts` | `[REQ-423/AC-4] falls back to node.inputs.noise_seed when seedNode.input_name is empty string` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/workflowParamInjector.test.ts -t "REQ-423/AC-4"` |
| **AC-4** | `frontend/src/utils/__tests__/workflowParamInjector.test.ts` | `[REQ-423/AC-4] falls back to node.inputs.value for primitive integer node when input_name is empty` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/workflowParamInjector.test.ts -t "REQ-423/AC-4"` |
| **AC-4** | `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts` | `[REQ-423/AC-4] legacy workflow with empty input_name successfully injects seed into noise_seed during generation` | `e2e` | `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts -t "REQ-423/AC-4"` |

---

## 3. テスト配置規約 (Test Placement Plan [W-DD-PLACE])

- **厳格禁止事項**: チケット番号を含む新規テストファイル（`*req423*`, `*pbi423*` 等）の作成は禁止。
- **配置先既存ファイル**:
  - `backend/tests/integration/api/test_workflows.py`
  - `frontend/src/utils/__tests__/workflowParamInjector.test.ts`
  - `frontend/src/utils/__tests__/generationRecord.test.ts`
  - `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts`
  - `frontend/src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx`
  - `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx`
  - `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx`
  - `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts`
  - `frontend/src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx`
  - `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts`
- **命名規則**:
  - 全ての `it(...)` および `def test_*` に `[REQ-423/AC-n]` プレフィックスを付与し、テストランナーのフィルタ（`-t "REQ-423/AC-n"` または `-k "REQ-423 and AC-n"`) で一意に実行可能とする。

---

## 4. 階層別テストシナリオ詳細

### 4.1 Tier 1: Unit Tests (コアロジック単体検証)
1. **`workflowParamInjector.test.ts`**:
   - `[REQ-423/AC-3]`: `seedNode.input_name = "noise_seed"` のサンプラーノードに対し、`seedOptions: { seedMode: 'fixed', seed: 424242 }` を指定して `injectWorkflowParams` を実行。
     - アサーション: `node.inputs.noise_seed === 424242` であること。`node.inputs.seed` が未定義（`undefined`）であること。
   - `[REQ-423/AC-4]`: `seedNode.input_name = ""`（空文字）の KSamplerAdvanced ノードに対し `injectWorkflowParams` を実行。
     - アサーション: `node.inputs` に存在する `noise_seed` が自動検知されてシード値が注入され、`node.inputs.seed` は生成されないこと。
   - `[REQ-423/AC-4]`: PrimitiveNode（`inputs: { value: 0 }`）に対し `input_name = ""` で実行。
     - アサーション: `node.inputs.value` にシード値が注入されること。
2. **`generationRecord.test.ts`**:
   - `[REQ-423/AC-3]`: 注入後グラフにおいて `noise_seed` に値が入っている場合、`buildGenerationRecord` が `Sampler_Seed` のメタ情報として `noise_seed` の値とキーを記録すること。
3. **`useMasterMappingRows.test.ts`**:
   - `[REQ-423/AC-1]`: `initFromScan` で `input_name: "noise_seed"` を持つスキャン結果を投入し、`getMappings` を呼び出した際、返却されるマッピング配列要素に `input_name: "noise_seed"` が含まれること。
   - `[REQ-423/AC-1]`: 既存保存マッピングの `input_name` が空文字列であっても、再スキャン結果の候補が持つ `input_name` で補完・修復されること。

### 4.2 Tier 2: Component & Integration Tests (UI・Hook結合検証)
1. **`WorkflowConnectionSection.test.tsx`**:
   - `[REQ-423/AC-2]`: ワークフロー接続設定画面で対応付けを保存する際、`workflowsApi.update` に送られる `mappings` 配列の全要素が `input_name` を保持していること。
2. **`WorkflowModalMultiStage.test.tsx` (RescanModal)**:
   - `[REQ-423/AC-1]`: 再スキャンモーダルを開いて「適用・保存」をクリックした際、`workflowsApi.update` の更新ペイロードに各スロットの `input_name` が含まれること。
3. **`useWorkflowManagement.seed.test.ts`**:
   - `[REQ-423/AC-2]`: 生成画面でマッピングの master_id を変更した際、`handleUpdateMapping` が他の既存マッピングおよび変更後マッピングの `input_name` を脱落させずに API に渡すこと。
4. **`NodeRemapModal.test.tsx`**:
   - `[REQ-423/AC-2]`: DatasetStudio で Positive/Negative ノードをリマップして保存した際、既存パラメータマッピングの `input_name` および `variant_id` が維持されること。
5. **`test_workflows.py` (Backend API)**:
   - `[REQ-423/AC-2]`: `PUT /api/workflows/{id}` で `input_name="noise_seed"` を送信し、200 OK 後に `GET /api/workflows/{id}` で取得したマッピングに `input_name="noise_seed"` が反映されていること。

### 4.3 Tier 3: Red Teaming & 境界値・異常系 (Gate 3 Baseline)
1. **完全空 `inputs` への注入防御**:
   - ノードの `inputs` が `{}` または `null` の場合でも、例外でクラッシュせず安全にフォールバックすること。
2. **存在しないキー指定**:
   - `input_name: "non_existent_key"` が指定されているがノードにそのキーが存在しない場合、フォールバック探索で実在キー（`noise_seed` 等）を解決すること。
3. **ランダムシードモード境界値**:
   - `seedMode: 'random'` の場合、0 から $2^{32}-1$ の範囲内の符号なし整数が正しく注入されること。
4. **複合スロット混在**:
   - 1つのワークフロー内に専用Seed（`input_type: 'seed'`）と汎用Seed（`role: 'Sampler_Seed'`）が共存する場合でも、相互に干渉せず各ノードの正しい `input_name` へ注入されること。

---

## 5. リスク評価および Mandatory Full-Suite Fallback 分析

- **変更リスク分類**: **Low**
  - DBスキーマの変更なし（マイグレーション追加なし）。
  - 公開 REST API エンドポイントの追加・削除・変更なし。
  - 外部依存パッケージの追加・更新なし。
- **Mandatory Full-Suite Fallback トリガー (OR条件)**:
  - 以下のいずれか1つでも発生した場合は、直ちに V2 局所検証を破棄し、**全テストスイート実行（V1 Baseline: Gate 1 + Gate 2 全件 + Gate 3）** へフォールバックする：
    1. `backend/app/models.py` または `migrations/` 配下のファイルが変更された場合。
    2. 既存のワークフロースキャンまたは生成APIの戻り値型定義に破壊的変更が生じた場合。
    3. テストコレクションで予期しない skip や deselected が発生した場合。
    4. 単体テストまたは型チェックで未解決のエラーが残存した場合。

