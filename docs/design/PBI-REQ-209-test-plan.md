# PBI-REQ-209 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `cd frontend && npm test -- src/utils/__tests__/workflowParamInjector.test.ts src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/utils/__tests__/bypassUtils.test.ts`
- **期待値**: 全 4 テストスイートの PASS。脳内推論での代用は厳禁。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py .` を実行し、設計整合性の客観的証明を得ること。

## 3. 手動・E2E検証 (Manual / UI Verification)
- **対象URL**: `http://localhost:5173/` (フロントエンド開発サーバー)
- **操作手順**:
  1. Generate 画面でワークフローを選択。
  2. LoRA スタックおよび各種パラメータを変更して「Save as Default」をクリック。
  3. リロードして初期パラメータ復元を確認。
  4. バッチ生成およびセット生成を実行し、プロンプト・シード値が正しく注入されることを確認。
- **判定基準 (Assertion)**:
  - コンソールエラー・不透明な例外なくキュー投入が完了すること。
- **必須エビデンス**: 単体テスト結果ログおよび動作検証ログ。
