# REQ-252 実行可能テスト計画 (Test Plan)

## 1. 自動テスト (CLI Verification)

### バックエンド単体テスト
- **コマンド**: `pytest backend/tests/test_comfy_proxy.py -v`
- **対象検証項目**:
  - `test_get_comfy_thumbnail_success`: ComfyUI からの取得、Pillow 縮小、WebP 形式変換、ヘッダー付与の検証
  - `test_get_comfy_thumbnail_in_memory_cache`: メモリ内キャッシュヒット時に ComfyUI へのリクエストが発生しないことの検証
  - `test_get_comfy_thumbnail_disk_cache`: メモリキャッシュクリア後でもディスクキャッシュファイル（`db/thumbnails/*.webp`）から直接高速返却されることの検証
  - `test_get_comfy_thumbnail_corrupted_disk_cache_recovery`: ディスク上のキャッシュファイルが0バイトや破損状態の場合、安全に削除・再生成へフォールバックすることの検証 (Red Team)
  - `test_get_comfy_thumbnail_not_found`: ComfyUI が 404 を返却した際、ディスクキャッシュを作成せず 404 を返却することの検証
  - `test_get_comfy_thumbnail_prunes_on_comfyui_deletion`: ディスクキャッシュが存在しても ComfyUI の HEAD 確認で 404 が返った場合、キャッシュを削除して 404 を返却することの検証

### フロントエンド静的検証・テスト
- **コマンド**: `npm --prefix frontend run build`
- **対象検証項目**:
  - `LazyThumbnail.tsx` の型定義整合性および TypeScript コンパイルエラーゼロの確認
  - `DesktopLayout.tsx` および `MobileLayout.tsx` のビルド整合性の確認
- **コマンド**: `npm --prefix frontend test`
  - 既存のフロントエンドユニットテストが全件 PASS することの確認

---

## 2. 結合・実機E2E検証 (Integration & E2E Verification)

### シナリオ 1: コールドスタート時のイベントループ非ブロッキング検証 (AC-1, AC-4)
1. バックエンドサーバーを再起動する（メモリキャッシュ全クリア）。
2. ブラウザで `http://localhost:5173` を開き、Generate 画面を表示する。
3. 生成履歴に 20 枚以上の画像が存在する状態で、ブラウザの開発者ツール（Network タブ）およびコンソールを開く。
4. **判定基準**:
   - サムネイル取得の通信が走っている最中でも、ジョブキューのポーリング（`/api/comfy/queue`）が詰まることなく一定間隔（1秒未満）で正常に 200 応答を返し続けること。
   - UIのプロンプト入力やタブ切り替えなどの操作がフリーズせず軽快に応答すること。

### シナリオ 2: 横スクロールコンテナでの真の遅延ロード検証 (AC-2)
1. 履歴画像が 20 枚以上ある状態で Generate 画面を表示する。
2. 初回マウント時、Network タブで発行された `/api/comfy/thumbnail` のリクエスト件数をカウントする。
3. **判定基準**:
   - 初期マウント時のリクエスト数が画面内の表示領域＋マージン分（約 4〜8 枚）に限定され、画面外にある 10 枚以上の画像が一括リクエストされていないこと。
   - 履歴ストリップを右に横スクロールした際、画面内に入ったサムネイルが順次追加ロードされること。

### シナリオ 3: ディスクキャッシュ永続化による高速表示検証 (AC-3, AC-4)
1. 一度表示した履歴画像を保持したまま、バックエンドサーバーを再起動（または uvicorn をホットリロード）する。
2. ブラウザで画面をリロード（F5）する。
3. **判定基準**:
   - サムネイルリクエストのレスポンスタイムが ComfyUI 再問い合わせ（1秒超）ではなく、ディスクキャッシュから数ミリ秒以内で即座に返却されること。

### シナリオ 4: ComfyUI 元画像削除時の履歴自動消去検証 (AC-2, AC-3)
1. ComfyUI 側で生成画像ファイルを削除（または ComfyUI 再起動による temp 画像クリア）。
2. Generate 画面を表示する。
3. **判定基準**:
   - ゾンビサムネイルが表示されたままにならず、404 を検知した画像が履歴ストリップから自動的に除外されて消去されること。

---

## 3. レッドチーム検証 (Red Teaming & Boundary Conditions)

### Red Team 1: 0バイト破損ディスクキャッシュの自動回復
- **テスト手順**:
  - 手動またはテストコードで `db/thumbnails` ディレクトリ内に 0 バイトの `.webp` ファイルを作成する。
  - 当該サムネイルのエンドポイント（`/api/comfy/thumbnail?filename=...`）に GET リクエストを送信する。
- **期待結果**:
  - バックエンドが例外（500 Internal Server Error）でクラッシュせず、破損ファイルを検知して削除し、正常に ComfyUI から元画像を取得・再生成して 200 WebP を返却すること。

### Red Team 2: IntersectionObserver 非対応環境または ref 未マウント時の堅牢性
- **テスト手順**:
  - `containerRef.current` がまだマウントされていない瞬間や `window.IntersectionObserver` が未定義の環境をシミュレート。
- **期待結果**:
  - コンポーネントが例外を投げずに即時可視（フォールバック表示）扱いとなり、画面が真っ白にならないこと。

### Red Team 3: ComfyUI 側で元画像が削除された場合のキャッシュ自動パージ
- **テスト手順**:
  - キャッシュ済みの画像について ComfyUI 側でファイルを削除し、サムネイル API をリクエスト。
- **期待結果**:
  - キャッシュが自動パージされ、404 が返却され、フロントエンドの履歴一覧から正常に消去されること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-252-test-plan.md`

