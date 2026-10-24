---
id: REQ-380-IMPLEMENTATION-PLAN
status: draft
tags: [implementation-plan, comfyui, mixed]
related_paths: [docs/design/REQ-380.md, docs/design/REQ-380-test-plan.md]
---

# Implementation Plan — REQ-380

## Objective

ComfyUIプロセスを維持したままモデル・キャッシュの解放要求を送り、SettingsとManagerの両方で生成中・停止中・状態不明時の誤操作と多重送信を防ぐ。外部ツールはComfyUIネイティブAPIを直接呼ぶ。

## Proposed Changes

| Card | Change kind / owner | Files / dependency |
| --- | --- | --- |
| T0 | code / engineer | .agents/verification.json。Manager sourceを検証identityへ追加。依存なし |
| T1 | code / engineer | tools/server-manager/comfy_memory.py、server_status.py、server_api.py、tests/unit/test_server_status.py、test_server_manager_timeout.py。依存なし |
| T2 | code / engineer | frontend/src/api/domains/systemManager.ts、ServiceConnectionCard.tsx、VramGuardSection.tsxと既存隣接試験。依存なし |
| T3 | code / engineer | tests/support/server_manager_sandbox.py、frontend/e2e/serverManager.spec.ts、settingsResponsive.spec.ts。T1/T2依存 |
| T4 | document / doc-editor | SPEC_SETTINGS.mdとserver_manager_guide.md。T1/T2依存 |
| T5 | code / engineer (supplemental verification) | frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx のみ。REQ-380-T2 done依存。ユーザー承認済みのT2第3回rework exceptionをカードstate遷移で実行するための補助カード。 |

実装担当は各Cardの限定されたcontextだけで作業し、PBI・他Card・無関係なcodeの再探索をしない。契約不足は設計へ返す。

## Dependency Graph

~~~mermaid
graph TD
  T0[REQ-380-T0 検証identity]
  T1[REQ-380-T1 Manager] --> T3[REQ-380-T3 Browser試験]
  T2[REQ-380-T2 Settings] --> T3
  T1 --> T4[REQ-380-T4 仕様同期]
  T2 --> T4
  T2 --> T5[REQ-380-T5 AC5期限試験]
~~~

最大深さ2。T1へ埋込dashboardを含め、同一server_api.pyの並行所有を避ける。T5は既存T2をreopenせず、同じAC-5のtest-only再作業例外を正規のready→in-progress→done状態遷移で記録する補助Cardである。最終検証はT0とT5を含む全Card done後に進む。

## Verification Plan

T1/T2はtransportで外部I/Oを切断して本番ロジックを通す。T3は本番HTML/Reactを実ブラウザで動かし、375px/767px/768px/1280pxの操作域、折返し、poll中のdisabled維持を確認する。T5は既存VramGuardSection試験内で実component/query/storeとtest-owned transportを通し、WS断後の次の2.5秒poll値が最大5秒以内に画面へ反映されることをcontrolled clockで確認する。異常系はqueue不明、生成中、停止、409/503/502/504、切断、二重操作、VRAM取得失敗と未保存値維持。Python/FEのPBTで不正なJSON/statusを安全側へ倒す。

独立tester-reviewerはprofileの全fixed commandをGate 1→2→3で新規実行し、AC scenarioも追加する。

Manager branchのGate 1には、所有Pythonのcomfy_memory.py、server_status.py、server_api.pyとtest-owned server_manager_sandbox.pyの構文検査を追加する。下記argvのbuilt-in compile()はpycを生成しない。profileの全fixed commandと既存Gate 2/3は維持し、この追加行を含むrequired_commandsをGate/canonical JSON順で保存する。以下は承認後の独立検証用計画で、本修正では実行しない。

~~~json
["backend\\.venv\\Scripts\\python.exe","-c","from pathlib import Path; files=('tools/server-manager/comfy_memory.py','tools/server-manager/server_status.py','tools/server-manager/server_api.py','tests/support/server_manager_sandbox.py'); [compile(Path(p).read_text(encoding='utf-8'), p, 'exec') for p in files]"]
~~~

doc-reviewerはT4の意味・矛盾・参照・正常/失敗/維持ケースを独立に判定する。ローカルモデル監査はqwen/qwen3.5-9b、ctx32768、reasoning none、直後unload確認を必須とする。

## Trade-offs and Risks

/freeの成功は非同期受付で、空き容量や全GPUメモリ解放を保証しない。次の生成で再ロード待ちが発生する。Managerの直前queue確認後に外部クライアントが新規投入する競合は完全排除できない。queuedも操作を抑止する。socket-only監視にbounded HTTP /queueを加えるためstatusの遅延上限が増える。

## Review and Endpoint

設計・テスト計画・物理Cardの具体的承認後に実装する。endpointはsource-onlyで、commit/push/配布は別承認。

既存root implementation_plan.mdはREQ-377の計画として保全する。coordinatorが本PBI固有planの保存先としてdocs/design/REQ-380-implementation-plan.mdを採用済み。.agentsの現sandboxはread-onlyなのでT0の実行許可が得られない場合、最終受入はpendingとなる。

## Response and recovery boundaries

ブラウザーUIはSettings/Managerの両方とも8899の既存/api/actionを使い、Managerが常にJSONを返す。ComfyUIネイティブ/freeだけが空本文HTTP200を返し得る。Managerはこのnative応答を{status:ok,action:free-memory,outcome:accepted}のJSONへ包む。外部localツールのloopback8188直接利用は別consumerで、Managerのguardを経由しない。通常のLANブラウザー/スマートフォンへ8188接続を要求しない。

UIは応答直後に『解放要求を受け付けました。空き容量は監視値で確認してください』というacknowledgementを表示する。『完了』『解放成功』とは表示しない。解放後にも古い/高いVRAM測定値が残り得るため、数値は監視で取得した測定値として表示し、低下を検出して完了を宣言する永続的なcompletion detectorは追加しない。応答後はfresh GET statusが既知idleかつcounts0/0と確認できる場合だけ再有効化する。unknownはdisabledのまま、後続GETで既知idleへ回復した場合だけ解除する。古いidle cacheでunknownを上書きして操作可能にしない。

同一タブはクリック直後のbusyRef/isActionPending、別タブはManager共通_active_action lockで排他する。先行actionの実行中に別タブactionが到達した場合はHTTP409、code=ACTION_BUSY、request_sent=falseを必ず返す。キューイングしない。試験では異なる2clientから同時要求し、2件目409/ACTION_BUSYとnative POST1件をassertする。

自動再送禁止は操作POSTだけ。background status/VRAM GET pollとWS再接続は継続し、操作POSTを再生しない。WS切断時はGET statusとVRAM refreshだけ行う。実ComfyUIの/free処理とGET /queueの間は外部clientの新規投入に対して非原子的であり、完全な外部排他は保証しない。

文書Card T4はAC-1〜5に関する文書の意味・参照・適用範囲の整合確認と、文書要件AC-6だけを担当する。AC-1〜5の機能実装・試験はT1/T2/T3が担当し、T5はユーザー承認済みAC-5期限試験だけを補う。doc PASSはそのcode ACのPASSを成立させない。T5は新しい機能要件や重複した実装責任を追加しない。ComfyUI最小versionは要件未指定なので推測せず、/free非対応は明確なエラーとして既存契約に従う。
