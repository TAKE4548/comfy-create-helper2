# PBI-REQ-141 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm test -- useGenerateAction` (in `frontend/`)
- **期待値**: 全テストケース（pending 即時描画、配列長維持、NG時のエラー通知と failed 反映）が PASS すること。
- **全フロントエンドテスト**: `npm test`

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-141.md`
- **ガバナンス検証**: `artifact_linter.py`

## 3. ブラウザ検証 (Browser Agent Verification / 手動検証)
- **対象URL**: `http://localhost:5173/`
- **操作手順**:
  1. 複数プリセット（2個以上）またはバッチサイズ 2 以上（合計ジョブ数 N >= 2）を選択。
  2. 「Generate Batch」をクリック。
  3. クリック直後、同一実行フレーム内で進捗バーが「Generating (0/N Complete)...」と表示され、投入ループ中も `activeBatch.length` が `N` から減少しないことを確認。
  4. （異常系）無効なワークフロー等の設定で実行した場合、「`[プリセット名] の X/Y 件目でエラーが発生しました`」（X, Y は整数）とトースト通知され、該当ジョブが `failed` としてキュー進捗が即座に補正されることを確認。
- **判定基準 (Assertion - 決定論的)**:
  - `handleGenerateSets` 呼び出し直後に `activeBatch.length === N` がセットされること
  - ループ中の各 `setActiveBatch` 呼び出しにおいて `activeBatch.length === N` が一定に保たれること（配列縮小の完全排除）
  - エラー発生時、`errorToast` に対象のプリセット名と `(X/Y)`（整数形式）が含まれ、該当インデックスのステータスが `failed` になること

