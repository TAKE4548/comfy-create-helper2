# REQ-347 最終QA監査 raw trace

## 実行条件

```text
Action: qa-audit
Target: docs/design/REQ-347-test-plan.md
Configured model: qwen/qwen3.5-9b
LOCAL_AUDIT_REASONING_EFFORT: none
--context-length: 32768
Audit process exit: 0
Complete raw output: docs/design/REQ-347-final-qa-audit.log
```

直前の先行runもexit 0で `CRITICAL FAILURE (Design Gate FAIL)` と出力した。tool表示は切り詰められたため、そのrunの全文は保存できていない。完全なraw出力を保持するため同条件で再監査した結果は下記 `FAIL (Critical Ambiguities Detected)`。両方ともFAILであり、後の表現へ統合・緩和せず記録する。

## raw verdict

```text
Verdict: FAIL (Critical Ambiguities Detected)
Status: Do Not Execute. Requires Refactoring before any test automation can be generated or run.
```

## raw findings summary

- 外部履歴や未定義の参照（過去監査round、関連文書、hash）に実行条件が依存する。
- Gate 3 のscroll/focus/responsive/async-save基準が定量的assertionや明示的ground truthを欠き、視覚的な自己申告に依存する。
- Screenshot/DOM記録の外部validatorが指定されず、観察した事実の判定が再現不能。
- `draft` metadataと過去/未来時制の監査記録が混在し、現行テスト契約が読み取りにくい。
- fixtureの具体的な寸法、本文長、schema、遅延APIのresponse/payload/error条件が不十分。

これらはraw監査の要約であり、監査結果をPASSへ読み替えない。正確な全文は上記raw outputを参照。原指摘の後続処置は下記r9/r11 Architect responseへ分離して記録する。

## 後続のArchitect disposition（r11）

- 上記QA auditはr9-r11改訂前の当時のactive planに対するraw verdictである。raw **FAIL (Critical Ambiguities Detected)** とraw statusはそのまま保持し、r11を監査した結果と混同しない。
- r10 active-plan BA audit raw verdict **CRITICAL FLAWS DETECTED**、r11 exact-plan BA audit raw verdict **REJECT (with conditions)** はそれぞれのrevision結果として保持する。r10/r11の完全なraw evidenceは `docs/design/REQ-347-r10-audit-trace.json` と `REQ-347-r11-audit.log` / `REQ-347-r11-audit-trace.json` に保存されている。Architectの証拠付き応答は `docs/design/REQ-347-final-qa-response-r9.md` のR10/R11 disposition節にある。いずれのraw verdictもPASSへ変えていない。
- r11応答は再現性/測定手順の指摘を評価し、active planの手順契約を凍結した。製品AC、カード、DAG、sourceは変更していない。旧時点の監査記録は `REQ-347-test-plan-history.md` とr9/r10/r11 snapshotsへ保持し、実行前提として使わない。
- r11時点のhandover statusは `active-test-plan-frozen-gate1-gate2-pass-gate3-externally-blocked` だった（当時の記録）。このGate 2 PASSはr14結果で更新されており、現行判定としては使用しない。Readiness status: `externally-blocked-inconclusive`、再開条件と6/6 source hash一致は `REQ-347-gate3-readiness-r9.json` に記録される。

## mandatory cleanup evidence

```text
python .../local_model_adapter.py unload: exit 0
lms ps --json: exit 0
stdout: []
```

記録: `docs/design/REQ-347-final-unload.log`, `docs/design/REQ-347-final-lms-ps.json`。この確認はLM Studioにロード済みモデルがないことだけを示し、GPU全体の空き状態を示さない。

## r14 visual acceptance update (2026-10-12)

この節はr14時点の受入証跡を追記する。上記raw QA verdictとr9/r10/r11のraw audit verdictは変更せず、履歴として保持する。

### r14 design audit record

