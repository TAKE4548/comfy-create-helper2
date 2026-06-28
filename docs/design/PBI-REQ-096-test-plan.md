# PBI-REQ-096 実行可能テスト計画 (監査後再改訂版)

## 1. 自動テスト (CLI Verification)
**目的**: スナップショットの作成、更新、画像ファイル保存に関するロジックをサービスレイヤーに移動させた後も、既存の API 機能がデグレーションなく正常に動作することを検証します。
- **前提条件**: `backend` ディレクトリが存在し、仮想環境（.venv）がセットアップ済みであること。
- **コマンド**:
  ```bash
  # バックエンドのテスト実行（Cwd: backend）
  python -m pytest tests/test_snapshots.py --tb=short -q
  ```
- **判定基準 (厳密)**:
  以下の条件を**すべて**満たすこと。いずれか一つでも欠けると「失敗」とみなす。
  1. **Exit Code 検証**: コマンドの Exit Code が `0` であること。
  2. **ログ汚染チェック**: 標準出力 (stdout) および標準エラー出力 (stderr) の両方に、以下の文字列が含まれていないことを確認すること。
     - `FAILED`
     - `AssertionError`
     - `ERROR` (テストケース名の直後にある場合)

## 2. ツール主導監査 (Tool-Driven Audit)
**目的**: 実装されたテストコードおよび設計書の整合性を検証します。
- **実行コマンド**:
  ```bash
  # 環境変数から GLOBAL_SCRIPTS パスを解決するか、既定の絶対パスから実行
  python %GLOBAL_SCRIPTS%\local_model_adapter.py qa-audit docs\design\PBI-REQ-096-test-plan.md
  ```
- **判定基準**:
  - スクリプトが正常に終了し、Exit Code が `0` であること。
  - **例外処理の厳格化**: もしスクリプトが存在しない場合や、実行時にエラーが発生した場合（Exit Code != 0）、**「監査プロセス自体の失敗」**として報告する。この段階で結果をスキップすることは禁止する。

## 3. API レベル統合検証 (Automated Integration Check)
**目的**: サービス層切り離しおよびクリーンアップロジックの完全性検証。
- **実行コマンド**:
  ```bash
  # バックエンドの統合テスト実行（Cwd: backend）
  .venv\Scripts\python test_integration_snapshots.py
  ```
- **判定基準 (厳密)**:
  以下の条件を**すべて**満たすこと。
  1. **Exit Code 検証**: コマンドの Exit Code が `0` であること。
  2. **成功メッセージ確認**: 標準出力に文字列 `ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!` が含まれていること。
     - *注意*: この文字列が見つからない場合、Exit Code が 0 でも「テストロジックが正しく完了していない」とみなすこと。
