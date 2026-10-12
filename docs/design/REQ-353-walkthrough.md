# REQ-353 検証ウォークスルー

## 総合判定: **INCONCLUSIVE**

REQ-353の受け入れ対象テストとbackend全件は通過しました。Gate 1のfrontend/backend型検証も最終実行で通過し、Gate 3のseed payload・拒否・履歴記録シナリオは対象テストで確認できています。一方、frontend全件テストは2回の実行で未変更領域のタイミング失敗が出ました。対象ファイルだけの再実行では通過しましたが、全件Gate 2はPASSと判定できません。

dev-verifyのローカルQA監査はFAILを返しました。指摘はテスト計画の実行手順や証拠の明示性に関するもので、AC-1〜5の実装不適合を直接示すものではありません。ただし必須監査結果をPASSに読み替えず、そのまま記録します。

## 実行証拠

<execution_evidence>

### Gate 1: 型検証

| 対象 | コマンド | 結果 |
| :--- | :--- | :--- |
| Frontend | `cd frontend; npm run typecheck` (`tsc -b --noEmit`) | PASS、exit 0 |
| Backend | `mypy backend` | 初回は`backend/app/routers/workflows.py:87`のfallback型不一致1件。T1修正後に再実行しPASS、194 source files、0 issues |

### Gate 2: 全件テスト

| 対象 | コマンド | 結果 |
| :--- | :--- | :--- |
| Backend | `cd backend; $env:PYTHONPATH='.'; ./.venv/Scripts/python.exe -m pytest`（elevated） | PASS、702 passed、3 warnings、102.51s |
| Frontend | `cd frontend; npx vitest run`（1回目） | FAIL、225/227 files passed、2070/2073 tests passed。2 filesで3 failures |
| Frontend | `cd frontend; npx vitest run`（負荷を外して再実行） | FAIL、225/227 files passed、2071/2073 tests passed。2 filesで2 failures |
| Frontend | `cd frontend; npx vitest run`（最終孤立実行、他のsuite停止後） | FAIL、225/227 files passed、2070/2073 tests passed。2 filesで3 failures |

Frontend全件の主な失敗証拠:

- `src/pages/__tests__/GeneratePage.test.tsx`のREQ-161「Generate Batch button is disabled when workflow is not loaded (Desktop)」は別の全件実行で`Test timed out in 5000ms`となった。REQ-161 Mobileでは別実行で`mobileBtn.disabled`が期待`false`に対し`true`。
- `src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx` の「stops after one retry page when baseline-known B follows a full 20-page cycle」で、期待`partial`に対し実値`checking`。
- 最終孤立全件実行は同じ2ファイルで3 failures。失敗詳細出力はtool responseの文字数上限で一部欠落し、個々のfailure traceは全件保存できなかった。失敗の出方が実行間で変化した。
- 該当2テストファイルと実装ソースはREQ-353の変更対象外。該当2ファイルを単独で再実行すると21/21 passedだった。単独再実行は全件実行での失敗を無効化しないため、Gate 2はFAIL扱いのまま。

Sandbox内のbackend pytestはTestClientの最初のcaseで進捗が止まったため中断した。権限昇格した同じテスト環境では対象APIテストおよびbackend全件が完了した。

### Gate 3: REQ-353 ACおよびRed Team

| AC | 検証結果 | 実行証拠 |
| :--- | :--- | :--- |
| AC-1 | PASS | `seedInputResolver.test.ts`、`seedBatch.test.ts`、`workflowParamInjector.test.ts`。fallback `noise_seed`への適用、未使用`seed`キー不追加、元graph不変・欠損拒否を検証 |
| AC-2 | PASS | `useGenerateAction.seed.test.ts`を含む65 tests。3 item送信payloadの`noise_seed=11/22/33`とmetadata値の対応を検証 |
| AC-3 | PASS | resolver/batch/injector/hook testsで未解決、prototype、後続不正、submitなしを検証 |
| AC-4 | PASS | seedBatch/injector/hook回帰testsでprimary seedおよびfixed/random互換を検証 |
| AC-5 | PASS | `generationRecord.test.ts`とhook結合testsでsubmitted graph値と履歴値の一致を検証 |

実行コマンド:

- `npx vitest run src/utils/__tests__/seedInputResolver.test.ts src/utils/__tests__/seedBatch.test.ts src/utils/__tests__/workflowParamInjector.test.ts src/utils/__tests__/generationRecord.test.ts` — 4 files、53 passed。
- `npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` — 2 files、65 passed。
- `cd backend; $env:PYTHONPATH='.'; ./.venv/Scripts/python.exe -m pytest tests/test_req353_seed_mapping_api.py tests/test_req353_openapi_contract.py tests/test_req350_seed_mapping_api.py tests/test_req336_mapping_masters_api.py`（elevated）— 11 passed。
- `python C:/Users/audih/.gemini/antigravity/scripts/openapi_parser.py backend/openapi.json get-schema WorkflowMappingRead` — `fallback_param_names`はarray<string>|nullのoptional propertyでrequired外。

実ComfyUI POSTやGPU画像生成は行っていない。test planの規定どおりfixture/stub境界でpayloadを検証した。

### Local QA auditとcleanup

- 実行: `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-353-test-plan.md`（elevated）。
- 結果: **FAIL (Critical Ambiguities Detected)**。モデル`qwen/qwen3.5-9b`、9.0B、Q6_K。監査文書は、テスト手順の環境前提、toast/record確認方法、Red Team入力と期待値、baseline比較などの明記不足を指摘した。
- AC影響: この監査結果はAC-1〜5の失敗証拠を示していない。実行した対象テストは全ACを検証した。ただし監査所見を無視して監査PASS扱いにはしない。
- 即時cleanup: `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload`（elevated）exit 0。`LM Studio reports no models loaded`を確認。全GPUメモリ解放を意味しない。

</execution_evidence>

## 残る確認事項

frontend全件Gate 2の不安定失敗の原因・baseline状態はこの検証では確定していません。失敗ファイルはREQ-353の変更対象外で、単独実行は成功していますが、過去baselineとの比較は未実施です。dev-coordinatorで未解決Gate 2とQA監査FAILを引き継いでください。

## ユーザー受容とクローズ判定

2026-10-12、ユーザーは「テスト不安定なら、別のPBIに起票してある通り、他でも出てるので、これの変更分が通ればとりあえずは許容する」と判断した。REQ-353固有のAC-1〜5と対象回帰テストはPASS（FE 118件、BE 11件、OpenAPI契約PASS）。したがって未変更領域のFrontend全件テスト3失敗と、テスト計画の明確さに関するQA監査指摘を暫定受容する。

全件Gate 2のraw結果はFAILのまま保持し、全件PASSとは扱わない。失敗対象は既存の別PBIで追跡中とのユーザー判断に基づく受容であり、REQ-353の変更差分に起因する不具合を示す証拠はなかった。QA監査もraw FAILのままとし、明示的AC不適合なし・変更対象テストPASSを根拠にユーザー受容でクローズへ進む。backend 702件、mypy 194 files、frontend typecheckはPASS。Model unload exit 0、LM Studio reports no models loaded。
