---
id: REQ-380-TEST-PLAN
status: draft
tags: [test-plan, comfyui, mixed]
related_paths: [docs/design/REQ-380.md, .agents/verification.json]
---

# REQ-380 テスト計画

## Acceptance mapping and placement

| AC | Existing test file / new responsibility file | Required case and expected evidence |
| --- | --- | --- |
| AC-1 | tests/unit/test_server_manager_timeout.py、frontend/src/api/domains/__tests__/systemManager.test.ts、frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx | [REQ-380/AC-1] idleでPOST /freeを1回だけ送信。空本文200を受付成功とし、subprocess未呼出し・PID/port維持を確認 |
| AC-2 | 同上、frontend/e2e/serverManager.spec.ts（Manager用新設） | [REQ-380/AC-2] 遅延中の連打、別タブから競合、status poll後もdisabled。1回だけ送信 |
| AC-3 | tests/unit/test_server_status.py、test_server_manager_timeout.py、ServiceConnectionCard.test.tsx | [REQ-380/AC-3] executing/queuedで理由表示と送信拒否。UI表示後にbusyへ変化する競合をManager直前検証で検出 |
| AC-4 | test_server_status.py、test_server_manager_timeout.py、ServiceConnectionCard.test.tsx | [REQ-380/AC-4] STOPPEDではqueue/free要求なし、UI disabled、Manager直呼びも拒否 |
| AC-5 | frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx、frontend/e2e/settingsResponsive.spec.ts、T5 deadline regression | [REQ-380/AC-5] 次の2.5秒SYSTEM_STATS更新を表示。WS断時は2.5秒fallback取得で、断から最大5秒以内に次値を表示。取得失敗表示、未保存draft維持 |
| AC-6 | docs/design/REQ-380-document-design.mdの文書ケース、T4のsemantic確認 | 外部直接/free、idle事前確認、受付と物理解放の区別、再ロード、8899と8000境界の整合 |

試験ファイル名にticket IDを用いない。Pythonの角括弧tagはpytest.paramのidへ入れ、pytest -kで選択できる実行node IDにする。JSはit/test名の先頭へtagを付ける。既存fixtureを再利用し、内部業務関数をpatchして受入結果を製造しない。

## Integrated scenarios

1. HTTP sandboxでComfyUIのTCP/queue/freeを提供する。実Manager handler・status decode・action lockから要求を通し、native POST payloadと回数を記録する。空本文200を返して受付結果を確認する。
2. 実React component、共有Manager hook、API client、QueryClient/storeを使用し、外部fetch/WSだけを切断する。ServiceConnectionCardの既存内部mockによるunitは残せるが、追加受入ケースはtransport統合を必須とする。
3. 受付後の次のstatsへ値を変化させ、表示容量が取得値と一致することを確認する。GPU解放量そのものを計算結果やモック値から実測したと表現しない。
4. AC-5 deadline regression（T5）では実component/query/storeとtest-owned HTTP transportを使い、WS接続中にfallback GETが走らないこと、WS断後の既存2500ms設定pollで次の値が断検知から5000ms以内に画面へ反映されることをcontrolled clockで確認する。設定値だけのassertionでは期限証明にしない。追加の±50ms許容差やtelemetry stale-age cutoffを導入しない。
5. 実Manager dashboardをtest-ownedサーバーで配信し、実JSのpoll/DOM再描画とボタンの無効化を確認する。test fixture以外の実ComfyUI・サービス起動停止・実GPUは使用しない。

## Red Team and preservation cases

| ID | Injected input / failure | Required result |
| --- | --- | --- |
| RT-1 | queue running/pending、UI後のidle→executing | /free未送信、409、理由とrefetch |
| RT-2 | stopped、TCP成功だが/queue 503/timeout/切断 | unknown、503 request_sent=false、FE/BEの死活値は維持 |
| RT-3 | 不正JSON、配列欠落、数値/文字列/booleanのqueue値、2MiB超過 | unknown、安全側、PBTで例外や送信漏れなし |
| RT-4 | /free 404/500/redirect、空本文200、POST timeout/切断 | 502失敗/200受付/504未確認を区別し、自動再送なし |
| RT-5 | 同時2要求、既存restart実行中、pollが操作中にDOM再生成 | 1要求のみ、active lock維持、finally後もbusy/unknown条件はdisabled |
| RT-6 | wrong service/all/alias、未許可Origin、壊れたaction body | 400/403、native transportとsubprocess未到達 |
| RT-7 | 旧Managerの追加fieldなし、不正field | 解放のみunknown抑止、既存start/stop/restart/logsは維持 |
| RT-8 | WS断、fallback 503、古いSYSTEM_STATS、dirtyな閾値 | 古い値に最新表示を付けず更新失敗表示、dirty値保持、回復後反映 |
| RT-9 | 375/767/768/1280px、長いerror、poll後のfocus | 44×44px以上の操作域、横overflowなし、重要文言省略なし |

