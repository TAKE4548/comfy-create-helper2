# REQ-354 T1 稼働確認記録

- 実施日: 2026-10-13 (Asia/Tokyo)
- 判定: INCONCLUSIVE。workflow応答のalias欠落は確認したが、listenerのworkspace rootと起動引数を特定できず、backend restart前提を満たさない。
- FE接続先: `frontend/vite.config.ts:74,80` のproxy targetは `http://127.0.0.1:8000`。
- Listener: `Get-NetTCPConnection -LocalPort 8000 -State Listen` で `0.0.0.0`, PID `44412`。
- Listener executable: `Get-Process -Id 44412` は `C:\Users\audih\AppData\Local\Programs\Python\Python312\python.exe`、開始時刻 `2026-10-12 04:49:19`。server-manager設定のworkspace backend venv (`backend\\.venv\\Scripts\\python.exe`) と一致しない。`Get-CimInstance Win32_Process` ではcommand lineを取得できず、外部root使用有無は未確認。
- 設定root: `tools/server-manager/config.json` は backend `../../backend`、venv python ` .venv\\Scripts\\python.exe`、起動引数 `-m uvicorn app.main:app --host 0.0.0.0 --port 8000`。
- 稼働master API: `GET /api/mapping-masters/4` は id=4, param_name=`seed`, fallback_param_names=`[noise_seed]`。
- 稼働workflow API: `GET /api/workflows/69` のseed mapping id `3545`〜`3551` は全て `master_id=4`、node `1260:1398`, `1260:1396`, `1351`, `1298:1223`, `1283:1216`, `1291:1221`, `1297:1222`。全てのfallback_param_namesが空/null相当。
- Read-only DB照合: workspace backend設定の `../db/prompt_surgeon.db`。master4保存値は `["noise_seed"]`、workflow69の7 mappingはvariant id 38〜44。該当fallback列を確認。DBは変更していない。
- Live OpenAPI `GET /openapi.json`: `WorkflowMappingRead.properties` に `fallback_param_names` が存在しない。
- Workspace import: `backend/.venv/Scripts/python.exe` で `app.routers.workflows.__file__` はworkspaceの `backend/app/routers/workflows.py`。
- 指定テスト: `backend/.venv/Scripts/python.exe -m pytest tests/test_req353_seed_mapping_api.py -q` → exit 0、4 passed (3 subtests passed)、1 deprecation warning。
- Restart: 未実施。稼働プロセスのroot/起動引数および処理中jobを安全に確認できていないため、対象backendを確定できない。外部プロセス/checkoutを調査していない。
- FE refetch/network確認: 未実施。T1で必要なlistener root確認後に継続する。
- 次の対応: coordinatorが稼働プロセスのrootとjob状態を確定後、workspace backend限定restartを判断する。alias欠落が残る場合はT1/T4受入を保留し、設計へ差し戻す。

## 再確認結果 (coordinator調査後)

- 判定: COMPLETED。初回のINCONCLUSIVEは当時の証拠状態として保持し、以下を再起動後の結果とする。
- 再起動前generation gate: 134 jobs、queued/submitting/running/unconfirmedは各0。`GET /api/generation/upstream-queue` のrunning/pendingは空、`GET /api/comfy/queue` のqueue_running/queue_pendingも空。server-manager `action_in_progress=null`。
- 再起動前listener ancestry: PID 44412 (global Python312) → PID 13232 (workspace `backend\\.venv\\Scripts\\python.exe`) → PID 40648 (`run_server.bat`, workspace `tools/server-manager` log path)。子プロセスのimage自体はglobal Python312であり、workspace venv imageとは記載しない。
- 承認済みbackend-only manager restart後: PID 44412終了、新listener PID 26320 (Python312 image) → 親PID 11704 (workspace backend venv Python) → 祖父PID 48956 (cmd、workspace `tools/server-manager\\run_server.bat`)。workspace manager配下の起動を確認。ComfyUIやfrontendはrestartしていない。
- workspace direct import: executableはworkspace `backend/.venv/Scripts/python.exe`、`app.routers.workflows.__file__` はworkspace `backend/app/routers/workflows.py`。
- 再起動後live OpenAPI: `WorkflowMappingRead.fallback_param_names` はoptional nullable array(string)、title `Fallback Param Names`。OpenAPI propertyに`default`は出力されず、requiredにも含まれない（Python初期値NoneはOpenAPIのdefaultキーワードを意味しない）。
- 再起動後 `GET /api/mapping-masters/4`: `fallback_param_names=[noise_seed]`。`GET /api/workflows/69`: seed mapping id 3545〜3551の全7件 (rough/detailを含む) が `[noise_seed]` を返す。
- FE proxy network確認: `GET http://127.0.0.1:5173/api/workflows/69` も同7 mappingの全てで `[noise_seed]`。APIとFE proxyのruntime契約一致を確認。
- queue再確認: `GET /api/generation/upstream-queue` running/pending empty、`GET /api/comfy/queue` queue_running/queue_pending empty。prompt送信は行っていない。
- 既存のworkspace import、指定pytest (4 passed、3 subtests passed) とAPI/typecheck evidenceを維持。source/config/DBは変更していない。再起動以外の追加変更なし。
- 結論: T1のruntime一致とFE経由のalias取得を確認。T1をCOMPLETEDとしてcoordinatorへ返す。T4で本記録の証拠を参照可能。

