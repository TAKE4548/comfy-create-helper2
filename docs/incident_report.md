# インシデントレポート: 複数端末環境におけるスナップショット画像（サムネイル・プレビュー）の表示不全

**日時**: 2026-09-16  
**報告者**: Incident Analyst  
**対象コンポーネント**: 
- `backend/app/services/snapshot_service.py`（スナップショット作成・外部 ComfyUI 画像ダウンロード処理）
- `backend/app/config.py`（ComfyUI 接続設定 `settings.comfy_url`）
- `frontend/src/pages/GeneratePage/hooks/useSnapshotActions.ts`（スナップショット保存リクエスト）
- `frontend/src/hooks/useComfyWebSocket.ts`（ComfyUI URL 解決 `resolveComfyUrl`）
- `frontend/src/pages/HistoryPage.tsx`（履歴一覧・サムネイルおよびモーダルプレビュー表示）
**分類**: **Type A（実装バグ / Implementation Bug）**

---

## 1. 障害概要

- **症状**:
  - 生成画像を保存（スナップショット登録）した端末と異なる端末で「History（履歴）」ページを閲覧すると、サムネイルおよびプレビュー（モーダル）の双方が実画像を表示できず、読み込みエラーまたはプレースホルダー表示となる。
  - 一方、保存操作を行った端末自身では正常に画像が表示される。
  - また、「生成履歴（Generate ページの履歴一覧）」では、異なる端末間であっても同様の画像表示不全は発生しない。
- **影響範囲**:
  - 2026-09-16 にクライアント端末（LAN IP: `192.168.3.10`）から保存されたスナップショット（ID: 4108 〜 4177 の計 68 件）。
  - 保存された画像の実体ファイルが `db/snapshots/` に永続化保存されておらず、DB 上に外部 ComfyUI URL（`http://192.168.3.13:8188/view?...`）がそのまま記録され、`thumbnail_path` が `NULL` となっている。

---

## 2. 再現手順

1. 端末 A（例: LAN 接続された外部 PC またはタブレット `192.168.3.10`）のブラウザから、サーバーホストの Prompt Surgeon（`http://192.168.3.13:8000`）にアクセスする。
2. 端末 A で画像を生成し、生成完了した画像を「Save」または「スナップショット保存」ボタンから保存する。
3. サーバーホスト端末 B（例: `127.0.0.1`）または別のクライアント端末 C で「History」ページ（`/history`）を開く。
4. **結果**:
   - 端末 A ではキャッシュまたは直接通信によりサムネイル・プレビューが見える。
   - 端末 B / C では、サムネイルが真っ黒またはプレースホルダー表示となり、クリックしてモーダルプレビューを開いても実画像が読み込めない。
   - 一方、「Generate」ページの履歴ドロワー／カルーセル（生成履歴）では、端末 B / C でもサムネイルが正常に表示される。

---

## 3. ログ・エビデンス

### エビデンス①: `logs/app.jsonl` の調査結果
- `python scripts/inspect_logs.py --errors --tail 10` を実行したところ、以下のエラーが大量に記録されていた：
  ```
  [2026-09-16T19:55:29.456+09:00] [ERROR] [backend ] [app.services.snapshot_service] Failed to download snapshot image from http://192.168.3.13:8188/view?filename=ComfyUI_temp_etsmj_00019_.png&subfolder=&type=temp&t=407bb57b-3030-434b-bddc-a165a6e78571: <urlopen error timed out>
  [2026-09-16T21:59:06.372+09:00] [ERROR] [backend ] [app.services.snapshot_service] Failed to download snapshot image from http://192.168.3.13:8188/view?filename=ComfyUI_temp_etsmj_00161_.png&subfolder=&type=temp&t=86f6ceb2-b419-4f81-9bfe-e33fc69b1127: <urlopen error timed out>
  ```
- クライアント IP `192.168.3.10` からの `POST /api/snapshots` は、毎回タイムアウト制限である **5000ms（約 5.02 秒）** を要して HTTP 201 を返却していた。
  - 例: `{"timestamp": "2026-09-16T21:59:06.386+09:00", ... "message": "POST /api/snapshots completed with 201 in 5018.51ms", "client_ip": "192.168.3.10"}`

### エビデンス②: データベース保存状態の確認（`db/prompt_surgeon.db`）
- `snapshots` テーブルを調査：
  - 正常時（ID <= 4107）:
    - `image_path`: `/api/snapshots/images/ComfyUI_temp_xpuvb_00088__15c91cf5.webp`
    - `thumbnail_path`: `/api/snapshots/images/thumb_ComfyUI_temp_xpuvb_00088__15c91cf5.webp`
  - 異常時（ID >= 4108 〜 4177, 計 68 件）:
    - `image_path`: `http://192.168.3.13:8188/view?filename=ComfyUI_temp_etsmj_00089_.png&subfolder=&type=temp&t=...`
    - `thumbnail_path`: `NULL`

### エビデンス③: バックエンドサーバーにおける ComfyUI 疎通確認
- サーバーホスト（Windows）上で Python によるソケット疎通および `urllib` をテスト：
  - `http://127.0.0.1:8188/view` : 即座に接続成功（ComfyUI が応答）。
  - `http://192.168.3.13:8188/view` : **TimeoutError（10035 / timed out）** で失敗。
