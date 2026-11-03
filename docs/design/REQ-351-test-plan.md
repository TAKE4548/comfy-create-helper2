---
id: REQ-351-test-plan
pbi: REQ-351
tags: [test-plan, frontend, backend, param-sync]
related_paths:
  - docs/design/REQ-351.md
  - docs/backlog/pbi/active/REQ-351.md
---

# REQ-351 テスト計画: ParamSync のロール×ステージ単位の同期先選択

## 1. 方針

- 検証プロファイル: **V1 既定**（`.agents/verification.json`）。V2 は採用しない。テスターは最終候補で Gate 1（静的検査・単体）、Gate 2（`scripts/run_full_suite.py` によるフルスイート、ファイル絞り込みなし）、Gate 3（`scripts/run_e2e.py` とシナリオ・異常系・Red Team）を新規に順に実行する。
- 各 AC は既存テストファイルを拡張して検証する。チケット番号を含むテストファイルは作らない。
- ケース名の先頭に `[REQ-351/AC-n]` を付ける（プロジェクト規約 REQ-356。Vitest は `it` 名、pytest は unittest 形式のため docstring に付け、関数名で `-k` 選択する）。層（unit/integration/scenario）は本書 §4 の表で宣言する。Vitest/unittest に層メタデータの API はないため、層の宣言は本表を正とする。
- テストは CPU のみで実行し、GPU・ComfyUI・LM Studio を使わない。

## 2. 共通フィクスチャ（T1/T2 で同じ値を使う）

| Stage/Role | role（computed_role） | variant_id | master_id | input_type | display_name | node / input |
|---|---|---|---|---|---|---|
| Main/Steps | `Sampler_Steps` | 201 | 10 | int | Steps | `1` / `steps` |
| Rough/Steps | `Sampler_Steps_Rough` | 202 | 10 | int | Steps | `2` / `steps` |
| Detail/Steps | `Sampler_Steps_Detail` | 203 | 10 | int | Steps | `3` / `steps` |
| Rough/OtherSteps | `Other_Steps_Rough` | 302 | 20 | int | OtherSteps | `4` / `steps` |
| Main/CFG（Red Team 用） | `Sampler_CFG` | 401 | 30 | float | CFG | `5` / `cfg` |

ステージ: `main`(id 1, name `Main`, sort_order 1)、`rough`(id 2, `Rough`, 2)、`detail`(id 3, `Detail`, 3)、すべて `is_active: true`。
マスター（`MappingMasterV2`）: id 10 `base_key: 'Sampler_Steps'`, `name: 'Steps'`、variants 201/202/203。id 20 `base_key: 'Other_Steps'`, `name: 'OtherSteps'`、variants 301（main, `Other_Steps`）/302（rough）。id 30 `base_key: 'Sampler_CFG'`、variant 401（main）。

## 3. 実行層と環境

| 層 | 内容 | 実行環境 |
|---|---|---|
| unit | `buildParamSyncCandidates` の純関数 | Vitest `@vitest-environment node`（既存ファイルの指定どおり） |
| integration | ParamSyncModal（jsdom、API ドメインモジュール境界で vi.mock）、useGenerateAction（node、ストア送信境界モック）、FastAPI TestClient + SQLite in-memory | Vitest / pytest |
| scenario | 再表示による復元、選択→解除→代表変更の複数手順 | 同上（integration 基盤上の複数手順ケース） |
| e2e | 新規 Playwright ケースは作らない。モーダル内のリスト表示・チェックは jsdom で検証でき、実ブラウザ固有の挙動（sticky・実スクロール・DnD）を変更しないため。Gate 3 では既存 `scripts/run_e2e.py` を実行し退行がないことを確認する | Playwright（既存） |

Seam: `buildParamSyncCandidates`・`groupMappingsByStage`・`applyParamSync`・`workflowParamInjector` はモックしない。切断するのは HTTP 境界（`api/client`、`api/domains/stageMasters`）と生成送信境界（ストアの `submitGenerationBatch` / `queuePrompt`）だけ。PBT は不要（設計書 §3）。

## 4. AC とケースの対応

### T1: `frontend/src/utils/__tests__/mappingStageGroups.test.ts`（describe `buildParamSyncCandidates`）

