---
id: REQ-344-test-plan
tags: [frontend, test, flaky, regression]
related_paths:
  - docs/backlog/pbi/active/REQ-344.md
  - docs/design/REQ-344.md
  - frontend/src/pages/__tests__/GeneratePage.test.tsx
---

# REQ-344: 検証計画

## Scope and Acceptance

AC-1: frontendで既定の npm test を連続5回実行し、各回でGeneratePage.test.tsxの全ケースがPASSする。既存13ケースと追加境界ケースの最終件数を記録する。診断/単独実行はこの5回へ含めない。設計時点では未実行。

workspace配下frontendの既存node_modules、Vitest 1.6/jsdom/React18、既定forks poolを使う。全APIをmockし、backend/ComfyUIの実応答に依存させない。監査モデルunload後に実行し、実行日時、実装識別、並列設定、他タスクの負荷を記録する。

## Diagnosis

T1変更前にfrontendで次を各1回実行する。開始/終了、終了code、対象失敗名、transform/collect/test時間、未定義API/act警告を保存する。再現しなければ「再現なし」と記し、主因を断定しない。
```powershell
npx vitest run src/pages/__tests__/GeneratePage.test.tsx --reporter=verbose
npm test -- --reporter=verbose
```

## Gate 1 / Gate 2

frontendから npm run typecheck と npx vitest run src/pages/__tests__/GeneratePage.test.tsx --reporter=verbose を順に実行する。Gate1は終了0、Gate2は対象全ケース成功。skip/todo/retry化、assertion削除、条件分岐による検証省略は不合格。局所検証だけでAC-1完了としない。

## Integration Scenarios

| ID | Given / When | Then |
|---|---|---|
| IT-1 | 毎ケースfresh fixture/QueryClient | mock実装/nested state/storage/widthが基準値、前caseのlist overrideなし |
| IT-2 | Desktop1024pxでworkflow未解決→resolve | API開始確認、generate-btn disabled→enabled |
| IT-3 | Mobile500pxでworkflow未解決→resolve | generate-btn-mobile disabled→enabled、最終DOM再取得 |
| IT-4 | preset同期→管理modal→preset選択 | 対象presetの必須表示、選択後もmodal表示 |
| IT-5 | 開いているpresetのclose tab | close button必須存在、removeSetが正しいIDで呼ばれる |
| IT-6 | case終了→次case | unmount/query cancel/clear、timer/spy復元、previous stateの残存なし |

## E2E Acceptance

このPBIのE2Eは既定runnerの全体実行による開発フロー検証であり、jsdomをブラウザー実測と記載しない。

T1/T2の疑わしい箇所への修正を1回適用し、最終局所検証1回が成功した場合に、coordinator/testerがfrontendで次を実行する。既定全体は最大5回の1バッチ、追加再試行なし。対象FAIL/timeoutが判明した回で停止しT3へ切り替える。対象関連か不明な未処理非同期例外や出力不足もT3で解析する。別ファイルだけの既存FAILは対象と区別し、対象5回の観測を継続できる。終了codeを即時取得し、worker数/retry/timeoutを追加指定しない。
```powershell
$req344Runs = @()
foreach ($req344Run in 1..5) {
  $req344Start = Get-Date -Format o
  $req344Log = "../docs/design/REQ-344-suite-$req344Run.log"
  npm test *> $req344Log
  $req344Exit = $LASTEXITCODE
  $req344Output = Get-Content -LiteralPath $req344Log -Raw
  $req344TargetFail = $req344Output -match 'FAIL\s+src[/\\]pages[/\\]__tests__[/\\]GeneratePage\.test\.tsx|GeneratePage\.test\.tsx[^\r\n]*\b[1-9]\d* failed\b'
  $req344TargetPass = $req344Output -match 'GeneratePage\.test\.tsx\s+\(\d+ tests?\)'
  $req344AsyncNeedsTriage = $req344Output -match '(?i)unhandled (error|rejection|exception)'
  $req344Runs += [pscustomobject]@{
    run = $req344Run; started_at = $req344Start
    finished_at = (Get-Date -Format o); exit_code = $req344Exit; log = $req344Log
    target_failure_detected = $req344TargetFail
    target_pass_line_found = $req344TargetPass
    async_needs_triage = $req344AsyncNeedsTriage
  }
  Get-Content -LiteralPath $req344Log -Tail 14
  if ($req344TargetFail -or -not $req344TargetPass -or $req344AsyncNeedsTriage) { break }
}
$req344Runs | ConvertTo-Json | Set-Content -LiteralPath '../docs/design/REQ-344-suite-results.json' -Encoding utf8
$req344Runs | Format-Table
```

ログの簡易文字列検出は停止判断を補助し、coordinatorが実際の対象行・件数・例外を確認する。各ログからrun/start/end/target件数/target判定/full suite exit/logを記録し、停止バッチの未実行回をNOT-RUNとして明示する。失敗回を捨てず、skipped/timeout/unhandled rejectionを別記する。出力不足でも同じバッチを繰り返さず、T3へ渡す。追加修正が必要なら静的解析から改訂設計を作りレビュー後に別の検証を計画し、既存ログを残す。

