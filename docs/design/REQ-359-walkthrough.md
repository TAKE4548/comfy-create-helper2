# REQ-359 検証ウォークスルー

## 総合判定: **Gates PASS / QA audit accepted / PBI done**

Typecheck、全フロントエンドテスト、REQ-359対象テストが成功し、隔離backend/DBとheadless Chromeによるブラウザ検証も完了しました。LocalStorageを空にしたroot、Anima workflow id=1、Illus workflow id=2の3ケースすべてでCDPがRuntime exception 0件・console.error 0件を記録しました。rootではUpload prompt、workflow 1ではAnima checkbox checked、workflow 2ではuncheckedを確認しています。ユーザーDBには接続せず、検証データは使い捨て環境だけに作成しました。

AC受入検証はPASSです。最終QA監査は、最新のexact-countテスト計画編集より前に1回だけ実行され、FAILを返しました。監査で妥当と判断した定量基準の不足はその後計画に追記し、E2E実行性の不足は隔離ブラウザ証拠で補いました。one-final-audit protocolに従い再監査していないため、raw verdictはFAILのまま保持します。ユーザーは2026-10-13にこの監査結果を受容してクローズする判断を行いました。

## 実行証拠

| Gate | コマンド / 操作 | 結果 |
|---|---|---|
| Gate 1 | `cd frontend; npm run typecheck` | PASS、終了コード0 |
| Gate 2 | `cd frontend; npx vitest run --reporter=dot` | PASS、230 files / 2142 tests、失敗0（AC追補前の全suite実行。追補後は下記REQ-359対象テストを再実行） |
| Gate 2 hygiene | `python C:\Users\audih\.gemini\antigravity\scripts\workflow_validator.py test-hygiene REQ-359` | FAIL、終了コード1。既存の複数ticket-named test file違反を列挙。REQ-359対象の2ファイルはticket-namedではない |
| Gate 3 対象 | `npx vitest run src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts -t "REQ-359/AC-" --reporter=dot` | PASS、3 passed / 1 skipped。ACT警告あり |
| Gate 3 対象 | `npx vitest run src/utils/__tests__/wiringStageGroups.test.ts -t "REQ-359/AC-4" --reporter=dot` | PASS、1 passed / 12 skipped |
| Gate 3 ブラウザ初回 | `http://127.0.0.1:5173/` を開き、indexを確認 | Generate/READYを確認。workflowなしのため選択切替とConsole確認は未完了 |
| Gate 3 初回分離backend試行 | workspace内一時SQLite / log / snapshot pathを指定してbackend起動 | FAIL、sandboxがlocalhost socket bindをerrno 13で拒否。試行用一時ディレクトリは削除。ユーザーDBは未変更 |
| Gate 3 隔離ブラウザ再検証 | 一時backend/SQLiteとisolated headless Chromeでroot、workflow 1 (Anima)、workflow 2 (Illus)を検証 | PASS。3ケースすべてCDP Runtime exceptions=0、console.error=0。rootでUpload prompt、workflow 1でAnima checkbox checked、workflow 2でunchecked。検証データは使い捨てDBのみ |
| Gate 3 追補検証 | hook test AC-1〜3、および `npm run typecheck` を再実行 | PASS、hook 3 passed / 1 skipped、typecheck終了コード0。非同期query/store更新にReact `act(...)` 警告あり |
| Gate 3 追補検証 | `npx vitest run src/utils/__tests__/wiringStageGroups.test.ts -t "REQ-359/AC-4"` を再実行 | PASS、1 passed / 12 skipped |
| 最終QA監査 | `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-359-test-plan.md` | 1回のみ実行、終了コード0。model=`qwen/qwen3.5-9b`、Q6_K、verdict=`FAIL (Critical Ambiguities Detected)`。この監査は後述のexact-count追記前。再監査は禁止のためraw verdictを保持し、妥当指摘は後続編集で対処済み |
| QA後処理 | `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py unload` | PASS。`LM Studio reports no models loaded.` |

## QA監査の構造化トリアージ

