# REQ-286 実行可能テスト計画 (Test Plan)

## 1. 自動テスト (CLI Verification)
- **Gate 1: 型検査 (Typecheck)**
  - コマンド: `cd frontend && npm run typecheck`
  - 期待値: 差分および新規分離コンポーネントを含め、エラー 0 件で PASS すること。
- **Gate 2: ユニットテスト (Unit Tests)**
  - コマンド: `cd frontend && npx vitest run src/pages/__tests__/HistoryPage.test.tsx`
  - コマンド (新規フック/ビュー): `cd frontend && npx vitest run src/pages/HistoryPage`
  - 期待値: 既存 16 件のテストケースおよび新規作成テストが全件 PASS すること。
  - カバレッジ要件:
    - `useAlbumDndOrder`: 単一アイテム Dnd 並び替え、複数選択グループ Dnd 並び替え、昇順/降順ハンドリングの検証。
    - `SnapshotGalleryView`: スナップショット一覧表示、無限スクロール sentinel 描画、フィルタ（ワークフロー、LoRA、タグセット、ソート順）変更時のコールバック、プレビューモーダル展開トリガーの検証。
    - `AlbumDetailView` (リファクタ後): `useAlbumDndOrder` との接続、Dnd 実行時の `onItemDragEnd` コールバック発火。
    - `HistoryPage/index.tsx`: ページ全体の初期描画、ビュー切り替え（Snapshots ↔ Albums）、ルーティング互換性（既存 `import { HistoryPage } from './pages/HistoryPage'` がそのまま動作すること）。

## 2. 結合・E2E検証 (Integration & E2E Verification)
- **シナリオ 1: 全スナップショット閲覧とフィルタ・無限スクロール**
  - 操作: HistoryPage を開き、ワークフロー、LoRA、タグセットのプルダウンフィルタを変更する。
  - 期待値: クエリパラメータに基づき `snapshotsApi.list` が再取得され、表示件数やカードが更新される。最下部にスクロールした際に IntersectionObserver により表示リミットが +24 件更新される。
- **シナリオ 2: アルバム詳細画面での Dnd-kit 並び替えと永続化**
  - 操作: Albums タブから特定のアルバムを選択し、詳細画面を開く。アイテムをドラッグ＆ドロップして並び替える。
  - 期待値: `useAlbumDndOrder` 内で算出された並び順 ID リストが `albumsApi.updateOrder` に送信され、TanStack Query のキャッシュが楽観的または即時に更新される。
- **シナリオ 3: 複数選択グループ Dnd 並び替え**
  - 操作: アルバム詳細で複数選択モードに入り、複数アイテムを選択した状態で1つのアイテムをドラッグして非選択アイテムの前後にドロップする。
  - 期待値: 選択された複数アイテムの相対順序を保持したまま、ドロップ位置にまとめて挿入され、`updateAlbumOrder` が呼ばれる。

## 3. Red Teaming (境界値・異常系検証)
- **RT-1: 無効な Dnd ドロップ (overId が自身または存在しない ID の場合)**
  - 操作: ドラッグ開始後、自身と同じ位置にドロップ、またはドロップ領域外でリリースする。
  - 期待値: `updateAlbumOrder.mutate` は発火せず、クラッシュや不正な API リクエストが発生しないこと。
- **RT-2: スナップショット 0 件時のエンプティステート表示**
  - 操作: スナップショットが空配列 `[]` の状態をモックまたはデータなし状態で表示。
  - 期待値: "No snapshots yet." アイコン・テキストが表示され、無限スクロール sentinel が作動しないこと。
- **RT-3: 直接 URL (ComfyUI direct /view) の thumbnail / safe URL 変換境界値**
  - 操作: `image_path` が ComfyUI 直接 URL (`http://localhost:8188/view?filename=xxx.png`) かつ `thumbnail_path` が null のスナップショットを描画。
  - 期待値: `toSafeImageUrl` / `toThumbnailUrl` により `/api/comfy/thumbnail?filename=xxx.png` にフォールバックされ、画像破損なく表示されること (REQ-267 回帰防止)。

## 4. ツール主導監査 (Tool-Driven Audit)
- **推論 BA / QA 監査**: `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py ba-audit` による論理的境界値・不整合の検証。
- **VRAM クリーンアップ**: 監査直後に `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py unload` を実行し、完全解放すること。
