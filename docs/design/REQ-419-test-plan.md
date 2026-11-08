---
id: REQ-419
title: "Test Plan: マッピングマスタ設定UIの再構成と判定プレビュー（改訂2）"
status: draft
revision: 3
tags:
  - test-plan
related_paths:
  - docs/backlog/pbi/active/REQ-419.md
  - docs/design/REQ-419.md
---

# Test Plan: REQ-419（改訂2・AC-12/AC-13 追跡更新）

## 1. リスク評価と検証プロファイル
- リスク分類: **high**。公開 API 契約の追加（原子的保存・プレビュー・`MappingVariantRead` 拡張）、トランザクション境界、スキャナ・候補ランク付け・ステージ検出の挙動変更、複数テストファイルの共有 fixture 更新を含む。
- 検証プロファイル: **V1 Baseline**（V2 は宣言しない）。最終候補に対し Gate 1（typecheck・mypy・UI不変条件・命名規約）、Gate 2（Backend `-n auto`・Frontend `npm test` の全スイート、ファイルフィルタなし）、Gate 3（Playwright と §5・§6）を新規実行する。
- 全スイート必須化トリガー（OR）: high 判定（常時）、収集件数の不一致・0件、想定外 skip/xfail、MSW 未処理リクエスト、フレーキー、所有外ファイルの変更、承認範囲外のテスト削除。

## 2. 環境と収集
- Backend: `backend\.venv\Scripts\python`（pytest, hypothesis, pytest-xdist）。リポジトリルートで実行。DB は `db_session`（外側トランザクション＋SAVEPOINT）。ロールバック検証では、事前データを `db_session.commit()` で SAVEPOINT 確定してからエンドポイントを呼ぶ（エンドポイントの rollback が事前データを巻き戻さないため）。
- Frontend: vitest（jsdom）+ MSW（`src/test/mocks/server`）。既存の API モジュール `vi.mock` 方式のテストは方式を維持してよい。E2E は Playwright chromium、`page.route` で `/api/**` を遮断。GPU・ComfyUI 不要。
- 収集: Backend は関数名 `test_req419_ac<N>_*`＋docstring 先頭 `[REQ-419/AC-N]`（parametrize の ids にもタグ）。選択は `-k "req419"`。Frontend/E2E はケース名先頭 `[REQ-419/AC-N]`、選択は `-t "REQ-419"` / `-g "REQ-419/AC-11"`。

