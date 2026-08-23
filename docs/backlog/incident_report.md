# 障害調査報告書 (Incident Report)

## 1. 障害概要
モバイル端末等で画像生成（バッチ生成等）を開始した後にアプリを離脱（画面ロックやブラウザのバックグラウンド移行、タブ休止）し、生成完了後にアプリに復帰またはリロードした際、生成履歴ストリップに生成結果の画像が表示されない（読み込まれない）。
※ 生成自体はComfyUI側で正常に完了しており、常時アクティブに接続していた別端末やComfyUI本体のFEでは生成画像の表示が確認できる。

## 2. 再現手順
1. モバイル端末（またはPCブラウザ）から画像生成（バッチ生成含む）を開始する。
2. 生成実行中にアプリから離脱する（別アプリを開く、画面をスリープ/ロックする等によりWebSocketが切断される）。
3. ComfyUI側で生成処理が完了する。
4. アプリへ復帰、またはページをリロードする。
5. 生成履歴ストリップに完了した最新の生成画像が表示されず、リロードしても反映されない。

## 3. 根本原因 (Root Cause Analysis)
1. **`fetchHistory` における画像マージ順序の逆転（主原因）**
   - 該当箇所: `frontend/src/store/useGenerationStore.ts:L1122`
   - WebSocket の `executed` 受信時や `reconcileState` では新着画像を配列先頭に追加（`[...newUrls, ...state.batchImages]`）しているのに対し、復帰時やリロード時に実行される `fetchHistory()` では `[...state.batchImages, ...targetImages]` と既存画像の**末尾**にマージしていた。
   - `localStorage` に過去画像が存在する場合、最新の画像が配列の末尾に追いやられ、`.slice(0, 50)` による切り捨てや表示順序の不整合が発生していた。
2. **バックエンド `/api/comfy/history` のタイムアウトと件数制限パラメータ欠落**
   - 該当箇所: `backend/app/routers/comfy.py:L142-L157`
   - FastAPIのプロキシ `GET /api/comfy/history` が `timeout=5.0` 秒固定で全件取得している。ComfyUI側に過去の生成履歴が蓄積するとレスポンスJSONが肥大化し、5秒のタイムアウトで例外となり空オブジェクト `{}` が返却されていた。また `max_items` クエリパラメータに対応していない。
3. **バッチ生成時のプロンプトID永続化スキップ**
   - 該当箇所: `frontend/src/store/useGenerationStore.ts:L1017-L1035`
   - バッチ生成時（`isBatchIntermediate: true`）に `LS_KEYS.CURRENT_PROMPT_ID` への保存が行われないため、生成途中でタブがアンロードされた場合に `reconcileState` による個別プロンプトのリカバリが行われていなかった。

## 4. 障害分類
- **分類**: **Type A (Implementation Bug - 実装不具合)**
- **判定理由**: 仕様自体の不備ではなく、履歴取得処理のマージロジックの不具合、バックエンドプロキシのタイムアウト/パラメータ設計不足、およびセッション状態の永続化漏れによる実装バグであるため。

## 5. 対策方針
- `useGenerationStore.ts` の `fetchHistory` において、取得した最新履歴画像（`targetImages`）が先頭に来るようマージ順序を是正する（`[...targetImages, ...state.batchImages]`）。
- `backend/app/routers/comfy.py` の `GET /history` に `max_items` パラメータを追加・ComfyUIへ中継し、タイムアウト値を緩和する。
- 復帰時（`visibilitychange` / `focus`）および起動時のリカバリロジックを強化し、未受信の生成結果が確実に履歴へ反映されるようにする。
