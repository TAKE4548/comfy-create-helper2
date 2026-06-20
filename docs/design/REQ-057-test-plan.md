# REQ-057: LoRA Stack設定の反映不具合および表示名改善 テスト計画

## 1. 自動テスト (CLI Verification)
- **ビルド・静的検証**:
  ```bash
  cd frontend
  npm run build
  npm run lint
  ```
- **フロントエンドユニットテスト**:
  ```bash
  cd frontend
  npm test
  ```
- **期待値**: ビルド及びテストがエラーなしで正常終了すること。

## 2. 手動検証 (Quantitative Manual Verification)

- **検証用テストデータ**:
  以下のノード定義を含むComfyUIのワークフローJSONファイル（テスト用ワークフロー）を用意して検証に使用する。
  - **ノードA**: ID `"10"`, クラス `"LoraLoaderStack"`, `inputs` に `lora_count` はなく `lora_name_1`: `"lora_quality_v1.safetensors"`, `lora_wt_1`: `0.75`, `model_str_1`: `1.0`, `clip_str_1`: `1.0` が含まれる。カスタムタイトルとして `"品質LoRA"` を設定。
  - **ノードB**: ID `"11"`, クラス `"LoraLoaderStack"`, `inputs` に `lora_count`: `2`, `lora_name_1`: `"lora_character_v2.safetensors"`, `lora_wt_1`: `0.90`, `lora_name_2`: `"lora_outfit_v3.safetensors"`, `lora_wt_2`: `0.50` が含まれる。カスタムタイトルとして `"キャラクターLoRA"` を設定。
  - **ノードC**: ID `"12"`, クラス `"LoraLoaderStack"`, inputsの一部が配列（例: `["1", 0]` などの接続リンク）になっているスロットを含む。カスタムタイトルなし（デフォルト）。

- **検証手順と判定基準 (Assertions)**:
  1. 上記の検証用テストデータ（ワークフローJSON）を画面からアップロードする。
  2. **表示名検証**: パラメータパネルにおいて、LoRA Stackのタイトルが `"品質LoRA"`、`"キャラクターLoRA"`、およびデフォルトの `"LoRA Stack"` とそれぞれ**完全に一致（空白等なし）**して表示されていることを確認する。
  3. **データ復元検証 (ノードA/B)**: 
     - `"品質LoRA"` 内のスロットが1件存在し、モデル名が `"lora_quality_v1.safetensors"`、強度が `0.75` に復元されていることを確認する。
     - `"キャラクターLoRA"` 内のスロットが2件存在し、スロット1のモデル名が `"lora_character_v2.safetensors"`、強度が `0.90`、スロット2のモデル名が `"lora_outfit_v3.safetensors"`、強度が `0.50` にそれぞれ完全に復元されていることを確認する。
  4. **接続リンクフィルタ検証 (ノードC)**:
     - 接続リンク（他ノードからの配線を示す配列）になっている入力部について、値が空文字列 `""`（モデル名）やデフォルト値 `0.0` または `1.0` に適切にフォールバックされ、パースエラーによるUIクラッシュが発生しないことを確認する。
  5. **エラーログ監視**: ブラウザの開発者ツールコンソールにおいて、`"cannot be parsed"` や `"out of range"`、`"Failed to parse LoRA"` などの警告・エラーログが一切出力されていないことを確認する。

## 3. 境界値・異常系検証 (Negative Test Cases)

- **`lora_count` が 0 の場合**:
  - `lora_count` が `0` のノードが含まれるJSONをロードした際、エラーを吐かずにスロット数 `0` として適切に解釈されること。
- **不正な値を含む場合**:
  - 強度設定値が数値に変換できない文字列（例: `"abc"`）や `null` などの場合でも、フォールバック値が適用され、画面表示およびアプリケーションの動作が損なわれないこと。
