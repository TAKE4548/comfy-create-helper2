# PBI-REQ-084 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm run build`
- **判定基準**: コマンドの Exit Code が 0 (成功) であること。さらに、ビルド出力ディレクトリである `frontend/dist/` 配下に `index.html` および JS/CSS アセットファイル群が正しく生成されていることを確認。
- **コマンド**: `npm run lint`
- **判定基準**: コマンドの Exit Code が 0 (成功) であること（警告以外のエラー件数が 0 件であること）。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py arch-audit .` を実行し、アーキテクチャ設計に矛盾や欠陥が指摘されないことを検証。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173/`

### AC-1: ドロップダウン廃止の検証
- **操作手順**:
  1. ページロード完了後、DOMツリー内から `#snapshot-history-select` および `#snapshot-history-select-mobile` を検索する。
- **判定基準**:
  - `document.getElementById('snapshot-history-select')` が `null` であること。
  - `document.getElementById('snapshot-history-select-mobile')` が `null` であること。

### AC-2 & AC-4: 複数選択・範囲選択およびプレビュー追従の検証
- **操作手順**:
  1. 生成履歴に画像が3つ以上存在する状態にする。
  2. 最初のリスク要素（`#thumb-0`）を普通にクリックする。
  3. 次に `Ctrl` キー（Macの場合は `Cmd` キー）を押しながら、3番目の要素（`#thumb-2`）をクリックする。
  4. 次に `Shift` キーを押しながら、2番目の要素（`#thumb-1`）をクリックする。
- **判定基準**:
  - 手順2実行後: メインプレビュー画像（`img[alt="Generated"]`）の `src` 属性値が `#thumb-0` の画像パスと一致すること。
  - 手順3実行後:
    - 画面上の選択中テキストが「2枚選択中」に変化していること。
    - `#thumb-0` と `#thumb-2` のボタン要素のクラスに `border-purple-500` が含まれていること。
    - メインプレビュー画像の `src` 属性値が `#thumb-2` の画像パスと一致すること（最新のクリック画像への追従）。
  - 手順4実行後:
    - `#thumb-0`, `#thumb-1`, `#thumb-2` のすべてのボタン要素に `border-purple-500` が含まれ、選択中テキストが「3枚選択中」になっていること。
    - メインプレビュー画像の `src` 属性値が最後にクリックした `#thumb-1` の画像パスに追従していること。

### AC-3: 複数スナップショット保存の検証
- **操作手順**:
  1. 上記の複数選択状態（3枚選択中）で、アクションバー内の `#save-snapshot-btn` をクリックする。
  2. ポップアップ（Save Snapshot モーダル）で保存を実行する。
- **判定基準**:
  - 複数選択中において、`#save-snapshot-btn` 要素の `disabled` 属性が `false` または存在しないこと。
  - 保存ダイアログ確定後、ネットワークリクエストまたはAPIのモックにおいて `/api/snapshots` に対してPOSTリクエストが 3回 送信されていることを確認。
