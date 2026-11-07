# REQ-417 実行可能テスト計画 (Executable Test Plan)

## 1. 自動テスト Baseline 検証 (CLI Verification 3-Gate)

### Gate 1: 静的型チェック & 構文検証 (Static Typecheck Baseline)
- **コマンド**:
  - `cd frontend; npm run typecheck`
  - `mypy backend`
- **期待値**:
  - 型エラー 0 件 (Exit code 0)。
  - Backend: 新規モデル (`BindingRuleSet`, `BindingRuleEntry`, `NodeSelector`, `NodeSelectorPattern`)、新規スキーマ、新規ルーターの型整合性を検証。
  - Frontend: `WorkflowMapping` の `input_name: string`、新規型定義 (`BindingRuleSet`, `NodeSelector`) の整合性を検証。

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**:
  - `backend\.venv\Scripts\python -m pytest backend/tests/integration/models/test_migrations.py backend/tests/integration/legacy/test_workflow_scanner.py backend/tests/integration/services/test_mapping_service.py backend/tests/integration/api/test_workflows.py backend/tests/governance/test_openapi_contract.py`
  - `cd frontend; npx vitest run src/utils/__tests__/workflowParamInjector.test.ts src/components/__tests__/MappingMasterEditModal.test.tsx`
- **期待値**: 全テスト PASS (Exit code 0)。AC-1〜AC-7 の全受入基準を網羅。

### Gate 3: シナリオ・境界値・Red Team 検証
- **コマンド**:
  - `backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_workflow_scanner.py -k "REQ-417 and (AC-2 or AC-3)"`
  - `backend\.venv\Scripts\python -m pytest backend/tests/integration/models/test_migrations.py -k "REQ-417 and (AC-1 or AC-6 or AC-7)"`
  - `cd frontend; npx vitest run src/utils/__tests__/workflowParamInjector.test.ts -t "REQ-417/AC-4"`
  - `cd frontend; npx vitest run src/components/__tests__/MappingMasterEditModal.test.tsx -t "REQ-417/AC-5"`
- **期待値**: 複数ステージ競合解決、セレクタNULL時の複数ノード競合 (`duplicated` 警告)、一意性制約違反（`UNIQUE(role)`、`UNIQUE(master_id, stage_id)`、`UNIQUE(master_id, node_selector_id)`）、参照中定義の削除拒否（400エラー）等の異常系・境界値テストがすべて PASS。

---

## 2. 階層別テスト設計 (Execution Tier & Case Hierarchy)

| Tier | レベル | 対象モジュール | 切断・モック方針 | 主な検証内容 |
|---|---|---|---|---|
| **Tier 1 (Unit)** | 単体ロジック | `backend/app/services/workflow_scanner.py` | DB・外部I/O完全排除（純粋関数／インメモリ辞書テスト） | Entry一致必須判定、自セレクタ完全一致（段階1）、部分一致（段階2）、セレクタなし（段階3）、他セレクタ一致の除外（段階4）、辞書式ソートアルゴリズムの決定論的動作 (AC-2)。複数ステージ競合時の具体性優先（完全一致＞部分一致＞最長パターン）判定 (AC-3)。PBT による順序不変性検証。 |
| **Tier 1 (Unit)** | 単体ロジック | `frontend/src/utils/workflowParamInjector.ts`, `seedInputResolver.ts` | 外部通信完全排除（純粋オブジェクト入力テスト） | 保存済み `input_name` を直接使用したパラメータ注入 (AC-4)。旧フォールバック解決に依存しないノード特定とスロット値更新の決定性。 |
| **Tier 2 (Integration)** | DB・マイグレーション結合 | `backend/app/migrations/steps.py`, `backend/app/models.py` | SQLite テストDB（ファイルまたはインメモリ） | フェーズ2マイグレーションによる旧マスタデータの無損失移行 (AC-1)。フェーズ5マイグレーションによるテーブル再作成と一意制約（`UNIQUE(role)`、`UNIQUE(master_id, stage_id)`、`UNIQUE(master_id, node_selector_id)`）の強制 (AC-6, AC-7)。 |
| **Tier 2 (Integration)** | API・サービス結合 | `backend/app/routers/binding_rules.py`, `node_selectors.py`, `backend/app/services/mapping_service.py` | FastAPI TestClient / DB統合 | CRUD API の入出力検証、参照中 role 一覧の返却、参照中エンティティ削除時の 400 エラーガード (AC-5)。role カスケード処理と永続化 role の整合性。 |
| **Tier 2 (Integration)** | UI・コンポーネント結合 | `frontend/src/components/MappingMasterEditModal.tsx` | jsdom / Vitest（React Testing Library） | Master / RuleSet / NodeSelector 3分割タブ・モーダルの表示・編集切替、参照中 role 一覧表示、「複製して編集」による安全な定義フォーク動作 (AC-5)。 |
| **Tier 3 (Scenario/Boundary)** | 境界・異常系・Red Team | `test_workflow_scanner.py`, `test_migrations.py`, `test_openapi_contract.py` | 境界・異常データ注入 / 競合インジェクション | 複数ノード同一優先度競合時の `duplicated` 警告、セレクタ未設定（NULL）時の複数ノード競合、OpenAPI スキーマとクライアント型の完全一致、制約違反 IntegrityError ハンドリング。 |

