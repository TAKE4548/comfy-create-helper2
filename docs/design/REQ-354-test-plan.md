---
id: REQ-354-test-plan
tags: [workflow, seed, integration, e2e]
related_paths: [docs/design/REQ-354.md, docs/backlog/pbi/active/REQ-354.md, docs/design/REQ-354-verification.md]
---

# REQ-354 テスト計画

## Acceptance Criteria

以下は承認済みPBIのAC本文であり、本計画だけで合否を判断するため再掲する。

- AC-1: Given mapping masterの`param_name=seed`と`fallback_param_names=[noise_seed]`、workflow nodeに`noise_seed`のみがある, When `GET /api/workflows/{id}`を呼ぶ, Then response mappingに`fallback_param_names=[noise_seed]`が含まれること。
- AC-2: Given AC-1のmappingと稼働中FE/BE, When Generateでseed batchを準備する, Then seed検証が`noise_seed`を解決し、ComfyUIへのqueue要求に進むこと。
- AC-3: Given random seed値が既知の3件, When 3件のgraph payloadを確認する, Then 各graphの`noise_seed`にそれぞれの値が入り、余分な`seed` keyが追加されないこと。
- AC-4: Given primary/fallbackのどちらもnodeにないmapping, When Generateする, Then ComfyUIへPOSTせず、候補を含むエラーで拒否すること。

AC-3の既知値はI3の固定乱数11/22/33で検証する。稼働時は実際の生成値をcaptureする。AC-4は2026-10-13にユーザーが承認したT3のnormal/checked-set自動回帰を受入証拠とする。この決定はruntime HTTP観測を追加必須としないという証拠範囲の指定であり、AC本文の変更ではない。

## Preconditions and Evidence

コマンドはWindows PowerShell、workspace root `C:\Users\audih\ws\comfy-create-helper2`、既存backend venv・frontend node_modulesを前提とする。本PBIはこのworkspaceの稼働復旧であり、このWindows環境を意図した対象とする。移植性やDocker導入は受入要件に含めない。BEはsqlite memory/dependency override、FEはcaseごとにmock storeを初期化してrandom spyをrestoreする。自動テストでproduction DBを更新しない。

runtimeではFE `http://127.0.0.1:5173` のAPI proxy先がBE `http://127.0.0.1:8000` と一致することを確認する。restart前にlistenerのPID/ancestry/command/executable/workspace起動元、処理中generation jobsと両queueを確認する。実行元が未確定、処理中jobが残る場合はrestartせずINCONCLUSIVE。必要なrestartはworkspace managerのbackendのみを対象とする。DBはmaster4/variant/7 mappingの関連列をread-only照合する。

証拠保存先は `docs/design/REQ-354-verification.md`、全体3-Gate結果は `docs/design/REQ-354-walkthrough.md`。コマンドごとにAC/ケース名、cwd、正確なコマンド、日時/timezone、exit status、発見/実行件数、warningと判定を記録する。秘密情報・prompt全文は記録しない。正例runtime証拠の最小項目は次のとおり。

| 対象 | 保存する値 / 出所 |
|---|---|
| runtime | 確認日時、BE listener PID/ancestry/command/executable、workspace direct importのsys.executableとmodule path、HTTP接続先。direct importのみでlistener内import一致と断言しない |
| API / FE再取得 | master/workflow GET先、取得日/時刻、workflow ID/name、7 mappingのid/master/variant/role/node/primary/alias、FE refetch/reloadまたはproxy応答の出所。単独refetch時刻未保存ならその事実と実施日・紐付く生成区間を記録 |
| batch / queue | batch_id、batch順の3 item、各prompt_idとjob status、状態取得元GET /api/generation/state、生成時刻/区間。各prompt_idの存在でComfyUI queue到達を判定 |
| 実graph | 各GET /api/comfy/history/{prompt_id}からrough 1260:1398 / detail 1260:1396のown noise_seed数値、両nodeでObject.hasOwn(inputs,'seed')=false。batch itemとpromptの対応を保持 |
| AC-4 | T3のnormal/checked-setケース名、exit/case数/日時、後段node・候補文字列、submitとstate setter未呼出しassertion。runtime HTTP POST件数は未測定と明記 |
| schema | 下記4者の取得元/日時、property内容、required/default非包含の比較結果/exit |

