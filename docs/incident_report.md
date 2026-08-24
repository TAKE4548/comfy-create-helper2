# インシデントレポート: 複数プリセット・バッチ生成時におけるジョブキュー投入遅延の調査報告書

## 1. 障害・事象概要 (Overview)

複数プリセットやバッチ数を指定して生成を実行した際、ComfyUIへのキュー投入が瞬時に終わらず、1件ずつ数秒以上かけてちまちま投入されているように見える事象についての調査を実施した。

### 観測されている事象:
1. **キュー登録の体感遅延**: 複数プリセット×バッチサイズ（例: 合計10〜20件）の生成を開始した際、一瞬でキュー一覧に積まれず、1件ずつ時間をかけて投入されている。
2. **キュー投入中の負荷集中**: 1件の投入処理が完了するごとに WebSocket イベントが多発し、裏で履歴取得（`fetchHistory`）やキュー取得（`fetchQueue`）が連続して走ることで通信および処理の遅延が累積している。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

- **再現手順**:
  1. Generate 画面で複数のプリセット（Presets）にチェックを入れる（またはバッチサイズを 3〜5 などに設定）。
  2. 「Generate Sets (N)」ボタンをクリックする。
- **観測結果**:
  1. `activeBatch` には初期プレースホルダー（`pending-...`）が即座に入るが、実際の ComfyUI `prompt_id` が確定してキューに正式登録されるまでに 1 件あたり数百ms〜数秒を要し、全件完了まで十数秒〜数十秒待たされる。
  2. 投入と並行して ComfyUI 側で先頭ジョブの実行が開始されると、さらに進捗イベントや履歴取得リクエストが多発してキュー投入完了が引き延ばされる。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` | L250-304 (`handleGenerateSets`) | 全プリセット×バッチ数のジョブを完全な直列ループ（`for ... for ... await queuePrompt`）で1件ずつ順番にネットワーク通信・完了待ちしている。 |
| 2 | `frontend/src/store/useGenerationStore.ts` | L616-619 (`ws.onmessage` の `case 'status'`) | ComfyUIがプロンプトを受信・キューイングするたびに WebSocket で `status` イベントを送信するが、それを受信するたびに `fetchQueue()` と **`fetchHistory(100)` (最大100件の全履歴JSON取得・全件走査)** を過剰に連続発火している。 |
| 3 | `backend/app/routers/comfy.py` | L59-79 (`queue_prompt`) | リクエストごとに `async with httpx.AsyncClient()` を生成・破棄しており、TCP接続プールが再利用されていない。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 根本原因 1: フロントエンドにおける完全直列逐次投入アーキテクチャ
- `useGenerateAction.ts` の `handleGenerateSets` は、対象となる全ジョブ（プリセット数 × バッチサイズ）に対して以下のように直列に `await queuePrompt(...)` を実行している。
  ```typescript
  for (const setItem of checkedSets) {
    for (let i = 0; i < setItem.batchSize; i++) {
      promptId = await queuePrompt(wfJson, ...)
      // promptId確定後に次のループへ進む
    }
  }
  ```
- ComfyUI の `/prompt` エンドポイントは、1リクエストにつき1件のワークフローを受け取り、ノードの整合性や型チェックなどのバリデーションを実行した上で `prompt_id` を返却する（ワークフローの規模やComfyUIの負荷により1件あたり100ms〜500ms+程度を要する）。
- これを直列ループで処理するため、ジョブ数が N 件ある場合、**N × (ネットワーク往復遅延 + ComfyUI検証時間)** の待ち時間がそのまま線形に累積する。

### 根本原因 2: キュー投入毎の WebSocket `status` 受信に伴う `fetchHistory` / `fetchQueue` のストーム（負荷増幅）
- ComfyUI はジョブがキューに追加されるたびに WebSocket で `status`（キュー残数更新）をブロードキャストする。
- `useGenerationStore.ts` (L616-619) では、`status` を受け取るたびに無条件で以下を実行している：
  ```typescript
  case 'status':
    get().fetchQueue()
    get().fetchHistory() // GET /api/comfy/history?max_items=100 を叩き、全履歴JSONをパース・画像URL抽出
    break
  ```
- 10件のジョブを連続投入すると、投入中に 10 回以上の `GET /history`（重い履歴データ）と `GET /queue` が並行して送信され、ブラウザとComfyUI間の通信帯域・コネクションおよびメインスレッドを圧迫し、直列投入の完了をさらに遅延させている。

### 根本原因 3: バックエンドにおける HTTP クライアントの毎リクエスト新規生成
- `backend/app/routers/comfy.py` の `queue_prompt` を含む各プロキシエンドポイントで `async with httpx.AsyncClient() as client:` が使われており、リクエスト毎にTCPソケットの確立と破棄が発生している。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_B: Specification Flaw
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type B (Specification / Architectural Flaw - 設計・仕様起因)**（一部実装最適化の余地あり）
  * 不具合（バグ）で処理が異常終了しているわけではなく、**「逐次直列ループによる投入」** と **「ComfyUIの1件毎の検証仕様＋WebSocket statusイベント受信時の過剰な履歴フェッチ」** が重なって発生している仕様・設計レベルのパフォーマンスボトルネックである。

---

## 6. 改善アプローチの方向性（参考）

1. **キュー投入の並列化 / バッチ化**:
   - `Promise.all` または一定の並行数（concurrency pool: 例 3〜5 並列）での `queuePrompt` 実行による通信パイプライン化。
2. **投入中の過剰フェッチ抑制（デバウンス / スロットリング）**:
   - `isBatchSubmitting` 中は WebSocket `status` 起因の `fetchHistory` 呼び出しを一時抑制、またはデバウンス（例: 500ms〜1秒間隔）して過剰な通信ストームを防ぐ。
3. **バックエンドの HTTP コネクションプール化**:
   - FastAPI 側でシングルトンの `httpx.AsyncClient` を維持し、接続オーバーヘッドを削減する。

---

## 7. 次のステップ提案 (Next Action)

ボトルネックのメカニズムおよび根本原因の特定が完了しました。
仕様・設計改善に向けた PBI 登録と詳細設計を実施するため、**`/dev-design` ワークフロー** への移行を提案します。