| 監査指摘 | 証拠に基づく判定 | 対応 / 残り |
|---|---|---|
| 「有限回」「追加更新なし」に数値基準がない | **監査時点では有効**。hook testは `renderCount < 12` とnotification countをassertしていたがtest-plan本文に正確値がなかった | 監査後にAC-1/2/3へ実assert値を明記済み。再監査なしでraw audit FAILは保持 |
| E2Eが手動で、Console判定・workflow切替に自動化手順がない | **監査時点では有効な証拠不足**。初回CUAではConsole/実workflowを確認できなかった | 後続のisolated headless Chrome/CDP検証で3ケースのRuntime exception/console.errorゼロとbase-model切替を確認。再監査はしていない |
| Zustand actionをspy/mockしてcall countを取るべき | **不採用**。test-planの「実store actionを置換しない」と矛盾し、実装はsubscription通知とstate/resultのexact assertionsを使う。監査例の `generationStore.actions` / Jest APIは実store契約とも一致しない | action spy導入はしない。指摘は仕様への不適合として分類 |
| AC-5に警告ゼロのbaseline比較が必要 | **要求外の上乗せ**。AC-5はtypecheck成功を要件とし、`npm run typecheck` はexit 0 | 新規warning baselineを定義しない |
| null/unknown IDなど追加境界ケースを必須化すべき | **任意のRed Team補足**。PBI acceptance criteriaには含まれず、現在の一回限り監査結果だけで実装不備とはしない | PBIのAC未達には数えない |

## AC 準拠表

| AC | 内容 | 証拠 | 判定 |
|---|---|---|---|
| AC-1 | index起動後に更新深度エラーなしでGenerate表示 | hook testでquery解決後のAnima収束、同値setter後の同一workflow参照、renderCount `< 12` を確認。隔離ブラウザのroot/Anima/Illus 3ケースでRuntime exception=0、console.error=0 | PASS |
| AC-2 | 同一raw workflowの無関係なstore更新でループしない | hook testでテスト専用の無関係fieldを更新し、派生workflow参照維持、Anima mode不変、余分なmode更新がないことを確認 | PASS (hook統合テスト範囲) |
| AC-3 | workflow選択のbase modelに応じAnima状態更新 | hook testでAnima workflow 7/9とSDXL workflow 8の同一model再選択、manual override、Anima↔SDXL切替を確認。隔離ブラウザでworkflow 1 (Anima) checked、workflow 2 (Illus) uncheckedを確認 | PASS |
| AC-4 | disabled mappingだけ生成cloneから除外しraw保持 | frozen raw入力に対し生成順序、raw配列参照とslot state保持を確認。関連境界テストでstate欠落/未知keyも確認 | PASS |
| AC-5 | 対象テスト・typecheck成功 | 対象2コマンドと `npm run typecheck` がすべて終了コード0 | PASS |

## Red Team / 境界確認

- workflow cloneテストでslot stateなし、空、未知slot keyを含む入力を実行し、mappingを誤除外しないことを確認。`frontend/src/utils/__tests__/wiringStageGroups.test.ts` 内の既存境界ケース。
- 一時backend/DBを使ったisolated headless Chrome検証でLocalStorage空のrootおよびAnima/Illus workflowを確認。CDP記録は3ケースともRuntime exception/console.errorゼロ。ユーザーDBには接続・変更していない。
- 最終QA監査は更新済みtest-planに対して1回実行しCriticalでFAIL。上記の有効指摘を判定に反映し、非適用の提案は採用していない。

## 未達・制約

- repo-wide test-hygieneの既存違反をガバナンス上どう扱うか調整する。REQ-359変更対象外の違反をこのレビューで改変していない。
- QA監査のraw FAILは残存するが、ユーザー判断で受容済み。監査の妥当指摘はtest-plan編集と隔離ブラウザ証拠で対処し、one-final-audit protocolに従って再監査は行っていない。

## 現在の状態

- PBI `REQ-359`: `done`、2026-10-13にアーカイブ済み。ACはすべてPASS。QA audit raw FAILはユーザー判断で受容済み。
- Task Card `REQ-359-T1`: `done`。実装と補足テストの対象ファイルは `frontend/src/pages/GeneratePage/hooks/useWorkflowManagement.ts`、`frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts`、`frontend/src/utils/__tests__/wiringStageGroups.test.ts`。
- REQ-359固有の追加変更: `docs/design/REQ-359-test-plan.md` のAC別ケース名を実テストに整合。
- Persistent DB: 未変更。分離検証用一時ディレクトリは削除済み。
