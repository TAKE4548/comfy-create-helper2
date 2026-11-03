# REQ-351 検証ウォークスルー報告書

## 総合判定: 本書は検証証跡の要約であり、最終ゲート実行結果は含まない

### 概要
REQ-351「ParamSync のロール×ステージ単位の同期先選択」について、実装 (T1: 候補生成ロジック、T2/T3: テスト拡張、T4: SPEC_GENERATE.md §2-8 追記) と検証の経緯を記録する。

- 検証プロファイルは V1 既定。Gate 1 -> Gate 2 -> Gate 3 の順に、凍結した候補 (base 8f5633a + 未コミット差分、14 ファイルのハッシュを実行前後で照合) に対して実行する。
- 最終ゲート実行は凍結候補に対して実施済み。コマンドごとの record id / sha256 / identity は、git 管理外の `docs/logs/verification` と最終実行レポート (`docs/logs/REQ-351/qa-code-report-final.md`) に保存されている。本書はこれらの値を埋め込まない (凍結順序のため)。
- 本書は、既存レポートが示す証跡以上の最終ゲート結果を主張しない。
- バックエンドのソースコードは変更していない (API / スキーマ不変)。

---

## 1. 変更ファイル

| 区分 | ファイル |
| :--- | :--- |
| 実装 (FE) | `frontend/src/utils/mappingStageGroups.ts` (`buildParamSyncCandidates`) |
| 実装 (FE) | `frontend/src/components/ParamSyncModal.tsx` |
| テスト (FE) | `frontend/src/utils/__tests__/mappingStageGroups.test.ts` |
| テスト (FE) | `frontend/src/components/__tests__/ParamSyncModal.test.tsx` |
| テスト (FE) | `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` |
| テスト (BE) | `backend/tests/integration/legacy/test_param_sync_groups.py` (往復テスト追加) |
| 仕様 | `docs/specs/SPEC_GENERATE.md` (§2-8、+8/-0) |
| PBI | `docs/backlog/pbi/active/REQ-351.md` |

注記: `.gitignore` と `frontend/.gitignore` にも変更があるが、本 PBI の作業以前から存在する無関係の変更であり (§7 参照)、REQ-351 の成果物ではない。

---

## 2. 受入基準 (AC) トレーサビリティマトリクス

| AC | 受入基準 | 検証テスト / 証跡 | ミュータント | 判定 |
| :--- | :--- | :--- | :--- | :---: |
| **AC-1** | 同一型の他ロールがステージ名付きで同期先候補に出る | U1-U3, I1, I4, I7, I8 | N1, N2, N3, N6 を検出 | **PASS** |
| **AC-2** | 代表自身は同期先として選べない | I2 | N4 を検出 | **PASS** |
| **AC-3** | 選択した同期先だけが追従する | G1, G4 | M1, M2, M3 を検出 | **PASS** |
| **AC-4** | 同一型の別ロールを同期先にできる | I3, G2 | - | **PASS** |
| **AC-5** | 選択解除した同期先は自身のストア値を保持し、ストアは書き換えられない | G3 (※モックストアに対する検証) | M4 は生存 (§4) | **PASS (制限あり)** |
| **AC-6** | 再表示時に復元される。API / スキーマは不変 | I5, I6, B1, 往復テスト (`stage_qualified_roles_round_trip`) | N5 を検出。BE ソース差分なし | **PASS** |

- AC 網羅: 6 / 6 (100%)。
- 文書観点: SPEC_GENERATE.md §2-8 は doc-reviewer 第2回レビューで AC-1〜AC-6 の記述対応が成立 (PASS)。文書 PASS はコード AC を閉じるものではなく、コード AC は上記テストとゲート証跡で判定した。
- 承認済みテスト選択 S = 16 件。収集件数は計画と一致。`.only` / `.skip` / `xfail` は 0 件。

---

## 3. Automated Baseline 3-Gate (V1)

<execution_evidence>

実行は fresh な独立実行で、候補は凍結 (14 ファイルのハッシュが実行前後で同一、`git status` も前後で同一)。各コマンドの record id / sha256 / identity は `docs/logs/verification` (git 管理外) と最終実行レポートに保存されている。

### Gate 1: 静的検査・単体

| コマンド | 内容 | 報告された結果 |
| :--- | :--- | :--- |
| `mypy backend` | バックエンド型検査 | 0 errors (exit 0) |
| `pytest backend/tests/unit` | バックエンド単体 | 39 passed (exit 0) |
| `vitest run src/utils src/components/**/__tests__` | フロントエンド単体 | 24 files / 326 tests passed (exit 0) |
| `python scripts/verify_ui_invariants.py` | UI 不変条件 | PASS (exit 0) |
| `npm --prefix frontend run typecheck` | `tsc -b --noEmit` | 0 errors (exit 0) |

### Gate 2: フルスイート (ファイル絞り込みなし)

| コマンド | 報告された結果 |
| :--- | :--- |
| `python scripts/run_full_suite.py` | vitest 249 files / 2727 tests passed、pytest 787 passed (exit 0) |

### Gate 3: シナリオ・異常系・Red Team

| コマンド | 報告された結果 |
| :--- | :--- |
| `python scripts/run_e2e.py` | Playwright 308 passed (exit 0) |
| `vitest -t REQ-351` (3 ファイル、テスト計画 §6) | 15 passed、66 件は選択外 (exit 0) |
| `pytest -k stage_qualified_roles_round_trip` | 1 passed (exit 0) |

