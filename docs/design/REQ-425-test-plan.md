---
title: "REQ-425: プロンプト構造テンプレートによる分割入力とノード別任意結合送信 テスト計画書"
tags:
  - REQ-425
  - test-plan
  - prompt-template
related_paths:
  - docs/backlog/pbi/active/REQ-425.md
  - docs/design/REQ-425.md
  - backend/tests/unit/test_schemas.py
  - backend/tests/integration/api/test_workflows.py
  - backend/tests/integration/models/test_migrations.py
  - backend/tests/governance/test_openapi_contract.py
  - frontend/src/utils/__tests__/promptUtils.test.ts
  - frontend/src/utils/__tests__/generationRecord.test.ts
  - frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx
  - frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx
  - frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx
  - frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts
  - frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts
---

# REQ-425: プロンプト構造テンプレートによる分割入力とノード別任意結合送信 テスト計画書

## 1. リスク評価と検証プロファイル (`[W-DD-3]`)

- **リスク分類**: `high`
  - **根拠**: DB マイグレーション（`step_036_prompt_structure_templates` による `prompt_structure_templates` テーブル作成および `workflows` / `workflow_history` へのカラム追加）、新規 REST API エンドポイント（`/api/prompt-templates`）、OpenAPI スキーマ拡張（`WorkflowRead` / `WorkflowCreate` / `WorkflowUpdate`）、および生成送信・プリセット・スナップショットのコアパイプラインへの変更を含むため。
- **検証プロファイル**: **V1 Baseline (Default)**（`.agents/verification.json` 準拠）
  - **Gate 1 (Static Verification)**:
    - Backend: `python -m py_compile backend/app/main.py`
    - Frontend: `npm --prefix frontend run typecheck`
    - UI Invariants Linter: `python scripts/verify_ui_invariants.py`
    - OpenAPI Drift Check: `python scripts/export_openapi.py --output backend/openapi.json --check` および `npm --prefix frontend run openapi:check`
  - **Gate 2 (Full Test-Suite Discovery Baseline)**:
    - Backend: `python -m pytest`（ファイルフィルタなし）
    - Frontend: `npm --prefix frontend run test -- --run`（ファイルフィルタなし）
  - **Gate 3 (Scenarios, Failure/Boundary & Red Teaming)**:
    - 独立シナリオ検証、異常系・境界値テスト（空ブロック・連続カンマ・存在しない Repeat インスタンス指定・無効化チップ混在・テンプレート未適用ワークフロー互換）、およびガバナンス検査（`test_no_req_naming.py`）。

---

## 2. 実行ティア定義 (Execution Tiers)

1. **Tier 1: Unit Tests (`unit`)**
   - `backend/tests/unit/test_schemas.py`: `PromptTemplateCreate`, `PromptTemplateUpdate`, `WorkflowPromptTemplateConfigSchema`, `WorkflowUpdate` の明示的 `null` 拒否・バリデーションの単体検証。
   - `frontend/src/utils/__tests__/promptUtils.test.ts`: `promptTemplateEngine.ts` の純粋関数（出力グループ結合、Repeat `all` / `index` フィルタリング、無効化チップ除外、空ブロックのスキップとカンマ正規化、Property-Based Testing `fast-check` による先頭・末尾・連続カンマ不在証明）の単体検証。
   - `frontend/src/utils/__tests__/generationRecord.test.ts`: `buildGenerationRecord` および `getMetadataView` における `prompt_template`（有効値のみ保持、`enabled: false` チップ除外）の構築・抽出検証。
2. **Tier 2: Integration Tests (`integration`)**
   - `backend/tests/integration/models/test_migrations.py`: `step_036_prompt_structure_templates` マイグレーション冪等性、および `seed_prompt_structure_templates` による「Anima 標準テンプレート」（キャラクター19ブロック＋全体17ブロック）の自動シード検証。
   - `backend/tests/integration/api/test_workflows.py`: `/api/prompt-templates` CRUD、およびワークフロー作成・更新・複製・ロールバック時の `prompt_template_config` 保存・復元検証。
   - `backend/tests/governance/test_openapi_contract.py`: Runtime OpenAPI と `backend/openapi.json` スナップショットの一致検証。
   - `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx`: 設定画面におけるテンプレート管理操作およびワークフロー出力グループ設定・JSONエクスポート/インポート統合検証。
   - `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` & `useWorkflowParams.test.ts`: 生成実行時のノード別結合送信、プリセット保存/復元時の無効化チップ保持、スナップショット復元時の有効値のみ復元検証。