---

## 3. AC 対照テスト配置計画 (Test Placement & Case Mapping) [W-DD-PLACE]

禁止事項: チケット番号付き新規テストファイルの作成は厳禁。既存のレイヤー別・コロケーションテストファイルを拡張する。

| AC ID | 対象ファイル | ケース名 (Tag) | レイヤー | 検証コマンド |
|---|---|---|---|---|
| `AC-1` | `backend/tests/integration/models/test_migrations.py` | `test_req417_ac1_phase2_migration_lossless_conversion` | `integration` | `backend\.venv\Scripts\python -m pytest backend/tests/integration/models/test_migrations.py -k "test_req417_ac1"` |
| `AC-2` | `backend/tests/integration/legacy/test_workflow_scanner.py` | `test_req417_ac2_lexicographical_scan_stages_and_input_name` | `unit` | `backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_workflow_scanner.py -k "test_req417_ac2"` |
| `AC-3` | `backend/tests/integration/legacy/test_workflow_scanner.py` | `test_req417_ac3_multi_stage_conflict_specificity_resolution` | `unit` | `backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_workflow_scanner.py -k "test_req417_ac3"` |
| `AC-4` | `frontend/src/utils/__tests__/workflowParamInjector.test.ts` | `[REQ-417/AC-4] uses persisted input_name directly without runtime fallback resolution` | `unit` | `cd frontend; npx vitest run src/utils/__tests__/workflowParamInjector.test.ts -t "REQ-417/AC-4"` |
| `AC-5` | `backend/tests/integration/api/test_workflows.py` | `test_req417_ac5_binding_rules_crud_and_referencing_roles_guard` | `integration` | `backend\.venv\Scripts\python -m pytest backend/tests/integration/api/test_workflows.py -k "test_req417_ac5"` |
| `AC-5` | `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | `[REQ-417/AC-5] displays referencing roles and supports duplicate-and-edit for shared definitions` | `integration` | `cd frontend; npx vitest run src/components/__tests__/MappingMasterEditModal.test.tsx -t "REQ-417/AC-5"` |
| `AC-6` | `backend/tests/integration/models/test_migrations.py` | `test_req417_ac6_phase5_unique_role_physical_constraint` | `integration` | `backend\.venv\Scripts\python -m pytest backend/tests/integration/models/test_migrations.py -k "test_req417_ac6"` |
| `AC-7` | `backend/tests/integration/models/test_migrations.py` | `test_req417_ac7_phase5_composite_unique_constraints_and_null_selector` | `integration` | `backend\.venv\Scripts\python -m pytest backend/tests/integration/models/test_migrations.py -k "test_req417_ac7"` |

---

## 4. Seam Map 設計 [W-DD-SEAM]

1. **Integrated (本物のコード)**:
   - `models.py`: 新規テーブルリレーション（`BindingRuleSet`, `BindingRuleEntry`, `NodeSelector`, `NodeSelectorPattern`, `MappingVariant`）
   - `workflow_scanner.py`: 辞書式比較アルゴリズム（段階1〜4、Entry照合、Pattern照合）
   - `migrations/steps.py`: フェーズ2およびフェーズ5のマイグレーション関数
   - `routers/binding_rules.py`, `routers/node_selectors.py`: CRUD API エンドポイント
   - `workflowParamInjector.ts`: `input_name` 直接使用ロジック
   - `MappingMasterEditModal.tsx`: 3分割モーダルおよび参照元 role 表示 UI
2. **Severed (切断対象)**:
   - ComfyUI サーバー API / WebSocket 通信（固定 JSON フィクスチャで代替）
   - 実ブラウザレンダリング（Vitest / jsdom 環境で UI コンポーネントを検証）
3. **Mock Level**:
   - 内部ビジネスロジック、DB ORM クエリ生成、スキャン関数のモンキーパッチは厳禁。
   - SQLite インメモリ／テンポラリ DB を実体として使用し、整合性制約を真に発効させる。
4. **PBT (Property-Based Testing)**:
   - `backend/tests/integration/legacy/test_workflow_scanner_property.py` に Hypothesis プロパティテストを追加：
     - ランダムな順序で渡された候補ノード群に対して、辞書式ソート関数が常に同一の最優先候補を一意に決定すること。
     - セレクタパターン文字列長および完全一致フラグに基づくスコアリングの単調増加性。
5. **Fault Injection**:
   - 参照中ロールが存在する状態での RuleSet / NodeSelector 削除リクエスト（HTTP 400 Bad Request 返却検証）。
   - 同一 role 文字列の重複 INSERT による SQLite `IntegrityError` 発生検証。
   - 同一 master 下での重複 stage_id および重複 non-NULL selector_id の INSERT による `IntegrityError` 発生検証。
   - スキャン時における候補ノードの重複（同率1位競合）に対する `duplicated` 警告の発生検証。

---

## 5. シナリオ検証 & Red Teaming (正常系・異常系・境界値) [Gate 3 Baseline]

### シナリオ S-1 (AC-1): フェーズ2マイグレーションの無損失データ変換
- **Given**: 既存の旧マスタ定義（`expected_class_types`, `param_name`, `fallback_param_names`, `title_patterns` を保持する `mapping_masters`）を含む DB において。
- **When**: マイグレーション（フェーズ2）が実行されたとき。
- **Then**: 新テーブル（`binding_rule_sets`, `binding_rule_entries`, `node_selectors`, `node_selector_patterns`）が作成され、既存の入力判定・タイトル判定条件が新構造へ無損失で移行され、`mapping_variants.role` に既存の computed_role が永続化され、`MappingVariant` が新定義を参照していること。

### シナリオ S-2 (AC-2): 辞書式スキャン判定と input_name 永続化
- **Given**: `BindingRuleSet` に `(class_type, param_name)` の組が定義された状態でワークフローをスキャンしたとき。
- **When**: ワークフロー内のノードが Entry 条件に一致した場合。
- **Then**: ノードタイトルと `NodeSelectorPattern` の一致段階（完全一致＞部分一致＞セレクタなし）および優先度に基づく辞書式判定により、最適な `(node_id, input_name)` が決定論的に選定され、`WorkflowMapping` に保存されること。

### シナリオ S-3 (AC-3): 複数ステージ競合と具体性優先解決
- **Given**: 同一 Master で複数の Stage / Variant が存在する状態で、同一ノードが複数ステージのセレクタに一致した場合。
- **When**: スキャンを実行したとき。
- **Then**: より具体的に一致した側のステージ（完全一致 ＞ 部分一致、部分一致同士なら長いパターン文字列）に割り当てられ、`StageMaster.sort_order` 順に確定された `(node_id, input_name)` は残りの Variant の候補から除外されること。

### シナリオ S-4 (AC-4): フロントエンド値適用の input_name 直接使用
- **Given**: スキャンにより確定されたワークフローにおいて。
- **When**: 生成パラメータ注入（`workflowParamInjector` / `seedInputResolver`）を実行したとき。
- **Then**: `WorkflowMapping` に保存された `input_name` が直接使用され、実行時フォールバック再解決なしに正しいノード・入力スロットへ値が注入されること。

### シナリオ S-5 (AC-5): 共有定義の参照元 role 表示と削除ガード・複製編集
- **Given**: 設定画面において共有されている `BindingRuleSet` または `NodeSelector` を編集・削除しようとしたとき。
- **When**: 編集画面を開くまたは削除操作を行ったとき。
- **Then**: その定義を参照している role の一覧が表示され、参照中の削除は拒否（HTTP 400）されるか、または「複製して編集」により安全に切り離せること。

### シナリオ RT-1 (AC-6): 重複 role 文字列登録の物理制約拒否
- **Given**: フェーズ5の旧経路削除と制約付与が完了した DB において。
- **When**: `mapping_variants` テーブルに同一の role 文字列（NOT NULL）を持つレコードを重複登録しようとしたとき。
- **Then**: `mapping_variants` テーブルの `UNIQUE(role)` 制約により重複が拒否されエラー（`sqlite3.IntegrityError`）となること。

### シナリオ RT-2 (AC-7): 複合一意制約および NULL セレクタ共存の検証
- **Given**: フェーズ5の旧経路削除と制約付与が完了した DB において。
- **When**: 同一の `master_id` に対して重複する `stage_id` または重複する non-NULL の `node_selector_id` を持つ `mapping_variants` レコードを登録しようとしたとき。
- **Then**: `mapping_variants` テーブルの `UNIQUE(master_id, stage_id)` および `UNIQUE(master_id, node_selector_id)` 制約により重複が拒否され、`node_selector_id` が NULL の Variant のみ同一 `master_id` 下で複数共存できること。

---

## 6. リスク評価 & Full-Suite Fallback トリガー分析

### 6.1 リスク分類 (Risk Classification)
- **判定**: `high` (DB スキーマ変更、テーブル再作成マイグレーション、公開 REST API / OpenAPI コントラクト更新)
- **根拠**:
  - `mapping_masters`, `mapping_variants`, `workflow_mappings` の主要テーブル構造および制約（UNIQUE / NOT NULL）の変更を伴う。
  - 新規テーブル 4 つ（`binding_rule_sets`, `binding_rule_entries`, `node_selectors`, `node_selector_patterns`）を追加し、既存データの無損失移行を行う。
  - バックエンドスキャナの判定アルゴリズムおよびフロントエンドのパラメータ注入という基幹パイプラインの刷新を含む。
  - 上記のいずれも SDD ガバナンスにおける High-Risk 対象（DBスキーマ、マイグレーション、パブリックコントラクト）に該当する。

### 6.2 Full-Suite Fallback トリガー (強制全スイート実行条件)
本 PBI は High-Risk に分類されるため、**V1 Baseline (Default: 変更影響サブシステムの逐次・完全新規実行)** が強制適用される。
さらに、以下のいずれかの事象が検知された場合、即座にフォールバックが発動し、全サブシステムの全テストスイート（`Gate 2: Full Suite`）を逐次再実行する：
1. マイグレーション実行中にテーブルスキーマの不整合や制約の不備が検出された場合。
2. OpenAPI スキーマ（`openapi.json`, `docs/openapi.yaml`）とバックエンド実装、またはフロントエンド型定義（`types.ts`）に乖離が発生した場合。
3. テストコレクションの不一致、想定外のテストスキップ（skip）、または偽陽性アサーションが検出された場合。
4. スキャンロジックにおいて、既存の fixture ワークフローに対する後方互換性リグレッションが検出された場合。

---

## 7. ツール主導監査 (Tool-Driven Audit)
- **監査コマンド**: `python helpers\local_model_adapter.py --context-length 32768 ba-audit --audit-kind design --audit-package "<PKG_JSON>" docs/design/REQ-417.md docs/design/REQ-417-test-plan.md docs/backlog/task/active/REQ-417-T1.md docs/backlog/task/active/REQ-417-T2.md docs/backlog/task/active/REQ-417-T3.md docs/backlog/task/active/REQ-417-T4.md docs/backlog/task/active/REQ-417-T5.md`
- **アンロード**: `python helpers\local_model_adapter.py unload`
