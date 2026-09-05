# PBI-REQ-173 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1-1. バックエンド API テスト
- **コマンド**: `cd backend && python -m pytest tests/test_speech_bubble_presets.py`
- **期待値**:
  - `test_create_duplicate_name_same_orientation_fails`: 同名・同 orientation で 400 エラーになること
  - `test_create_duplicate_name_different_orientation_succeeds`: 同名・異 orientation で 201 成功すること
  - 既存の全テストケースを含め、100% PASS すること

### 1-2. フロントエンド ユニットテスト
- **コマンド**: `cd frontend && npm test -- SpeechBubbleControls.test.tsx --run`
- **期待値**:
  - プリセットチップに `(縦)` / `(横)` が付与されて表示されること
  - 同名・異文字方向のプリセットが双方表示され、それぞれクリック時に正しい orientation が適用されること
  - 全テストケースが PASS すること

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード・設計監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-173-T1.md`
- **バックログ整合性監査**: `python ${GLOBAL_SCRIPTS}\backlog_linter.py`

