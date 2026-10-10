# REQ-333 実装進行トラッカー

2026-10-10（Asia/Tokyo）。ユーザーはAC-36を含む設計を承認し、最大並列度での進行を指示。PBIはin-progress、AC-01..36は維持。追加指示により親rootがCoordinatorの責務を担当し、最大3 Engineerと合わせて4枠を使う。旧Coordinatorは停止・履歴保持、BAはinactive。現行タスク状態は下表を正とする。

T4はrepository18件/mypy/metadata API4件、T5の取消競合・既知prompt IDのDB保存失敗回復修正後は29 tests/mypy pass、T6はprotocol修正後8 tests/mypy passから明確な拒否と未確認を区別する追加修正へ進行。T8は厳密nested decoderまで20 tests/typecheck pass。T11は16 tests/mypy pass。これらは局所証跡であり、全体3-Gate/実端末検証完了を意味しない。

## Dispatch protocol

- T1（`SKILL.md`の承認済み通信方針更新）は実装DAG外の前段preflightで完了済み。
- 親がCoordinatorとして調整・レビュー・状態同期を担当し、ソース実装は最大3名のEngineerだけへ委任する。
- 現在の担当タスクは下表の実装中を参照。依存完了後に空き枠へ次タスクを投入する。
- 各カードの `depends_on` が完了前に着手させない。Task Cardのstatus完了反映と検証証跡は親調整役が同期する。

## Task dispatch matrix

