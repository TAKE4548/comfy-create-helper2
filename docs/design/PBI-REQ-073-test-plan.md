# PBI-REQ-073 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `pytest tests/test_xxx.py` (適宜修正)
- **期待値**: 全テストケースの PASS。脳内推論での代用は厳禁。

## 2. ツール主導監査 (Tool-Driven Audit)
- **API検証**: `openapi_parser.py` を使用し、エンドポイントの差分を確認すること。
- **コード監査**: `local_model_adapter.py arch-audit .` を実行し、設計整合性の客観的証明を得ること。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:8000/docs`
- **操作手順**: [1. 〇〇をクリック, 2. △△を入力]
- **判定基準 (Assertion)**: [ステータスコード 200, レスポンスボディに期待する値が含まれること]
- **必須エビデンス**: スクリーンショットの保存パスを指定すること。
