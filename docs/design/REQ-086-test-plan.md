# PBI-REQ-086 実行可能テスト計画 (修正版)

## 1. 自動テスト (CLI Verification)
- **コマンド**:
  ```bash
  npm --prefix frontend run test -- --testPathPattern="useMultiSelect.test.ts" --verbose
  ```
- **判定基準 (Exit Code & Output)**:
  - Exit Code が `0` であること。
  - 出力ログに `PASS useMultiSelect` または同様の成功メッセージが含まれていること。
  - 失敗メッセージ（FAIL）が出力されていないこと。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs\design\PBI-REQ-086-test-plan.md
  ```
- **判定基準**: スクリプトが完了し、エラーメッセージを出力しないこと。

## 3. ブラウザ検証 (Browser Agent Verification)
**前提条件**: Headless Chrome または Puppeteer/Playwright を使用し、以下のアクションを実行して DOM 状態とログを確認する。

### 検証項目 1: スワイプスクロール動作 (Headless Mode)
- **操作**: `page.touchstart`, `touchmove` イベントをシミュレートし、画像領域を Y 軸方向に移動させる。
- **判定基準**:
  1. ページのスクロール位置 (`window.scrollY`) が変化していること。
  2. 詳細プレビューモーダル要素（例: `.modal-overlay`）の `style.display` プロパティが `'none'` または存在しない DOM であること。

### 検証項目 2: 通常のタップ (Headless Mode)
- **操作**: 画像領域に対して単発の `click` イベントを発生させる。
- **判定基準**:
  - 詳細プレビューモーダル要素が DOM に追加され、かつ `style.display` が `'block'` または `'flex'` であること。

### 検証項目 3: 長押しによる複数選択モードのキャンセル (Headless Mode)
- **操作**:
  1. 画像領域に対して `touchstart` を発生させる（500ms 間隔で）。
  2. 500ms 後に `touchmove` イベントを発生させる。
- **判定基準**:
  1. モバイルビューモードが有効になっていること。
  2. `touchmove` が発生した直後、ページスクロール位置（`window.scrollY`）が変化していること。
  3. 複数選択用の UI 要素（チェックボックスなど）が消滅していること。