PBT: Python Hypothesisのrecursive JSON（max_leaves=30）からqueue envelopeを生成し、正しい空配列2つの場合だけidleになる性質と、busy/unknownでは/free回数0を検証する。FEは既存fast-checkで欠落・不正execution_state/countを生成し、解放許可に昇格しない性質を検証する。seed/失敗例を証拠に保存する。

## Local commands

cwdはproject root、PowerShellでPYTHONDONTWRITEBYTECODE=1を設定する。ここで列挙するのは承認後に実行する計画であり、設計時に実行済みのテストではない。

~~~powershell
backend\.venv\Scripts\python.exe -m pytest tests/unit/test_server_status.py tests/unit/test_server_manager_timeout.py -k 'REQ-380'
npm.cmd --prefix frontend run typecheck
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/api/domains/__tests__/systemManager.test.ts src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx -t 'REQ-380'
backend\.venv\Scripts\python.exe scripts/run_e2e.py e2e/serverManager.spec.ts e2e/settingsResponsive.spec.ts --grep 'REQ-380'
~~~

## Sequential independent baseline

.agents/verification.jsonのfixed argvを変更せず全行含める。T0でtools/server-managerのidentity追加とlogs除外が検証済みであることを前提とする。最終checkerはCard done・全追跡文書凍結後、新しいRecordV1を各argvごとに作成する。 追加Gate 1として、下表先頭のbuilt-in compile()でManagerの3ファイルとtest-owned sandbox fixtureを構文検査する。ファイルをUTF-8で読み込んでcompileするだけなのでpycを書き込まない。これは承認後の独立受入で実行する計画であり、本修正時には実行しない。

| Gate | Exact command argv (JSON) |
| --- | --- |
| 1 | ["backend\\.venv\\Scripts\\python.exe","-c","from pathlib import Path; files=('tools/server-manager/comfy_memory.py','tools/server-manager/server_status.py','tools/server-manager/server_api.py','tests/support/server_manager_sandbox.py'); [compile(Path(p).read_text(encoding='utf-8'), p, 'exec') for p in files]"] |
| 1 | ["backend\\.venv\\Scripts\\python.exe","-m","mypy","backend"] |
| 1 | ["backend\\.venv\\Scripts\\python.exe","-m","pytest","backend/tests/unit"] |
| 1 | ["backend\\.venv\\Scripts\\python.exe","scripts/run_in_dir.py","frontend","npm.cmd","exec","--","vitest","run","src/utils","src/components/**/__tests__"] |
| 1 | ["backend\\.venv\\Scripts\\python.exe","scripts/verify_ui_invariants.py"] |
| 1 | ["npm.cmd","--prefix","frontend","run","typecheck"] |
| 2 | ["backend\\.venv\\Scripts\\python.exe","scripts/run_full_suite.py"] |
| 3 scenario | ["backend\\.venv\\Scripts\\python.exe","-m","pytest","tests/unit/test_server_status.py","tests/unit/test_server_manager_timeout.py","-k","REQ-380"] |
| 3 scenario | ["backend\\.venv\\Scripts\\python.exe","scripts/run_e2e.py","e2e/serverManager.spec.ts","e2e/settingsResponsive.spec.ts","--grep","REQ-380"] |
| 3 | ["backend\\.venv\\Scripts\\python.exe","scripts/run_e2e.py"] |
| 3 scenario | ["backend\\.venv\\Scripts\\python.exe","scripts/run_in_dir.py","frontend","npm.cmd","exec","--","vitest","run","src/api/domains/__tests__/systemManager.test.ts","src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx","src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx","-t","REQ-380"] |

required_commandsはGate、canonical JSON順にcoordinatorがScopeManifestへ保存する。run_e2e.pyは自分のViteサーバーを起動するため、5173使用中なら他プロセスを停止して強制実行せず、競合を報告する。Manager sandboxはephemeral portで起動・終了し、stderr/stdoutはtest-ownedプロセスの範囲で回収する。

## Evidence and independent review

