---
id: REQ-344-test-plan
tags: [frontend, test, flaky, followup]
related_paths:
  - docs/design/REQ-344.md
  - docs/design/REQ-344-static-analysis.md
  - docs/backlog/task/active/REQ-344-T5.md
  - docs/backlog/task/active/REQ-344-T6.md
  - frontend/src/pages/__tests__/GeneratePage.test.tsx
---

# REQ-344: getComfyModels追補の検証計画

## Current Evidence and Acceptance

2026-10-13。T1-T3はTask done。T2の対象実行は人手停止exit1でPASSではなく、5回受入は未完了。
T3原本はREQ-344-static-analysis.md。getComfyModels mock欠落は強い静的候補だが、
No queryFnのruntime発火observer/歴史的flakyの根因は未確定。setup.ts realpath EPERMによる
全体collection失敗は別の環境障害として扱う。旧test planはpre-followup snapshotへ保存済み。

AC-1は同じ実装で既定npm test連続5回、対象全ケースが全回PASS。focused診断/対象単独runを
5回へ数えない。skipped/todo/retryや失敗回除外で合格にしない。

## Planned Run Budget and Gates

| Phase | 回数・wall上限 | 次ゲート |
|---|---|---|
| T5 typecheck | 1回 | exit0 |
| T6 focused診断 | 1回、120秒 | load state Desktop/Mobile2case PASS、警告0、query evidence取得 |
| T6対象全ケース | 1回、120秒 | 正常完了exit0/全件PASS、警告・未処理例外・collection失敗なし |
| 既定受入バッチ | 最大5回、各600秒 | 全対象PASS、setup collection環境ゲート充足 |

wall期限はcoordinatorがexec sessionを外側から監視し、期限に達した当該run/sessionを停止する。
case timeoutや並列設定を変更しない。停止はINCONCLUSIVE、未実行回はNOT-RUN。
正常終了code/summaryがないrunを成功としない。T1/T2のrunを再dispatchせず、今回計画の
単発診断と単発対象だけを追加する。別候補追加/追加再試行は新しい静的解析と人のレビューへ。

## Gate 1 and Focused Diagnostic

cwd: frontend。T5で npm run typecheck を1回。T6は次を1回実行する（wall120秒）:
```powershell
$env:VITE_REQ344_QUERY_DIAGNOSTICS = '1'
try {
  npx vitest run src/pages/__tests__/GeneratePage.test.tsx --testNamePattern 'REQ-161: Generate button follows workflow load state' --reporter=verbose *> ../docs/design/REQ-344-followup-diagnostic.log
  $req344DiagnosticExit = $LASTEXITCODE
  Get-Content -LiteralPath '../docs/design/REQ-344-followup-diagnostic.log' -Tail 35
} finally {
  Remove-Item Env:VITE_REQ344_QUERY_DIAGNOSTICS -ErrorAction SilentlyContinue
}
exit $req344DiagnosticExit
```

必須記録: case名/観測時点/key/query有無、observer総数、queryFnのtypeofとmock参照一致、
status/fetchStatus、getComfyModels mockCalls、No queryFn/Missing queryFn件数。
warning最初の1件、各case cleanup前、suite終了summaryを区別する。
warning0はsnapshot/実行2caseと合わせて評価し、cacheがない場合は未観測を記す。
3consumerの静的owner位置を総observer数へ置き換えない。consoleの本来の出力は維持する。

期待: focused2case全PASS、警告0、両caseで対象key/queryFn function/mock参照一致を確認。
diagnostic summary/必要なsnapshotが不足、警告再発、run停止、collection失敗なら次へ進まず親へ。
warning消失だけで歴史的根因を確定しない。

## Gate 2: Single Target Validation

focused gateが満たされた場合だけ1回、wall120秒:
```powershell
Remove-Item Env:VITE_REQ344_QUERY_DIAGNOSTICS -ErrorAction SilentlyContinue
npx vitest run src/pages/__tests__/GeneratePage.test.tsx --reporter=verbose *> ../docs/design/REQ-344-followup-target.log
$req344TargetExit = $LASTEXITCODE
Get-Content -LiteralPath '../docs/design/REQ-344-followup-target.log' -Tail 35
exit $req344TargetExit
```

正常完了exit0、既存＋追加の全対象case PASS、skipなし、No queryFn再発なし、未処理例外なしが必要。
失敗ならread-only静的解析と親の改訂レビューへ戻す。通るまで再実行しない。

## Follow-up Acceptance Batch

