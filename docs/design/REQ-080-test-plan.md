# REQ-080 実行可能テスト計画: 新規プロファイル作成時にワークフローのデフォルト設定を選択すると全パラメータが空欄になる問題の修正

## 1. 自動テスト (Unit Tests)

### 1-1. テスト項目
- `getInitialParams` が正しくエクスポートされ、期待通り動作すること。
- `handleCreatePreset` 内で `copySourceId === 'default'` の場合に、デフォルトパラメータ（`getInitialParams` の戻り値）とデフォルトアセット（`workflow.default_applied_assets` のパース値）が設定されて `createPresetMutation.mutate` が呼び出されること。

### 1-2. テストの実行コマンド
```bash
npm run test -- frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.ts
```

---

## 2. 手動検証 (Manual Verification)

### 2-1. 現象再現と確認
1. フロントエンドとバックエンドのサーバーを起動する。
2. ブラウザで生成ページ（`GeneratePage`）を開き、任意のワークフローを選択する。
3. プロファイル一覧の横の「プロファイルを追加」ボタンをクリックする。
4. コピー元に「ワークフローのデフォルト設定」を選択し、新規プロファイル名（例: `TestDefaultSet`）を入力して「作成」をクリックする。
5. 作成したプロファイル（`TestDefaultSet`）を選択する。
6. パラメータ入力欄（プロンプトやモデル名等）および適用アセットが、空欄にならずワークフローのアップロード時のデフォルト設定（初期値）になっていることを確認する。