3. **Tier 3: UI Component & E2E / Scenario Tests (`e2e` / `scenario`)**
   - `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx` & `MobileLayout.test.tsx`: デスクトップおよびモバイルレイアウトにおける分割ブロック入力、Repeat インスタンス追加・削除、ブロック別アセット追加、および未割り当てプロンプト欄（Negative Prompt 等）の従来表示維持の検証。

---

## 3. AC トレーサビリティ・テストケースマトリクス (`[W-DD-PLACE]`)

> **REQ-356 命名規約厳守**: テストファイルパス・ディレクトリ名に `req425` や `REQ-425` を絶対に含めない。すべての新規テストは既存の機能別コロケーションテストファイルへ追加し、テスト関数名または `it(...)` 記述の先頭に `[REQ-425/AC-n]` タグを付与する。

| AC | 要件概要 | Tier | 既存配置先ファイル (`[W-DD-PLACE]`) | 安定ランナー ID / テスト識別子 |
|---|---|---|---|---|
| **AC-1** | プロンプト構造テンプレート（Repeat可否・順序付きブロック群）の定義・保存・編集 | Integration / UI | `backend/tests/integration/api/test_workflows.py`<br/>`frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | `test_workflows.py::test_prompt_structure_template_crud_lifecycle`<br/>`SettingsPage.test.tsx` (`[REQ-425/AC-1] creates and edits a prompt structure template with repeatable sections`) |
| **AC-2** | 「Anima 標準テンプレート」（キャラ19ブロック Repeat可 ＋ 全体17ブロック 非Repeat）の初期シード | Integration | `backend/tests/integration/models/test_migrations.py` | `test_migrations.py::test_seed_anima_standard_prompt_template_blocks_and_order` |
| **AC-3** | ワークフロー毎の任意出力グループ定義・ノード割当・結合ブロック選択・Repeat対象指定 | Unit / Integration / UI | `backend/tests/unit/test_schemas.py`<br/>`backend/tests/integration/api/test_workflows.py`<br/>`frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | `test_schemas.py::test_workflow_prompt_template_config_schema_validation`<br/>`test_workflows.py::test_workflow_prompt_template_config_persist_copy_and_rollback`<br/>`SettingsPage.test.tsx` (`[REQ-425/AC-3] configures workflow prompt output groups and repeat filters`) |
| **AC-4** | Positive 側は分割入力欄群を表示し、出力グループ未割当の Negative 側は従来の単一プロンプト入力欄として表示・編集できる | UI / Integration | `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx`<br/>`frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | `DesktopLayout.test.tsx` (`[REQ-425/AC-4] renders split blocks for assigned positive roles while keeping unassigned negative role as single editor`)<br/>`MobileLayout.test.tsx` (`[REQ-425/AC-4] renders split prompt editor and unassigned prompt roles in mobile prompt tab`) |
| **AC-5** | Repeat キャラ2追加・キャラ2の特定ブロック（`upper clothes`）のみへの TagSet/LoRA 追加の独立性・キャラ2削除時の空枠を残さない詰め保持 | Unit / UI | `frontend/src/utils/__tests__/promptUtils.test.ts`<br/>`frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx` | `promptUtils.test.ts` (`[REQ-425/AC-5] scopes asset tag addition to a single repeat instance block and compacts remaining instances on removal`)<br/>`DesktopLayout.test.tsx` (`[REQ-425/AC-5] adds asset tags only to character 2 upper clothes and removes character 2 without leaving empty instance slots`) |
| **AC-6** | 重複選択・独立評価可能なグループ1（全ブロック→ノードA）とグループ2（`character name`, `expression`→ノードB）に対する登録順展開・無効チップ/空欄スキップ・カンマ連結（`alice, smile, bob, coat, rim light` / `alice, smile, bob`） | Unit / Integration | `frontend/src/utils/__tests__/promptUtils.test.ts`<br/>`frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` | `promptUtils.test.ts` (`[REQ-425/AC-6] evaluates overlapping output groups independently in instance order while skipping disabled chips and empty blocks`)<br/>`useGenerateAction.test.ts` (`[REQ-425/AC-6] submits alice, smile, bob, coat, rim light to node A and alice, smile, bob to node B without extra commas`) |
| **AC-7** | プリセット保存・読込時に2キャラ Repeat 構成・各ブロック値・無効化チップ (`enabled: false`) を結合文字列へ丸めず完全復元する | Unit / Integration | `frontend/src/utils/__tests__/promptUtils.test.ts`<br/>`frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts`<br/>`frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` | `promptUtils.test.ts` (`[REQ-425/AC-7] preserves disabled chips and multi-instance structure in preset state JSON`)<br/>`useWorkflowParams.test.ts` (`[REQ-425/AC-7] restores split blocks, repeat instances, and disabled chips from preset paramValues`) |
| **AC-8** | 生成履歴・スナップショットは有効入力のみを分割状態のまま保持・表示し、無効化チップを混入させず、復元時は有効入力のみを各分割入力欄へ再配置する | Unit / Integration | `frontend/src/utils/__tests__/generationRecord.test.ts`<br/>`frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts` | `generationRecord.test.ts` (`[REQ-425/AC-8] records only enabled chip values in prompt_template metadata and strips disabled chips`)<br/>`useWorkflowParams.test.ts` (`[REQ-425/AC-8] restores only effective split block values from snapshot without disabled chips`) |
| **AC-9** | テンプレート未設定ワークフローおよび既存プリセットでは PC のノード単位入力欄・モバイルの Prompt tabs 切替表示と送信挙動が維持される | Integration / UI | `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx`<br/>`frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx`<br/>`frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` | `DesktopLayout.test.tsx` (`[REQ-425/AC-9] renders conventional single TagChipEditor fields when workflow has no prompt template`)<br/>`useGenerateAction.test.ts` (`[REQ-425/AC-9] submits conventional single prompt fields unchanged when template is not configured`) |
| **AC-10** | ノードA（全インスタンス）・ノードB（1番目のみ）・ノードC（2番目のみ）に対し、1人入力時はノードCが空文字（未存在2番目をエラー・余分カンマなくスキップ）、2人追加後は各割当ノードへ `alice, dress, bob, suit` / `alice, dress` / `bob, suit` が送信される | Unit / Integration | `frontend/src/utils/__tests__/promptUtils.test.ts`<br/>`frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` | `promptUtils.test.ts` (`[REQ-425/AC-10] skips non-existent repeat instance index without error or extra commas and joins 1st and 2nd instances when added`)<br/>`useGenerateAction.test.ts` (`[REQ-425/AC-10] sends empty string to node C when only 1 character exists and sends bob, suit after character 2 is added`) |

---

## 4. Red Team 境界値・異常系シナリオ (Gate 3)

1. **RT-1: すべて無効化または空白・カンマのみのブロック混在 (`AC-10`)**:
   - ブロック A が `[enabled: false ("solo")]`、ブロック B が `", ,   ,"`、ブロック C が `[enabled: true ("1girl, ")]`、ブロック D が空欄、ブロック E が `[enabled: true (", indoors")]` の場合、結合結果が `"1girl, indoors"` となり、`", 1girl"` や `"1girl, , indoors"` が一切発生しないこと。
2. **RT-2: 存在しない Repeat インスタンス番号を参照する出力グループ (`AC-6`, `AC-10`)**:
   - Repeat インスタンスが 1 件（`#1`）のみ存在する状態で、FaceDetailer #2 用の出力グループ（`repeat_filter: { mode: 'index', index: 2 }`）が評価された場合、エラーにならず Repeat 部分は空として安全にスキップされること。
