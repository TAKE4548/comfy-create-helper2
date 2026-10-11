---
id: REQ-350-TEST-PLAN
pbi_id: REQ-350
status: review-ready
tags: [seed, integration, e2e, boundary]
related_paths: [docs/backlog/pbi/active/REQ-350.md, docs/design/REQ-350.md, frontend/src/utils/workflowParamInjector.ts, frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts]
---

# REQ-350 Test Plan

## Scope and execution status

設計段階の計画。アプリケーションコード/テストコードは変更せず、以下の実装後テストは未実行。新規test pathはTask Cardで作成する予定。実データDBやGPUへ書込む自動テストは行わず、fixture・memory SQLite・MSW/stubを使う。人間の設計レビュー承認後に実行する。

## Acceptance mapping

| AC | Given / When / Then の検証 | 証拠 / Task |
|---|---|---|
| AC-1 | seedを選択し保存→マスタGETとmodal再表示でseedが維持 | T2 UI+API |
| AC-2 | seed workflowを開く→当該欄にShuffle/Lock、固定/ランダム表示 | T11/T5/T9 |
| AC-3 | fixed100で3枚→送信graphの当該target=100,101,102(number) | T3/T4/T7/T9 |
| AC-4 | 乱数stub11,22,33でrandom3枚→target=11,22,33 | T3/T7/T9 |
| AC-5 | random単発と境界stub0/MAX→0..4294967295整数 | T3/T7 |
| AC-6 | Main100/Rough200・同期無・global999で2枚→Main100,101/Rough200,201 | T3/T4/T7/T9 |
| AC-7 | seedとfloat CFGが共存→float欄にSeed toggleなし | T5/T9 |

乱数stubはseedBatchのrandomUint32差替えまたは同helperのmockを使用する。request UUIDの乱数生成を巻き込む全体 Math.random 回数の推測では検証しない。実行中のrandomが11/22/33になる確率は判定しない。random偶然一致は成功。

## Gate 1: typecheck

workspace rootから `cd frontend; npm run typecheck`。exit 0 / 型エラー0を記録する。Backend sourceは変更予定なし。Python契約テスト追加は構文と既存fixture整合をGate 2で検証。pytest --collect-onlyを型検証の代用としない。

## Gate 2: unit and integration

各コマンドはworkspace rootから独立に開始する。

- `cd frontend; npx vitest run src/utils/__tests__/seedModel.test.ts src/utils/__tests__/seedBatch.test.ts src/utils/__tests__/workflowParamInjector.test.ts`
- `cd frontend; npx vitest run src/components/__tests__/MappingMasterEditModal.seed.test.tsx src/components/__tests__/SeedField.test.tsx src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx`
- `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.seed.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`
- `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/usePresetAutoSave.seed.test.ts src/store/__tests__/multiSetSlice.seed.test.ts`
- `cd backend; $env:PYTHONPATH='.'; ./.venv/Scripts/python.exe -m pytest tests/test_req350_seed_mapping_api.py tests/test_req350_seed_preset_roundtrip.py tests/test_req336_mapping_masters_api.py tests/test_req336_stage_api.py`
- `cd frontend; npx vitest run src/test/e2e_req350_seed.test.tsx`
- `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts`

全対象exit 0、失敗0。既存global Seed型/通常float/LoRA/Presetの回帰を含める。必要な3-Gate baseline全体の `cd frontend; npm test` と `cd backend; $env:PYTHONPATH='.'; ./.venv/Scripts/python.exe -m pytest` はtesterがdev-verifyで実行し、既存失敗と本変更の失敗を区別する。

### Integration scenarios

1. 型の永続化: MappingMasterV2作成/更新input_type=seed→GET→workflow read映射へseed伝播。variant_id・param_name・通常float masterが保持される。
2. 状態保存: ParamPanel modeトグル/数値変更→setParamValues→activeSet更新→autosave→preset API往復→再読込。reserved JSONは完全にstringで往復する。
3. 複数stage: 同じmasterのMain/Rough variantを別nodeへmapping。slotKeyが異なり別mode/値を保持。stage suffix cascade後もmodeが保持され、数値roleが新名称へ対応する。
4. 生成凍結: 通常/複数セットをfixed/random混在で実行。アクティブセットは画面値を優先、非アクティブはセット自身の値。indexは各セット0から。送信待機中の編集に影響されない。
5. graph/metadata: targetはnumber、item.param_values[role]はそのnumberのstring。GenerationRecord.parametersのvalueは送信graphと一致。reserved mode JSONがgraphにない。
6. 同期: seed->seed fixed、random、チェーンで親のmodeと実値を共有する。randomの共有親は各indexに1抽選。無同期なら独立抽選。
7. 互換性: metadata不在の専用型はfixed、legacy非seed Sampler_Seedはglobal制御。専用Sampler_Seedはglobal999から独立。旧float型値を自動変更しない。
8. 保存/復元: Save Default randomで抽選しない。Reset Defaultはgraph値/fixed。snapshotの実値はMain/Roughともfixed基準に復元。元のセット基準値は生成後も変更されない。
9. 再試行: request_idを固定してAPI応答を一度遅延/不明にし、既存retry経路で同request_id・同graph・同実Seedを保持する。乱数再取得なし。

