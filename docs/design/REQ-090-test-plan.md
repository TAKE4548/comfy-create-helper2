# REQ-090-test-plan: useWorkflowParams.tsのパース・分割テスト計画書

## テスト手法
Vitest を使用したフロントエンドのユニットテストとして検証を行います。

## 検証対象ファイル
- ロジック： `frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts`
- テスト： `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts`

## 実行コマンド
フロントエンドディレクトリ (`frontend`) 内で以下のコマンドを実行します。
```bash
npm run test
```

## テストケース定義

### 1. `extractGeneralParam`
- **Case 1**: `node.inputs` に指定された `paramName` (例: `seed`) が存在する場合、その値が文字列として取得できること。
- **Case 2**: `node.inputs` に指定された `paramName` は存在しないが、`value` が存在する場合、`value` の値が取得できること。
- **Case 3**: `node` が `null` や `inputs` 未定義、あるいは該当する入力値がない場合、空文字 `""` が返ること。

### 2. `extractLoraStackParams`
- **Case 1 (EasyLoraStack)**:
  - `num_loras: 2` が指定されているノードにおいて、`lora_1_name`, `lora_1_strength`, `lora_1_model_strength`, `lora_1_clip_strength` から値が抽出され、それぞれ正しいマップキー（`${role}_lora_name_1`, `${role}_lora_wt_1`, `${role}_model_str_1`, `${role}_clip_str_1`）に格納されること。
- **Case 2 (StandardLoraStack)**:
  - `lora_count: 1` が指定されているノードにおいて、`lora_name_1`, `lora_wt_1`, `model_str_1`, `clip_str_1` から値が抽出され、正しいマップキーに格納されること。
- **Case 3 (Auto Detection)**:
  - `num_loras` や `lora_count` が存在しないが、`lora_2_name` や `lora_name_3` が定義されている場合、最大インデックス値（例: 3）が自動で `loraCount` になること。
- **Case 4 (Edge Case)**:
  - `node` や `inputs` が存在しない、あるいは `loraCount` が `0` の場合、`${role}_lora_count: "0"` のみが返り、個別の LoRA スロットは格納されないこと。

### 3. `getInitialParams`
- **Case 1 (Integration)**:
  - 複数のマッピング (LoRAスタックと一般パラメータ) を含む `Workflow` を入力した際、すべてのマッピングが適切に処理されて1つのマージされたパラメータマップが返ることを検証すること。
