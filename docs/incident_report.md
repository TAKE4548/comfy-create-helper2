# インシデントレポート: ComfyUI 生成繰り返しに伴うキュー投入・ジョブ削除のレスポンス遅延調査報告書

## 1. 事象概要 (Overview)

ComfyUIサーバの起動後、生成（単体生成・バッチ生成・セット一括生成）を何度か繰り返していると、以下の事象が発生することが報告された。

### 観測されている事象:
1. **ジョブ削除（キューからの削除 / 実行中断）のレスポンスが顕著に遅くなる**:
   - ジョブ管理モーダル等から待機中ジョブの削除や中断ボタンを押した際、UIが反応してキューから消えるまでに数秒〜十数秒のタイムラグが発生する。
   - 生成回数・ジョブ完了回数が増えるにつれて、この遅延が顕著に悪化する。
2. **キュー投入（生成開始）のレスポンス低下**:
   - 「生成」ボタンまたは「セット一括生成」を押下後、キューに登録されて実行が開始されるまでの応答時間が徐々に悪化する。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

- **再現手順**:
  1. バックエンドおよび ComfyUI を起動する。
  2. 生成画面からプロンプト生成（10〜30回以上、または複数セット一括生成）を複数回繰り返し実行し、履歴（History）が ComfyUI 内およびクライアント内に蓄積された状態にする。
  3. バッチ生成または複数セット生成を投入し、キューに複数ジョブを待機（Pending）させる。
  4. ジョブ管理モーダルを開き、待機中ジョブの「削除（ゴミ箱）」ボタンを押下する。
  5. **観測結果**:
     - ジョブ削除リクエストの完了までに数秒以上の待機時間が発生し、削除完了が顕著に重くなる。
     - 生成ボタン押下時にも `queuePrompt` の完了待ちが重くなり、UIのレスポンスが全体的に低下する。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/store/useGenerationStore.ts` | L1274-1350 (`cancelJob`) | ジョブ削除時に `deleteQueue`（または `interrupt`）、未生成ジョブに対する不要な `deleteHistory`、および `fetchQueue` の計3回の HTTP リクエストが完全直列（Sequential `await`）で実行されている。 |
| 2 | `frontend/src/store/useGenerationStore.ts` | L1353-1380 (`clearPendingQueue`) / L1382-1434 (`cancelAllJobs`) | 待機キューの一括クリアや全ジョブ中断時にも、`deleteQueue`、`deleteHistory`、`fetchQueue` の複数 HTTP リクエストが直列に順次実行されている。 |
| 3 | `frontend/src/store/useGenerationStore.ts` | L733, L778, L807 (`ws.onmessage`) / L1148-1207 (`fetchHistory`) | ジョブ完了時（`executing: node=null`, `executed`, `execution_complete`）に `fetchHistory`（`GET /api/comfy/history?max_items=100`）が高頻度で多重発火し、ComfyUI およびバックエンドプロキシの通信帯域・イベントループを圧迫している。 |
| 4 | `backend/app/routers/comfy.py` | L159-175 (`get_history`), L199-218 (`manage_history`), L120-140 (`manage_queue`) | ComfyUI へのプロキシエンドポイントにおいて、単一の `httpx.AsyncClient` コネクションプールを介して通信しているが、肥大化した `/history` の送受信が並行して走ることで他リクエスト（`/queue`, `/prompt`）がブロック・遅延する。 |
| 5 | `frontend/src/store/useGenerationStore.ts` | L1086-1115 (`queuePrompt`) | プロンプト投入ごとに `localStorage` のメタデータを走査・パース・クリーンアップする処理が走り、生成回数増加に伴いメインスレッドの処理負荷が増加する。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 原因1: `cancelJob` における不要な `deleteHistory` 呼び出しと 3段直列 HTTP 通信のオーバーヘッド (ジョブ削除遅延の主因)
- `frontend/src/store/useGenerationStore.ts` の `cancelJob`（L1274-1350）では、ジョブ1件の削除に対して以下の 3 つの HTTP 通信を直列 `await` で順次実行しています：
  1. `await comfyApi.deleteQueue({ delete: [promptId] })` （実行中の場合は `interrupt`）
  2. `await comfyApi.deleteHistory({ delete: [promptId] })`
  3. `await get().fetchQueue()`
- **問題点**:
  - 待機中（Pending）のジョブは ComfyUI の実行キュー（Queue）にのみ存在し、履歴（History）には一切登録されていません。それにもかかわらず、毎回 `deleteHistory` を呼び出して ComfyUI の `/history` エンドポイントへ無駄な POST 通信と内部キューの排他ロック（Mutex Lock）アクセスを行っています。
  - さらに、ComfyUI 側はキューの削除が行われると WebSocket 経由で `status` イベントをブロードキャストし、フロントエンド側で自動的に `fetchQueue()` が発火します。それと重複して末尾で明示的な `await get().fetchQueue()` を直列同期待ちしているため、1回の削除操作に対して合計 3 往復のネットワークラウンドトリップと ComfyUI サーバの処理待ちが累積し、顕著なレスポンス遅延を引き起こしています。

### 原因2: 生成履歴（History）の肥大化と重複ポーリングによる ComfyUI / プロキシサーバの負荷増大 (キュー投入・削除全般の遅延要因)
- ComfyUI は生成完了ごとに、ノード定義や実行結果を含む詳細な JSON データをインメモリの `self.prompt_queue.history` に蓄積します。
- フロントエンドではジョブ完了に伴い、`ws.onmessage` 内で `executed`（L778）、`execution_complete`（L807）、`executing: node=null`（L733）の各タイミングで `fetchHistory()`（`GET /api/comfy/history?max_items=100`）が連続して重複発火します。
- 生成を繰り返すにつれて ComfyUI の `/history` の JSON ペイロードサイズは数MB〜数十MBに肥大化します。ComfyUI（Python aiohttp / GIL）が巨大な JSON をシリアライズして送信する間、ComfyUI のシングルイベントループが占有され、後続の `/prompt`（キュー投入）や `/queue`（キュー削除・確認）リクエストの受付・処理がキューイングされて応答待ちが発生します。

### 原因3: WebSocket イベントと手動フェッチの二重実行によるコネクション競合
- キュー投入時（`queuePrompt`）やジョブ削除時（`cancelJob`）において、API 呼び出し完了直後の手動 `fetchQueue()` と、ComfyUI が WebSocket 経由で送信する `status` イベントハンドラによる `fetchQueue()` がミリ秒単位で同時に発生しています。
- これにより、同じ `/queue` 取得リクエストがバックエンドおよび ComfyUI へ多重に送られ、ComfyUI 内部の `PromptQueue.mutex`（排他制御ロック）の競合が発生しています。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug - 実装バグ・非効率な通信/状態更新シーケンス)**
  * 外部仕様の変更や新機能の要件定義ではなく、フロントエンドの `useGenerationStore` における不要な API 呼び出し（未実行ジョブへの `deleteHistory`）、過剰な直列 `await` 通信、ジョブ完了時の重複 `fetchHistory` 呼び出し、および ComfyUI との通信オーケストレーションの非効率性に起因する実装上のパフォーマンス課題です。

---

## 6. 次のステップ提案 (Next Action)

根本原因の特定と分類（Type A）が完了しました。
本不具合（ジョブ削除・キュー投入のレスポンス遅延）を解消し、生成を繰り返した後でも軽快に動作するよう改修するための設計・実装計画を策定するため、**`/dev-design` ワークフロー** への移行を提案します。
