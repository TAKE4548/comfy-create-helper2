# REQ-347 検証ウォークスルー

## 総合判定: **INCONCLUSIVE**

技術検証の総合判定は **INCONCLUSIVE**。Gate 1 は PASS。Gate 2 のraw全件結果は失敗を含むが、ユーザーは不安定な既存テストを別PBIで追跡し、本PBIでは許容すると明示したため、受入上は「ユーザー承認済み・対象外化」と記録する。Gate 3の外観についてもユーザーが現在の表示を良好と確認した。これらの受入判断はraw test failureや未計測のBR-VIS項目を技術的PASSに変換しない。

## 実行証拠

<execution_evidence>

### Gate 1 — 型チェック

- 作業場所: `frontend/`
- コマンド: `npm run typecheck`（`tsc -b --noEmit`）
- 結果: **PASS**, exit 0、型診断なし。

### Gate 2 — 全件テスト

- r14の有効な全件コマンド: `npx vitest run --reporter=json --outputFile=../tmp/REQ-347-r14-full-vitest-<run>.json`（`frontend/`、ファイルfilterなし）。有効な3回はいずれも229 test filesを収集。最後のJSON `numTotalTestSuites` はファイル数ではなくnested suite数。
- r14の全件結果は順に **2076/2079**, **2077/2079**, **2078/2079** passed（すべてexit 1）。毎回 `useGenerateDisplayState.residual` の既存テスト `...baseline-known B follows a full 20-page cycle` が `expected checking to be partial` で失敗。raw Gate 2結果はfailedでありfull PASSではない。ユーザーはこの不安定な既存テストを別PBIで追跡しREQ-347では許容すると明示したため、受入処理ではGate 2を**ユーザー承認済み（不安定テストを別PBIへスコープ外化）**とする。元の失敗とexit codeは保存する。
- 保存証拠: [初回JSON](../../tmp/REQ-347-r14-full-vitest-elevated.json) / [初回ログ](../../tmp/REQ-347-r14-full-vitest-elevated.log)、[再実行JSON](../../tmp/REQ-347-r14-full-vitest-rerun.json) / [再実行ログ](../../tmp/REQ-347-r14-full-vitest-rerun.log)、[最終JSON](../../tmp/REQ-347-r14-full-vitest-final.json) / [最終ログ](../../tmp/REQ-347-r14-full-vitest-final.log)。隔離ファイルは [residual 8/8 JSON](../../tmp/REQ-347-r14-residual-file.json) と同名 `.log`。同ファイル単独ではpassするが、全件での再現失敗を打ち消さない。
- REQ-161 Desktop/Mobileの既定5,000ms timeoutも先行する全件/ファイル実行で観測された。timeout値は変更せず、filter付き再実行ではpassした。raw証拠: [GeneratePage isolated JSON](../../tmp/REQ-347-r14-GeneratePage-file-elevated.json) と `.log`、[REQ-161 filtered JSON](../../tmp/REQ-347-r14-REQ161-filtered.json) と `.log`、[Desktop filtered JSON](../../tmp/REQ-347-r14-REQ161-desktop-filtered.json) と `.log`。
- Gate 1 typecheck PASS。r14 focused suites: T16 6/6、T17 31/31、T18 8/8、T19 20/20 PASS。これらは全件runの1件失敗を相殺しない。sandbox EPERMによる0-test runは製品テスト結果から除外。

### Gate 3 — 実ブラウザーと受入シナリオ

- r11以前の実環境観察: Codex in-app browser、`http://127.0.0.1:5173/`、画面1280×720。既存Settings workflowを操作して見出しを観察した記録は旧版の証拠であり、r14の新しい外観を実測したものではない。
- 同じSettings mapping領域を下へスクロールし、Main見出しが領域上端に残った状態からRough見出しへ進み、さらにDetailが通常位置に現れることをスクリーンショットで確認。上方向へ戻すとMain見出しが再び上端に現れた。視覚観測であり、scrollTop、root/header/targetの矩形、computed style値は取得していない。
- r11 active planには隔離fixtureのrecipeと操作期待値が定義されているが、fixture transport/API制御harnessとDOM/scroll telemetryを備えた対応runnerは利用できなかった。Generateはworkflow未選択の状態で開始し、既存Settings workflowのcombobox値も「未指定」だったため、承認済みfixtureでのシナリオは実施していない。Prompt/Parameter入力、Settings保存/再表示、focus/click/Tab/Shift+Tab、responsive/zoom、API遅延保存競合も未確認。
- r14の表示に対し、ユーザーは現在の見た目が良いと明示的に確認した。これは外観に関するユーザー受入として記録する。
- BR-VIS1–3の客観測定は依然 **INCONCLUSIVE**。r14のgeometry、accessible-name、typography、popup位置/操作の実ブラウザー計測証拠はない。測定状態をPASSに変更しない。
- Gate 3技術計測は **INCONCLUSIVE**。視覚結果についてはユーザー受入済みと区別して併記する。

