---
id: REQ-355-TEST-PLAN
tags: [frontend, verification, boundary]
related_paths:
- docs/design/REQ-355.md
- docs/backlog/pbi/active/REQ-355.md
- docs/incidents/REQ-344-residual-history.md
- frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx
---
# REQ-355 実行可能テスト計画

## Acceptance and Commands

cwd C:/Users/audih/ws/comfy-create-helper2/frontend。npm test = vitest run。
診断コピーは.txtで通常収集外。original test 8件、GeneratePage.test.tsx 13件。
Gate1: npm run typecheck、exit0。
局所AC-1:
```powershell
npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx --reporter=verbose
```
期待8/8 PASS、対象名の初回partial、20calls、retry後21callsとbaseline保持。
Gate2/AC-2:
```powershell
npm test
```
既定のfile discovery/pool/retry/timeoutを維持、全suite exit0。
診断時の2079件は参考値。現sourceの収集数・pass/fail/skipを報告し、
増減があれば他変更と診断コピー収集の有無を説明する。

T2 PASS後、REQ-344-T11新バッチを親が独立processで直列5回実行する。
途中source/runtime/context変更なし。各回全suite PASS、
GeneratePage.test.tsx 13/13と本file 8/8および対象case PASSを照合してAC-3を満たす。
過去の失敗run、focused runや診断コピーを5回へ算入しない。
5回完了後の追加full runは要求しない。

## Integration and E2E Acceptance Paths

既存hook結合テストでQueryClient・Zustand・React commit・generationApi mock連携を検査。
baselineBをown/all cacheへ保存→20ページ即時mock→初回mount flush→partial/20calls
→既存のactでmanual retry→21calls/partial→baselineB保持。
UI・API契約変更がないためブラウザE2E追加は不要。アプリ統合の受入経路は
既定full suiteとREQ-344のGeneratePage 13ケースを使う。

## Gate 3 Boundary and Anomaly Audit

| 境界/異常 | 既存caseと観測 | 期待 |
|---|---|---|
| has_moreが20ページ連続true | 対象case初回 | partial、20calls |
| retryでbaseline-known Bが再出現 | 対象case後半 | 追加1call、partial、baseline保持 |
| 同じidentityが繰返す | one retry page when has_more repeats... | 無限取得せずpartial |
| unmount後のlate response | late response after unmount... | cache/storeに書かない |
| StrictMode reconnectとunknown | shares one request... | request共有、明示retry時だけ再取得 |
| query restoration中 | waits for Query restoration... | restoration完了前requestなし |

新しい境界caseや実時間assertを加えない。8既存caseのPASSと
差分が対象初回renderのみであることをGate3に使う。
全体負荷での上限処理はfull suiteで観測する。初回assertを弱めたり、
期待partialをcheckingへ変えたり、mockを20未満へ短縮した場合はFAIL。
不明な終了、unhandled、collection失敗、skipはPASSにしない。

## Evidence, Stop and Handback

実行前後のsource SHA256、cwd、runtime、command、start/end/wall/exit、
収集/pass/fail/skip、対象case名、raw log、Gate/AC表を下記Execution Evidenceへ記録。
SPEC_GENERATE.mdのSHA256も実行前に記録し、現在の20page/partial契約を固定する。
raw log/JSONはcoordinatorが指定するworkspace成果物へ保存。
対象原本が収集され、.txt診断コピーが収集されていないことを確認。
source固定後に検証。途中変更はバッチ無効を明記し、成功runを拾い集めない。
FAIL/INCONCLUSIVEは残りをNOT-RUNとして親へ返す。既知warningは保持し、
warning0を新ACにしない。run wall上限600秒、環境障害は通常permission規則に従う。

REQ-344 handbackはT1 source差分、3-Gate結果、各AC結果、
AC-3=PENDINGと新5回バッチの対象条件を渡す。
AC-3未完了時にREQ-355 PBIをdoneへ移さない。

QA監査はdev-verifyに従い初回からrequire_escalated、
localhost LM Studio/CLI利用を理由へ明示:
```powershell
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-355-test-plan.md
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload
```
exit、所見、model/runtime/settings/chunks/elapsedと直後unload exit0を記録。
監査未実施や指摘未処理は3-Gate PASSに含めない。
外部script不在、権限拒否、監査失敗、unload未確認はINCONCLUSIVEで親へ返す。
監査をbest effortや単なるwarning扱いへ変更しない。

## Execution Evidence

### Run REQ-355-T2-20261013