## T4 連携確認

- 実施日: 2026-10-13 (Asia/Tokyo)。ユーザーは当日、(1) listener実行元とgeneration jobを安全確認してから再開、(2) `fallback_param_names` のOpenAPI `default`を省略しPython初期値Noneと区別する、(3) runtime response interceptionの代わりにT3自動回帰証拠でAC-4を受け入れる、を承認。
- T1〜T3 evidence: T1は上記のworkspace manager restart後のlistener ancestry、live API/OpenAPI/FE proxy一致、pytest 4 passed・3 subtests、source path workspace内を記録。T2はpytest 6 passed・10 subtestsおよびmypy成功。T3は `cd frontend; npm run typecheck` exit 0 (`tsc -b --noEmit`)、Vitest指定5 files/63 tests passed。T3の新規seed回帰ケースはnormal/checked-set双方で、有効な先行slotと解決不能な後段slotを設定し、候補値の準備後も `submitGenerationBatch`、`setActiveBatch`、`isBatchSubmitting` setterを呼ばず、node 4と `seed`/`noise_seed` 候補を含むエラーを確認する。既存random 11/22/33ケースは `noise_seed` のみ存在しown `seed` keyがないことを確認。
- Positive runtime E2E (AC-2): workflow 69をFEから再取得し、batch size 3でGenerate。batch ID `78d8958c-e5fc-41f6-88be-195347cf0746` の3件は `GET /api/generation/state` で全て `succeeded`、session/scopeは同一sessionのnormal。Comfy prompt IDsは順に `13935ec1-fc5e-4bf5-a083-a4ec5b656a37`, `dab28789-3172-4ef9-8535-2baf7b57d89a`, `04a6f2b0-95ca-45ad-a05d-c8d0f919cce2`。時刻は2026-10-13 03:04:28〜03:06:26 JST（2026-10-12 18:04:28〜18:06:26 UTC）。`GET /api/comfy/history/{prompt_id}` の成功graph inputsでrough `1260:1398` とdetail `1260:1396` の両nodeにown `seed` keyがなく、`noise_seed` はbatch順に `(3612915999, 3149064762)`, `(3560856115, 1314242313)`, `(4022759160, 256501581)`。画面上の画像変化もユーザー確認済み。判定: PASS。
- AC-4 / unresolved later slot: 上記T3自動回帰のnormal/checked-set検証でsubmit/state setter未呼出しと候補を含むエラーを確認。2026-10-13のユーザー承認により追加のworkflow response interceptionは受入必須ではない。実HTTP POST件数を測定したとは主張しない。判定: PASS（T3自動証拠）。
- WorkflowMappingRead schema contract: workspace routerのimport pathは `backend/app/routers/workflows.py`。再起動後live OpenAPI、workspace `app.openapi()`、`backend/openapi.json`、`docs/openapi.yaml` の `fallback_param_names` propertyはnullable array(string)、title `Fallback Param Names`で4者一致。4者ともpropertyに`default`を出力せず、requiredにも含めない。指定比較コマンドとpytest結果は下記。
- T4総合判定: COMPLETED。初回listener不一致のINCONCLUSIVE記録は上記のT1再確認結果より前の履歴として維持し、承認後のT1/T4判定と区別する。

<execution_evidence>

- T1 targeted API test: `backend\\.venv\\Scripts\\python.exe -m pytest tests/test_req353_seed_mapping_api.py -q` — exit 0、4 passed、3 subtests passed。再起動後listener PID 26320、workspace manager ancestryはverification上記載のとおり。
- T2 coordinator-reported: specified backend pytest exit 0、6 passed、10 subtests passed、mypy成功。
- T3 typecheck: `cd frontend; npm run typecheck` — exit 0 (`tsc -b --noEmit`)。T3 unit tests: `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts src/utils/__tests__/seedInputResolver.test.ts src/utils/__tests__/seedBatch.test.ts src/utils/__tests__/workflowParamInjector.test.ts src/utils/__tests__/generationRecord.test.ts` — exit 0、5 files、63 tests passed。normal/checked-set後段未解決ケースのassertionと11/22/33ケースは上記T3 evidenceを参照。
- T4: `backend\\.venv\\Scripts\\python.exe -m pytest tests/test_req353_seed_mapping_api.py tests/test_req353_openapi_contract.py -q` — exit 0、6 passed、10 subtests passed、1 Starlette deprecation warning。
- T4: Task Cardの4者schema comparison command — exit 0、`runtime/local/snapshot/docs fallback contract matched; default omitted, optional nullable`。

</execution_evidence>