codeはtester-reviewer/dev-verify、documentはdoc-reviewer/doc-verifyが独立に受入判定する。QA auditは承認済みplanに対しqwen/qwen3.5-9b、ctx32768、reasoning none、fresh runと直後unload確認が必要。欠けた監査やGateはpending/INCONCLUSIVE。既存BA requirement監査を新しいdesign監査として再計上しない。

Gate結果・stdout・AC matrix・限界はignored docs/logsへ保存する。本PBI固有の実装計画はdocs/design/REQ-380-implementation-plan.mdを採用し、既存root planを保全する。.agentsの現在のwrite permissionはT0実行時に解決する。T0未完了のまま最終PASSを示さない。

## Response and recovery boundaries

ブラウザーUIはSettings/Managerの両方とも8899の既存/api/actionを使い、Managerが常にJSONを返す。ComfyUIネイティブ/freeだけが空本文HTTP200を返し得る。Managerはこのnative応答を{status:ok,action:free-memory,outcome:accepted}のJSONへ包む。外部localツールのloopback8188直接利用は別consumerで、Managerのguardを経由しない。通常のLANブラウザー/スマートフォンへ8188接続を要求しない。

UIは応答直後に『解放要求を受け付けました。空き容量は監視値で確認してください』というacknowledgementを表示する。『完了』『解放成功』とは表示しない。解放後にも古い/高いVRAM測定値が残り得るため、数値は監視で取得した測定値として表示し、低下を検出して完了を宣言する永続的なcompletion detectorは追加しない。応答後はfresh GET statusが既知idleかつcounts0/0と確認できる場合だけ再有効化する。unknownはdisabledのまま、後続GETで既知idleへ回復した場合だけ解除する。古いidle cacheでunknownを上書きして操作可能にしない。

同一タブはクリック直後のbusyRef/isActionPending、別タブはManager共通_active_action lockで排他する。先行actionの実行中に別タブactionが到達した場合はHTTP409、code=ACTION_BUSY、request_sent=falseを必ず返す。キューイングしない。試験では異なる2clientから同時要求し、2件目409/ACTION_BUSYとnative POST1件をassertする。

自動再送禁止は操作POSTだけ。background status/VRAM GET pollとWS再接続は継続し、操作POSTを再生しない。WS切断時はGET statusとVRAM refreshだけ行う。実ComfyUIの/free処理とGET /queueの間は外部clientの新規投入に対して非原子的であり、完全な外部排他は保証しない。

試験のCONFIG_FILEはtest-owned TemporaryDirectory内の新規JSONを使う。production pathを先に保存し、temp_path.resolve()!=production_path.resolve()をassertしてから、testプロセス内でserver_api.CONFIG_FILEをtemp_pathへbindする。production configのbytes/hashを試験前後で確認し、書込み・rename・backup・restoreを一切しない。fixtureの全HTTPはephemeral loopback port、サービス起動停止要求は0とする。テスト失敗時もtemp以外をcleanupしない。

文書Card T4はAC-1〜5に関する文書の意味・参照・適用範囲の整合確認と、文書要件AC-6だけを担当する。AC-1〜5の実機能の実装・試験はT1/T2/T3の責任で、doc PASSはそのcode ACのPASSを成立させない。T5はユーザー承認済みの同一AC-5試験再作業を状態遷移可能な補助Cardで実行し、新しい機能要件や重複した実装責任を導入しない。ComfyUI最小versionは要件未指定なので推測せず、/free非対応は明確なエラーとして既存契約に従う。

## Exact browser transport routing

Settings統合caseはpage.goto('http://127.0.0.1:5173/settings#system')で開く。FEの本番宛先127.0.0.1:8899を変更せず、Playwrightだけが次のtransport routeでtest-owned Managerへ転送する。Manager dashboardはmanagerUrlのephemeral同一Originを直接開く。productionの8899/8188ポートをbindしない。

~~~typescript
// managerUrl is emitted by the test-owned sandbox process, e.g. 127.0.0.1:<ephemeral>.
await page.route('http://127.0.0.1:8899/api/**', async (route) => {
  const original = new URL(route.request().url())
  const destination = new URL(original.pathname + original.search, managerUrl)
  const response = await route.fetch({ url: destination.href })
  await route.fulfill({ response })
})
await page.goto('http://127.0.0.1:5173/settings#system')
~~~

このrouteには固定http://127.0.0.1:8899/api/actionが含まれ、method/POST body/headersを保持して転送する。status/logsも同じManagerへ届く。先にメイン8000相当API stubを登録し、後登録の8899専用routeを優先する。/src/apiのVite moduleはstubしない。受入caseは実Manager handler→transport→fakeComfyまで通し、UI内部業務関数はmockしない。
