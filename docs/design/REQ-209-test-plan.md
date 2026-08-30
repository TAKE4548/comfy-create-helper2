# Test Plan: REQ-209 ワークフローパラメータ解析・注入（LoRAスタック/バイパス）ロジックの共通化と二重実装排除

## 1. 概要 (Test Overview)

本テスト計画は、REQ-209において実施するワークフローパラメータ解析・注入ロジックの純粋関数モジュール（`workflowParamInjector.ts`）への一元化、`useWorkflowParams.ts` / `useGenerateAction.ts` からの重複実装排除、および `bypassUtils.ts` の推移的リンク解決アルゴリズムによる安全性強化を機械的・定量的に検証するものである。

---

## 2. 自動テスト計画 (Automated Tests)

### 2.1 新規単体テスト (`frontend/src/utils/__tests__/workflowParamInjector.test.ts`)
実行コマンド:
```bash
cd frontend && npm test -- src/utils/__tests__/workflowParamInjector.test.ts
```

定量合否基準:
- プロセス終了コード: `0` (エラーなし)
- テストファイル数: 1 / アサーション数: 13 件全件 PASS
- 実行時間: ≤ 3.0s

テストケースと検証内容:
1. `extractGeneralParam`:
   - `node.inputs[paramName]` 存在時: 厳密に文字列型で該当値を返却（期待値: `'testVal'`）。
   - `node.inputs['value']` 存在時: フォールバック値を返却（期待値: `'fallbackVal'`）。
   - node または inputs が null/undefined の場合: 空文字 `''` を返却。
2. `extractLoraStackParams`:
   - `easy loraStack` 形式: `num_loras: 2` からスロット1〜2の各キー（`name`, `wt`, `model_str`, `clip_str`）を抽出し、正確に一致する辞書オブジェクトを返却。
   - 標準 `loraStack` 形式: `lora_count: 1` からスロット1の各キーを抽出し、正確に一致する辞書オブジェクトを返却。
   - カウント未定義時: `lora_name_3` 等の最大キー番号 `3` を検出し、`lora_count = '3'` を設定。
3. `getInitialParams`:
   - ワークフローマッピング情報（一般パラメータ、LoRAスタック等）から完全な初期パラメータ辞書を生成し、期待オブジェクトと一致。
4. `injectLoraStackParams`:
   - `easy loraStack`: `num_loras = 1` 指定時、スロット1に値をセットし、スロット2〜10の既存キーを `'None'` / `1.0` に初期化、標準キー（`lora_count`, `lora_name_1` 等）を `delete` して `undefined` にすること。
   - 標準 `loraStack`: `lora_count = 2` 指定時、スロット1〜2に値をセットし、スロット3以降の余剰キーおよびeasyキー（`num_loras` 等）を `delete` して `undefined` にすること。
5. `injectGeneralParam`:
   - `int`: `parseInt('30') === 30`
   - `float`: `parseFloat('8.5') === 8.5`
   - `boolean`: `'true' === true`
   - `string`: `'masterpiece, best quality'`
   - ノード inputs に `paramName` または `'value'` として厳密に代入。
6. `injectWorkflowParams`:
   - マッピング定義に従い全パラメータが注入されたワークフローJSONを返却（元の `workflow.json_body` は一切変更されないイミュータブル性を保証）。
   - `seedOptions` 指定時:
     - `fixed`: `seed: 1000, index: 2` -> `inputs.seed === 1002`
     - `random`: `0 <= inputs.seed <= 2^32 - 1`

### 2.2 既存テスト回帰検証
実行コマンド:
```bash
cd frontend && npm test -- src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/utils/__tests__/bypassUtils.test.ts
```

定量合否基準:
- プロセス終了コード: `0`
- 全 3 テストファイル（計 35 テストケース）が 100% PASS（失敗 0、スキップ 0）。

### 2.3 バイパステスト拡充 (`frontend/src/utils/__tests__/bypassUtils.test.ts`)
実行コマンド:
```bash
cd frontend && npm test -- src/utils/__tests__/bypassUtils.test.ts
```

定量合否基準:
- プロセス終了コード: `0`
- 6 テストケース全件 PASS。

特定シナリオ検証:
1. `should successfully bypass multiple nodes in reverse order without link breakage`:
   - 4ノード連鎖（A -> B -> C -> D）において、`bypassedNodeIds: ["4", "3"]` の逆順指定でも D の入力が A の出力 `["5", 0]` に再配線され、ノード 3 と 4 が削除されること。
2. `should handle cycle connections gracefully by severing looped links`:
   - ノード 3 と 4 が相互参照する循環グラフにおいて、両者をバイパスした際に無限ループに陥らず、下流ノード 6 の入力スロットが `delete`（切断）されて `undefined` になること。
3. `should not corrupt or delete required input connections if nodeInfo is missing`:
   - スキーマ未定義のノード 10 が指定された場合、ノード 10 の削除・再配線をスキップし、ノード 11 の接続 `["10", 1]` が維持されること。

### 2.4 フロントエンド全単体テスト実行 (全件スキャン)
実行コマンド:
```bash
cd frontend && npm test
```

定量合否基準:
- プロセス終了コード: `0`
- 全 40 テストファイル、468 テストケース全件 PASS。

---

## 3. 手動テスト・検証シナリオ (Manual Verification)

### シナリオ 1: LoRAスタック設定とデフォルトパラメータ保存
1. Generate 画面で LoRA スタックを含むワークフローを選択する。
2. LoRA スロットを追加・変更し、「Save as Default」を実行する。
3. 画面をリロード（または別ワークフロー切り替え後に再選択）し、保存された LoRA スタックパラメータが完全に復元されることを確認する。

### シナリオ 2: 単一生成およびバッチ生成（セット生成）の動作検証
1. プロンプトおよび LoRA パラメータを設定する。
2. 通常の「Generate Batch」を実行し、シード値およびパラメータが正常に ComfyUI に渡されて生成が完了することを確認する。
3. 複数セットのチェックを入れ「Generate Checked Sets」を実行し、各セットのパラメータとシード値が正しく注入されてキュー投入されることを確認する。

### シナリオ 3: バイパスプロファイルの有効化と生成
1. バイパスプロファイルを有効化し、生成を実行する。
2. 該当ノードがワークフローからバイパス（再配線）され、エラーなく ComfyUI で実行完了することを確認する。