対象単独gate後、診断envを解除して既定npm testを最大5回の1バッチ。
各run wall600秒を外側で監視する。run開始markerから期限を計測し、期限超過時は停止して
当該runをINCONCLUSIVEと記録する。停止時は親が部分ログ/結果を補完する。
このloopはcase timeout/worker数/retryを指定しない:
```powershell
Remove-Item Env:VITE_REQ344_QUERY_DIAGNOSTICS -ErrorAction SilentlyContinue
$req344Runs = @()
foreach ($req344Run in 1..5) {
  $req344Start = Get-Date -Format o
  Write-Output "REQ-344 suite run $req344Run started $req344Start"
  $req344Log = "../docs/design/REQ-344-followup-suite-$req344Run.log"
  npm test *> $req344Log
  $req344Exit = $LASTEXITCODE
  $req344Output = Get-Content -LiteralPath $req344Log -Raw
  $req344TargetFail = $req344Output -match 'FAIL\s+src[/\\]pages[/\\]__tests__[/\\]GeneratePage\.test\.tsx|GeneratePage\.test\.tsx[^\r\n]*\b[1-9]\d* failed\b'
  $req344TargetPass = $req344Output -match 'GeneratePage\.test\.tsx\s+\(\d+ tests?\)'
  $req344QueryFnWarning = $req344Output -match 'No queryFn|Missing queryFn'
  $req344AsyncNeedsTriage = $req344Output -match '(?i)unhandled (error|rejection|exception)'
  $req344PermissionError = $req344Output -match '\bEPERM\b'
  $req344SetupCollectionError = $req344PermissionError -and ($req344Output -match 'setup\.ts|realpath')
  $req344Runs += [pscustomobject]@{
    run = $req344Run; started_at = $req344Start
    finished_at = (Get-Date -Format o); exit_code = $req344Exit; log = $req344Log
    target_failure_detected = $req344TargetFail; target_pass_line_found = $req344TargetPass
    query_fn_warning = $req344QueryFnWarning; async_needs_triage = $req344AsyncNeedsTriage
    permission_error = $req344PermissionError; setup_collection_error = $req344SetupCollectionError
  }
  $req344Runs | ConvertTo-Json | Set-Content -LiteralPath '../docs/design/REQ-344-followup-suite-results.json' -Encoding utf8
  Write-Output "REQ-344 suite run $req344Run finished exit $req344Exit"
  Get-Content -LiteralPath $req344Log -Tail 14
  if ($req344TargetFail -or -not $req344TargetPass -or $req344QueryFnWarning -or $req344AsyncNeedsTriage -or $req344PermissionError) { break }
}
```

文字列検出は補助であり、親が実ログ・対象件数・collection状態を確認する。
EPERM検出は保守的に停止し、setup.ts/realpathとの実関係はraw例外で確定する。
collection失敗のrunをtest assertion FAILやflaky再現として扱わない。
setup.ts EPERMが再発したら対象PASS行があっても環境ゲート未充足、バッチを停止する。
ACL/cache/setup/実行権限/worker変更や修復後のその場再試行はこの追補の対象外。
環境のread-only調査と親レビューへ返し、再実行は別のレビュー済み計画が必要。

target FAIL/timeout/警告再発/未処理例外/出力不足も停止条件。別ファイルだけの既存assertion FAILは
全体Gate2 FAILとして別記し、collection正常・対象結果が明確なら5回観測を継続できる。
5行表に未実行回NOT-RUNを置き、失敗回を捨てない。全5回のtarget PASSがAC-1観測条件。
全体Gate失敗時はT4の成功完了を親判断まで保留する。

## Integration and Gate 3 Boundaries

T1/T2で実装済みの試験・assertionを保持する。対象単独runと受入suiteで次を確認する:
- Desktop/Mobileのworkflow未解決/resolve/rejectによるdisabled状態。
- preset初期同期前save禁止、同期後positive保持、999/1000ms autosave。
- fixture/reset/cleanup/query cancel-clear/timer-storage復元。
- preset modal選択後の表示、close tabの必須assertion、ErrorBoundary。
今回追加の観測はgetComfyModelsのreset後function/既定[]とqueryFn一致。
timer、mockされた本体、製品queryのenabled/retryを変更して合格にしない。

## Outputs and Decision

T6出力REQ-344-followup-validation.md:
Attempt Evidence、Diagnostic Evidence、Target Result、Acceptance Table、Next Decision。
source SHA256、日時、各code/停止理由/最後のcase、警告数、query snapshots、5回またはNOT-RUN、
EPERM分類、未観測項目、生ログへのリンクを含む。T3原本や先行ログは上書きしない。

queryFnがfunctionへ変わり警告が消えた観測と、歴史的flaky原因の確定を区別する。
失敗/証拠不足なら静的解析と改訂レビュー、EPERMなら別の環境調査レビューへ。
対象5回PASS＋環境ゲート充足＋追加修正不要の親判断後にT4を実行する。

## Audit Status

旧BA監査INCONCLUSIVE（exit1）と直後unload exit0の証拠を保持。
今回追補は人のレビュー用改訂で再監査しない。旧traceを新設計のPASSにしない。
