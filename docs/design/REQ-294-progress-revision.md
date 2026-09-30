# REQ-294 AC-1 真の工程進捗: 設計差し戻し案（レビュー待ち）

## 背景と設計判断

2026-09-29 の初回 Gate 3 で、4段階の進捗リストが空であることが判明した。現行 `generateDraftApi(payload): Promise<SceneDraftResponse>` は最終結果しか返さず、Hook から工程中の開始・完了を観測できない。時間で見かけの段階を進める実装は工程の実態と異なるため採用しない。REQ-294 の既承認範囲に対する API 契約追加として、実装前に再レビューする。

**推奨 A: NDJSON ストリーミング POST。** 現行 `POST /api/speech/scene-draft` の JSON 契約を保ち、新規 `POST /api/speech/scene-draft/stream` を追加する。`SceneDraftRequest` は同一。レスポンス `application/x-ndjson` は1行1イベントの UTF-8 JSON。FastAPI の `StreamingResponse` を使い、工程境界は service 実行箇所からのみ発行する。永続ジョブ状態は持たない。

Serviceの追加シグネチャは `progress_callback: ProgressCallback | None = None` とし、`ProgressCallback = Callable[[ProgressStepKey, ProgressStatus], Awaitable[None]]` を同serviceで宣言する。`ProgressStepKey` は上記4値、`ProgressStatus` は `active | done | error`。callbackは実工程境界で await し、callback未指定の既存JSONルートは戻り値・例外契約を保つ。新規ルートのシグネチャは `generate_scene_draft_stream(payload: SceneDraftRequest) -> StreamingResponse` とし、`SessionLocal()` を generator 内で生成・closeする。

```text
{"type":"progress","step":"reference","status":"active"}
{"type":"progress","step":"reference","status":"done"}
{"type":"progress","step":"vlm","status":"active"}
{"type":"progress","step":"vlm","status":"done"}
{"type":"progress","step":"style","status":"active"}
{"type":"progress","step":"style","status":"done"}
{"type":"progress","step":"vram","status":"active"}
{"type":"progress","step":"vram","status":"done"}
{"type":"result","data":<SceneDraftResponse>}
```

`step` は `reference | vlm | style | vram`、`status` は `active | done | error`。失敗時は現在の工程を `error` とし、VRAM解放の実行・結果を報告してから `{"type":"error","error_kind":...,"message":...}` を送信する。成功を示す `result` は VRAM 解放完了後に1回だけ送信する。`vram_unloaded=false` の場合、`vram` を `error` とし、stream は `error` を送って `result` を送らない（旧JSON endpoint の `vram_unloaded` フィールド契約は保つ）。ヘッダー送信後の失敗はHTTPコードを変えられないため `error` イベントで伝える。FastAPIのRequest schema検証は開始前422、service内で見つかる無効snapshot/overrideはstream内errorイベントになる。イベントに画像・prompt・機密データを含めない。

T13の実イベント `error_kind` は `lm_studio_400 | connection_refused | timeout | invalid_request | vram_unload_failed | unknown` の6値。`invalid_request` はservice内ValueError、`vram_unload_failed` はunloadがfalseのとき。T14 transportは全6値を型に含め、T15 Hookの現行4分類にない2値は安全に `unknown` へ写してサーバーmessageを表示する。将来専用表示が必要なら別UI変更としてレビューする。

T14 client は `SceneSpeechStreamError(kind, message)` をexportし、error行でrejectする。Hookは `instanceof` でkindを取り出す。これによりサーバーの固定安全メッセージを失わず、string検索に頼らない。

### 真の工程境界

| 工程 | 開始 | 完了 |
|---|---|---|
| reference | snapshot取得・キャラ解決の前 | tone high/mid/low、Top-3、参照prompt/bubbles、画像Base64、モデル選定の後 (`speech_scene_service.py:624-696`) |
| vlm | `call_vlm` の直前 | `parse_vlm_json_with_fallback` と非空 `items` 検証後 (`:700-703`) |
| style | `convert_items_to_bubbles` の直前 | バブル生成後 (`:704-706`) |
| vram | 推論を伴う try/finally の `unload_vlm_model_with_retry` 直前 | unload 完了後 (`:707-708`) |

