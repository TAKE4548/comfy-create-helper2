# REQ-245 実行可能テスト計画（監査対応版）

## 1. 自動テスト (CLI Verification)

- **バックエンド単体テスト**:
  - **コマンド**: `pytest backend/tests/test_comfy_proxy.py -v`
  - **期待値**: exit_code = 0, 全テスト PASS。
  - **検証項目**:
    - `GET /api/comfy/thumbnail`: ComfyUI 画像取得から Pillow リサイズ・WebP 変換、200 返却
    - `Cache-Control` ヘッダー (`public, max-age=604800, immutable`) および `Content-Type: image/webp`
    - インメモリ LRU キャッシュヒット（2回目以降のリクエストで ComfyUI 通信が発生しないこと）
    - ComfyUI 404 時は HTTP 404 (`Image not found in ComfyUI`)、接続エラー時は HTTP 502 (`ComfyUI view error`) を返却すること
    - キャッシュ上限 500 件超過時に `_thumbnail_cache.popitem(last=False)` により最古のエントリを破棄し、要素数が 500 以下に維持されること

- **フロントエンド単体テスト**:
  - **コマンド**: `npm --prefix frontend test src/utils/__tests__/thumbnailUrl.test.ts`
  - **期待値**: exit_code = 0, 全テスト PASS。
  - **検証項目**:
    - ComfyUI `/view?filename=...` 形式 URL の `/api/comfy/thumbnail?...` への正しい変換
    - 通常の Snapshot 画像パス（`/api/snapshots/images/...`）や外部 URL のバイパス（非変換保持）
    - null / undefined / 空文字の安全な空文字返却
    - 特殊文字・日本語を含む filename / subfolder の URL エンコード整合性

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

- **シナリオ 1: Generate 画面の軽量サムネイル表示と高精細プレビューの分離**:
  1. Generate 画面を開き、履歴ストリップ内の画像一覧を表示。
  2. ストリップ内の `<img>` 要素の `src` が `/api/comfy/thumbnail?...` となっており、`loading="lazy"` および `decoding="async"` が付与されていることを確認。
  3. ストリップ内のサムネイルをクリックし、メインプレビュー領域の `<img>` 要素の `src` がフル解像度の元画像 URL (`/view?filename=...`) になっていることを確認。
- **シナリオ 2: LoRA / TagSet のサムネイルパス保存是正**:
  1. LoRA または TagSet 編集モーダルで画像をクロップして保存。
  2. 保存されたエンティティの `thumbnail_path` に `/api/snapshots/images/thumb_...webp` が設定されていることを確認。
  3. LoRAs / Tags 一覧画面でカード画像カルーセル (`ImageCarousel`) の `<img>` に `loading="lazy"` および `decoding="async"` が付与され、軽量 WebP が描画されることを確認。
- **シナリオ 3: モーダル展開時のパフォーマンス**:
  1. 一括変換モーダル（`BatchSpeechTransformModal`）を開き、多数のスナップショットが存在する場合でも画面外スナップショット画像の一括リクエストが走らず、画面内の画像のみが順次ロードされることを確認。

- **Red Teaming (境界値・異常系)**:
  - **手順 1 (ComfyUI 停止時/ファイル不在時のフォールバック)**:
    - 存在しない画像ファイル名を指定して `GET /api/comfy/thumbnail?filename=non_existent_image.png` を実行。
    - **期待結果**: バックエンドが 404 Not Found を返し、フロントエンド側でクラッシュせずフォールバック表示（`ImageOff` アイコン等）されること。
  - **手順 2 (クエリパラメータ境界値)**:
    - `size=0` や `size=10000`、`quality=-1` や `quality=200` などの異常値を送信。
    - **期待結果**: FastAPI/Pydantic のバリデーション（`ge=32, le=1024`、`ge=10, le=100`）により HTTP 422 Unprocessable Entity が返却され、サーバーが安全に保護されること。
  - **手順 3 (LRU キャッシュ容量・メモリリーク検証)**:
    - 505 件の異なるキャッシュキーでサムネイル生成を実行。
    - **期待結果**: `_thumbnail_cache` の要素数が厳密に 500 件に保たれ、古いキーから順に破棄されること。

---

## 3. ツール主導監査 (Tool-Driven Audit)

- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-245-test-plan.md`
- **アーティファクト監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/design`
- **セキュリティ監査**: `python ${GLOBAL_SCRIPTS}\pre_commit_linter.py`