BE live GETとFE proxy GETを区別し、キャッシュ更新だけでbackend復旧と扱わない。ユーザーの生成操作確認、proxy応答、Comfy historyを照合する。既存refetch証拠は2026-10-13の操作報告とproxy応答、生成区間は03:04:28〜03:06:26 JST。単独refetchの秒単位時刻を測定済みとは扱わない。

## Integration Scenarios

| ID | 手順 | 判定 / AC |
|---|---|---|
| I1 | seed masterから7 mapping、legacy/variant混在、noise_seedのみgraphを隔離APIへ登録してGET | 全7件seed/[noise_seed]、node/variant保持。AC-1 |
| I2 | 同一masterとworkflowをGET比較、既存null/[]ケース | alias値/登録順一致、nullと[]の形状保持、推測なし |
| I3 | 下記固定入力で既存Generate hook回帰 | noise_seed実値/own key/履歴が期待どおり。AC-2/3の自動証拠 |
| I4 | 有効先行slotの後に解決不能slotを置きnormal/checked-set | 全件送信関数0回、送信state変更0回、後段nodeと両候補エラー。AC-4 |
| I5 | 初期値→batch→injector→履歴の既存alias回帰 | primary→登録順fallbackの同じ規則、元graph不変 |

I3は `src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts` の `submits three random seeds through a registered fallback and records each actual value`。入力はnode `3` の`inputs={noise_seed:40}`、mapping primary `seed`/fallback `[noise_seed]`/role `Sampler_Seed`、専用seed mode random、batchSize=3。`prepareSeedBatch`の`randomUint32`を順に11/22/33へstubする。

期待は1つの`submitGenerationBatch` requestにitems3件、batch順`graph['3'].inputs.noise_seed`が数値`[11,22,33]`、全itemでown `seed` keyなし。`param_values.Sampler_Seed`は文字列`['11','22','33']`、`JSON.parse(param_values[PROMPT_RECORD_KEY]).parameters[0].value`は数値`[11,22,33]`で解決したnoise_seed実値と一致する。履歴の宣言primary `param_name`はseedのまま保持する（`generationRecord.test.ts`のresolved-inputケースでも確認）。

既存I3テストは先頭submit requestの3件と上記値をassertする。submit呼出回数1回の直接assertは既存ケースにはなく、`mock.calls[0]`の検証を回数計測済みとは記録しない。1 batch submitの期待を3件の個別submitへ読み替えない。現行ビルドの検証を新規に実施する際はCommandsのVitestを実行してassertion結果を保存する。テストの存在確認やsource読取だけでPASSにしない。実行済み結果の継承条件はCompletion Ruleに示す。

I4はnode `3` の`inputs={seed:0}`とnode `4` の`inputs={}`、両mappingにprimary seed/fallback [noise_seed]。normalは役割値40/50、checked-setはchecked=trueのFirst setで役割値5/6。`handleGenerate()`/`handleGenerateSets()`それぞれで `submitGenerationBatch` / `setActiveBatch` / `setIsBatchSubmitting`未呼出し、errorに`node 4`と`seed, noise_seed`を含むことをassertする。有効な先行slotだけの送信も拒否する。mock関数境界の証拠であり実HTTP POST回数の観測ではない。

## Runtime E2E Scenarios

1. runtime gateを満たしmaster4/workflow69（API_base_v8.0）をGETする。全7 mapping ID 3545〜3551でprimary seed/alias [noise_seed]を確認。必要なbackend restart後は新PID/ancestryと応答を記録。
2. FE workflow queryをinvalidate/refetchまたはreloadし、FE経由応答のaliasとrough/detail nodeを確認。取得元と時刻精度を明記。
3. workflow69でrandom/batch3 Generate。batch ID、3 prompt ID/status、各graphのrough/detail実noise_seedとown seed不存在を保存。I3の固定乱数とは別証拠。
4. AC-4はT3/I4のnormal/checked-set自動結果を照合。runtime response intercept/HTTP POST0の追加観測は承認済み方針で必須ではない。実HTTP件数を測定済みとは記録しない。
5. Comfy unavailable、実行先不一致、必要なgraph/prompt_id取得不能はINCONCLUSIVE。POST後Comfy失敗とSeed事前拒否を区別。画像の見た目変化だけでaliasを証明しない。

