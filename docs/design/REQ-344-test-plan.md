---
id: REQ-344-test-plan
tags: [frontend, test, flaky, acceptance]
related_paths:
  - docs/design/REQ-344.md
  - docs/design/REQ-344-root-cause-analysis.md
  - docs/backlog/task/active/REQ-344-T10.md
  - docs/backlog/task/active/REQ-344-T11.md
  - docs/backlog/task/active/REQ-344-T12.md
---

# REQ-344: 最小修正の検証計画

## Acceptance and Baseline

AC-1: 既定npm test連続5回でGeneratePage.test.tsxが毎回全13件PASS。
全体Gate2は全suite 0 failureを要求する。診断30/30と15/18は最終差分のACへ転用しない。
5回はPBI所定の安定性gate。正しさは各caseのdisabled→query成功→DOM enabledで観測する。
mockはテストresolverで解決するため実network待ちはない。API同期化を目的としない。
最小2ケース変更とfull suite検証は、それぞれ実装範囲と回帰検証範囲である。
開始条件: 原因外変更をHEADへ復元、元13件を保持、diffは元REQ-161 2ケースのみ、
人の設計レビュー済み。既定runtime/pool/timeout/retry/実timerを維持する。
既知mock警告は保存し警告0を合否条件に加えない。未処理例外は失敗として扱う。

## Integration and E2E Acceptance Paths

| ケース | 操作と観測 | 期待 |
|---|---|---|
| Desktop | 1024pxで未解決workflowをrender | generate-btnが存在しdisabled |
| Mobile | 500px、resize、未解決workflowをrender | generate-btn-mobileが存在しdisabled |
| 取得開始 | get(1)呼出しをwaitFor | resolverを安全に呼べる |
| 取得成功 | async act外resolve、query状態待ち | ['workflow',1] status success |
| DOM更新 | 再queryして別waitFor | buttonが存在しenabled |
| 元13件 | 対象file全体 | REQ-112/REQ-186/autosave/error boundary含め13/13 |
| 全suite | default npm test連続5回 | 各回対象13/13、全体failure0 |

製品変更がないためmanual/browser E2Eは不要。
既存integrationの未ロード→ロード成功→操作可能をE2E受入経路として用いる。

## Red Team Boundaries

- 初期disabled確認の削除は拒否。query成功だけではDOM成功と判定しない。
- DOM再queryにtoBeInTheDocument/toBeEnabledを使いnull/古い参照を見逃さない。
- async act内resolve、timeout延長、skip、pool/retry変更、fixture/API/cleanup/timer変更、
  ケース追加はscope逸脱としてT10へ返す。
- file未収集、13件以外、skip、timeout、unhandledはFAIL/INCONCLUSIVE。
- reject/unresolved追加4件は診断証拠に保持し、最終13件へ加えない。
- mock警告をtimeout原因と混同せず別PBIで扱う。

## Commands and Gates

cwd: C:/Users/audih/ws/comfy-create-helper2/frontend。
T10局所:
```powershell
npm run typecheck
npx vitest run src/pages/__tests__/GeneratePage.test.tsx --reporter=verbose
```
T11 Gate1:
```powershell
npm run typecheck
```
T11 Gate2/3はcoordinatorが同一source SHA256/runtime/contextで5回直列実行:
```powershell
npm test
```
各run raw logとexitをREQ-344-minimal-suite-N.logへ保存。
json reporterを補助追加できるがfile/name filter、timeout/retry/pool変更は禁止。
run1をGate2と連続5回に兼用し追加のGate2 runを重複実行しない。
Gate3は5回AC、上表の両layout経路、diff境界監査。局所PASSだけで最終PASSにしない。
QA監査/unloadはdev-verifyに従う。

## Evidence and Failure Policy

minimal-verification.mdへHEAD/source SHA256/runtime/context/cwd、各command/開始終了/wall/exit、
target collected/pass/fail/skip、全suite結果、warning/unhandled、3-Gate/AC判定、raw参照、
QA監査traceを記録。run1..5全行を作り未実行NOT-RUN、収集不能INCONCLUSIVE。
別file失敗は対象ACと全体Gateを分けて親へ返す。
対象FAIL/unhandled/収集障害/report不足/wall600秒で停止し残りNOT-RUN。
既知warningだけなら継続。失敗回を捨てた再バッチは設計再レビュー前に行わない。
sandbox収集障害は通常permissionルールで処理しバッチ前にcontext固定。
runtime/ACL/configを変更して通す処理はしない。
default waitForの期限でqueryまたはDOMが未達ならFAILで親へ返し、timeoutを延長しない。
Mobileは既存resizeのactを保持しDOMを個別待機する。5回は独立processなのでmock状態を
process間で共有しない。file内漏れは13件の全体実行結果で検出し追加修正なら再設計する。
T12は全gate PASS後。PBI完了/commit/archiveはcoordinator担当。

## History and Audit

旧T1-T9、snapshot、実験、EPERM結果は保存。新dispatchはT10-T12のみ。
BA監査対象は設計/test-plan/T10/T11/T12全件。traceとunload exitを保存する。
監査原応答はCRITICAL、文書明文化と指摘対応案をcoordinator/人のレビューへ返す。
監査後追記を含むため再監査済みとは主張しない。
