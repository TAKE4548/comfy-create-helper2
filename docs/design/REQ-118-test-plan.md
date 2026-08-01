# REQ-118: テスト計画書 (Test Plan)

## 1. 検証目的
ワークフロー複製処理において、ソースワークフローのバイパスプロファイルが新ワークフローへ正確に複製されることを自動テストで検証する。

## 2. 自動テスト項目 (`backend/tests/test_workflows.py`)

### テストケース: `test_copy_workflow_with_bypass_profiles`
1. **事前条件**:
   - ワークフローAを作成
   - ワークフローAに対して `BypassProfile`（例: `name="Profile 1"`, `bypassed_node_ids='["10", "20"]'`, `is_enabled=True`）を DB に登録
2. **実行手順**:
   - `POST /api/workflows/{workflow_a.id}/copy` (`{"name": "Copied Workflow"}`) を呼び出す
3. **検証項目**:
   - ステータスコードが `201 Created` であること
   - コピーされた新ワークフローのIDで `GET /api/workflows/{new_wf_id}/bypass-profiles` を取得し、要素数が1であること
   - 取得されたバイパスプロファイルの `name` が `"Profile 1"`、`bypassed_node_ids` が `["10", "20"]`、`is_enabled` が `True` であること

## 3. テスト実行コマンド
```bash
pytest backend/tests/test_workflows.py -k test_copy_workflow
```
