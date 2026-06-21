# PBI-REQ-061 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**:
  ```bash
  cd frontend && npm run test -- --ci --passWithNoTests=false
  ```
- **期待値 (Assertion)**:
  - テスト実行プロセスが `Exit Code 0` で終了すること。
  - `useGenerateAction.test.ts` および `useGenerationStore.test.ts` のすべてのテストケースが `PASS` すること。
  - テスト出力ログに `FAIL` や `Error` が含まれていないこと。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  ```bash
  python ${GLOBAL_SCRIPTS}\artifact_linter.py ${GLOBAL_ROOT}\brain\<conversation-id>
  ```
- **期待値 (Assertion)**:
  - スクリプトが `Exit Code 0` で終了すること。
  - リンター出力に致命的なエラーが報告されないこと。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173`
- **操作手順**:
  1. 複数のセット（例: 「Set 1」「Set 2」）を選択し、それぞれ `batchSize` を 2 に設定。
  2. 「Generate Batch」をクリック。
  3. ブラウザのネットワークタブまたはComfyUIのUIで、即座に4つのジョブがキューに登録されることを確認。
  4. 生成中にパラメータ編集領域（Steps, CFG等）の入力フィールドにフォーカスし、数値を変更できることを確認。
  5. UI の進捗表示が `Generating (m/4 Complete)...` の形式で正確にカウントされ、プログレスバーが徐々に進むことを確認。
  6. 生成中に「Cancel All」をクリックするか、ComfyUIでキューをクリアする。
- **判定基準 (Assertion)**:
  - 生成中でも画面および入力フィールドがロックされず編集可能であること。
  - 進捗表示が全体の総数を分母として `m/n Complete` と表示され、最終完了時に 100% となること。
  - キャンセル実行時に、APIレベルで `delete` / `interrupt` リクエストが ComfyUI に送信され、アプリ状態が正常に `Ready` に戻ること。
