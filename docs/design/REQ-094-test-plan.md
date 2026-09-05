# PBI-REQ-094 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm run test -- src/api/__tests__/client.test.ts` (または `npx vitest run src/api/__tests__/client.test.ts` を `frontend` ディレクトリ内で実行)
- **期待値**: 新しく実装したすべてのテストケースが PASS すること。脳内推論での代用は厳禁。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py arch-audit .` を実行し、設計整合性の客観的証明を得ること。

## 3. ブラウザ検証 (Browser Agent Verification)
- 本タスクは純粋な APIクライアントモジュールのユニットテスト追加であるため、ブラウザ検証やUIの変更はありません。
