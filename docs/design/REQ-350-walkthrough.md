# REQ-350 検証ウォークスルー

## 総合判定: INCONCLUSIVE

Frontend型チェック、REQ-350統合E2E、全体frontend/backend suiteが通過しました。frontend最終実行は212 files / 1969 tests、backendは690 testsです。初回全件実行には負荷依存のタイムアウトが1件ありましたが、単独実行と最終全件実行は成功しています。権限付きローカルQA監査は完了し、条件付き承認・要修正の指摘を返しました。unloadと未ロード確認も成功しています。実ブラウザ/ComfyUI接続証拠がなく、監査指摘の扱いもユーザー判断待ちのため総合判定はINCONCLUSIVEです。

## 実行証拠

<execution_evidence>

| Gate | コマンド / 手順 | 結果・証拠 |
|---|---|---|
| Gate 1 | `cd frontend; npm run typecheck` | PASS、exit 0。`tsc -b --noEmit` が完了し診断0件。 |
| Gate 2 frontend 全件 | `cd frontend; npm test`（最終再実行） | PASS、212 files / 1969 tests。先行実行では `GeneratePage.test.tsx > REQ-161: Generate Batch button is disabled when workflow is not loaded (Desktop)` が5000ms timeoutだったが、ファイル単独13/13 PASS、以後の全件再実行もPASS。 |
| Gate 2 切り分け | `cd frontend; npx vitest run src/pages/__tests__/GeneratePage.test.tsx` | PASS、13/13、2.465s。全体実行時のみの負荷依存タイムアウトとして観測。 |
| Gate 2 backend 全件 | `cd backend; $env:PYTHONPATH='.'; ./.venv/Scripts/python.exe -m pytest`（昇格再実行） | PASS、690 passed、3 warnings、100.26s。先行実行は最初の項目から進まず中断したが、再実行では全件完了。 |
| Gate 2 backend 対象回帰 | `cd backend; $env:PYTHONPATH='.'; ./.venv/Scripts/python.exe -m pytest tests/test_req350_seed_mapping_api.py tests/test_req350_seed_preset_roundtrip.py tests/test_req336_mapping_masters_api.py tests/test_req336_stage_api.py` | 対象コマンド単独の初回は13件collect後に停止し中断。Gate 2 backend全件再実行は690件PASSで、当該テスト群を含む全 discovery suiteを通過。 |
| Gate 3 REQ-350統合 | `cd frontend; npx vitest run src/test/e2e_req350_seed.test.tsx` | PASS、9/9。固定Main 100/101/102とRough 200/201/202、role値/履歴metadata一致、random stub 11/22/33、desktop/mobile同等、サイズ上限超過の送信拒否、MAX overflow拒否、壊れたmodeの送信拒否とactiveBatch維持、request再照会時のgraph固定を確認。 |
| Gate 3 ParamPanel境界 | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx` | PASS、11/11。専用Seed controlが表示され、float CFGが同じPanel内にあってもSeed mode toggleが専用Seed分のみであることを確認。 |
| API契約 | `python C:/Users/audih/.gemini/antigravity/scripts/openapi_parser.py backend/openapi.json list-endpoints` および `get-endpoint /api/mapping-masters post`, `get-endpoint '/api/mapping-masters/{master_id}' put` | endpointを抽出。Create/Update OpenAPI schemaは `input_type: string` でありenum制約やMappingMasterV2 variant契約は定義されていない。Backend全件suiteは690 passed。 |
| Local QA audit（昇格・待機延長再試行） | `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py qa-audit docs/design/REQ-350-test-plan.md` | exit 0。指定reasoningモデルのロード後に監査完了。判定は「CONDITIONALLY APPROVED、4 critical remediations」。指摘: duplicate randomが許容される基準、実ブラウザ手順の自動化経路、INCONCLUSIVE状態、AC-3/4のnumber/string明記。mediumとして画像目視/手動 evidence と PowerShell固有 `PYTHONPATH` 指定を挙げた。 |
| GPU cleanup | `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload`（昇格） | exit 0、「All models unloaded from LM Studio. VRAM freed.」。直後の昇格 `lms ps` は「No models are currently loaded」。GPU全体の使用量は未測定。 |
| GPU free verification | `nvidia-smi` / `lms ps`（昇格） | `nvidia-smi` 未導入。昇格 `lms ps` は「No models are currently loaded」。GPU全体の空き容量は実測不能。 |
| 作業状態 | `git status --short` | `fatal: this operation must be run in a work tree`。変更差分・基準commitを検証できず。 |

</execution_evidence>

## 受入基準準拠表

| AC | 受入項目 | 実行証拠 | 判定 |
|---|---|---|---|
| AC-1 | Seed型の保存と再読込 | 統合E2Eで画面反映を確認。Backend全件690 passedにREQ-350 mapping API / preset roundtripテストを含む。 | PASS |
| AC-2 | Seed欄にShuffle/Lockと固定/ランダム操作 | 統合E2Eで固定/ランダム切替UIを確認。 | PASS |
| AC-3 | fixed 100で3枚を100/101/102として送信 | 統合E2Eでgraph targetを確認。 | PASS |
| AC-4 | random stub 11/22/33を3枚に反映 | 統合E2Eで乱数stub 11/2^32、22/2^32、33/2^32を使用し、graphに `[11,22,33]` と3回抽選を確認。 | PASS |
| AC-5 | 単発randomと0/MAX境界がuint32整数 | `seedModel.test.ts` で0/MAX parsing、`seedBatch.test.ts` でrandom uint32出力・不正抽選拒否・overflow全体拒否を確認。 | PASS |
| AC-6 | Main/Roughをglobal seedから独立して別々に増分 | 統合E2EでMain 100/101/102・Rough 200/201/202、global値と異なることを確認。 | PASS |
| AC-7 | float CFG欄にSeed toggleを表示しない | ParamPanelテストでfloat CFGと専用Seedを同時表示し、SeedField toggleが専用Seed欄の1件のみであることを確認。 | PASS |

## Red Team境界確認

| ケース | 実測結果 |
|---|---|
| Batch size 9 / 10,000,000（fixed/random） | 送信前拒否、乱数抽選なし、activeBatch不変更を4パターン確認。PASS |
| fixed MAXからbatch size 2 | 送信前拒否、activeBatch不変更を確認。PASS |
| 壊れたreserved mode JSON | エラー、送信なし、activeBatch維持を確認。PASS |
| uncertain submission retry lookup | 同request idとgraphを保持して照会を確認。PASS |
| B01/B05/B08/B10 | `seedModel.test.ts` と `seedBatch.test.ts` で0/MAX、負値/小数/指数/不正値、invalid random draw、reserved metadataの拒否を確認。PASS |
| B13/B15 | `seedBatch.test.ts` でtarget競合、同期cycle/mixed type/multiple parent拒否を確認。PASS |
| 実ブラウザ/ComfyUI E1-E8 | 自動統合テストの外側の実環境証拠は未取得。INCONCLUSIVE。 |

## QA監査指摘と coordinator トリアージ

監査はtest planの曖昧さを指摘した。AC-3/4のnumber/string表現は統合E2Eで数値型をassertし、AC-4はrandom stub 11/22/33をassertするよう補足済み。PowerShellの `PYTHONPATH` は実行環境の標準コマンドで、backend全件690件が成功した。random偶然一致は要件上許容される動作であり、実ブラウザE1-E8はlive環境 evidence が得られない場合 `INCONCLUSIVE` とする既存方針である。監査が提案した「95%以上で3回連続再現」および「INCONCLUSIVEを除去」は承認済み要件を変えるため自動採用しない。ユーザーに残りの指摘と実ブラウザ検証の扱いを確認する。

## 制約と残作業

- Git worktree認識不具合により差分/commit比較はできませんでした。
- backend全件は昇格再実行で690件成功しました。対象回帰だけの初回実行はsocket制約で停止しましたが、全件runでは対象も通過しています。
- frontend最終全件runは212 files / 1969 testsすべてPASS。REQ-161の先行timeoutは単独再実行と最終全件再実行では再現しませんでした。
- 実ブラウザ/ComfyUI E1-E8は実施していません。
- ローカル監査は完了しましたが、監査判定はPASS/COMPLIANTではありません。モデルunloadと `lms ps` による未ロード確認は成功しましたが、GPU全量の空きは `nvidia-smi` 不在で未測定です。
- `docs/walkthrough.md` はREQ-343の既存記録のため変更せず、本記録を `docs/design/REQ-350-walkthrough.md` に保存しました。

