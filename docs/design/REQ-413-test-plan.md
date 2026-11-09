# REQ-413 実行可能テスト計画 (Executable Test Plan)

## 1. 自動テスト Baseline 検証 (CLI Verification 3-Gate)

### Gate 1: 静的型チェック (Static Typecheck Baseline)
- **コマンド**: `cd frontend; npm run typecheck`
- **期待値**: 型エラー 0 件 (Exit code 0)。`SlotDefinition` の `variantEnabled` 追加および各フックでの型整合性を検証。

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: `cd frontend; npm test` (局所実行: `cd frontend; npx vitest run src/utils/__tests__/wiringStageGroups.test.ts src/utils/__tests__/mappingStageGroups.test.ts`)
- **期待値**: 全テスト PASS (Exit code 0)。AC-1〜AC-5 の全受入基準を網羅。

### Gate 3: シナリオ・境界値・Red Team 検証
- **コマンド**: `cd frontend; npx vitest run src/utils/__tests__/wiringStageGroups.test.ts src/utils/__tests__/mappingStageGroups.test.ts -t "REQ-413"`
- **期待値**: 境界値ケース（全バリアント無効、スロット定義未指定、未知のvariant_id、レガシーマッピングfallback）および PBT 特性テストが PASS。

---

## 2. 階層別テスト設計 (Execution Tier & Case Hierarchy)

| Tier | レベル | 対象モジュール | 切断・モック方針 | 主な検証内容 |
|---|---|---|---|---|
| **Tier 1 (Unit)** | 単体ロジック | `workflowMappingState.ts` (`generationWorkflow`) | 外部I/O完全排除（純粋関数テスト） | `variantEnabled: false` のスロットが `mappings` から除外されること (AC-1, AC-2)。`variantEnabled: true` かつ slot state が非 false のマッピングが保持されること (AC-3)。レガシー形式（variant_id=null）の除外安全動作 (AC-4)。PBT による順序保持と決定性検証。 |
| **Tier 1 (Unit)** | 単体ロジック | `mappingStageGroups.ts` (`groupMappingsByStage`, `buildParamSyncCandidates`) | 外部I/O完全排除（純粋関数テスト） | `variant.is_enabled: false` のマッピングがステージグループおよび ParamSync 候補から除外されること (AC-5)。 |
| **Tier 2 (Integration)** | フック結合 | `useWorkflowManagement.ts` | React Query / Hook 結合 (APIレスポンスインメモリ) | `mappingMasters` の `is_enabled` が `slotDefinitions` へ伝播し、`workflow.mappings` および `paramMappings` から無効バリアントが除外されること (AC-1, AC-2)。 |
| **Tier 3 (Scenario/Boundary)** | 境界・異常系 | `wiringStageGroups.test.ts`, `mappingStageGroups.test.ts` | インメモリ極値・異常データ注入 | 未知のバリアントID、レガシーマッピング（variant_id=null）、全バリアント無効、空スロット定義におけるフォールバック安全性 (AC-3, AC-4, AC-5)。 |

---

## 3. AC 対照テスト配置計画 (Test Placement & Case Mapping) [W-DD-PLACE]

禁止事項: チケット番号付き新規テストファイルの作成は厳禁。既存のコロケーションテストファイルを拡張する。

| AC ID | 対象ファイル | ケース名 (Tag) | レイヤー | 検証コマンド |
|---|---|---|---|---|
| `AC-1` | `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | `[REQ-413/AC-1] excludes mappings whose slot definition has variantEnabled false from generated workflow mappings` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/wiringStageGroups.test.ts -t "REQ-413/AC-1"` |
| `AC-2` | `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | `[REQ-413/AC-2] ensures disabled variant mappings are omitted from generated mappings so params are not injected` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/wiringStageGroups.test.ts -t "REQ-413/AC-2"` |
| `AC-3` | `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | `[REQ-413/AC-3] preserves mappings when variantEnabled is true and slot state is not false` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/wiringStageGroups.test.ts -t "REQ-413/AC-3"` |
| `AC-4` | `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | `[REQ-413/AC-4] safely excludes legacy mappings (variant_id=null) when master slot definition has variantEnabled false` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/wiringStageGroups.test.ts -t "REQ-413/AC-4"` |
| `AC-5` | `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | `[REQ-413/AC-5] excludes disabled variants from stage groups and param sync candidates` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/mappingStageGroups.test.ts -t "REQ-413/AC-5"` |

---

## 4. Seam Map 設計 [W-DD-SEAM]

1. **Integrated (本物のコード)**:
   - `workflowMappingState.ts: generationWorkflow`
   - `mappingStageGroups.ts: groupMappingsByStage`, `buildParamSyncCandidates`
   - `useWorkflowManagement.ts: slotDefinitions` メモ化生成
2. **Severed (切断対象)**:
   - バックエンド HTTP 通信 / WebSocket
   - SQLite DB 永続化層（`workflow_mappings` テーブル）
3. **Mock Level**:
   - 内部ビジネスロジック（`slotKey`, `mappingSlotKey`, `isV2` 等）のモックは厳禁。
   - 純粋関数テストにはプレーンな JavaScript オブジェクト（POJO）をフィクスチャとして入力し、戻り値の不変性・同一性をアサートする。