### 補助チェック
- `verify_test_naming.py --strict`: exit 1。他 PBI のテストに存在する既存違反 18 件によるもので、REQ-351 のファイルに該当する違反は 0 件 (§6 参照)。副作用で書き換わった `docs/design/REQ-356-test-mapping.md` は復元済みで、clean。
- `workflow_validator.py test-hygiene REQ-351`: `TEST_ACCRETION_VIOLATION` なし。

</execution_evidence>

Red Team の観点: 異なる `input_type` の role の除外 (Sampler_CFG)、同一 role 文字列の重複ステージ (最初のステージ名の1候補に集約)、選択→解除→代表変更の複数手順、再表示による復元。

---

## 4. ミュータント検証結果

本物のソースは変更せず、スクラッチコピー上で実施した。

| 対象 | 結果 |
| :--- | :--- |
| T1 (候補生成): 重複排除なし、`stageName` null、型フィルタ無効、自己除外なし、`validSlaves` 欠落、`input_type` フォールバックなし | 全て検出 (killed) |
| T2: M1 / M2 / M3 | 検出 (killed) |
| T2: **M4** (ストアへの書き戻し) | **生存**。等価ミュータントと判断 (後述) |

M4 / AC-5 の制限: 実効値は `applyParamSync` が作る派生コピーであり、ストアの `paramValues` を書き換えても生成結果に差が出ない。そのため AC-5「ストアが書き換えられない」の検証はモックストアに対するアサーションに依存しており、実ストアでの書き戻し検出力には限界がある。最終ゲート時点の候補はミュータント検証時の候補と `SPEC_GENERATE.md` の文面のみ異なり、コードファイルは同一のため、ミュータント結果は再実行していない。

---

## 5. 文書レビュー (doc-verify、SPEC_GENERATE.md §2-8)

| 回 | 判定 | 内容 |
| :--- | :--- | :--- |
| 第1回 | **FAIL** | F1 (必須): 「同期も行わない」が実装 (`applyParamSync` は型を判定せず `slave_roles` を無条件コピー) と矛盾。F2 / F4 は推奨 (「保存値」の語義衝突、同一 role 文字列の制限未記載)。F3 は情報のみ。 |
| 手戻り | - | doc-editor が §2-8 を修正 (「同期も行わない」削除、設定画面での選択に範囲限定、「自身の入力値 (ストアの値)」へ語を分離、同一 role 文字列の制限を追記)。 |
| 第2回 | **PASS** | F1 解消、F2 / F4 解消、実装との矛盾 0 件。AC-1〜AC-6 の記述対応が成立。任意の改善提案 O1 が1件 (必須ではない)。 |

レポート: `docs/logs/REQ-351/qa-doc-report.md` (第1回)、`docs/logs/REQ-351/qa-doc-report-r2.md` (第2回)。

---

## 6. QA ローカルモデル監査

- 生ステータス: **ISSUES_FOUND** (FAIL 相当の分類)。指摘は1件。内容は `verify_test_naming.py --strict` の exit 1 (他 PBI のテストに存在する既存違反 18 件、REQ-351 のファイルでは 0 件) が「全コマンド exit 0」の期待に反するというもの (決定論的プレチェックによる検出)。
- トリアージ: ユーザーはこの指摘を過剰であり AC の範囲外と判断した。**ユーザーの明示回答は「許容する」**。これにより、この指摘を受け入れた上でクローズ工程へ進める判断を得ている。ステータスを PASS へ読み替えてはいない。
- 実行条件: モデル `qwen/qwen3.5-9b`、context 32768、reasoning none。
- クリーンアップ: モデルをアンロード済み (`lms ps` が `[]`)。GPU メモリ全体の解放を主張するものではない。
- 証跡: `docs/logs/REQ-351/qa-audit-result.json`、`qa-audit-evidence.md`。

---

## 7. 設計整合性・自律編集レビュー

- Class B 編集の報告は T1〜T3 とも 0 件。差分の再計算でも報告外のカード外編集は検出されなかった。
- ただし `.gitignore` / `frontend/.gitignore` に、どのカードの Impacted Files にも含まれない変更 (test-results / playwright-report / blob-report、`*.db-wal` / `*.db-shm` の追加) が存在する。更新時刻はエンジニア作業開始より前で、本 PBI の作業以前から存在する無関係の変更と判断した (出所は不明。コーディネーターの処置対象として記録)。本 PBI のコミット範囲に含めるか否かはコーディネーターが決定する。

---

## 8. 既知の制限

- T2 / T3 のテストは特性化テスト (characterization tests) であり、追加時点で Green、Red は観測していない。
- AC-5 の検証はモックストアに対するもので、M4 は等価ミュータントとして生存 (§4)。
- ミュータント検証は先行候補で実施し、最終候補では再実行していない (コードは同一)。
- `verify_test_naming.py --strict` は他 PBI 由来の既存違反 18 件により exit 1 (REQ-351 起因は 0 件、ユーザーが許容)。
- `.gitignore` 系の変更は本 PBI と無関係の既存変更。
- 最終ゲート実行の個別 record id / ハッシュは本書に含めない。参照先は `docs/logs/verification` と `docs/logs/REQ-351/qa-code-report-final.md`。

## 9. 参照
- 設計: `docs/design/REQ-351.md`、`docs/design/REQ-351-implementation_plan.md`、`docs/design/REQ-351-test-plan.md`
- QA レポート: `docs/logs/REQ-351/qa-code-report.md`、`qa-code-report-final.md`、`qa-doc-report.md`、`qa-doc-report-r2.md`、`qa-audit-evidence.md`、`qa-audit-result.json`