## E2E and browser acceptance

Vitest/RTLのローカル統合E2Eは新規frontend/src/test/e2e_req350_seed.test.tsx。操作→API response→状態→BatchRequestまで確認する。実ブラウザと実ComfyUIの検証は別途以下を実施する。接続URLは稼働する開発環境の設定値から取得し、固定portを推定しない。

| ケース | 操作 | 合格条件 |
|---|---|---|
| E1 型設定 | Settingsで整数入力マスタをseedへ変更して保存、再開 | seed選択保持、workflow再取得に反映 |
| E2 固定再現 | GenerateでMain=100固定、3枚 | リクエストgraph100/101/102、履歴の各実Seedも一致 |
| E3 stage独立 | Main=100、Rough=200固定、2枚・同期なし | 各stageのtargetが別々に増分、global値変更で影響なし |
| E4 random探索 | 専用欄randomで1枚・3枚 | 入力disabled、各Seedは範囲内整数、偶然同値も合格 |
| E5 mode保持 | 別presetへ切替→戻る→画面再読込 | 個別mode/値を保持 |
| E6 mobile | 小画面でMain/Rough操作 | 欄名、mode、44px相当の操作領域、キーボード操作とaccessible nameが判別可能 |
| E7 送信前異常 | fixed MAXで2枚、後続セットだけoverflow | 説明エラー、要求送信0、既存batch状態を保持 |
| E8 snapshot | 履歴から実Seedを復元して単発固定 | 元の実Seedで再送、Main/Rough値が揃う |

E2/E3は画像目視だけで判定せずNetwork/graph/生成recordの数値を証拠にする。実nodeのSeed対応と接続条件を記録する。未稼働/証拠なしはINCONCLUSIVE。

## Gate 3: boundary and anomaly matrix

| ID | 条件 | 期待結果 |
|---|---|---|
| B01 | fixed0/1枚、MAX/1枚 | 0/MAX numberで成功 |
| B02 | fixed MAX-1/2枚 | MAX-1,MAXで成功 |
| B03 | fixed MAX/2枚 | 全要求拒否、送信0、ラップなし |
| B04 | 第2セットのみB03 | 第1セットも送信しない、既存activeBatch維持 |
| B05 | -1, 1.5, 空文字, 1e3, NaN, Infinity, 9007199254740992 | 説明付き拒否。空文字UI入力は保持可能 |
| B06 | dedicated seedのbatchSize0/-1/非整数/9/10000000/Infinity | 抽選前・送信前拒否、UIの1..8上限と一致 |
| B07 | random stub0/MAX/同値11,11 | 0/MAXは成功、重複11も成功 |
| B08 | random stub負値/小数/MAX+1 | 注入拒否（テスト差替えの誤契約も検出） |
| B09 | mode JSON破損/未知version/使用slot未知mode | エラー、暗黙random化なし |
| B10 | reserved keyとmapping.role衝突 | 送信前拒否、graphへのmetadata漏出なし |
| B11 | 同masterの別variant、suffix変更 | mode独立保持、別stage値誤採用なし |
| B12 | 削除/再作成variant、古いmetadata slot | 新slotはfixed、古slotは使用しない |
| B13 | 同node同inputのseed/seedまたはseed/float競合 | 説明付き拒否、順序依存上書きなし |
| B14 | node/role欠損、slot重複、graph-reference Seed | 説明付き拒否、配線を暗黙破壊しない |
| B15 | mixed型sync、cycle、複数親 | 説明付き拒否、通常paramだけの同期は回帰なし |
| B16 | random親+seed slave | 親と子は各indexで同実値、親1抽選 |
| B17 | generating/VRAM待機中にmode/値/master編集 | 既に凍結した要求とrecordは変化しない |
| B18 | default保存時random、snapshot旧mode=random | 保存に抽選なし、snapshot実値はfixed復元 |
| B19 | ParamTypeMaster.name='seed' | 標準seedを優先、同値選択肢重複なし |
| B20 | 通常float CFG/カスタムfloatと専用Seed共存 | floatへのSeed操作追加なし、型値変換回帰なし |
| B21 | role履歴一意でない/ステージ解決曖昧 | 他stageへのbase_key補完を拒否 |
| B22 | Main role=Sampler_Seed とRough role、legacy Main混在 | 表示前フィルタで専用Mainを落とさず、legacy globalを二重表示しない |

MAX=4294967295。Gate 3にはB03/B04/B09/B13/B15の意図的な異常投入を必ず含め、toastと送信呼出し数を実測する。

## Evidence and SSoT gate

各証拠には日時、commitまたはworking tree基準、コマンド、exit、該当AC/B番号、graph target keyと実値を残す。SSoT同期T10が完了し、AC-1〜7と上記必須異常ケースPASS、実ブラウザの不足が明示された後にcoordinatorが終結判定する。

BA design audit/unloadの実行状況はdocs/design/REQ-350-design-audit.md。ローカル監査の不成立をGate 3やACのPASS代用にしない。
