# PBI-REQ-052 実行可能テスト計画: Dynamic LoRA Stack (easyLoraStack) 対応

## 1. 自動テスト (CLI Verification)
- **コマンド**: `cd frontend && npm run test`
- **期待値**: `useGenerateAction.test.ts` に追加する `lora_stack` ペイロード生成サニタイズテストを含む、すべてのテストケースが PASS し、コンソール出力に `FAIL` や未処理のエラーログが含まれていないこと。脳内推論での代用は厳禁。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py sync-docs` を実行し、エラーログや異常終了が発生しないことを確認する。

## 3. ブラウザ手動検証 (Browser Verification Scenario)

### 前提条件 (Prerequisites Setup)
1. `lora_stack` 入力タイプ（`input_type: "lora_stack"`）を持つノードをマッピングしたテスト用ワークフロー `wf_lora_stack_test` を登録または用意する。
2. テスト用のLoRAファイルおよびDBメタデータを準備する。
   - `test_registered.safetensors` (DB登録済み、`description="Registered Model"`)
   - `test_unregistered.safetensors` (DB未登録、説明文なし)

---

### TC-01: LoRAスロットの動的追加
- **手順**:
  1. ワークフロー選択から `wf_lora_stack_test` を選択する。
  2. パラメータパネル内、LoRAスタックエディタの「+ Add LoRA」ボタン（`#add-lora-btn`）をクリックする。
- **判定基準 (Assertion)**:
  - 画面上にスロット行（クラス名 `.lora-slot-row[data-index="1"]`）が表示されること。
  - Zustand状態 `paramValues['Lora_Stack_lora_count']` が `"1"` に更新されていること。

### TC-02: モデル表示名の切り替え（登録情報優先表示）
- **手順**:
  1. 追加した最初のLoRAスロットのモデル選択セレクトボックス（`.lora-slot-row[data-index="1"] select`）を開く。
  2. 選択肢から `test_registered.safetensors` を選択する。
  3. 選択肢から `test_unregistered.safetensors` を選択する。
- **判定基準 (Assertion)**:
  - ドロップダウンの表示名（optionのテキスト）に `Registered Model` が表示されていること。
  - 未登録のモデル選択肢には、相対パス名である `test_unregistered.safetensors` がそのまま表示されていること。

### TC-03: スロット削除とインデックスの繰り上げ処理
- **手順**:
  1. さらに「+ Add LoRA」を2回クリックし、合計3つのスロットを追加する。
  2. 以下の値を設定する。
     - スロット1: `test_registered.safetensors` (ウェイト: `0.8`)
     - スロット2: `test_unregistered.safetensors` (ウェイト: `0.5`)
     - スロット3: `test_registered.safetensors` (ウェイト: `0.9`)
  3. 2番目のスロット of 削除ボタン（`.lora-slot-row[data-index="2"] .delete-slot-btn`）をクリックする。
- **判定基準 (Assertion)**:
  - スロット行が2つになり、スロット数（`lora_count`）が `"2"` に更新されていること。
  - 新しい2番目のスロット（`.lora-slot-row[data-index="2"]`）のモデル選択値が `test_registered.safetensors` (ウェイト: `0.9`) にシフトしていること。
  - ストア内の `paramValues` から `Lora_Stack_lora_name_3` などのキーが完全に削除されていること。

### TC-04: 生成ペイロードのサニタイズ（残骸削除）
- **手順**:
  1. スロット数を1に削減（1番目のスロットのみ残す）する。
  2. ChromeのDevToolsを開き、「Network」タブで `ws` 接続または `prompt` リクエストを監視する。
  3. 「Generate Batch」をクリックする。
- **判定基準 (Assertion)**:
  - 送信されたComfyUI実行ペイロードJSON内の該当ノードの `inputs` にて：
    - `lora_count` が `1` に設定されていること。
    - `lora_name_1` は設定値、`lora_name_2` および `lora_name_3` などのキーが完全に `inputs` オブジェクト内から削除されていること。（送信されたJSONリクエストボディをコピーし、`lora_name_2` や `lora_wt_2` などのキーが存在しないことを確認する。）

### TC-05: 履歴プレビューでのグループ表示
- **手順**:
  1. 生成完了後、履歴ストリップの最新画像をクリックして拡大モーダルを開く。
  2. 情報パネル内のパラメータおよび適用アセット一覧を確認する。
- **判定基準 (Assertion)**:
  - 情報パネル内のパラメータデータから、`lora_name_X` などの個別フラットキーがそのままむき出しで表示されるのではなく、モーダル内に新設された「LoRA Stack (easyLoraStack)」セクションとして統合グループ化して表示されていること。
  - 表示されているモデル名に `Registered Model` が適用されていること。

### TC-06: 無効なデータへの耐性検証
- **手順**:
  1. `lora_stack` スロットの入力欄に、空欄のまま、または無効な数値（例: ウェイトに `abc` などの文字）を一時的に入力する。
  2. 「Generate Batch」をクリックする。
- **判定基準 (Assertion)**:
  - アプリケーションが完全にクラッシュ（白画面/黒画面）せず、コンソールエラーやバリデーションメッセージが表示され、動作が正常に維持されること。

### TC-07: LoRAスロットの上限（最大10件）検証
- **手順**:
  1. `wf_lora_stack_test` を選択し、「+ Add LoRA」ボタン（`#add-lora-btn`）を連続してクリックする。
  2. スロットが10件登録された状態で、さらに追加しようとする。
- **判定基準 (Assertion)**:
  - スロット行が10件（`.lora-slot-row[data-index="10"]`）までしか作成されないこと。
  - スロット数が10件に達した際、「+ Add LoRA」ボタンが非活性化（disabled）されるか、クリックしてもスロット数が増えないこと。