保存済み正例batchは `78d8958c-e5fc-41f6-88be-195347cf0746`。以下は全件succeeded、両nodeにown seed keyなし。検証結果の引用であり再実行時に同じ乱数/IDを要求しない。

| prompt_id（batch順） | rough noise_seed | detail noise_seed |
|---|---:|---:|
| 13935ec1-fc5e-4bf5-a083-a4ec5b656a37 | 3612915999 | 3149064762 |
| dab28789-3172-4ef9-8535-2baf7b57d89a | 3560856115 | 1314242313 |
| 04a6f2b0-95ca-45ad-a05d-c8d0f919cce2 | 4022759160 | 256501581 |

## Schema Baseline

比較する4者は稼働GET `http://127.0.0.1:8000/openapi.json`、workspace backendをimportした`app.openapi()`、`backend/openapi.json`、`docs/openapi.yaml`。各`components.schemas.WorkflowMappingRead.properties.fallback_param_names`の辞書全体を比較する。正本契約は次のpropertyで、4者一致、required非包含、property内OpenAPI default非包含を確認する。

```yaml
fallback_param_names:
  anyOf:
  - items:
      type: string
    type: array
  - type: 'null'
  title: Fallback Param Names
```

すなわちoptional nullable array(string)。登録済alias値をnullへ落とすことを許す契約ではない。Pythonモデル`Optional[list[str]] = None`はPython初期値であり、OpenAPI `default: null`出力の要求ではない。比較前にdefaultを除去するなどの正規化は行わない。defaultが出力される、requiredへ含まれる、4者のpropertyが異なる場合はいずれも比較FAILとしてその差を記録する。他property（variant_idなど）のdefaultは独立に判定する。localだけの一致は稼働契約の一致を証明しない。

## Gate 3 Boundary and Anomaly Matrix

既存回帰・承認済み異常系の範囲。

| ケース | 期待 | 検証 |
|---|---|---|
| primary/複数alias/重複 | primary優先、登録順の既存key | resolver/API |
| null/[] | 形状保持、推測なし | BE/resolver |
| inherited/undefined key | own keyのみ、undefined skip | resolver |
| primary配線+scalar alias | primaryで拒否、aliasへ逃げない | batch |
| 後段slot/node欠落 | submit関数0回、node/候補情報 | hook/batch (I4) |
| 同じnode.key複数slot | 衝突拒否 | batch |
| fixed UINT32_MAX、batch2 | overflow拒否 | batch/hook |
| random -1/NaN/>UINT32_MAX | 拒否 | batch |
| batch0/9/小数、sync cycle | draw前に拒否 | batch |
| malformed aliasJSON | schema拒否 | BE |
| DB/variant/API host差異 | 検出、勝手なDB修正なし | runtime |
| 更新後query cache | FE経由の再取得応答で判定 | E2E |
| legacy非seed parameter | 既存挙動保持 | injector |

## Commands and Result Handling

各ブロックのcwdへ移動し、各行を個別実行して直後の`$LASTEXITCODE`を保存する。期待exitはすべて0。設定/依存環境不足は理由付きINCONCLUSIVEとし、成功と推定しない。

BE cwd `C:\Users\audih\ws\comfy-create-helper2\backend`、Gate 1型検査とGate 3対象API回帰:

```powershell
.\.venv\Scripts\python.exe -m mypy app/routers/workflows.py app/schemas/workflow.py
.\.venv\Scripts\python.exe -m pytest tests/test_req353_seed_mapping_api.py tests/test_req353_openapi_contract.py tests/test_req340_backend_fallback.py -q
.\.venv\Scripts\python.exe -c 'import sys,app.routers.workflows as w; print(sys.executable); print(w.__file__)'
```

