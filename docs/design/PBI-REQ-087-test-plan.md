# PBI-REQ-087 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `pytest backend/tests/test_req_087.py -v`
- **期待値**: 全テストケースの PASS。脳内推論での代用は厳禁。

## 2. ツール主導監査 (Tool-Driven Audit)
- **API検証**: `openapi_parser.py` を使用し、エンドポイントの差分を確認すること。
- **コード監査**: `local_model_adapter.py arch-audit .` を実行し、設計整合性の客観的証明を得ること。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173/` (フロントエンド起動URL)
- **操作手順**:
  1. Generate ページのパラメータパネルで、LoRA のセレクトボックスに `description`（設定済みのもの）が表示されること、未設定のものはパスで表示されることを確認する。
  2. History ページを開き、LoRA フィルタ（`id="history-lora-filter"`）の選択肢が `description || model_name` となっていることを確認する。
  3. Tags ページを開き、タグセット詳細で複数のサブセット（名称＋タグ）を追加・編集・削除し、Generate ページでそれを選択して適用できることを確認する。
  4. カバーサムネイル設定UIで画像をアップロードし、ドラッグでのクロップ位置移動やスケール調整を行い、保存されたサムネイルが指定通りに切り抜かれていることを確認する。
  5. LoRAs / Tags ページの詳細モーダルを開き、「Edit」ボタンからモーダル内でそのまま編集状態へ切り替わり、保存またはキャンセルで元の詳細ビューに戻ることを確認する。
- **必須エビデンス**:
  - `.gemini/browser_verification_lora_desc.png` (LoRA desc 表示)
  - `.gemini/browser_verification_tag_subsets.png` (タグサブセット管理と適用)
  - `.gemini/browser_verification_cropper.png` (クロップ機能)
  - `.gemini/browser_verification_integrated_modal.png` (詳細/編集統合モーダル)