```text
Raw verdict: 現状のドキュメントは「マージ不可（UNSAFE FOR MERGE）」です。
Audit trace: docs/design/REQ-347-r14-audit-trace.json
Architect response/disposition: docs/design/REQ-347-r14-audit-response.md
Contract: frozen
```

Raw verdictはresponse内の証拠ベースdispositionによってPASSに読み替えない。

### 3-Gate evidence

| Gate | r14 result | Evidence |
|---|---|---|
| Gate 1 | PASS | `npm run typecheck` success。focused suites: T16 6/6、T17 31/31、T18 8/8、T19 20/20。 |
| Gate 2 raw test result | FAIL / full PASS未達 | 229 test files。連続する有効unfiltered runsは2076/2079、2077/2079、2078/2079 passed。最後もexit 1。 |
| Gate 2 acceptance disposition | User-accepted waiver | ユーザーは不安定な既存テストを別PBIで追跡し、本PBIでは許容すると明示。 |
| Gate 3 objective measurements | INCONCLUSIVE | BR-VIS1、BR-VIS2、BR-VIS3のr14 geometry/accessibility/typography/popup計測は未実施。 |
| Visual acceptance | User accepted | ユーザーは現在の表示が良好と明示的に確認。これは測定PASSではない。 |

Gate 2 raw failureは各runで `useGenerateDisplayState.residual` の `...baseline-known B follows a full 20-page cycle` が `expected checking to be partial`。最後のrunで残るため全件PASSとしない。対象file単独は8/8 passする。REQ-161 Desktop/Mobileの既定5,000ms timeoutは先行runで観測され、filtered rerunはpassした。timeout設定は変更されていない。

保存された全件JSON/log:

- `tmp/REQ-347-r14-full-vitest-elevated.json` / `.log` — 2076/2079
- `tmp/REQ-347-r14-full-vitest-rerun.json` / `.log` — 2077/2079
- `tmp/REQ-347-r14-full-vitest-final.json` / `.log` — 2078/2079
- `tmp/REQ-347-r14-residual-file.json` / `.log` — isolated 8/8
- `tmp/REQ-347-r14-GeneratePage-file-elevated.json` / `.log`; `tmp/REQ-347-r14-REQ161-filtered.json` / `.log`; `tmp/REQ-347-r14-REQ161-desktop-filtered.json` / `.log` — timeout/filtered diagnostics

Gate 3 evidence matrix:

| Scenario | Result | Measured evidence |
|---|---|---|
| BR-VIS1 sticky geometry/hit testing | INCONCLUSIVE | r14 browser geometry, sticky boundary, target/header rect and hit test not captured. |
| BR-VIS2 headings/accessibility names | INCONCLUSIVE | No r14 browser inspection evidence captured. |
| BR-VIS3 typography/toolbar/popup | INCONCLUSIVE | No measured typography, viewport/zoom, popup geometry or interaction evidence captured. |

Earlier Settings browser observations concern the previous visual revision and do not verify r14. The user's new confirmation that the current display looks good is recorded as visual acceptance; it does not provide BR-VIS1–3 measurement evidence. No visual measurement PASS is claimed.

Current handover verification summary: Gate 1 PASS; Gate 2 raw full-suite failures retained with user-approved separate-PBI scope waiver; Gate 3 appearance accepted by user while objective BR-VIS1–3 remain INCONCLUSIVE. PBI lifecycle was not changed by this verification update.

### Explicit user-accepted path and closure recommendation

```text
User acceptance: current display looks good.
User waiver: unstable full-suite test(s) are tracked in a separate PBI and are acceptable for this PBI.
Latest raw full-suite evidence: 2078/2079 passed, exit 1; preserved at tmp/REQ-347-r14-full-vitest-final.json and .log.
```

Recommendation: orchestration may close REQ-347 under this explicit user-accepted path. Keep the raw Gate 2 failure and the unmeasured BR-VIS1–3 status visible; the waiver and visual acceptance do not convert those checks into technical PASS. Raw audit verdicts and Architect dispositions above remain unchanged.
