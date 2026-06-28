# PBI-REQ-097 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `.venv\Scripts\python -m pytest tests/test_workflows_copy.py`
- **期待値**: 追加されたテストケースを含むすべてのテストが正常に PASS すること。

### 実行予定のテストケース:
1. `test_copy_empty_workflow`: mappings/presetsを持たないワークフローのコピー成功検証
2. `test_update_workflow_name_conflict`: 更新時に他ワークフロー名との重複による 409 Conflict エラー検証
3. `test_create_workflow_invalid_json_body`: 作成時に不正な json_body を渡した際の 422 エラー検証
4. `test_update_workflow_invalid_json_body`: 更新時に不正な json_body を渡した際の 422 エラー検証

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py` による監査（実装後の verification フェーズで実行）

## 3. 手動・ブラウザ検証 (Browser Agent Verification)
本要件は純粋なバックエンド API ユニットテストの追加であるため、フロントエンド画面の変更はなく、ブラウザ検証の必要はありません。
そのため自動テスト（`pytest`）のみで完全に検証を行います。
