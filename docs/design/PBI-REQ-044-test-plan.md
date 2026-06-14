# PBI-REQ-044 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `$env:PYTHONPATH="backend"; python -m pytest backend/tests/test_albums.py`
- **期待値**: 全テストケースの PASS。
  - `test_delete_album_items` が PASS すること。
  - `test_add_album_items`（既存アルバムへの追加および重複防止ロジック）が PASS すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **API検証**: `openapi_parser.py` を使用して `/api/albums/{album_id}/items` が定義されていることを確認。
  - コマンド: `python ${GLOBAL_SCRIPTS}\openapi_parser.py backend\openapi.json list-endpoints`
- **フロントエンド型チェック**: `npm run build` を実行し、TypeScriptのビルドにエラーが出ないこと。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173` (Viteフロントエンド)
- **操作手順**:
  1. 生成ページ (Generate Page) でスナップショットの保存ボタンをクリックする。
  2. 表示されたモーダルで「新規アルバム作成」を選択し、任意のアルバム名を入力して保存する。
  3. 次に別のスナップショットの保存ボタンをクリックし、ドロップダウンから先程作成したアルバムを選択して保存する。
  4. 履歴ページ (History Page) でスナップショット一覧を選択し、「New Album」改め「Add to Album」をクリックする。
  5. モーダルの検索ボックスでキーワードを入力し、インクリメンタル検索が正しくフィルタリングを行うか確認する。
  6. アルバムを選択して「追加」を実行し、該当するアルバムに正しく追加されることを確認する。