### ローカルモデル QA 監査

- コマンド: `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-347-test-plan.md`
- 実行設定: adapterが使用モデルを `qwen/qwen3.5-9b` と確認。`LOCAL_AUDIT_REASONING_EFFORT=none` を設定、context 32768を明示。model output traceはQ6_Kを記録。audit exit 0。
- 保存した完全なraw output: [REQ-347-final-qa-audit.log](REQ-347-final-qa-audit.log)。raw verdictは **FAIL (Critical Ambiguities Detected)**、Statusは “Do Not Execute. Requires Refactoring before any test automation can be generated or run.”。主な指摘は外部監査履歴への依存、主観的/数値未定義のGate 3基準、スクリーンショット自己申告の検証loop、draftと過去の監査ラウンドの時系列混同、fixture寸法/長さ/API payloadの不足。これはraw audit結果として保持し、PASSに読み替えない。Architect/Coordinatorがトリアージする。
- この QA audit verdict はr9-r11改訂前のその時点のtest-planを対象にしたhistorical raw resultであり、後の改訂を監査した結果とは混同しない。raw verdict/statusは原文のまま保持され、Architectのr9応答では再現性指摘を証拠別に評価した。
- r10 BA raw verdict **CRITICAL FLAWS DETECTED**、r11 BA raw verdict **REJECT (with conditions)**、r14 design audit raw verdict `現状のドキュメントは「マージ不可（UNSAFE FOR MERGE）」です。` は各revisionの結果として保持する。r14 responseには証拠ベースのdispositionとfrozen contractがあるが、raw verdictはPASSへ変換しない。証拠: [r14 audit trace](REQ-347-r14-audit-trace.json)、[r14 response](REQ-347-r14-audit-response.md)。
- r14 handoverは `visual-r14-contract-frozen-architect-dispatch-ready-acceptance-pending`。最新verificationはGate 1 PASS、Gate 2 full-suite mixed/INCONCLUSIVE、Gate 3 BR-VIS1–3 INCONCLUSIVE。readinessの外部runner/telemetryとfixture制約は [REQ-347-gate3-readiness-r9.json](REQ-347-gate3-readiness-r9.json) に記録される。r10/r11のresponse/dispositionは [REQ-347-final-qa-response-r9.md](REQ-347-final-qa-response-r9.md) に保持する。
- planの履歴は [REQ-347-test-plan-history.md](REQ-347-test-plan-history.md) とr9-r11 snapshotsへ隔離され、現在の手順は [REQ-347-test-plan.md](REQ-347-test-plan.md) 本文にある。YAML `draft` / `design_gate: pending` は文書metadataであり、r10/r11監査が未実行という意味ではない。
- 監査後すぐのunload: `local_model_adapter.py unload` exit 0。記録: [REQ-347-final-unload.log](REQ-347-final-unload.log)。独立確認 `lms ps --json` exit 0、結果 `[]`: [REQ-347-final-lms-ps.json](REQ-347-final-lms-ps.json)。この結果はLM Studioにロード済みモデルがないことだけを示し、GPU全体の空き状態を示さない。

</execution_evidence>

## AC compliance matrix

以下のPASSは全件実行中のVitest統合assertionに対するもの。Gate 3のブラウザー合格とは区別する。

