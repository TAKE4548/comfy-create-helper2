# PBI-REQ-092 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
**目的**: `useGeneratePageState` フックの機能性、および他フック・ストアとの状態連携の正しさを検証します。
- **コマンド**:
  ```bash
  # ビルドと静的解析の実行（Exit Code 確認必須）
  npm run build && npm run lint
  
  # テスト実行（Exit Code 確認必須）
  npm run test -- src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx
  ```
- **判定基準**:
  以下の条件をすべて満たすこと：
  1. **Exit Code 検証**:
     - `npm run build` の Exit Code が `0` であること。
     - `npm run lint` の Exit Code が `0` であること。
     - `npm run test` の Exit Code が `0` であること。
  2. **テスト結果の完全性検証**:
     - テストログに `FAIL` が含まれず、追加されたすべてのテストケースが `PASS` すること。
     - 対象テストケース名：
       - `should initialize with default states and fetch active lists`
       - `should handle workflow change and update workflow state`
       - `should load snapshot params and assets on handleLoadSnapshot`
       - `should integrate with useMultiSelect state`
       - `should handle preset creation, update, and deletion mutations`

## 2. ツール主導監査 (Tool-Driven Audit)
**目的**: 実装されたテストコードおよび設計書の整合性を検証します。
- **実行コマンド**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs\design\PBI-REQ-092-test-plan.md
  ```
- **判定基準**:
  - 監査スクリプトが警告やエラーなく完了し、テスト計画が具体的かつ実行可能であると判定されること。

## 3. 手動・ブラウザ検証 (Browser Agent Verification)
フックの機能連携を直接 UI から検証します。
- **検証手順**:
  1. 開発サーバーを起動 (`npm run dev`)。
  2. ブラウザで `http://localhost:5173` にアクセス。
  3. 任意のワークフローを選択し、画像生成履歴のサムネイルを長押し（またはCtrl+クリック）して複数選択モードに切り替わるか確認する。
  4. 選択された状態で画像の一括ダウンロードやクリアが動作することを確認する。
  5. プリセット保存モーダルを開き、現在のパラメータ設定がプリセットとして保存され、ドロップダウンに即時反映されるか確認する。
