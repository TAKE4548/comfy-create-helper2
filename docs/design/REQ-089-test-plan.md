# PBI-REQ-089 実行可能テスト計画 (最終修正版)

## 1. 自動テスト (CLI Verification)
**目的**: ロジック層の機能正しさとビルド健全性を検証する。
- **コマンド**:
  ```bash
  # ビルドと静的解析の実行（Exit Code 確認必須）
  npm run build && npm run lint
  
  # テスト実行（Exit Code 確認必須）
  npm run test -- src/hooks/__tests__/useComfyWebSocket.test.ts
  ```
- **判定基準**:
  AI エージェントは以下の条件をすべて満たすことを証明する必要がある。単なる「成功した」という記述では不十分とする。
  1. **Exit Code 検証**:
     - `npm run build` の Exit Code が `0` であること。
     - `npm run lint` の Exit Code が `0` であること。
     - `npm run test` の Exit Code が `0` であること。
  2. **テスト結果の完全性検証**:
     - テスト出力ログを解析し、以下の条件がすべて成立することを確認する：
       a) `FAIL` という文字列が含まれていないこと。
       b) `Error:`, `AssertionError:`, `TypeError:` などのエラー接頭辞を含む行が含まれていないこと。
       c) 指定された以下の5つのテストケース名がすべて `PASS` ステータスで出力されていること：
          1) `should handle WebSocket constructor exception gracefully`
          2) `should handle WebSocket connection lifecycle (open, close, error)`
          3) `should update hooks state on various JSON messages`
          4) `should handle binary preview image messages (Blob / ArrayBuffer)`
          5) `should call fetch with correct arguments on queuePrompt and cancelGeneration`
  3. **数値的検証**:
     - テスト実行ログからテストの要約行（例：`Tests  5 passed (5)` など）を探し、失敗（failed）の数が `0` であることを確認すること。
  4. **レポート生成**:
     - 上記検証結果を構造化データ（JSON）または明確なチェックリスト形式で報告すること。

## 2. ツール主導監査 (Tool-Driven Audit)
**目的**: 実装コードと要件定義の整合性を検証する。
- **アクション**:
  1. **環境確認**: 実行環境に監査スクリプト `${GLOBAL_SCRIPTS}\local_model_adapter.py` が存在することを確認する。存在しない場合、またはパスへのアクセス権限がない場合は、「ENVIRONMENT_MISMATCH」として監査失敗を報告すること。
  2. **実行**: 監査スクリプトを実行し、標準出力 (stdout) と標準エラー出力 (stderr) を完全に記録・報告する。
     ```bash
     python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs\design\PBI-REQ-089-test-plan.md
     ```
- **判定基準**:
  - スクリプトがエラーや警告を報告せず、適合判定が得られること。
  - AI はスクリプトの出力内容（生のログ）を回答内で引用し、適合していることを証明すること。
  - スクリプトの実行は、Python の標準ライブラリおよび明示的に指定されたモジュールのみを使用するものとする。外部 API への非同期呼び出しや、内部状態を保持するクラスの使用は禁止される。

## 3. 手動・ブラウザ検証 (Browser Agent Verification)
**目的**: 統合環境での動作と、ネットワーク層の挙動を検証する。
**注意**: 本ステップは AI エージェントが自動で検証を実行できません。人間の QA エンジニアまたは開発者が実際にローカルのブラウザ環境で以下の検証ステップを実行し、その実行結果ログとコンソールログを `walkthrough.md` に記載してください。

- **環境設定**:
  - ブラウザ: Chrome (最新版) または Firefox (最新版)。
  - ネットワーク: 開発者ツール > Network タブで `WebSocket` の接続を確認可能にする。

- **検証ステップ**:
  1. **接続確認**:
     - アプリケーションを起動し、コンソール（Console）に WebSocket の `open` イベントログ（`WebSocket connection established` または対応するイベントハンドラ内のログ）が出力されることを確認する。
     - *判定*: ログが存在するか？ (Yes/No)
  2. **メッセージ送信テスト**:
     - **入力データ**: 画像ファイル `assets/test_sample.png` をアップロードし、プロンプト欄に `"test prompt for verification"` と入力して送信する。
     - **期待動作**: アプリが処理を開始し、コンソールに `queue_prompt` 形式の JSON メッセージが出力されること。
     - *判定*: 期待される JSON 構造が含まれているか？ (Yes/No)
  3. **エラーハンドリングテスト**:
     - **操作**: ネットワークを切断（Network タブ of "Offline" をオンにする）し、処理中の状態で切断状態を作る。
     - **期待動作**: アプリがクラッシュせず、コンソールまたは UI に `"Connection lost: Handling error gracefully"` またはそれに類するエラーログ/エラー表示がされること。
     - *判定*: エラー処理が適切に動作したか？ (Yes/No)

- **最終報告**: 人間によって上記 3 ステップすべてで「Yes」が確認された場合のみ、本要件は完了とする。
  - **[必須]**: 各ステップ（接続確認、メッセージ送信、エラーハンドリング）において、「Yes」と判定した根拠となるコンソールログの該当行を `walkthrough.md` に引用すること。
    - 例: `[LOG] WebSocket connection established to ws://localhost:8188` (Step 1)
