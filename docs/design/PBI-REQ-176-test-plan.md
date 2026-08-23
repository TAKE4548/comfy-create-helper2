# PBI-REQ-176 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1-1. フロントエンド ユニットテスト
- **コマンド**: `npm test -- SpeechBubbleControls.test.tsx --run`
- **対象ファイル**: `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx`
- **期待値**:
  - `renders presets separated into with-text and without-text sections`: テキスト付きとスタイル専用のセクションに分かれてプリセットが表示されること。
  - `collapses and expands preset sections on toggle click`: セクションの開閉ボタンクリックでチップ一覧の表示/非表示が切り替わること。
  - `sorts presets by name (asc/desc) and created date (asc/desc)`: ソート選択に応じてプリセットの表示順序が変更されること（デフォルトは名前昇順）。
  - `filters presets by free text search query`: 検索ボックスに入力したキーワードでプリセット名がインクリメンタルに絞り込まれること。
  - `filters presets by orientation (all/vertical/horizontal)`: 縦書き/横書きボタンにより該当する向きのプリセットのみが表示されること。
  - `persists filter, sort, and collapse states to localStorage and restores them`: 操作した設定が `localStorage` に保存され、コンポーネント初期化時に正しく復元されること。
  - 全テストケースが 100% PASS すること。

### 1-2. フロントエンド全体回帰テスト
- **コマンド**: `npm test -- --run`
- **期待値**: 全テスト 100% PASS

## 2. ツール主導監査 (Tool-Driven Audit)
- **タスク監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-176.md`
- **QA監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/PBI-REQ-176-test-plan.md`
- **セキュリティ監査**: `python ${GLOBAL_SCRIPTS}\pre_commit_linter.py`