## 3. テスト配置（W-DD-PLACE）
| 層 | ファイル | 区分 |
|---|---|---|
| Backend integration/PBT | `backend/tests/integration/legacy/test_workflow_scanner.py`, `test_workflow_scanner_property.py` | 既存拡張 |
| Backend API | `backend/tests/integration/api/test_workflows.py` | 既存拡張 |
| Backend governance | `backend/tests/governance/test_openapi_contract.py` | 既存拡張 |
| Frontend unit | `frontend/src/components/mappingMaster/__tests__/variantDraft.test.ts` | 新規モジュールのコロケーション |
| Frontend component | `frontend/src/components/mappingMaster/__tests__/ScanPreviewPanel.test.tsx` | 同上 |
| Frontend component | `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | 既存拡張 |
| Frontend component | `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | 既存拡張 |
| Frontend component | `frontend/src/components/__tests__/StageManagerModal.test.tsx` | 既存拡張 |
| Frontend unit | `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | 既存拡張 |
| Frontend unit | `frontend/src/utils/__tests__/variantCandidateDefinition.test.ts`, `workflowAdaptiveStageDetector.test.ts` | 新規/未テストモジュールのコロケーション |
| Frontend component | `WorkflowModalMultiStage.test.tsx`, `WorkflowAdaptiveStaging.test.tsx`, `WorkflowConnectionSection.test.tsx`（+fixture 更新のみ: `WorkflowModalEditing.test.tsx`, `workflowMappingIntegration.test.tsx`, `GeneratePage.test.tsx`） | 既存拡張 |
| E2E | `frontend/e2e/settingsResponsive.spec.ts` | 既存拡張 |

## 4. AC とケースの対応
| AC | ケース（安定ID） | 層 | ファイル |
|---|---|---|---|
| AC-1 | `[REQ-419/AC-1] edit mode shows only master value fields` | component | MappingMasterEditModal.test.tsx |
| AC-1, AC-13 | `[REQ-419/AC-13] [REQ-419/AC-1] candidateDefinitionForVariant ignores master legacy columns` | unit | variantCandidateDefinition.test.ts |
| AC-1, AC-13 | `[REQ-419/AC-13] [REQ-419/AC-1] upload and rescan rank candidates per variant from rule entries` | component | WorkflowModalMultiStage.test.tsx |
| AC-2 | `[REQ-419/AC-2] buildMasterDraft orders variants by stage sort_order` | unit | variantDraft.test.ts |
| AC-2 | `[REQ-419/AC-2] variant rows show role, enabled, entries and patterns by priority` | component | MappingMasterEditModal.test.tsx |
| AC-2 | `test_req419_ac2_variant_read_includes_inline_definitions` | integration | test_workflows.py |
| AC-3 | `test_req419_ac3_atomic_save_repoints_and_clears_selector` | integration | test_workflows.py |
| AC-3 | `test_req419_ac3_atomic_save_swaps_selectors` | integration | test_workflows.py |
| AC-3 | `[REQ-419/AC-3] buildAtomicSaveRequest assigns new definitions only to the edited row` | unit | variantDraft.test.ts |
| AC-3 | `[REQ-419/AC-3] switching definitions persists and reopen shows new names` | component | MappingMasterEditModal.test.tsx |
| AC-4 | `[REQ-419/AC-4] findOtherReferrers combines server and draft references` / `pendingSharedChoices lists only dirty persisted shared definitions` | unit | variantDraft.test.ts |
| AC-4 | `[REQ-419/AC-4] shared edit shows referrer roles and blocks save until chosen` | component | MappingMasterEditModal.test.tsx |
| AC-5 | `test_req419_ac5_atomic_save_duplicate_keeps_original` / `test_req419_ac5_atomic_save_update_shared_changes_all_referrers` | integration | test_workflows.py |
| AC-5 | `[REQ-419/AC-5] duplicate choice builds a copy op and keeps the original` / `update-shared choice builds an update op` | unit | variantDraft.test.ts |
| AC-5 | `[REQ-419/AC-5] both choices are reflected after reopen for every referrer` | component | MappingMasterEditModal.test.tsx |
| AC-5, AC-12 | `[REQ-419/AC-12] [REQ-419/AC-5] section sends one atomic-save request and refreshes definitions` | component | MappingMasterSection.modals.test.tsx |
| AC-6 | `test_req419_ac6_atomic_save_rejects_invalid_requests`（parametrize ids `[REQ-419/AC-6] dup-stage`, `dup-selector`, `new-item-used-stage`, `role-collision`, `rule-set-name-collision`, `unknown-ref`, `foreign-variant-id`, `update-missing-id`） | integration | test_workflows.py |
| AC-6 | `test_req419_ac6_atomic_save_allows_multiple_null_selectors` | integration | test_workflows.py |
| AC-6 | `[REQ-419/AC-6] validateVariantDrafts flags duplicate stage and selector` / `mapServerValidationErrors maps 422 rows` | unit | variantDraft.test.ts |
| AC-6 | `[REQ-419/AC-6] uniqueness error is shown on the row and nothing is sent` / `server 422 is mapped to the variant row` | component | MappingMasterEditModal.test.tsx |
| AC-6 | `[REQ-419/AC-6] save failure is propagated to the modal` | component | MappingMasterSection.modals.test.tsx |
| AC-7 | `[REQ-419/AC-7] master card shows variant count badge without +N classes` | component | MappingMasterSection.modals.test.tsx |
| AC-8 | `[REQ-419/AC-8] stage create and edit forms have no search keyword input` | component | StageManagerModal.test.tsx |
| AC-8 | `[REQ-419/AC-8] title conditions are editable only in the selector editor` | component | MappingMasterEditModal.test.tsx |
| AC-9 | `test_req419_ac9_detailed_scan_*`（2件）/ `..._consistent_with_scan_workflow_variants`（PBT） | integration/PBT | scanner テスト |
| AC-9 | `test_req419_ac9_scan_preview_uses_unsaved_definitions` / `scan_preview_error_responses`（parametrize） | integration | test_workflows.py |
| AC-9 | `[REQ-419/AC-9] preview renders ...` / `sends the unsaved draft` / `failure keeps draft and ignores stale responses` / `disabled when no workflow` | component | ScanPreviewPanel.test.tsx |
| AC-9 | `[REQ-419/AC-9] preview panel receives the unsaved draft` | component | MappingMasterEditModal.test.tsx |
| AC-9 | `test_req419_ac9_openapi_new_contracts_match_runtime` | contract | test_openapi_contract.py |
| AC-10 | `test_req419_ac10_scan_preview_does_not_persist` | integration | test_workflows.py |
| AC-10 | `[REQ-419/AC-10] preview never calls persistence endpoints` | component | ScanPreviewPanel.test.tsx |
| AC-11, AC-12 | `[REQ-419/AC-11] [REQ-419/AC-12] 375px: master edit sheet supports variant switch, shared choice and preview` / `[REQ-419/AC-11] 1280px: same operations send the same requests` | e2e | settingsResponsive.spec.ts |
| AC-12 | `test_req419_ac12_atomic_save_applies_all_changes_in_one_request` | integration | test_workflows.py |
| AC-12 | `test_req419_ac12_atomic_save_rolls_back_on_injected_db_failure`（parametrize ids `[REQ-419/AC-12] after-definition-create`, `during-variant-update`） | integration（fault injection） | test_workflows.py |
| AC-12 | `test_req419_ac12_atomic_save_all_or_nothing_property` | PBT | test_workflows.py |
| AC-12 | `[REQ-419/AC-12] [REQ-419/AC-5] api client posts atomic-save and scan-preview bodies` | unit | variantDraft.test.ts |
| AC-12 | `[REQ-419/AC-12] save failure keeps the draft and shows an error` | component | MappingMasterEditModal.test.tsx |
| AC-13 | `test_req419_ac13_scanner_ignores_stage_search_keywords` / `scanner_ignores_master_legacy_fields` | integration | test_workflow_scanner.py |
| AC-13 (a)(b) | `test_req419_ac13_scanner_legacy_only_and_keyword_only_nodes` | integration | test_workflow_scanner.py |
| AC-13 (a)(b) | `test_req419_ac13_scan_preview_ignores_legacy_fields` | integration | test_workflows.py |
| AC-13 | `[REQ-419/AC-13] rankWorkflowNodeCandidates applies entry pairs and contains patterns` / `keeps legacy behavior when entryPairs is undefined` | unit | workflowNodeUtils.test.ts |
| AC-13 (a)(b) | `[REQ-419/AC-13] legacy-only and keyword-only nodes are not promoted` | unit | workflowNodeUtils.test.ts |
| AC-13 | `[REQ-419/AC-13] candidateDefinitionForVariant orders entries and splits patterns by match type` | unit | variantCandidateDefinition.test.ts |
| AC-13 (a)(b) | `[REQ-419/AC-13] detectActiveStages uses selector patterns and ignores search_keywords` / `buildStageSelectorPatterns aggregates enabled variants by stage` | unit | workflowAdaptiveStageDetector.test.ts |
| AC-13 (a)(b) | `[REQ-419/AC-13] upload rescan and wiring ignore legacy-only and keyword-only nodes` | component | WorkflowModalMultiStage.test.tsx / WorkflowAdaptiveStaging.test.tsx |
| AC-13 (a)(b) | `[REQ-419/AC-13] settings wiring shows stages detected by selector patterns` | component | WorkflowAdaptiveStaging.test.tsx / WorkflowConnectionSection.test.tsx |

## 5. 統合フロー
1. 既存 Master（main/rough、共有 RuleSet、rough のみセレクタ）を開く → Variant 行（AC-2）。
2. rough の RuleSet を編集 → 保存 → 共有選択（AC-4）→ 複製 → `atomic-save` 1回 → 再表示で rough のみ新 RuleSet、main は元内容（AC-5）。
3. 「共有定義を更新」→ 全参照元で新内容。
4. rough を「セレクタなし」へ → 保存 → 再表示（AC-3）。
5. 下書きでプレビュー → 結果が下書きに従い、保存系不変（AC-9/AC-10）。
6. 保存後、ワークフロー再スキャン画面・配線画面の候補順位とステージ表示が新しい RuleSet/NodeSelector に従う（AC-13）。
7. Master 値変更＋2行の定義切替＋共有更新／複製を含む保存の途中で失敗 → エラー表示・下書き保持・DB 不変。失敗しなければ全変更が1回で反映（AC-12）。

## 6. Red Team・境界・異常系（Gate 3）
- RT-1: 2 Variant が同じセレクタを参照し、片方から編集して「複製」→ もう片方は元を参照。
- RT-2: 新規行で使用済みステージ → 行エラー・送信0件。サーバへ直接送ると 422、既存 Variant は上書きされない。
- RT-3: 複製名の衝突 → ` 2` 付与。同一要求内で create 同士の名前衝突 → 422、何も作られない。
- RT-4（AC-12）: 原子的保存の途中で DB 失敗を注入 → 新規定義・共有更新・Variant 付替え・Master 名変更の**いずれも**残らない。
- RT-5: 保存中の二重送信防止、422/409/ネットワーク断でモーダルは閉じず下書き保持。
- RT-6: プレビュー要求中のワークフロー切替で古い応答を破棄。ワークフロー0件時は実行不可。
- RT-7: 全 Variant 無効のプレビュー → 全件 `disabled`。
- RT-8: パターンの大文字小文字差・空白・priority 同値。exact と contains の両方に一致するノード。
- RT-9: 375px で長い定義名・role がページ横スクロールを起こさない（role/ID は truncate しない）。
- RT-10: 共有選択パネル表示中の Esc はパネルのみ閉じる。
- RT-11（AC-13）: `rule_entries` を持たない Variant（旧データ・旧 fixture）で候補ランク付けが例外にならず全ノード低 tier になる。search_keywords だけを持つステージは配線画面で検出されない（ビルトイン／main は常時表示）。
- RT-12: 他 Master の Variant id を `atomic-save` に含める → 422、他 Master は不変。

## 7. 旧テストの扱い
- `MappingMasterEditModal.test.tsx` の `[REQ-417/AC-5]` タブ前提ケースとノードピッカー前提の `[REQ-365/AC-9]` 2ケースは新構成へ置換（シート表示・Esc・タップ領域の意図は維持）。
- `MappingMasterEditModalAutocomplete.test.tsx` と `MappingMasterSection.fallbacks.test.tsx` は削除（ユーザー承認済み）。件数を検証報告に記録。
- `MappingMasterSection.modals.test.tsx` の `+N classes` 期待は AC-7 に合わせ更新（`+N stages` は維持）。
- `test_workflow_scanner.py` の旧フォールバック依存3ケースは NodeSelector/Entry ベースへ書き換え（意図維持）。
- Master 旧列で推奨ノードを期待していた呼び出し側テストは、同等の `rule_entries`/`selector_patterns` を fixture に追加して意図を維持する（期待値の変更は「Master 旧列だけに依存した推奨」がなくなる箇所に限定し、変更件数を報告）。
- `MappingMasterEditModal.seed.test.tsx` と `dedicatedSeedIntegration.test.tsx` は無変更で PASS を維持。