4. **PBT (Property-Based Testing)**:
   - `fast-check` を使用したプロパティテストを `wiringStageGroups.test.ts` に配置：
     - ランダムな長さ（0〜30件）の mappings とランダムな enabled/disabled フラグを持つ slots を入力。
     - 期待不変条件: 戻り値の mappings に含まれるすべての mapping について、対応する slot の `variantEnabled` が `false` ではないこと、かつ元の順序が完全に保持されていること。
5. **Fault Injection**:
   - 異常系・極値ケースを網羅（Red Teaming 参照）。

---

## 5. シナリオ検証 & Red Teaming (正常系・異常系・境界値) [Gate 3 Baseline]

### シナリオ S-1 (AC-1 / AC-2): マスタ無効バリアントの除外と生成注入遮断
- **Given**: マスタで `is_enabled = false`（通常/Main無効）のバリアントマッピングを含むワークフロー。
- **When**: `generationWorkflow(raw, slotDefinitions)` を実行したとき。
- **Then**: 戻り値 `output.mappings` に当該バリアントが含まれず、`useWorkflowManagement` の `paramMappings` および ComfyUI 注入配列から除外されること。

### シナリオ S-2 (AC-3): マスタ有効バリアントの正常保持
- **Given**: マスタで `is_enabled = true` のバリアントマッピングを含むワークフロー（`mapping_slot_states` は未設定または `true`）。
- **When**: `generationWorkflow(raw, slotDefinitions)` を実行したとき。
- **Then**: 当該マッピングが `output.mappings` に完全に保持され、`paramMappings` に正常表示されること。

### シナリオ S-3 (AC-4): レガシー形式マッピングの安全除外
- **Given**: `variant_id == null` のレガシーマッピングを持つワークフローで、マスタ側の対応バリアントが `is_enabled = false` の場合。
- **When**: `generationWorkflow(raw, slotDefinitions)` を実行したとき。
- **Then**: 当該レガシーマッピングが安全に `output.mappings` から除外されること。

### シナリオ S-4 (AC-5): ステージグループおよび ParamSync 候補からの除外
- **Given**: マスタで `is_enabled = false` のバリアントマッピング。
- **When**: `groupMappingsByStage` および `buildParamSyncCandidates` を呼び出したとき。
- **Then**: 当該マッピングがステージグループ表示および ParamSync 候補リストに含まれないこと。

### シナリオ RT-1: 全バリアント無効の極値
- **入力**: ワークフローに 5 件のマッピングが存在し、対応するすべてのスロット定義で `variantEnabled: false` が設定されている。
- **期待結果**: `generationWorkflow` が空配列 `mappings: []` を返し、例外をスローせず、`rawWorkflow` を破壊しないこと。

### シナリオ RT-2: 未知の variant_id（孤立マッピング）の安全性
- **入力**: ワークフローのマッピングにスロット定義一覧 `slots` に存在しない `variant_id: 9999` が含まれている。
- **期待結果**: `variantEnabled` の判定でエラー（`TypeError: cannot read property of undefined` 等）にならず、ワークフローの `mapping_slot_states` に基づいて安全に処理されること。

### シナリオ RT-3: 空スロット定義における後方互換性フォールバック
- **入力**: `generationWorkflow(raw)` のように第 2 引数 `slots` を省略、または空配列 `[]` を渡す。
- **期待結果**: 既存の `mapping_slot_states` のみに基づくフィルタリングが 100% 動作し、既存テストケースとの完全な互換性を維持すること。

---

## 6. リスク評価 & Full-Suite Fallback トリガー分析

### 6.1 リスク分類 (Risk Classification)
- **判定**: `low` (UI / Frontend 純粋関数およびフックのステートフィルタリング)
- **根拠**:
  - バックエンドの DB スキーマ、マイグレーション、API エンドポイント契約、認証・権限、共有インフラへの変更を一切含まない。
  - 変更はフロントエンドの 2 つの純粋関数ファイル（`workflowMappingState.ts`, `mappingStageGroups.ts`）と 1 つのフック（`useWorkflowManagement.ts`）に局所化されている。
  - 既存の `workflow_mappings` DB レコードは破壊せず維持されるため、データ消失リスクがない。

### 6.2 Full-Suite Fallback トリガー (強制全スイート実行条件)
以下の条件が 1 つでも発生した場合、直ちにフォールバックが発動し、フロントエンドおよびバックエンドの全テストスイート（`Gate 2: Full Suite`）を逐次再実行する：
1. バックエンドコード、SQL、またはマイグレーションファイルへの偶発的編集が検知された場合。
2. `package.json` や `tsconfig.json` 等のインフラ・依存関係設定が変更された場合。
3. テスト実行時にコレクションの不一致、想定外のスキップ（skip）、または型チェックエラーが発生した場合。
4. 単体テストにおいて内部ロジックのモック汚染や偽陽性アサーションが検出された場合。

---

## 7. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_HELPERS}\local_model_adapter.py --context-length 32768 qa-audit --audit-kind qa_evidence --audit-package <PKG_JSON> docs/design/REQ-413-test-plan.md`
- **アンロード**: `python ${GLOBAL_HELPERS}\local_model_adapter.py unload`