| AC | Prompt | Parameter | Settings | Gate 3の実ブラウザー証拠 |
|---|---|---|---|---|
| AC-1 | PASS (Vitest統合) | PASS (Vitest統合) | INCONCLUSIVE | Settingsで3工程groupは視覚確認したが計画fixtureではない。Generateは未選択。 |
| AC-2 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | Settingsはscroll中の見出しを視覚確認。指定root寸法/scrollTop/header・target rectは未計測。 |
| AC-3 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | SettingsでMain/Rough/Detail見出しの変化と逆スクロールを視覚確認。境界値/viewport rectは未計測。 |
| AC-4 | N/A | PASS (Vitest統合) | N/A | browser fixture未実行。 |
| AC-5 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | 3領域でfocus非遮蔽、click、Tab/Shift+Tabを実測していない。 |
| AC-6 | N/A | N/A | PASS (Vitest統合) | nodeA→nodeCの実ブラウザー保存/再表示は未実行。 |
| AC-7 | PASS (Vitest統合) | N/A | N/A | browser fixture未実行。 |
| AC-8 | PASS (Vitest統合) | PASS (Vitest統合) | N/A | 両root同時の実画面fixtureは未実行。 |

## Gate 3 scenario / Red Team status

| 項目 | 状態 | 証拠・未確認事項 |
|---|---|---|
| E2E-G1/G2/G3, E2E-S1/S2 | INCONCLUSIVE | Generate fixture無し。Settings画面にMain/Rough/Detailは表示されたが、対象fixture/編集/save payloadを検証できず。 |
| BR-1-P/V/S | INCONCLUSIVE | Settingsのscroll途中を観察。3rootそれぞれのroot selector・scrollTop・rect未取得。 |
| BR-2-P/V/S | INCONCLUSIVE | Settingsの見出し切替/逆スクロールを視覚確認。境界到達値と1px許容測定未実施。 |
| BR-3-P/V/S | INCONCLUSIVE | click、Tab/Shift+Tab、target/header矩形の非遮蔽を実施していない。 |
| BR-4 | INCONCLUSIVE | Prompt/Parameterの一方だけを動かす実fixture無し。 |
| BR-5 | INCONCLUSIVE | 120px split、drag、800×600、200% zoom、長名横overflow未実施。 |
| BR-6 | INCONCLUSIVE | 長名/同名/短文/単一/0 mapping fixture未実施。 |
| BR-7 | INCONCLUSIVE | collapse/preset/workflow切替/master refetchの実ブラウザー操作未実施。 |
| BR-8 | INCONCLUSIVE | metadata障害、inactive参照、第四stageのブラウザーfixture未実施。 |
| BR-9 | INCONCLUSIVE | sync、Seed、LoRA/popupとheader干渉を実ブラウザーで未確認。 |
| BR-10 | INCONCLUSIVE | Settingsの375/767/768/1024px viewport検証未実施。 |
| BR-11 | INCONCLUSIVE | 実ブラウザーで遅延保存中の再編集/再表示/次保存を未実施。 |

### r14 視覚受入項目

| 項目 | 判定 | 証拠 |
|---|---|---|
| BR-VIS1 sticky geometry/hit testing | INCONCLUSIVE | r14ブラウザー計測なし。root/header/target rect、sticky境界、hit test未取得。 |
| BR-VIS2 見出しとaccessible names | INCONCLUSIVE | r14画面の見出し/accessible name確認記録なし。 |
| BR-VIS3 typography、toolbar、popup位置/interaction | INCONCLUSIVE | 16px/24/600、viewport/zoom、popup矩形/操作を実ブラウザーで未計測。 |

## 残件

- r14 contractは凍結済み。Gate 3を再開するには外部runner/telemetryと隔離fixture/API transportを用意し、BR-VIS1–3、3領域の測定、全E2E、Red Team操作を実行する。今はGate 3 **INCONCLUSIVE**を維持する。
- raw QA `FAIL (Critical Ambiguities Detected)`、r11 raw BA `REJECT (with conditions)`、r14 raw design audit `現状のドキュメントは「マージ不可（UNSAFE FOR MERGE）」です。` は証拠として保持し、PASSへ変更しない。r14 dispositionは [REQ-347-r14-audit-response.md](REQ-347-r14-audit-response.md) に記録済み。
- 検証担当はPBI lifecycle、archive、commitを変更していない。

## ユーザー受入とクローズ勧告

- ユーザー確認: 現在の表示は良好。不安定な全件テストは別PBIで追跡し、本PBIでは許容する。
- この受入はraw全件結果を変更せず、最新 **2078/2079 passed, exit 1** を保持する。既存residual失敗は本PBIのスコープ外として別PBI追跡に委ねる。
- **クローズ勧告: ユーザー承認済みの例外受入経路で orchestration はクローズ可能。** BR-VIS1–3の測定とGate 2 raw failureは技術PASSではなく、免除/受入判断として記録する。
