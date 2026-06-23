# PBI-REQ-074 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**:
  ```bash
  cd frontend
  npm run test
  ```
- **期待値**:
  - `src/components/TagChipEditor/__tests__/useChipParser.test.ts`
  - `src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`
  - `src/store/__tests/useGenerationStore.test.ts`
  - `src/hooks/__tests__/useComfyWebSocket.test.ts`
  - `src/components/TagChipEditor/__tests__/useChipHistory.test.ts`
  - `src/hooks/__tests__/useMasterMappingRows.test.ts`
  - `src/hooks/__tests__/useMultiSelect.test.ts`
  - `src/components/TagChipEditor/__tests__/TagInput.test.tsx`
  - `src/components/TagChipEditor/__tests__/TagChip.test.tsx`
  - `src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx`
  などの既存フロントエンドテスト（計55テスト）がすべてPASSすること。

- **ビルド確認**:
  - コマンド:
    ```bash
    cd frontend
    npm run build
    ```
  - 期待値: TypeScript エラーや Vite ビルドエラーがなく、正常に完了すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py arch-audit .` を実行し、設計整合性の客観的証明を得ること。

## 3. 手動動作検証
リファクタリング後の画面において、以下の機能が以前と同様に動作することを確認します。
- ワークフローの選択およびアップロード
- パラメータ値（Sampler, Scheduler, Seed等）の変更
- アセット（LoRA, TagSet）の追加・有効化・無効化
- LLM Audit の実行
- 世代生成（Generate Batch）の呼び出し
- デスクトップ表示およびモバイル表示（リサイズ時）の切り替え