FE cwd `C:\Users\audih\ws\comfy-create-helper2\frontend`、Gate 1型検査とGate 3対象回帰:

```powershell
npm run typecheck
npx vitest run src/utils/__tests__/seedInputResolver.test.ts src/utils/__tests__/seedBatch.test.ts src/utils/__tests__/workflowParamInjector.test.ts src/utils/__tests__/generationRecord.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts
```

schema比較はBE cwd、既存yaml依存で実行する。新規依存は追加しない。成功出力は `runtime/local/snapshot/docs fallback contract matched; default omitted, optional nullable`。

```powershell
.\.venv\Scripts\python.exe -c 'import json,pathlib,urllib.request,yaml; from app.main import app; key="fallback_param_names"; schema=lambda d:d["components"]["schemas"]["WorkflowMappingRead"]; local=schema(app.openapi()); runtime=schema(json.load(urllib.request.urlopen("http://127.0.0.1:8000/openapi.json",timeout=10))); snap=schema(json.loads(pathlib.Path("openapi.json").read_text(encoding="utf-8"))); doc=schema(yaml.safe_load(pathlib.Path("../docs/openapi.yaml").read_text(encoding="utf-8"))); variants=(local,runtime,snap,doc); assert all(s["properties"][key]==runtime["properties"][key] for s in variants); assert all(key not in s.get("required",[]) and "default" not in s["properties"][key] for s in variants); print("runtime/local/snapshot/docs fallback contract matched; default omitted, optional nullable")'
```

Gate 2全件suiteはfrontend cwdの`npm test`（vitest run）、backend cwdの`.\.venv\Scripts\python.exe -m pytest`。全件とは各repo既定テスト設定でdiscoverされた全test。ファイル選択、`-k`/`-t`、retry/skipによる絞り込みを追加しない。discover件数と結果を保存し、no tests found/collection failure/意図しないskipは成功にしない。Gate 3 focused回帰はGate 2の代替ではない。

型検査/test/assertion失敗はFAIL。エラーの内容を記録してPASSと断言しない。warningは実際の本文・発生元・件数を保存し、exit status/テストの合否と別に記載する。対照ログなど根拠がなければ既存warningと呼ばない。warningが必須テスト未実行、assertion未評価、schema不一致を示す場合は対応するFAIL/INCONCLUSIVEを維持する。exit0で全assertion成功ならその実測結果を記録し、warningを削除したり根拠なく無害と断定しない。保存済みGate 2はFE 229 files/2,079 tests、BE 703 passed/3 warningsであり、将来の件数を固定しない。

## Completion Rule

AC-1は隔離APIとlive全7 mapping、AC-2はFE再取得後の稼働batch3/各prompt_id、AC-3は固定11/22/33と実graphのnoise_seed/own seed不存在、AC-4は承認済みT3/I4 normal/checked-set未呼出しassertionで判定する。各ACへ出所・日時精度・exit/case数を紐付け、4者schema一致とSSoT同期、3-Gate結果を保存する。失敗や必須正例証拠不足は理由付きFAIL/INCONCLUSIVE。

本改訂はtest-plan文章のみの明確化であり、製品実装・テストsource・稼働環境を変更していない。T1〜T4と3-Gateの記録は実際の実行結果を保持した受入証拠であり、文章変更だけを理由に全件テストや有償生成を再実行する必要はない。これらの記録と対象実装/環境が対応している場合に継承し、新規source変更、失敗、関連環境変更があれば影響する検証を再実行する。記録の単なる存在や脳内推論を新規実行結果と扱わない。

AC-4の最終証拠は明示承認済みのT3 normal/checked-set unit assertionである。実HTTP countの追加測定を必須化したり、未測定のHTTP countを0と報告したりしない。ローカルQA raw verdictはテストexit0と別に保存し、exit0を監査PASSと読み替えない。初回raw traceを保持し改訂版traceを別ファイルへ保存、監査後はunload exit0/残存モデルなしを確認する。