- **理由**:
  - ComfyUI は WSL2 内で稼働しており、Windows ホストでは `127.0.0.1` 経由のポートフォワーディングのみが自動構成されている。
  - Windows ホスト自身の外部 LAN IP（`192.168.3.13`）宛ての通信は、Windows ファイアウォールおよびヘアピン NAT / ループバックルーティングの制約により WSL2 に転送されずタイムアウトする。

### エビデンス④: 生成履歴（Generate ページ）が他端末でも表示される理由
- [`frontend/src/pages/GeneratePage/components/DesktopLayout.tsx`](frontend/src/pages/GeneratePage/components/DesktopLayout.tsx) L819:
  - サムネイル描画時に `toThumbnailUrl(img)` を適用している。
- [`frontend/src/utils/thumbnailUrl.ts`](frontend/src/utils/thumbnailUrl.ts) L14:
  - URL に `/view?` が含まれる場合、バックエンドのサムネイルプロキシ `/api/comfy/thumbnail?filename=...` に変換している。
- このエンドポイントは FastAPI バックエンド（Port 8000）が受け持ち、内部設定 `settings.comfy_url`（`http://localhost:8188`）を通じて ComfyUI と通信するため、クライアントがどの端末であっても正常に表示される。

---

## 4. 根本原因分析（Root Cause Analysis）

### 根本原因 1: `SnapshotService.create_snapshot` におけるクライアント提供外部 URL の無検証利用
- **該当箇所**: [`backend/app/services/snapshot_service.py`](backend/app/services/snapshot_service.py) L92-L116
- **メカニズム**:
  1. クライアント端末（`192.168.3.10`）が `resolveComfyUrl` によって解決された ComfyUI URL（`http://192.168.3.13:8188/view?...`）を `payload.image_path` に格納して `POST /api/snapshots` を呼び出す。
  2. バックエンドは、自環境で ComfyUI と通信するための内部 URL（`settings.comfy_url = "http://localhost:8188"`）を持っているにもかかわらず、クライアントから渡された `payload.image_path`（`192.168.3.13:8188`）に直接 `urllib.request.urlopen` を試行する。
  3. サーバーホスト内部からの自機 LAN IP（`192.168.3.13:8188`）宛て通信がタイムアウトし、画像ダウンロードが失敗する。

### 根本原因 2: 例外キャッチ時のサイレントフォールバックによる不正レコード永続化
- **該当箇所**: [`backend/app/services/snapshot_service.py`](backend/app/services/snapshot_service.py) L114-L116, L138-L145
- **メカニズム**:
  1. 画像ダウンロード失敗時、`except Exception as e:` でエラーログを出力するのみで、処理を中断・失敗させない。
  2. 結果として `saved_image_path` はフォールバックとして外部 URL のまま維持され、`saved_thumbnail_path` は `None` のまま DB に登録される。
  3. `../db/snapshots/` への WebP 変換・永続化保存も行われない。

### 根本原因 3: `HistoryPage.tsx` における絶対 URL / 相対パスの依存
- **該当箇所**: [`frontend/src/pages/HistoryPage.tsx`](frontend/src/pages/HistoryPage.tsx) L523, L639, [`AlbumDetailView.tsx`](frontend/src/pages/HistoryPage/components/AlbumDetailView.tsx) L426
- **メカニズム**:
  - `snap.thumbnail_path` が `NULL` の場合、`snap.image_path`（`http://192.168.3.13:8188/...`）がそのまま `<img>` の `src` に渡される。
  - 保存端末（`192.168.3.10`）ではブラウザキャッシュまたは直接 LAN 通信により表示されるが、別端末（`127.0.0.1` やポート 8188 に直接到達できない端末）では画像の取得に失敗する。

---

## 5. 影響データと復旧可能性

- **影響件数**: 68 件（Snapshot ID: 4108 〜 4177）
- **データ実体の残存状況**:
  - `http://127.0.0.1:8188/view` 経由で対象画像（例: `ComfyUI_temp_etsmj_00089_.png`）の存在を確認したところ、HTTP 200（約 1.7〜1.8MB）で全量取得可能であることを実証済み。
  - ComfyUI の一時フォルダ（`type=temp`）にまだ画像ファイルが残存しているため、マイグレーションスクリプトまたは修復処理によって、正規の WebP 画像およびサムネイルとして `db/snapshots/` に永続化し、DB のパスを修復することが可能。

---

## 6. 是正方針（設計フェーズへの申し送り）

1. **バックエンド ComfyUI 画像ダウンロード処理の是正** (`SnapshotService.create_snapshot`):
   - クライアントから渡された `payload.image_path` が ComfyUI の `/view` URL である場合、ホスト名部分をサーバーの内部設定 `settings.comfy_url`（`http://localhost:8188` または `http://127.0.0.1:8188`）に正規化してダウンロードを行う。
   - 万一ダウンロードに失敗した際のエラーハンドリングを強化し、サイレントな不正データ永続化を防止する。
2. **既存 68 件のスナップショット修復マイグレーション**:
   - `thumbnail_path IS NULL` かつ `image_path LIKE 'http%'` のレコードを対象に、内部 ComfyUI から実画像を取得して `db/snapshots/` に WebP 保存・サムネイル生成を行い、DB レコードを正規の相対 URI（`/api/snapshots/images/...`）に更新する修復スクリプトの作成・実行。
3. **フロントエンド側の堅牢性向上**:
   - `HistoryPage` や `HistoryModalPreview` においても、万一未保存の ComfyUI URL が渡された場合に備えた URL 解決またはフォールバックの検討。
