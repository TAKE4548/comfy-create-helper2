# PBI-REQ-107 実行可能テスト計画（監査済み・再最適化版）

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm run build`
- **Cwd**: `frontend`
- **タイムアウト制限**: 60 秒
- **判定ロジック (厳密)**:
  1. プロセスが完了するまで待機（最大 60 秒）。
  2. 終了コード (Exit Code) が `0` である場合 → **PASS**。
  3. 終了コードが非ゼロの場合、またはプロセスがタイムアウトした場合 → **FAIL**。
  4. ※標準出力/エラーストリームに "Error" や "Failed" を含む文字列が含まれている場合は即座に **FAIL** と判定する。

## 2. ツール主導監査 (Tool-Driven Audit)
- **ロジック**: 
  - コマンド: `python ${GLOBAL_SCRIPTS}\artifact_linter.py` (ローカル開発環境)
- **判定ロジック (厳密)**:
  1. スクリプトの終了コードが `0` である場合 → **PASS**。
  2. 終了コードが非ゼロの場合、または出力ストリームに "Validation Failed" / "Integrity Error" を含む文字列が含まれている場合 → **FAIL**。

## 3. ブラウザ検証 (Automated Browser Verification)
**前提条件**: Playwright または Selenium WebDriver を使用した自動化スクリプト。

### 手順 A: 環境構築
1. ブラウザを起動し、`http://localhost:5173/history` にアクセスする。
2. 画面幅を `800px` にリサイズする。

### 手順 B: フルスクリーンモードへの遷移
1. 任意の履歴項目をクリックし、`HistoryModalPreview` が表示されていることを確認する（DOM 存在チェック）。
2. プレビュー画像要素をクリックしてフルスクリーンモードへ遷移させる。

### 手順 C: 数値的判定 (Critical - Programmatic Check)
**注意**: AI は CSS プロパティの文字列をそのまま比較せず、必ず数値に変換（パース）してから比較すること。

- **検証対象**: DOM 要素 `.modal-backdrop` の `padding-bottom` プロパティ。
- **取得ロジック (JavaScript)**:
  ```javascript
  const rawValue = getComputedStyle(document.querySelector('.modal-backdrop')).paddingBottom;
  // パース処理: "0px" -> 0, "calc(...)" -> NaN, undefined -> NaN
  const numericValue = parseFloat(rawValue); 
  ```

- **判定ロジック (AI エージェント向け指示)**:
  - **ケース A: フルスクリーン時**
    - `numericValue` が `0` に等しいことを確認する。
    - *条件*: `numericValue === 0`
  
  - **ケース B: 通常表示時**
    1. モーダルを通常サイズに戻す（閉じるまたはリサイズ解除）。
    2. 再度 `padding-bottom` の数値を取得し、`numericValue` を算出する。
    3. **判定**: `numericValue > 0` (正の数値であること) を確認する。
    - *条件*: `!isNaN(numericValue) && numericValue > 0`

## 4. エビデンス生成
- フルスクリーン時と通常表示時の、ブラウザ全体のスクリーンショットを取得し、指定ディレクトリ（例: `./test-results/screenshots/`）に保存する。