実行環境: Windows workspace、Node v18.16.1、npm 9.7.1、Vitest 1.6.1。
検証cwdは`C:/Users/audih/ws/comfy-create-helper2/frontend`。
ソースSHA256は実行前後とも
`C43A581BA28B94C85DB7F09CF2BF9C3BB0AE2041D6407D455B17FF5FE01FF7B1`。
`SPEC_GENERATE.md` SHA256は
`165EF7F1D504936942BDE4FA5F4CE1D2256F6F4697C8BE063DA176624A4E5FD6`。
ソース差分は対象1ファイル、5 insertions / 1 deletion、テスト宣言8件。
診断`.txt`コピーはテストディレクトリに存在せず、Vitest収集対象なし。

| Gate/AC | コマンド・観測 | 結果 |
|---|---|---|
| Gate 1 / AC-1前提 | `npm run typecheck`; 2026-10-13 02:19:03.741–02:19:23.462 +09:00; wall 19.721s; exit 0 | PASS、0 errors |
| Gate 2 / AC-2 | `npm test`; 2026-10-13 02:14:59.020–02:16:21.023 +09:00; wall 82.003s (Vitest報告79.68s); exit 0 | PASS、229 files / 2079 passed / 0 failed / 0 skipped |
| Gate 3 / AC-1 | focused residual file。sandbox実行はsetup.ts `realpath` EPERMでcollection 0件/exit 1。昇格実行 02:14:41.289–02:14:47.435 +09:00; wall 6.146s; exit 0 | PASS、8/8。20ページ後partial/20 calls、retry後21 calls、baseline保持を含む既存境界caseを実行 |
| AC-3 | REQ-344-T11の独立した既定full-suite直列5回 | PASS。各回全suite 2079/2079、GeneratePage 13/13、残存履歴8/8。source SHA256は各runの前後で一致。詳細は[REQ-344 T11記録](REQ-344-minimal-verification.md)。 |

全体suiteログでは既存warning行142件を観測。`Unhandled`、`uncaughtException`、
`unhandledRejection`の文字列一致は0件。warning 0件は受入条件にしていない。
全体suiteの対象残存履歴ファイルも8/8 PASS。

raw logs:
- `tmp/REQ-355-T2-20261013-typecheck-timed.log`
- `tmp/REQ-355-T2-20261013-residual.log` (sandbox collection failure)
- `tmp/REQ-355-T2-20261013-residual-elevated.log` (8/8 PASS)
- `tmp/REQ-355-T2-20261013-full.log` (既定npm test)
- `tmp/REQ-355-T2-20261013-qa-audit.log`
- `tmp/REQ-355-T2-20261013-unload.log`
- `tmp/REQ-355-T2-20261013-evidence.json`

#### Local model QA audit

指定コマンドを昇格実行し、`qwen/qwen3.5-9b` (9.0B, Q6_K)、
`--context-length 32768`を記録。runtimeはlocal_model_adapter経由のLM Studio。
コマンド全体wallは02:16:38.994–02:17:53.242 +09:00、74.248s、exit 0。
監査本文の判定は`FAIL (Critical Ambiguities Detected)`。
所見はAC-1の`partial`/20・21 calls、baseline-known B、件数変動の説明可能性、
5回loopとsource integrity checkの機械的検証が不足するという指摘。
推奨修正には固定総件数2079のassertなどが含まれる。所見の妥当性判断や設計変更は
この検証Taskの範囲外のため実施せず、親coordinatorのトリアージへ送る。
adapter traceはreasoning実設定、inference-only時間、内部chunk数を出力しない。
プロトコル指定のreasoning noneは実際のrequest traceでは未確認と記録する。
監査直後unloadは02:18:01.905–02:18:04.717 +09:00、wall 2.812s、exit 0。
LM Studioはモデル未ロードと報告した。全GPUメモリ解放を意味しない。

| 受入基準 | 判定 | 根拠 |
|---|---|---|
| AC-1: 対象8ケースと20ページ境界 | PASS | focused 8/8、全体runでも8/8 |
| AC-2: 既定frontend全suite | PASS | `npm test` 229 files / 2079 tests pass |
| AC-3: REQ-344用5回バッチ | PENDING | T2では未実施、親coordinatorが所有 |

Gate 1–3およびAC-1/2/3の実行結果はPASS。必須QA監査本文はFAILのまま保持し、
その所見を過剰な要求としてユーザーが許容、REQ-344の5回バッチを続行する判断を承認した。
5回バッチは全回成功し、source SHA256も前後一致したためREQ-355を完了とする。
