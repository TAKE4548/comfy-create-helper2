# PBI-REQ-027 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**:
  ```bash
  cd frontend
  npx vitest run --reporter=verbose src/components/TagChipEditor/__tests__/
  ```
- **判定基準 (Assertion)**:
  - 実行したすべてのテスト（`useChipParser.test.ts`, `useChipHistory.test.ts`, `TagChip.test.tsx`, `TagInput.test.tsx`, `TagChipEditor.test.tsx`）が完了し、Exit code が `0` であること。
  - テストの失敗数（failed）が `0`、スキップ数（skipped）が `0` であること。
  - `npx vitest run --coverage` を実行した際、カバレッジ結果が正常に出力されること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **設計整合性監査**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-027.md
  ```
  - **期待値**: 出力結果で致命的な整合性エラーや不足シンボルの指摘がないこと。
- **アーティファクト検証**:
  ```bash
  python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog/task/active
  ```
  - **判定基準**: Linter の検証ステータスが `<status>PASS</status>` であり、Exit code が `0` であること。

## 3. 手動およびビルド検証
- **コマンド**:
  ```bash
  cd frontend
  npm run build
  ```
- **判定基準 (Assertion)**:
  - Exit code が `0` であること。
  - TypeScript コンパイル（`tsc`）がエラーなしで完了すること。
  - `dist/` ディレクトリ配下に `index.html` および `assets/` ファイルが生成されていること。
