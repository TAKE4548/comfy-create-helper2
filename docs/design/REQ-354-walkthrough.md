# REQ-354 検証ウォークスルー

## 総合判定: **ユーザー受入でクローズ**

3-Gateの実行結果と受入基準はPASSです。一方、必須ローカルモデルQA監査のraw判定は **FAIL (Critical Ambiguities Detected)** / Highです。ユーザーは2026-10-13にraw判定と記録済み制約を受け入れ、クローズへ進む判断をしました。raw判定はPASSへ読み替えず、監査traceを保持します。

## 3-Gate結果

| Gate | 実行 | 結果 | 証拠 |
|---|---|---|---|
| Gate 1: 型検査 | `frontend; npm run typecheck` | PASS (exit 0) | `tsc -b --noEmit` |
| Gate 1: 型検査 | `backend; .\\.venv\\Scripts\\python.exe -m mypy app/routers/workflows.py app/schemas/workflow.py` | PASS (exit 0) | `Success: no issues found in 2 source files` |
| Gate 2: 全件テスト | `frontend; npm test` | PASS (229 files, 2,079 tests) | 229 passed / 2,079 passed |
| Gate 2: 全件テスト | `backend; .\\.venv\\Scripts\\python.exe -m pytest` | PASS (703 tests) | 703 passed; 3 warnings; 263.95s |
| Gate 3: AC/API・異常系 | backend API/schema focused run | PASS | 6 passed, 10 subtests passed; 1 Starlette deprecation warning |
| Gate 3: AC-4 Red Team | `frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts` | PASS | 10 tests passed。通常Generateとchecked-set双方で、後段未解決slotのとき送信関数・送信state setter未呼出し、nodeと`seed, noise_seed`候補を含むエラーを検証 |

全件Suiteに選択的なテスト絞り込みは使っていません。Gate 3のfocused runは受入シナリオの個別証跡として追加実行しました。

## 受入基準 (AC) 準拠表

| AC | 期待結果 | 実行証拠 | 判定 |
|---|---|---|---|
| AC-1 | workflow GETで登録済み`fallback_param_names=[noise_seed]`を返す | live `GET /api/mapping-masters/4` は`[noise_seed]`。live `GET /api/workflows/69` のseed mapping 7件 (ID 3545–3551) 全て`[noise_seed]`。TestClientの7 mapping/legacy+variant回帰も成功 | PASS |
| AC-2 | 稼働GenerateがSeed検証を通過しComfyUI queueへ進む | T4 runtime記録でbatch `78d8958c-e5fc-41f6-88be-195347cf0746` の3件すべて`succeeded`、各Comfy `prompt_id`を記録。画面上の画像変化はユーザー確認済み | PASS |
| AC-3 | 3件のgraphでnoise_seed実値が使われseed keyを余計に追加しない | T4のComfy historyにrough/detail両nodeの3組の実値を記録。own `seed` keyなし。自動回帰の固定random 11/22/33も成功 | PASS |
| AC-4 | 解決不能な後段slotを全件送信前に候補付きで拒否する | 自動回帰で通常/checked-set両方の`submitGenerationBatch`・`setActiveBatch`・`setIsBatchSubmitting`が未呼出し。node 4および`seed, noise_seed`候補を含むエラー | PASS (ユーザー承認済みT3証拠)。実HTTP POST数は計測していない |
| WorkflowMappingRead契約 | `fallback_param_names` optional/nullable、schema4者一致、OpenAPI `default`省略 | live schemaと`docs/openapi.yaml`を確認。T4の保存済み比較ではlive/local app.openapi/backend snapshot/docsのproperty一致、required外かつproperty defaultなし | PASS |

AC-4は2026-10-13の承認済み判定に従いT3自動回帰で受け入れています。実HTTPリクエスト件数を測定したとは扱っていません。

## Task CardとSSoT確認