参照工程で失敗した場合はモデルを呼んでいないため unload は不要。VLM/スタイル工程で例外が起きても `finally` で unload を完了してから error を送る。stream のキャンセル/切断時も生成タスクを中止し、unload の完了を待って DB session を閉じる。イベントキュー方式を採る場合、bounded queue と task cancellation の終了処理をテストする。`StreamingResponse` のジェネレータ内部でDBを所有し、FastAPI dependency session が応答本文送信中に閉じることを前提にしない。既存 JSON endpoint と処理ロジックを共有し、二重実装しない。

### フロントエンド契約

`sceneSpeechApi.generateStream(payload, options?)` が `fetch` の `ReadableStream` を `TextDecoder` で増分解析する。`options?: { onProgress?: (event: SceneSpeechProgressEvent) => void; signal?: AbortSignal }` とする。改行が複数チャンクに分かれる場合、複数行が1チャンクに入る場合、最後の改行がない場合を扱う。`result` で Promise を resolve し、HTTPエラー・`error` イベント・切断前に `result` がない場合は reject。Hook はクリック直後に reference active を表示し、受信したイベントだけで4段階の状態を更新する。Onboarding 表示中も直近進捗を保持し、保存/スキップ後に戻す。`generationId` と `AbortController` を併用し、閉じる・再試行・参照切替後の旧イベント/結果を破棄する。現在の注入可能 `generateDraftApi` は `(payload: SceneDraftRequest, options?: SceneSpeechStreamOptions) => Promise<SceneDraftResponse>` に拡張する。既存の一引数モックは型互換を維持し、実画面の標準経路はstreamを使う。

イベントは Progress State 内の4工程リストだけを更新する。Onboarding は初出キャラの独立フォーム表示で、推論工程の名称ではない。`error` イベントは Error State、`result` は Onboarding 完了時または完了待ちの後で Review State に遷移する。最終 `result` 行にも `\n` を付けて送信し、generator は直後に終了する。フロントは result 後の未知行/重複resultを失敗として検知する。

**代替 B: job ID + polling。** POSTでジョブ作成、GETで状態取得、キャンセルAPIを追加する。ネットワーク切断後の再接続には強いが、ジョブ保存、TTL、同時実行制御、DB session と unload の所有境界が増える。今回の単一モーダル1回生成には A が小さい。

### 既存 WebSocket / job 基盤との比較（ユーザー指摘を受けて確認）

| 方式 | 現行コードの利用可能部分 | REQ-294に追加で必要な構造 | 判断 |
|---|---|---|---|
| A: 同一POSTのNDJSON | 既存 `scene-draft` のRequest/Responseとserviceを共有。fetch単位で工程と結果が閉じる | service callback、stream router、増分parser | 推奨。別クライアント混線がなく、切断時の生成taskとunloadの所有関係が明確 |
| B: 既存 `/api/ws` 配信 | `backend/app/routers/ws.py` のmanagerは `active_connections: list[WebSocket]` と全員向け `broadcast()`。`resource_monitor` が `SYSTEM_STATS` を全配信。frontend `systemWsService` はsingleton 1 callbackで、`useSystemStats` が `SYSTEM_STATS` と `VRAM_RECOVERED` を処理 | request/client別購読、WS接続ACK、HTTP生成要求との相関ID、再接続/非表示時の欠落復元、複数購読者配信、全配信による他ユーザーへの工程漏洩防止 | 現行のまま工程をbroadcastするのは不可。接続管理とUI購読の改修がAより広い |
| C: 既存 speech-batch job polling を拡張 | `SpeechBatchManager` はin-memory `_jobs/_tasks`、`/api/speech-batch/jobs/{id}`、frontend `BatchSpeechTransformModal` は1秒間隔のReact Query再取得 | scene専用job/schema、工程状態、cancel、期限・同時実行制御、結果管理、VRAM/unload所有 | 再接続後の状態復帰が必要なら有利。今回は範囲が広い |

