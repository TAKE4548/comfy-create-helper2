# PBI-REQ-090 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm run test` (または `npx vitest run`)
- **期待値**: `useWorkflowParams.test.ts` に追加したすべてのユニットテストケースが PASS すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py` を使用した監査（任意）。

## 3. テストケース詳細

### 3.1 `extractGeneralParam` の単体テスト
- **ケース 1**: `node.inputs` に指定された `paramName` が存在する場合、その値が文字列として取得できること。
- **ケース 2**: `node.inputs` に指定された `paramName` は存在しないが、`value` が存在する場合、`value` の値が取得できること。
- **ケース 3**: `node` が `null` や `inputs` 未定義、あるいは該当する入力値がない場合、空文字 `""` が返ること。

### 3.2 `extractLoraStackParams` の単体テスト
- **ケース 1 (EasyLoraStack)**:
  - `num_loras: 2` が指定されているノードにおいて、`lora_1_name` や `lora_1_strength` 等が抽出され、それぞれ正しいマップキー（`role` プレフィックス付き）に格納されること。
- **ケース 2 (StandardLoraStack)**:
  - `lora_count: 1` が指定されているノードにおいて、`lora_name_1` や `lora_wt_1` 等が抽出され、正しいマップキーに格納されること。
- **ケース 3 (Auto Detection)**:
  - `num_loras` や `lora_count` が存在しないが、`lora_2_name` や `lora_name_3` が定義されている場合、最大インデックス値（3）が自動で `loraCount` になること。
- **ケース 4 (Edge Case)**:
  - `node` や `inputs` が存在しない、あるいは `loraCount` が `0` の場合、`lora_count: "0"` のみが返ること。

### 3.3 `getInitialParams` の統合テスト
- LoRAスタックと一般パラメータの双方が混在するワークフローを正しくパースできること。