targetが全5回PASSならAC-1の観測条件を満たす。全体に既存FAILがある場合は対象AC観測を保持しつつ、全体Gate2をFAILとして親へ報告する。coordinatorがPBI完了を判断する。

全5回PASSでも、変更前の失敗→非同期/共有状態機構→修正で遮断された経路の説明に具体的な観測・ファイル:行がない場合はT3の静的解析を行う。成功したという事実だけで原因を確定しない。

## Gate 3: Boundary and Anomaly

| ID | 手順 | 必須観測 |
|---|---|---|
| RT-1 | 両widthでworkflow未解決render | API開始確認、disabled維持、unmount可能 |
| RT-2 | 両widthでworkflow reject、retry=false | query error到達、disabled維持、未処理rejectionなし |
| RT-3 | preset query未解決、1200ms fake advance | 未解決条件を確認しupdate0回 |
| RT-4 | textarea positive付きpreset resolve→同期→1200ms advance | query success、storeと表示入力が元positiveを保持、空positive保存なし |
| RT-5 | 同期済みpositiveをsetterで変更、999ms→1ms | 999msで0回、1000msで1回、正しいid/positive/base_updated_at payload |
| RT-6 | listをoverrideしたcase終了→基準case | 初期list[]、cache空、fresh store、one-shot残存なし |
| RT-7 | Mobile→Desktopのcase順、全体並列 | width1024復元、対象DOM混在なし、unmount後resize |
| RT-8 | fake timer区間のcleanup | bounded advance、query clear後real timer復元、runAllTimersでpollingしない |
| RT-9 | 既存ErrorBoundary throw | fallback/error/reload必須assert、console spy復元 |

RT-1〜5はT2、RT-6〜8はT1/T2のfixtureと局所/全体実行、RT-9は既存ケースで確認する。製品UIを変更しないため767/768px境界の追加は対象外。既存の500/1024pxは必須。

## Static Analysis Fallback

T3の切替評価は全経路で1回行う。局所/全体の対象失敗が残る、対象関連の非同期例外が不明、または5回PASSでも具体的な因果証拠が不足する場合に静的解析を実施する。5回PASSかつ具体的な説明が揃えば、解析不要の根拠を記録する。

対象はTask Cardの明示したテスト、GeneratePageと関連hook/layout、store、vite.config/setup。Promise開始/settle/await/cleanup、timer作成/clear/real-fake切替、mock default/one-shot/reset、store snapshot/subscribe/setter、query key/enable/retry/poll/gc/取消、component importとrender/effect境界を静的に照合する。参照先の追加は直接関係するimportに限定し理由を残す。

出力 `docs/design/REQ-344-static-analysis.md` の必須項目:

| 項目 | 期待証拠 |
|---|---|
| Attempt Evidence | 修正1回と局所/全体バッチ、切替条件、停止時NOT-RUN |
| Lifecycle Matrix | async/timer/mock/store/query/boundaryの6分類、owner/start/cleanup/共有/ファイル:行 |
| Causal Paths | 失敗から候補機構への辺、遮断/残存/未観測の区別 |
| Hypotheses | 修正済み/残存/根拠により否定/未確定、支持・反証・必要な最小検証 |
| Next Decision | 追加修正不要なら証拠整理、必要なら最小変更・検証案を親の改訂設計へ |

T3はread-only解析＋文書作成で、追加コード修正やテスト再試行をしない。静的にCPU競合/処理時間を確定しない。親が根拠と次手をレビューする。解析後も原因未確定ならその限界を明示し、原因の断定や調査ループに戻らない。対象5回PASS・追加修正不要ならT4へ進める。残存失敗/追加修正必要なら改訂設計レビューへ戻す。

検証コマンド（workspace root、解析出力の構造確認。内容は親がレビュー）:
```powershell
rg -n '^## (Attempt Evidence|Lifecycle Matrix|Causal Paths|Hypotheses|Next Decision)' docs/design/REQ-344-static-analysis.md
rg -n 'async|timer|mock|store|query|boundary|未確定|解析不要' docs/design/REQ-344-static-analysis.md
```

timeout延長、全体直列化、worker制限、skip/retryで合格にしない。import分離など追加修正が必要なら静的解析の具体的な根拠から設計を改訂する。

## Records and SSoT

T3は切替評価/必要時の静的解析を記録し親へ返す。T4は対象5回PASSと追加修正不要の判断後に、ログからdocs/design/REQ-344-verification.mdを作成し、SPEC_GENERATEに回帰方針と設計/計画/解析リンクを追加する。根因/成功を実ログにない推測で補完しない。監査はINCONCLUSIVEの既存記録を保持し、改訂T3/T4は再監査済みとしない。

Local QA audit command (verify phase):
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-344-test-plan.md
LM Studio localhost/lmsへの接続は初回からelevated sandboxで実行し、完了直後にadapter unloadのexit0を確認する。
