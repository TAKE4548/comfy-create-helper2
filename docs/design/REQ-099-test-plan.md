# PBI-REQ-099 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### バックエンド キャッシュヘッダー検証テスト
- **コマンド**: `pytest backend/tests/test_snapshots.py -k test_snapshot_images_cache_header`
- **期待値**: 静的ファイル（スナップショット画像）エンドポイントへのリクエストが成功し、レスポンスの `Cache-Control` ヘッダーに `public, max-age=31536000, immutable` が含まれていること。

### フロントエンド ユニットテストの実行
- **コマンド**: `npm --prefix frontend run test` または `vitest` を用いて、既存のテストが壊れていないことを検証する。

---

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py arch-audit .` を実行し、アーキテクチャ設計に整合しているか検証する。

---

## 3. 手動検証 (Manual Verification / Browser / Network)
- **対象URL**: `http://localhost:5173/history` （フロントエンド開発サーバー）
- **検証手順**:
  1. `npm run dev` および `uvicorn app.main:app` を起動する。
  2. 開発者ツール (F12) の「ネットワーク」タブを開く。
  3. 「キャッシュを無効化 (Disable cache)」のチェックを**外した**状態で、履歴（History）またはアルバムページに遷移する。
  4. 2回目以降の遷移時に、画像がキャッシュから読み込まれている（`Status: 200 OK (from disk cache)` または `304 Not Modified`）ことを確認する。
  5. 端末の表示エリア外にある画像が初期状態でロードされず、スクロール時に動的にリクエストが発生する（Lazy Loading）ことをネットワークタブで目視確認する。
