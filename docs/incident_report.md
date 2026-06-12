# 障害調査報告書 (Incident Report)

## 障害概要
スナップショット一覧のアルバム（Albums）ページが空で何も表示されない。404エラーになるわけではない。

## 再現手順
1. アプリケーションの「History」画面を開く。
2. 画面右上または表示切り替えで「Albums」タブを選択する。
3. アルバムリスト領域が真っ白（または空）になり、作成済みのアルバムが表示されないことを確認する。

## 根本原因 (Root Cause Analysis)
1. **APIレスポンスのスキーマ不整合**:
   * バックエンドのアルバム一覧API `GET /api/albums`（[albums.py:L12-L14](file:///c:/Users/audih/ws/comfy-create-helper2/backend/app/routers/albums.py#L12-L14)）のレスポンスモデルに `list[schemas.AlbumSummary]` が指定されている。
   * [schemas.py:L193-L198](file:///c:/Users/audih/ws/comfy-create-helper2/backend/app/schemas.py#L193-L198) において、`AlbumSummary` は `id`、`name`、`created_at` のみを持ち、`items` フィールドを含んでいない。
2. **フロントエンドでの例外発生（レンダリングエラー）**:
   * フロントエンドの [HistoryPage.tsx (L220-L236)](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/HistoryPage.tsx#L220-L236) では、APIから返却された各アルバム情報に対し、`album.items.slice(0, 3)` や `album.items.length` のように `items` 配列が存在することを前提としたアクセスを行っている。
   * APIレスポンスに `items` が含まれないため `album.items` が `undefined` となり、レンダリング時に `Cannot read properties of undefined (reading 'slice')` 等のJavaScriptランタイムエラー（または例外）が発生し、アルバムタブ内の描画が失敗して何も表示されなくなる。

## 障害分類
* **分類**: **Type A (Implementation Bug / 実装バグ)**
  * バックエンドとフロントエンドの間でデータ構造（スキーマ定義）の想定に乖離があり、実行時に参照エラーを引き起こす実装上の不備であるため。

## 対策方針（※調査フェーズのため実装は行いません）
* `backend/app/routers/albums.py` の `list_albums` エンドポイントのレスポンスモデルを、`list[schemas.AlbumSummary]` から `list[schemas.AlbumRead]`（または `items` を含む新しいサマリースキーマ）に変更し、フロントエンドが必要とする `items` データを返却するように修正する。
