# PBI-REQ-135 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **フロントエンド型チェック & リント**:
  - コマンド: `npm --prefix frontend run build`
  - 期待値: ビルドエラーおよび型チェックエラーが0件であること。
- **ユニットテスト**:
  - コマンド: `npm --prefix frontend test -- --watchAll=false`
  - 期待値: 全フロントエンドユニットテストが PASS すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**:
  - コマンド: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-135.md`
  - 期待値: タスクカードの密閉性および精度に問題がないこと。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173`
- **検証シナリオ**:
  1. プリセット一覧にて複数のプリセットを選択し、「一括編集」モーダルを開く。
  2. プロンプトまたはアセット適用エリアにて「アセットを追加 (Add Asset)」ボタンをクリック。
  3. `AddAssetModal` が起動し、LoRA および タグセット を選択して確定できること。
  4. 追記モード (Append) と 置換モード (Replace) を切り替え、「適用する」をクリック。
  5. 対象の全プリセットに対して選択したアセットが一括適用され、プロンプトテキストにもアセットタグが反映されることを確認する。
- **判定基準 (Assertion)**:
  - 選択モーダルから複数のアセットを正常に一括設定できること。
  - 完全重複アセットはスキップされ、別サブセットは正常に保持・追加されること。
