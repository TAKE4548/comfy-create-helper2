# PBI-REQ-098 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `.venv\Scripts\python -m pytest tests/test_loras.py`
- **期待値**: 追加されたテストケースを含むすべてのテストが正常に PASS すること。

### 実行予定のテストケース:
1. `test_reorder_loras_empty`: `ordered_ids` が空配列の場合に `204 No Content` を返すことの検証 (AC-1)
2. `test_reorder_loras_non_existent_id`: 存在しない ID を渡した場合に DB 更新で例外が発生せず `204 No Content` を返すことの検証 (AC-2)
3. `test_reorder_loras_duplicate_id`: 重複した ID を渡した場合に DB 更新で例外が発生せず `204 No Content` を返すことの検証 (AC-2)
4. `test_reorder_loras_db_integrity`: 無効なリクエストや一部無効な ID を含むリクエストの後でも、存在する LoRA の `sort_order` のみが正しく更新され、かつ他のフィールドや DB 整合性が保たれることの検証 (AC-3)

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py` による監査（実装後の verification フェーズで実行）

## 3. 手動・ブラウザ検証 (Browser Agent Verification)
本要件は純粋なバックエンド API ユニットテストの追加であるため、フロントエンド画面の変更はなく、ブラウザ検証の必要はありません。
そのため自動テスト（`pytest`）のみで完全に検証を行います。