T1〜T4のTask Cardは全て`done`。T1の再起動後runtime確認ではworkspace manager配下listener、master/workflow API、FE proxyのaliasが一致し、queueは空。T2の7 mapping APIテスト、T3のrandom seedと後段slot拒否、T4のruntime batch3・OpenAPI default省略・SPEC同期の証拠を確認しました。T1初回のINCONCLUSIVE記録は履歴として残り、後続の再起動後証拠と区別されています。

`openapi_parser.py docs/openapi.yaml get-schema WorkflowMappingRead` はexit 0。`fallback_param_names` はnullable array(string)、title `Fallback Param Names`、required外で、このpropertyにdefaultはありません。`variant_id`には別途`default: null`があるため、fallback propertyの判定と混同していません。

## <execution_evidence>

### Gate 1

```text
frontend: npm run typecheck
> tsc -b --noEmit
exit 0

backend: .venv/Scripts/python.exe -m mypy app/routers/workflows.py app/schemas/workflow.py
Success: no issues found in 2 source files
exit 0
```

### Gate 2

```text
frontend: npm test
Test Files 229 passed (229)
Tests      2079 passed (2079)
Duration   102.37s
exit 0

backend: .venv/Scripts/python.exe -m pytest
collected 703 items
================= 703 passed, 3 warnings in 263.95s (0:04:23) =================
exit 0
```

### Gate 3

```text
openapi_parser.py docs/openapi.yaml get-schema WorkflowMappingRead
exit 0
fallback_param_names: nullable array[string], title Fallback Param Names
required: id, master_id, node_id (fallback_param_names absent)

live GET /api/mapping-masters/4
id=4, param_name=seed, fallback_param_names=[noise_seed]

live GET /api/workflows/69
7 seed mappings (3545–3551), each fallback_param_names=[noise_seed]

backend API/schema focused verification
6 passed, 10 subtests passed, 1 warning; exit 0

T3 focused scenario
1 test file passed, 10 tests passed; exit 0
```

正例runtimeのbatch ID、3つのComfy prompt ID、rough/detail `noise_seed`実値は`docs/design/REQ-354-verification.md`に保存されたT4実行記録を参照しました。そこでは3件すべて`succeeded`。AC-4のruntime HTTP POST件数は測定されていません。

### ローカルモデルQA監査

```text
Command: local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-354-test-plan.md
Model: qwen/qwen3.5-9b; quantization Q6_K
Raw verdict: FAIL (Critical Ambiguities Detected)
Raw risk: High
Adapter exit: 0 (report returned)

Command: local_model_adapter.py unload
exit 0; LM Studio reports no models loaded

Command: lms ps --json
exit 0; []
```

監査の指摘は、AC定義が対象test planにない、決定的metric/証拠要件の曖昧さ、環境固定パス、schema基準/capture要件の曖昧さです。AC本文はPBI文書にあり、T1–T4の実行証拠も別途存在しますが、この説明を使ってraw FAILをPASSへ読み替えていません。詳細な構造化監査記録は`docs/design/REQ-354-qa-audit-trace.json`。

## 制約・引継ぎ

- 監査モデルのunloadを検証しました。`lms ps --json`が空配列でありモデル未ロードを示しますが、GPUメモリ全体が解放済みとは主張しません。
- `git status --short` は `fatal: this operation must be run in a work tree` で利用できず、作業ツリー差分の完全な一覧確認はできませんでした。
- 既存のroot `walkthrough.md` はREQ-343の記録だったため変更せず、本REQ用に本ファイルを作成しました。
- 必須QA監査の生判定FAILは`docs/design/REQ-354-qa-audit-trace.json`に保持。監査指摘の採否やテスト計画修正の設計判断はcoordinator経由で確認してください。

## クローズ判断

- 2026-10-13、ユーザーは最終再監査のraw `FAIL (Critical Ambiguities Detected)` / Highを記録したまま受け入れ、REQ-354をクローズへ進めることを承認しました。
- 残るI3のsubmit回数を直接assertしていない制約は既知制約として保持します。監査raw verdictは変更していません。
- PBIとTask Cardのアーカイブは完了しました。Git statusはwork treeエラーで利用できず、別タスク変更との混在もあるため、コミットは安全に切り分けられる状態を確認できていません。
