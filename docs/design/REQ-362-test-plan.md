# Test Plan: REQ-362 Prompt Surgeon プレビュー高速化と200件三位一体キャッシュ実装

## 1. 概要 (Overview)
本テスト計画は、REQ-362で定義されたプレビュー高速化、ゼロプローブ通信、フルサイズWebPキャッシュ生成（先行・オンデマンド）、200件上限枠制御、およびプログレッシブプレビューの受入基準を網羅的に検証する。

## 2. 受入基準マッピング (AC Coverage)

| AC番号 | 検証項目 | テストファイル | 検証方法 |
| :--- | :--- | :--- | :--- |
| **AC-1** | フルサイズWebPキャッシュヒット時ゼロプローブ (<5ms, ステータス200, WebP形式) | `backend/tests/integration/legacy/test_comfy_proxy.py` | キャッシュファイル配置状態で `/api/comfy/view` を呼び出し、ComfyUIへのHTTP呼び出しが発生しないこと、media_type="image/webp" であることを検証 |
| **AC-2** | サムネイルキャッシュヒット時ゼロプローブ | `backend/tests/integration/legacy/test_comfy_proxy.py` | キャッシュファイル配置状態で `/api/comfy/thumbnail` を呼び出し、プローブ通信（_check_comfy_exists）がスキップされ即時返却されることを検証 |
| **AC-3** | 生成完了通知（WebSocket / executed）受信時のフルサイズWebP先行生成 | `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | `executed` イベント処理時にサムネイルとフルサイズWebP双方がディスクに生成・保存されることを検証 |
| **AC-4** | キャッシュミス時のオンデマンドWebP生成とフォールバック | `backend/tests/integration/legacy/test_comfy_proxy.py` | キャッシュ未存在時にComfyUIから取得した画像がWebP変換・ディスク保存されて返却されることを検証 |
| **AC-5** | フルサイズWebPキャッシュ220件超過時の200件自動間引き | `backend/tests/integration/legacy/test_comfy_proxy.py` | 225個のダミーキャッシュファイル作成後に保存処理を実行し、最新200個に整理されることを検証 |
| **AC-6** | SQLite `prompt_metadata` レコード200件上限パージ | `backend/tests/integration/legacy/test_prompt_metadata.py` | 205件登録時にアクティブプロンプトを除外した古いレコードから削除され200件以下に収まることを検証 |
| **AC-7** | フロントエンドのプログレッシブプレビュー描画 | `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | フルサイズ画像ロード待ち状態においてサムネイルWebPがプレースホルダーとして描画されることを検証 |

## 3. 3-Gate Baseline 検証コマンド

### Gate 1: 型検査 & 単体検証 (Typecheck & Unit)
```bash
# Frontend Typecheck
cd frontend; npm run typecheck

# Backend Typecheck
mypy backend

# 単体テスト (各コンポーネント)
cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx
backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_comfy_proxy.py -k "REQ-362"
backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_prompt_metadata.py -k "REQ-362"
backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_comfy_generation_bridge.py -k "REQ-362"
```

### Gate 2: 統合テストスイート (Integration Suite)
```bash
# Frontend 全体テスト
cd frontend; npm test

# Backend 全体テスト (並列)
backend\.venv\Scripts\python -m pytest -n auto
```

### Gate 3: 境界・異常系 (Red Teaming / Boundary Scenarios)
1. **ComfyUI 404/502 異常系**: ComfyUIで画像が削除されている場合、適切なHTTPステータス（404/502）が返却されること。
2. **破損キャッシュファイルの自己修復**: キャッシュファイルが0バイトや破損している場合、キャッシュミスとして扱われ再取得・再生成されること。
3. **並行アクセス時の間引き競合安全性**: 複数プロセスが同時に間引き処理を実行しても `FileNotFoundError` でクラッシュしないこと。
