# PBI-REQ-175 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1-1. フロントエンド ユニットテスト
- **コマンド**: `npm test -- SpeechBubbleControls.test.tsx --run`
- **対象ファイル**: `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx`
- **期待値**:
  - `opens overwrite preset modal when overwrite icon is clicked`: 💾 アイコンクリックでモーダルが開き、プリセット名とテキスト包含チェックボックスが表示されること。
  - `updates preset name and retains text setting via overwrite modal`: モーダル内で名前を変更して上書き保存した際、変更後名称で `update` API が呼び出されること。
  - `enables text inclusion via overwrite modal on preset without text`: テキスト未設定のプリセットに対してモーダルで「テキストを含める」をチェックして保存した際、`text: '現在のテキスト'` で `update` API が呼び出されること。
  - `clears text via overwrite modal when unchecking text inclusion`: テキスト設定済みプリセットに対してモーダルで「テキストを含める」のチェックを外して保存した際、`text: null` で `update` API が呼び出されること。
  - `cancels overwrite preset modal without calling update api`: キャンセルボタン押下時にモーダルが閉じ、`update` API が呼ばれないこと。
  - 全テストケースが 100% PASS すること。

### 1-2. フロントエンド全体回帰テスト
- **コマンド**: `npm test -- --run`
- **期待値**: 334 tests 100% PASS

## 2. ツール主導監査 (Tool-Driven Audit)
- **タスク監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-175.md`
- **QA監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/PBI-REQ-175-test-plan.md`
- **セキュリティ監査**: `python ${GLOBAL_SCRIPTS}\pre_commit_linter.py`