ComfyUI用の `useComfyWebSocket` / `comfyWsService` は外部 ComfyUI の `/ws?clientId=...` に接続し、Prompt Surgeon の `/api/ws` と別系統のため流用対象にならない。現行 `systemWsService` はタブ非表示時にsuspendされるため、単純な進捗broadcastは欠落する。NDJSONも通信切断時に再接続で途中復元はしないが、Hookがエラー表示と再試行を提供し、serverはunloadを完遂する。

**リスク:** reverse proxy の応答バッファリングで進捗が遅れる可能性、切断時キャンセルでも unload を完遂する必要、現行 JSON と stream で処理が乖離しないこと、streamではservice内の入力エラーをHTTP 4xxでなくerrorイベントとして伝えること。ローカル FastAPI と実ブラウザの両方でイベント到着順・時間を記録し、バッファリングを確認する。完了済み T2 のキャプション修復、T1 の空 items 修復とは独立。

既存repoにNginx/Apache設定は見つからず、`frontend/vite.config.ts` の `/api` 開発proxyとbackend直配信が確認できた。Gate 3は両経路で工程が順に到着することを確認する。将来別proxyを置く場合は、その設定の応答バッファリングをその環境で確認する。

## BA監査と反映

REQ-294 PBI本文と本改訂案の全文を `local_model_adapter.py --unload-after ba-audit` へ渡し、Qwen3.5 9B reasoning Q6_Kで監査した。監査exit 0、直後の自動unloadは `VRAM freed`、finallyの明示unloadもexit 0 (`No models currently loaded`)。

| 指摘 | 判断 |
|---|---|
| JSON/streamの処理分岐 | 同一service関数と同一finally unloadを両endpointから使用する仕様を明記。 |
| Progress/Onboarding/Error/Reviewの対応 | 上記のState写像を明記。工程イベントはProgressのリストだけを更新する。 |
| result行の終端とstream終了 | `\n`を付けて1回送信し、generatorを直後に閉じる仕様を明記。 |
| proxy buffering | 現repoのVite開発proxy/直配信で実到着を測る。未確認のNginx設定を前提にしない。 |
| 切断/例外時のVRAM leak | service finallyとproducer cancel/awaitの検証を維持する。監査文の「unload後に送信失敗すればモデルが残る」は時系列に矛盾するため採用しない。 |
| 全イベントへのrequest_id | この設計は1fetch=1streamで分離され、HookのgenerationIdが旧イベントを遮断する。全配信WSと異なり別リクエストのイベントが混線しないため必須化しない。 |
| Rev16 batch処理 | 工程イベントだけを追加し、T1の抽出・VLMバッチの処理量と順序を変更しない。 |

## 提案 DAG と検証

既存8カードと Gate修復 T9〜T11 の完了を前提に、次のカードは**レビュー承認後にのみ ready/dispatch**する。いずれも変更対象3ファイル以下、目安300行以下。

| ID | 役割・対象ファイル | 依存 | 検証 |
|---|---|---|---|
| T12 | service工程イベント: `speech_scene_service.py`, `test_speech_scene_service.py` | T1再作業 | scoped mypy、service pytest |
| T13 | streaming router: `speech_scene.py`, `test_speech_scene_router.py` | T12 | scoped mypy、router pytest、stream切断時unload |
| T14 | frontend NDJSON transport/type: `api/client.ts`, `api/types.ts`, `api/__tests__/sceneSpeechStream.test.ts` | T13 | typecheck、分割チャンク/エラー/abort Vitest |
| T15 | Hook受信・状態同期: `useSceneSpeechGeneration.ts`, hookテスト | T14 | typecheck、順序/Onboarding/stale Vitest |
| T16 | Editor標準経路のstream接続: `SpeechBubbleEditorModal/index.tsx`, `types.ts`, Editorテスト | T15 | typecheck、Editor統合 Vitest |

Gate 1 は `mypy backend` と frontend `npm run typecheck`、Gate 2 は backend 全pytestと frontend `npm test`、Gate 3 は実ブラウザで4工程イベントの到着順、即時表示、375px表示、通信切断/キャンセル/再試行、VRAM解放、既存 JSON API 互換を確認する。進捗のテストは任意の固定タイマーで工程を進めず、人工的に制御した各 service 境界のイベントを待って状態をアサートする。