| ID | ケース名 | 層 | 期待 |
|---|---|---|---|
| U1 | `[REQ-351/AC-1] builds stage-qualified candidates for every mapped role in stage order` | unit | §2 の5 mapping（入力順はばらばら）から role 5件。順序は Main→Rough→Detail のステージ順。`Sampler_Steps_Rough` の stageName は `Rough`、displayName は `Steps`、inputType は `int` |
| U2 | `[REQ-351/AC-1] dedupes duplicate roles and skips null roles without mutating inputs` | unit（境界） | 同じ role の mapping 2件→候補1件、role null→除外、入力配列とオブジェクトは変更されない（`structuredClone` と比較） |
| U3 | `[REQ-351/AC-1] leaves stageName null when a mapping cannot be resolved to a stage` | unit（境界） | variant_id が存在しないバリアントを指す mapping の stageName は null（`Unknown` を返さない） |

### T1: `frontend/src/components/__tests__/ParamSyncModal.test.tsx`（describe `REQ-351 stage-qualified candidates`）

| ID | ケース名 | 層 | 期待 |
|---|---|---|---|
| I1 | `[REQ-351/AC-1] shows same-role other stages and same-type other roles with stage names as sub candidates` | integration | 代表 `Sampler_Steps` のグループ選択時、チェックボックス3件。ラベルに `Rough / Steps`、`Detail / Steps`、`Rough / OtherSteps` が表示される |
| I2 | `[REQ-351/AC-2] excludes the representative Main/Steps itself from sub candidates` | integration | サブ候補領域に `Role: Sampler_Steps` がない。チェックボックスは3件だけ |
| I3 | `[REQ-351/AC-4] lets the same-type other role Rough/OtherSteps be selected as a sync target` | integration | `Rough / OtherSteps` をクリック→`updateParamSyncGroup(<id>, { slave_roles: [...既存, 'Other_Steps_Rough'] })` |
| I4 | `[REQ-351/AC-1] keeps different input types out of sub candidates` | integration（Red Team） | float の `Sampler_CFG` はサブ候補に出ない |
| I5 | `[REQ-351/AC-6] restores saved stage-qualified sync targets as checked when the modal is reopened` | scenario | `slave_roles: ['Sampler_Steps_Rough', 'Other_Steps_Rough']` の保存済みグループで、マウント→アンマウント→再マウント後、`Rough / Steps` と `Rough / OtherSteps` がチェック済み、`Detail / Steps` は未チェック |
| I6 | `[REQ-351/AC-6] keeps stage-qualified sync targets when the representative changes to a same-type role` | integration（保持） | 代表を `Sampler_Steps_Detail` に変更→`updateParamSyncGroup` の `slave_roles` に `Sampler_Steps_Rough` が残り、新しい代表自身は含まれない |
| I7 | `[REQ-351/AC-1] keeps candidates when stage master loading fails` | integration（Fault） | `stageMastersApi.list` reject でも3候補が表示され、ステージ名はバリアントの `stage_name` で表示される |
| I8 | `[REQ-351/AC-1] keeps candidates by workflow input_type when mapping master loading fails` | integration（Fault） | `mappingMastersApi.list` reject でも `WorkflowMapping.input_type` で3候補が出る（ステージ名なし表示は許容） |

既存ケース（`selects a sync group and displays candidate slave roles with same input_type ...`、`creates a new param sync group` など）は無変更で PASS すること（legacy フィクスチャ互換の保持確認）。

### T2: `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`（describe `REQ-351 stage-qualified param sync`）

| ID | ケース名 | 層 | 期待 |
|---|---|---|---|
| G1 | `[REQ-351/AC-3] syncs only the selected Rough stage and keeps Detail at its own value` | integration | paramValues Main=20→50 に変更済み（`{Sampler_Steps:'50', Sampler_Steps_Rough:'30', Sampler_Steps_Detail:'40'}`）、グループ `slave_roles:['Sampler_Steps_Rough']`。送信グラフで node2.steps=50、node3.steps=40、node1.steps=50 |
| G2 | `[REQ-351/AC-4] syncs the same-type other role Rough/OtherSteps to the representative value` | integration | Main=60、`slave_roles:['Other_Steps_Rough']`→node4.steps=60 |
| G3 | `[REQ-351/AC-5] stops syncing an unselected Detail stage and keeps its value at release` | scenario | 手順1: `slave_roles:[Rough, Detail]`、Main=60 で生成→node2=node3=60。手順2: グループを `slave_roles:[Rough]` に変更、Main=70 で生成→node2=70、node3=40（ストアの Detail 値）。ストアの `paramValues.Sampler_Steps_Detail` は全手順で `'40'` のまま |
| G4 | `[REQ-351/AC-3] does not sync stage-qualified targets when the group is disabled` | integration（保持） | `is_enabled:false`→node2=30、node3=40 |