3. **RT-3: プリセットとスナップショットの無効チップ境界分離 (`AC-7`, `AC-8`)**:
   - 無効チップ（`enabled: false`）を含む分割状態で生成を実行した際、プリセット（`__prompt_template_state_v1`）には無効チップが残る一方、生成リクエストの `cleanParams` および `GenerationRecord`（`__prompt_surgeon_metadata_v1`）には `__prompt_template_state_v1` や無効チップ文字列が一切漏洩しないこと。
4. **RT-4: テンプレート削除後のワークフロー安全性 (`AC-1`, `AC-3`)**:
   - ワークフローが参照していたテンプレートが後から削除された場合でも、`workflow.prompt_template_config.template_snapshot` により当該ワークフローの分割入力および結合送信が破損せず継続動作すること。

---

## 5. Mandatory Full-Suite Fallback 条件

以下のいずれかに該当する場合（本 PBI は DB マイグレーション・公開 API スキーマ変更を含むため初期状態で該当）、部分テストのみで完了とせず、必ず **V1 Full-Suite Baseline（Backend 全 pytest ＋ Frontend 全 Vitest）** を新鮮な状態で実行する：
- DB マイグレーション（`backend/app/migrations/steps.py`）または SQLAlchemy モデル（`backend/app/models.py`）の変更。
- OpenAPI スキーマ（`backend/openapi.json`, `frontend/src/api/schema.ts`）の変更。
- 共有ストア・生成パイプライン（`useGenerateAction.ts`, `useWorkflowParams.ts`, `generationRecord.ts`）の変更。