| Task | 依存 | 所有ファイル | 同一ファイル競合 | 現在 |
|---|---|---|---|---|
| `T1` | — | `SKILL.md` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T2` | — | `backend/app/schemas/generation.py`<br>`backend/tests/test_generation_schema.py` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T3` | — | `backend/app/models.py`<br>`backend/app/migrations/steps.py`<br>`backend/tests/test_generation_jobs_migration.py` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T4` | `T2`, `T3` | `backend/app/services/generation_repository.py`<br>`backend/app/routers/prompt_metadata.py`<br>`backend/tests/test_generation_repository.py` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T5` | `T2` | `backend/app/services/generation_service.py`<br>`backend/tests/test_generation_service.py` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T6` | `T2` | `backend/app/services/comfy_generation_bridge.py`<br>`backend/tests/test_comfy_generation_bridge.py`<br>`backend/requirements.txt` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T7` | — | `tools/server-manager/server_api.py`<br>`backend/tests/test_manager_origin_req333.py` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T8` | — | `frontend/src/api/domains/generation.ts`<br>`frontend/src/api/domains/__tests__/generation.test.ts`<br>`frontend/src/api/client.ts` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T9` | `T8` | `frontend/src/utils/generationSelectors.ts`<br>`frontend/src/utils/__tests__/generationSelectors.test.ts` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T10` | `T2`, `T4`, `T5`, `T6`, `T11` | `backend/app/routers/generation.py`<br>`backend/app/main.py`<br>`backend/tests/test_generation_api.py` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T11` | `T2` | `backend/app/routers/ws.py`<br>`backend/tests/test_ws.py`<br>`backend/tests/test_generation_ws.py` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T12` | — | `backend/app/routers/comfy.py`<br>`backend/tests/test_comfy_proxy.py`<br>`backend/tests/test_comfy_proxy_fault.py` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T13` | — | `frontend/src/api/domains/systemManager.ts`<br>`frontend/src/hooks/useManagerStatus.ts`<br>`frontend/src/hooks/__tests__/useManagerStatus.test.ts` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T14` | `T8` | `frontend/src/store/services/systemWsService.ts`<br>`frontend/src/hooks/useSystemStats.ts`<br>`frontend/src/store/services/__tests__/systemWsService.test.ts` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T15` | `T8`, `T14`, `T16` | `frontend/src/store/slices/connectionSlice.ts`<br>`frontend/src/store/types.ts`<br>`frontend/src/store/__tests__/slices/connectionSlice.test.ts` | types.tsはT16→T15依存で直列化 | 完了（局所検証済み） |
| `T16` | `T8` | `frontend/src/store/slices/jobQueueSlice.ts`<br>`frontend/src/store/types.ts`<br>`frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T17` | `T8`, `T16` | `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts`<br>`frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`<br>`frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.fault.test.ts` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T18` | `T8` | `frontend/src/pages/DatasetStudioPage/components/MatrixGenerationStep.tsx`<br>`frontend/src/pages/DatasetStudioPage/hooks/useStudioGeneration.ts`<br>`frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T19` | `T8`, `T13` | `frontend/src/components/common/SystemStatusBadge.tsx`<br>`frontend/src/components/common/PageHeader.tsx`<br>`frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T20` | `T9`, `T19` | `frontend/src/pages/GeneratePage/components/DesktopLayout.tsx`<br>`frontend/src/pages/GeneratePage/components/MobileLayout.tsx`<br>`frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.req333.test.tsx` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T21` | `T8`, `T16` | `frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts`<br>`frontend/src/utils/thumbnailUrl.ts`<br>`frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T22` | `T12` | `backend/app/services/snapshot_service.py`<br>`backend/tests/test_snapshot_service_req267.py`<br>`backend/tests/test_snapshots_req316_metadata.py` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T23` | `T14` | `frontend/src/store/services/comfyWebSocketService.ts`<br>`frontend/src/store/useGenerationStore.ts`<br>`frontend/src/store/services/__tests__/comfyWebSocketService.test.ts` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T24` | `T8` | `frontend/src/hooks/useComfyWebSocket.ts`<br>`frontend/src/hooks/__tests__/useComfyWebSocket.test.ts`<br>`frontend/vite.config.ts` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T25` | `T13` | `frontend/src/pages/SettingsPage/components/ServiceConnectionCard.tsx`<br>`frontend/src/pages/SettingsPage.tsx`<br>`frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T26` | `T17`, `T20`, `T21`, `T22`, `T30`, `T31` | `docs/specs/SPEC_GENERATE.md`<br>`docs/specs/SPEC_HISTORY.md`<br>`docs/specs/SPEC_COMMON.md` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T27` | `T18`, `T25` | `docs/specs/SPEC_SETTINGS.md`<br>`docs/specs/SPEC_DATASET_STUDIO.md`<br>`docs/specs/server_manager_guide.md` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T28` | `T7`, `T10`, `T12`, `T15`, `T17`, `T18`, `T20`, `T21`, `T22`, `T23`, `T24`, `T25`, `T29`, `T30`, `T31` | `backend/tests/test_generation_integration.py`<br>`frontend/src/__tests__/App.generationIntegration.test.tsx`<br>`backend/openapi.json` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T29` | — | `frontend/src/pages/GeneratePage/components/SettingsPopover.tsx`<br>`frontend/src/pages/GeneratePage/components/__tests__/SettingsPopover.req333.test.tsx` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T30` | `T8`, `T16` | `frontend/src/components/JobManagementModal.tsx`<br>`frontend/src/components/__tests__/JobManagementModal.req333.test.tsx` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |
| `T31` | `T8`, `T12` | `frontend/src/pages/GeneratePage/sections/GenerationGallerySection.tsx`<br>`frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req333.test.tsx` | なし（manifestの完全一致パスで重複なし） | 完了（局所検証済み） |

| `T32` | `T20`, `T21` | `frontend/src/pages/__tests__/GeneratePage.test.tsx`<br>`frontend/src/utils/__tests__/thumbnailUrl.test.ts` | なし（既存回帰テストのみ） | 完了（局所検証済み） |
| `T33` | `T15`, `T17` | `frontend/src/test/e2e_req207.test.ts`<br>`frontend/src/test/e2e_req240_multidevice.test.ts`<br>`frontend/src/test/e2e_req260_vram_guard.test.ts` | なし（既存回帰テストのみ） | 完了（局所検証済み） |
| `T34` | `T16`, `T17` | `frontend/src/test/e2e_req317_storage.test.tsx`<br>`frontend/src/test/e2e_req332_recovery.test.tsx` | なし（既存回帰テストのみ） | 完了（局所検証済み） |

| `T35` | `T11` | `backend/tests/test_vram_guard.py` | なし（既存回帰テストのみ） | 完了（局所検証済み） |

| `T36` | `T7` | `tests/unit/test_server_manager_timeout.py` | なし（既存回帰テストのみ） | 完了（局所検証済み） |

## DAGと競合管理

- 実装DAG: 36 cards（承認済み31＋既存回帰試験移行5）、循環なし。types.tsはT16→T15依存で直列化する共有所有。共有interfaceは依存を通じて直列化し、カード外の同時編集を避ける。
- 推奨critical path: `T2 → T4 → T10 → T28` および `T3 → T4 → T10 → T28`。並行の長経路は `T8 → T14 → T15 → T28`、`T8 → T16 → T17 → T26`、`T13 → T19 → T20 → T26`。
- T28は実装code leavesとT30/T31を含む統合terminal。T26/T27は正本同期。T1完了と設計承認は既に解決済み。
- T3のDB migrationが必要とする物理column/index/JSON inventoryは親が承認済みD3に沿ってカードへ追記済み。既存対象ファイル内の契約具体化であり、新しい公開behaviorは追加していない。

## Current verification boundary

- このtrackerは最新のdispatch snapshot。tableとmanifestは現状の所有・依存・状態に同期する。
- この工程でテスト結果を捏造しない。Task Cardのtypecheck/局所テスト、最後の統合検証、監査/QA triageは実行者のexit/stdoutと証拠を記録する。
- PBIは `in-progress`。実装中はAC-01..36の本文を変更せず、必要なら設計差し戻しを行う。

## Dated dispatch history

2026-10-10 dispatch history: T1 governance preflight完了後にT2/T3/T8を開始。T2/T3は局所検証済み。T12はBE画像route/thumbnail互換テスト38件とmypy passで完了。T5は最初の20件/mypy pass後、親read-only reviewでrequest replay、callback、started_at、legacy prompt cancel、progress/preview callback/health overlay欠落が見つかった。前者は再検証待ち、後者をEngineer Aが修正中。T8は独立review後nested runtime DTO検証を追加し20件/typecheck pass。T4はmarker有無にかかわらずPromptMetadataを同transactionで保存する修正を18 repository tests+4 API tests+mypy passで完了。T6は初回7 tests+mypy pass後、binary big-endian decode、history delete POST/timeout、prompt_id interrupt hintの修正が必要と判明し、T5後に再作業予定。T16はstore/types.ts ownerの変更後、Engineer Bが実装中。

初期の型所有修正ではtypes.tsをT16へ移して既存actionsの型を先行更新した。その後、T16完了後のT15へoptionalな同期issue型の追記を許可した。types.tsの共有は既存T16→T15依存で直列化し、カード数/DAG辺は不変。settings.tsは既存same-origin APIのためT16の変更対象から削除した。

2026-10-10 latest milestone: T5 callback/health rework passed 24 tests+mypy. T6 big-endian/history-delete/interrupt-hint rework passed 8 tests+mypy. T6 is complete; Engineer A moved to T11. Engineer B continues T16 while preserving existing UX regression coverage. Current active set is T11/T16.

## Final acceptance verification

2026-10-10: 親Coordinator＋最大3 Engineerで36カードを局所検証済み。Gate 1はBE mypy 165 source files、FE typecheck、配布buildでPASS。Gate 2は無フィルターのBE 628件、FE 154 files／1454件でPASS。

全体判定はINCONCLUSIVE。更新後Managerの実応答と実ブラウザー・スマホのシナリオ証拠が未取得。最新のread-only確認ではComfy queueは0/0、BE epochは261e7524-a9b2-4dd3-aaf7-a3000c546a59、WS snapshot revision 74とSYSTEM_STATS 13 keysを確認。Managerはallowed OriginへのACAO/Varyがなく旧processのまま。ブラウザー起動再試行はkernel assets path不存在で失敗。独立QA監査は空キューで再試行成功、直後unloadもexit 0。指摘はREQ-333-qa-triage.mdへ照合記録済み。

追加のプロセス時刻確認: 8000 PID 35920の起動は09:18:36 JSTで、最新WS cleanupソースの更新09:07:52 JSTより後。最新Backend反映待ちは解消した。8899 PID 6692は10月4日20:40:33 JST起動のまま。Windows管理者再起動の進め方をユーザーに確認中。

証拠と36 ACの判定は[REQ-333-walkthrough.md](REQ-333-walkthrough.md)に集約。PBIはin-progressを維持し、未取得の証拠をPASSとして扱わない。

## Preview regression rework

2026-10-10のユーザー報告: 生成中にプレビューが消える。FEがstate revisionごとに未受信画像のpreview URLも合成することを確認。画像callback受信時だけ更新するoptional JobView.preview_urlへ変更する。承認仕様の修正で、新たな生成機能は追加しない。

- T37: Engineer A、BE schema/service/service testsの3ファイル。実画像受信後だけ一時preview URLを付与し、進捗更新でURLを変えない。
- T38: Engineer B、FE API/connection slice/slice testsの3ファイル。URL未受信時は直前画像を保持、終端・epoch変更は解除。
- Engineer C: 関連preview経路の独立read-only review。

従前の全件PASSは変更前の証拠。修正後の型検査・全件回帰・配布buildを再取得する。

プレビュー修正の最終証拠: BE全件629 PASS、FE全件154 files／1456 PASS、BE mypy165 files PASS、FE typecheckと配布build PASS。T4 repositoryのpreview_url:null projection整合とT33旧fixtureの進捗のみnull期待も修正。独立Engineer C review PASS、OpenAPIを実appから再生成済み。T37/T38局所完了で計38カード。

稼働反映: queue0/0確認後の8899 POST restart/backendは409。Managerは別のfe/startをaction_in_progressとして返したため、今回Backend再起動は未実施。稼働Backendへの修正反映は別途必要。

## User acceptance feedback rework

ユーザーの4点をT39–T44で対応。T39はPC/mobile進捗表示の整数化、T40はmobile取消modalのfooter段組み、T41は非current preset一括投入の初回回帰検証、T42–T44は完了日時のBE記録・FE解釈・metadata panel表示。親Coordinator＋最大3 Engineerでファイル所有を分けて進行。

T41はユーザーが「生成画像・内容もデフォルトになっていた」と明確化。実parameter injectionを通じてactive editorと非active複数presetのgraph/seed/chips/assets/凍結metadataが独立する初回送信ケースを追加。現在のコードでは再現なし、本番の推測変更はしない。初期化時の一過性であることを確定した証拠はない。

最新read-only確認でもqueue0/0、旧BE epoch261e7524-a9b2-4dd3-aaf7-a3000c546a59にはpreview_urlなし。Manager action_in_progressはfe/startのまま。ソース・build検証と稼働反映の証拠は区別する。

最終フィードバック検証: BE無フィルター641 PASS／2 warnings、FE無フィルター154 files／1468 PASS、BE mypy165 files PASS、FE typecheckと配布build PASS。T43不足日時のremote補完、T44取得中のlocal metadata表示、T46解決済みcopyの画面反映を含む。中間FE失敗はREQ-333-feedback-frontend-final.txtへ保持、最終結果はREQ-333-feedback-frontend-rerun.txt。

T39–T46局所完了、計46 cards／36 AC、DAG depth4／最大所有3 files維持。非current presetの原因は未確定・本番推測修正なし。最新BE反映はManager旧processのfe/start actionによる409で待機。実ブラウザー・スマホの描画証拠は未取得。

## LAN development FE WebSocket correction

T47完了。修正前はlocalhost5173とLAN8000が接続成功し、LAN5173だけ403。/api proxyのchangeOrigin:falseでbrowser Host/Originを保持し、Vite自動再読込後は3経路すべてgeneration snapshot＋SYSTEM_STATS受信。外部https://example.com Originは403維持、LAN5173のHTTP stateもPASS。FE typecheck PASS。証拠は.tmp/REQ-333-mobile-dev-ws-before.txtとafter.txt。開発proxyのみの変更で、前回配布buildは影響なし。

Managerの全サービスLISTENとは別にaction_in_progress fe/startが操作をdisabledにしている。こちらは別調査中。スマホ自体の画面操作は未実施。

T48/T49完了。Manager出力回収を通常一時file＋サイズsnapshot有限readへ変更し、子孫PIPE EOF待ちの経路を除去。実Managerのhandle継承は未検証、旧fe/start busyは管理者再起動の方法確認待ち。busyをAPI無視で解除せず、UIにはFrontend名を表示。最終BE643 PASS、FE154 files／1469 PASS、mypy165/Manager py_compile/FE typecheck/build PASS。49カード局所完了、36 AC保持。

## Logs, completion follow, and restart rework

T50–T54局所完了。実ログAPI全4サービス200、numeric総行数とcontentをFE正規化。status/log7秒とaction120秒を分離、timeout等は未確認/refetch/no resend。完了原画を覆う当該旧job previewだけ解除し、後続frameを保持。BE停止未確認はlaunchせず非zero、readiness失敗非zero、予算最低60秒。仕様差分も同期。

実token検査: BE8000 PID35920 High0x3000、Manager8899 PID34832 Medium0x2000。BE09:18起動、Manager16:03起動、BE epoch261e...のまま。ManagerログPermissionErrorあり。既存Admin BEの停止にはAdmin Managerが必要。.tmp/req333_restart_manager_admin.ps1はManagerのみの厳密PID/port/script確認、busy時延期、子孫停止なし、BE PID保持確認を行うhelperとして準備・構文検査済み、未実行。UAC方法の回答待ち。

最終BE全646 PASS／2 warnings、FE全155 files／1485 PASS、mypy165、Manager py_compile、PS stub／構文、FE typecheck／build PASS。54 cards局所完了、36 AC維持、最大depth4／所有3 files。実管理者再起動と実端末ACは未確認、PBIはin-progress。

## Approved Manager elevation and live restart verification

ユーザーの「CodexがUACでManagerのみ管理者再起動する」という明示承認によりhelperを実行。status ok、Manager親PID43960、8899 listener PID27088。既存BE PID35920はManager単体再起動の前後で維持され、生成基盤をまとめて停止する操作は行っていない。根拠は.tmp/REQ-333-manager-admin-result.json。

続けて上流queue0/0・管理jobのactive0・Manager busyなしを確認し、8899経由でBE restartを実行。約10.35秒でstatus ok、BE PID35920→39828、epoch261e7524-a9b2-4dd3-aaf7-a3000c546a59→c9bdee5d-7501-44a2-881e-b6b8e3893cd0。preview_url契約とupstream HTTP/WS readyを確認し、旧port LISTENを再起動成功と誤認していない。根拠は.tmp/REQ-333-elevated-be-restart.json。

更新後Managerの全4サービスlogs APIは200、numeric lines/contentを確認。LAN5173・LAN8000・localhost5173の許可OriginへACAO、外部example.comと8080は403。localhost5173/LAN5173/LAN8000のWSはGENERATION_SNAPSHOTとSYSTEM_STATS受信、外部Originは403。根拠は.tmp/REQ-333-post-elevation-logs-cors.jsonと.tmp/REQ-333-post-elevation-ws.txt。

さらにqueue0/0・active0・busyなしを再確認してComfyUI restartを実行。約19.81秒でstatus ok、再起動後queue API到達・0/0を確認。根拠は.tmp/REQ-333-elevated-comfy-restart.json。実ブラウザーの成功通知やWSL PID変更を直接測定した証拠ではない。

Gate1/2の2131件PASSと54カード局所完了は維持。今回の実API検証によりManager反映・BE反映の待機は解消した。自動追従、ログ画面、再起動toast、mobile表示など実画面の確認は残るためGate3全体はINCONCLUSIVE、PBI in-progressを維持する。


## 2026-10-10 ユーザー受入・完了

ユーザーは「大丈夫そう。これで完了にしよう」と明示し、現状を受け入れてクローズを指示した。Gate 1/2成功、54カード局所完了、実APIの再起動・ログ・LAN WS確認を根拠として完了する。実ブラウザー・スマホの全36 AC実行証拠を取得したという意味ではなく、自動Gate 3のINCONCLUSIVEと監査findingの原判定は履歴に保持する。追加の設計変更・厳密な監査をクローズ条件に追加しない。