G3 の意味（AC-5「解除時の値」）: Detail を同期先から外した時点で Detail 自身の入力欄にある値、つまりストア `paramValues['Sampler_Steps_Detail']` の値（40）を指す。同期は生成時に送信値だけを代表値で上書きし、ストアは書き換えないため、手順1で 60 を送信しても Detail のストア値は 40 のまま（同期中の入力欄も無効化された状態で 40 を表示）。手順2の node3 が 60（直前に送った値）や 70（新しい代表値）なら FAIL とする。

数値の比較は送信グラフの型変換後の値（int）で行う。期待値はフィクスチャ定数から独立に書き、実装関数の戻り値を期待値に流用しない。

### T3: `backend/tests/integration/legacy/test_param_sync_groups.py`

| ID | ケース名 | 層 | 期待 |
|---|---|---|---|
| B1 | `test_stage_qualified_roles_round_trip`（docstring `[REQ-351/AC-6] ...`） | integration | POST で `master_role:'Sampler_Steps'`、`slave_roles:['Sampler_Steps_Rough','Other_Steps_Rough']`→GET 一覧で同じ値・同じ順序。PUT で `['Sampler_Steps_Rough']` に変更→GET で1件だけ、`master_role` は不変 |

### T4（document）

SPEC_GENERATE.md §2-8 の記述を doc-verify（意味・矛盾・適用範囲・参照・AC シナリオ）で確認する。コード AC の合否には使わない。

## 5. AC 網羅表

| AC | ケース |
|---|---|
| AC-1 | U1, U2, U3, I1, I4, I7, I8 |
| AC-2 | I2 |
| AC-3 | G1, G4 |
| AC-4 | I3, G2 |
| AC-5 | G3 |
| AC-6 | I5, I6, B1 |

## 6. 収集・選択の検証コマンド（リポジトリルートで実行）

```
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils/__tests__/mappingStageGroups.test.ts src/components/__tests__/ParamSyncModal.test.tsx src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts -t "REQ-351"
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_param_sync_groups.py -k "stage_qualified_roles_round_trip"
backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict
```

選択契約: 承認済み選択 S = §4 の 16 ケース（U1-U3, I1-I8, G1-G4, B1）。S は収集結果に全件含まれ、全件 PASS であること。空の収集、重複 ID、未知の AC タグ、skip/xfail/only は不可。

## 7. リスク評価とフルスイートへのフォールバック

- 変更リスク: **low**（フロントの候補生成・表示のみ。スキーマ・API・依存・共有フィクスチャ・検証基盤の変更なし）。ただし V1 既定のため、低リスクでも Gate 2 のフルスイートは常に新規実行する。
- 次のいずれかが起きたら高リスクとして扱い、フルスイートと全 Gate を再実行し、設計へ差し戻す（OR 条件）: T2 で `useGenerateAction.ts` の修正が必要になった、バックエンドのソース・スキーマ・OpenAPI に差分が出た、共有テストユーティリティ（`src/test/utils/`）や `conftest.py` に差分が出た、収集件数が §6 の 16 と一致しない、想定外の skip がある、モック境界が §3 を越えた、結果が不安定（flaky）、所有ファイル外の差分がある。
- 環境が不明な場合（venv・node_modules の欠落など）は低リスクに丸めず、INCONCLUSIVE として報告する。

## 8. Gate 3 シナリオ・Red Team

- 正常: I1→I3→I5（候補表示→別ロール選択→再表示で復元）、G3（選択→解除→代表変更）。
- 異常・境界: I7、I8（API 失敗）、U2、U3（重複・null・未解決）、I4（型不一致）、I2（自己参照）。
- 保持: 既存 ParamSyncModal テスト全件、G4（無効グループ）、Seed 同期の既存テスト（`seedModel.test.ts`、`useGenerateAction.seed.test.ts`）が無変更で PASS。
- Red Team 観点: 同じ role の重複 mapping で React key が重複しない（コンソール警告がない）こと、代表変更で同期先に新しい代表自身が残らないこと、保存済みグループの `slave_roles` にワークフローに存在しない role がある場合、モーダルは候補に出さず、別の同期先のチェック切替ではその role を保存値から削除しないこと（`handleSlaveToggle` の既存挙動の保持）。代表変更時に型を解決できない role が除かれるのは既存挙動のまま（変更しない）。テスターの探索的確認項目とし、承認済み選択 S には含めない。
