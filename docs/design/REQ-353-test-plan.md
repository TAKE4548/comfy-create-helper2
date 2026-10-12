---
id: REQ-353-TEST-PLAN
pbi_id: REQ-353
status: review-ready
tags: [seed, integration, e2e, boundary, contract]
related_paths: [docs/backlog/pbi/archive/REQ-353.md, docs/design/REQ-353.md, frontend/src/utils/seedInputResolver.ts, frontend/src/utils/seedBatch.ts, frontend/src/utils/workflowParamInjector.ts, frontend/src/utils/generationRecord.ts, backend/app/routers/workflows.py]
---

# REQ-353 Test Plan

## Status and Fixtures

設計のみ。ここに記したテストの追加・実行は設計承認後。実DB・実ComfyUIへのPOSTやGPU生成は自動テストに使わない。memory SQLite/TestClient、Vitest/stubと現行store mockを利用する。新規test pathsはカード所有者が作成する。frontend/dist配信の確認が必要なら実装後coordinatorが別途build手順を管理する。

共通fixtureはSamplerCustomの`inputs={noise_seed:278164878394259}`、primary=`seed`、fallback=`[noise_seed]`、`input_type=seed`。rough/detailは別node/slot/roleにする。random用param値は32bit範囲の基準値（例: 40）を明示し、既存UINT32基準値検証で失敗させない。初期値抽出のtestは元のworkflow値を読み出すだけで、64bit範囲への仕様拡張ではない。

## Acceptance Mapping

| AC | Given / When / Then | Task / 証拠 |
|---|---|---|
| AC-1 | noise_seedだけ存在→prepare/inject→既知seedでnoise_seed更新、seed新設なし | T2/T3/T4、元graph不変も確認 |
| AC-2 | random3枚・既知抽選11/22/33→hook submit→各payload.graph.noise_seed=対応値 | T6、submit mockで凍結BatchRequest捕捉 |
| AC-3 | primary/fallbackなし→batch検証→明確なtoast、submit 0回、graph不変 | T4/T6、通常/選択set双方 |
| AC-4 | primary seedが存在→fixed/random→従来seed更新 | T4/T6、既存legacy回帰も実行 |
| AC-5 | 注入後record→履歴metadata.value/param_valuesがsubmitted key値と一致 | T5/T6、recorded=true/status=submitted |

T1 API契約で登録したfallbackがworkflow GETへ伝搬していることを独立検証し、T6には同じ応答shapeのWorkflow fixtureを入力する。モックだけのFEテストをAPI伝搬の証拠としない。

## Gate 1: Types and Contract

workspace rootから`cd frontend; npm run typecheck`。contextのbackend型検証コマンド`mypy backend`も実行して既存問題と追加field起因を分ける。型checkをpytest collect-onlyで置換しない。

T8はapp.openapi()のWorkflowMappingRead fallback propertyとsnapshotの同propertyを比較し、optional/null/array of stringsかつrequired外であることを確認する。全OpenAPI snapshotの既知driftをこの変更の失敗条件に混ぜない。

## Gate 2: Unit and Integration

コマンドはworkspace rootから独立に実行する。

- `cd backend; $env:PYTHONPATH='.'; ./.venv/Scripts/python.exe -m pytest tests/test_req353_seed_mapping_api.py tests/test_req353_openapi_contract.py tests/test_req350_seed_mapping_api.py tests/test_req336_mapping_masters_api.py`
- `cd frontend; npx vitest run src/utils/__tests__/seedInputResolver.test.ts src/utils/__tests__/seedBatch.test.ts src/utils/__tests__/workflowParamInjector.test.ts src/utils/__tests__/generationRecord.test.ts`
- `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`

APIケースはeffective_master（legacy/master、variant経由）、fallback保存JSON→response配列、null/[]/順序、404既存動作、不正JSON schema検証を含む。fixtureでDB fallbackをvariant masterへ設定し、master_idを使う既存経路と同じmetadata優先を保証する。

純粋関数ケースはprimary優先、fallback登録順、0/null存在判定、未登録noise_seed、登録済value、未登録value拒否、欠損node/inputs、own property/prototype、二つのmappingが同じ実keyに解決、graph-reference拒否を含む。cloneJson=trueの元graph不変と、cloneJson=falseで無効な後続seedによる部分変更なしを確認する。初期値はnoise_seedを読む一方、欠損seedは空文字とし画面初期化を壊さない。

recordケースはsubmitted noise_seed値とactualParamValues一致、宣言param_name保持、bypassed seedの未記録、missing/空graphで例外なし、非seed legacy捕捉維持。hookケースは通常3枚/チェックされた複数set、無効入力でsubmitとsubmitting-state変更が0回、API応答fixtureからpayloadまでを確認する。抽選stubはseedBatchモジュールの実prepareSeedBatchへrandomUint32引数を渡すwrapperを使い、hook/UUID用乱数を固定して呼出し順を推測しない。

## Gate 3: E2E and Red Team

Generate画面相当のhook→BatchRequest送信境界で、API response shapeから各itemのgraphとmetadataを同時検証する。画像の視覚的差異をAC判定に使わない。境界0/4294967295、fixed overflow、random偶然重複、同期親子同値、別slot独立、保存基準値/mode不変は既存seed suiteを含めて確認する。

Red Team: 登録外noise_seedがあっても推定しない、primaryが配線ならaliasへ逃げない、undefinedを実入力とみなさない、prototype上のseedを使わない、後続setの不正が全要求を拒否、空graph記録がworkflow snapshot受付を妨げない。先行正常node/後続不正nodeのcloneJson=false経路も部分書込なしとする。

3-Gate baseline全体の実行範囲はtester-reviewerがdev-verifyと現行baselineに従い決定する。今回のカード局所テストが通った後は、新しい失敗や変更がない限り同じテストを重複実行しない。未実行/既存失敗/本変更失敗を区別した結果を保存する。

## Evidence and Limitations

必要な証拠は各コマンドexit code・失敗件数、GET fallback JSON、3item payload key/value/own-key確認、record value一致、未解決時submit回数0。実POST本文の恒久ログは追加しない。Local BA監査はworkspace外共通script制約でNOT_RUN。人間設計レビュー前に監査完了を主張しない。
