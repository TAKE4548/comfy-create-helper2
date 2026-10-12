# REQ-347 Gate 2 Mobile Timeout Triage

## Verdict

REQ-161 Mobileの初回全体実行で生じた5,000ms timeoutは、変更なし・同じ既定timeoutの有効な全体/単独再実行では再現しない。一過性のtest実行タイミング失敗として分類する。T5の機能回帰を示す証拠は確認できない。具体的なhost負荷/スケジューリング原因や、変更前baselineで既に発生していたという歴史的証拠は未取得のため断定しない。timeout増加/skip/assert弱化/source修正/新Task Cardは不要。

## Original Failure and Corrections

親/QA報告: frontendのnpx vitest runは初回exit1、226 files中225成功/1失敗、2,052成功/1失敗。失敗名はGeneratePage.test.tsxの「REQ-161: Generate Batch button is disabled when workflow is not loaded (Mobile)」。rawはTest timed out in 5000msだけでJS stackなし。52.17sは該当testの時間ではなく全run時間（QAが訂正）。この初回失敗をPASSへ書き換えない。

report取得のrestricted-sandbox実行はsetup.tsでEPERMとなりcollection以前に失敗した別実行。有効なproduct test結果へ数えず、その後のelevated再実行と区別する。tmp/REQ-347-final-vitest-stdout.logは調査時0Bだったため、存在しないstackを引用しない。

## Read-only Source Evidence

- GeneratePage.test.tsx L257-285: window.innerWidth=500、独自QueryClientProviderを使用、workflow getをdeferred mockへ置換、初期Generate Batch disabledを確認、actでworkflowをresolveしてwaitForでenabledを確認。workflow responseはmappings:[]。fake timerやtimeout設定変更はない。
- MobileLayout.tsx L770付近: ParamPanelへmobileを渡すがstageGroupingは渡さない。
- ParamPanel.tsx L148/L169/L392-395: stageGrouping既定false、空paramMappingsならnull、grouped子はtrue時だけmount。StageGroupedParametersのquery hookはこのMobile fixtureで実行されない。
- MobileLayout.tsx L827: disabled={!selectedWorkflowId || !isConnected || !workflow}を保持。
- git diff --numstatでGeneratePage.test.tsx、MobileLayout.tsx、GeneratePage.tsx、useWorkflowManagement.ts、useGeneratePageState.ts、vite.config.tsに変更なし。T5の修正はflat query非mountと既存renderer互換性。
- workflow取得はuseWorkflowManagement.tsの既存['workflow',selectedWorkflowId] query。T5のgrouped metadata取得はworkflowの存在/生成ボタン条件を変更しない。

## Valid Verification Evidence

QAがfull終了後に順次実行。Architectはsource/testを編集せず、試験も実行していない。QAは各再実行の間にcode/test/config変更・timeout増加なしと報告。

| 実行 | 結果 |
|---|---|
| elevated unfiltered full JSON run | exit0、226/226 files、2,053/2,053 tests、640/640 nested suites、success:true |
| npx vitest run src/pages/__tests__/GeneratePage.test.tsx -t 'REQ-161.*Mobile' --reporter=verbose | exit0、1成功/12 skipped（filterによる選択外）、Mobile test161ms、全run3.52s |
| npx vitest run src/pages/__tests__/GeneratePage.test.tsx --reporter=verbose | exit0、13/13成功、tests合計2.13s、全run5.46s |

全体JSONをArchitectが直接読んでsuccess/件数/GeneratePage file passedを確認。640はnested suitesの数でありfile数ではない。単独logは非致命的React act/既存mock query警告を含むが各exit0を保持する。初回generic timeoutのhost負荷原因をこれらの警告から推測して確定しない。

| Artifact | SHA256 |
|---|---|
| tmp/REQ-347-final-vitest-report.json | EB68DAD7A81163A40C130F21667EEC033B60AA741B3BF2C316A4BB7D94AE657F |
| tmp/REQ-347-REQ161-filtered.log | 226FA55D94ED6164DC2545EA5C4DD0537C67BDF1E10F2A7C42CECCB2C5964ED9 |
| tmp/REQ-347-GeneratePage-file.log | 975DE99ED55B40A5C447905A1196DE8D5B542CEF502DA5853BCFAF25225EF900 |

## Handover

有効な再実行のGate1 typecheck/全体Gate2 PASS証拠を親へ返す。元timeout・EPERM収集失敗・有効PASSを別実行として保存する。T5/その他カードの挙動契約を変更しないため、新規設計監査は不要。人間判断事項0。Gate3実ブラウザー受入/QA raw FAILは独立した検証事項で、本診断からPASSとしない。
