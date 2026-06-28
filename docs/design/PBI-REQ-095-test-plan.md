# PBI-REQ-095 実行可能テスト計画 (Revised)

## 1. 自動テスト (CLI Verification)
- **コマンド**: `pytest backend/tests/test_snapshots.py backend/tests/test_loras.py -v`
- **期待値 (Assertion)**:
  - テスト結果として `PASSED` が出力されること。
  - `FAILED` または `ERROR` が発生していないこと。
  - **脳内テスト禁止**: コマンド実行結果 (Exit Code 0) のみを正常終了の判定根拠とする。プロセス終了コード (Exit Code) が 0 でない場合、直ちに Fail と判定する。

### 実行予定 of テストケース:
1. `test_patch_snapshot_invalid_tag_set` (`backend/tests/test_snapshots.py`):
   - `PATCH /api/snapshots/{snapshot_id}` において、存在しない `tag_set_ids` を含む payload を送信し、レスポンスコードが `400` であること、および詳細情報に "TagSet with ID" が含まれていることを検証する。
2. `test_update_lora_not_found` (`backend/tests/test_loras.py`):
   - `PUT /api/loras/{lora_id}` において、存在しない `lora_id` を指定して呼び出し、レスポンスコードが `404` であること、およびレスポンス詳細が `"LoRA not found"` であることを検証する。
3. `test_delete_lora_not_found` (`backend/tests/test_loras.py`):
   - `DELETE /api/loras/{lora_id}` において、存在しない `lora_id` を指定して呼び出し、レスポンスコードが `404` であること、およびレスポンス詳細が `"LoRA not found"` であることを検証する。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py ${GLOBAL_ROOT}\brain\14b2da54-ce5e-4e49-827d-9f44c750dc7b`
- **判定基準**: プロセス終了コードが 0 であり、かつ `<status>PASS</status>` が出力されること。

## 3. 手動・ブラウザ検証 (Browser Agent Verification)
本要件はバックエンド API の例外エラー応答ユニットテストの追加であるため、フロントエンド UI の変更はなく、ブラウザ検証の必要はありません (N/A)。

## 4. 判定ロジック (Decision Logic)
- **Pass**: 上記すべての自動テストが Exit Code 0 で正常に終了し、全アサーションをクリアした場合。
- **Fail**: テストが 1 つでも失敗、または例外エラーが発生した場合。脳内推論による代替判定を行わないこと。
