# REQ-236 実行可能テスト計画 (Test Plan)

## 1. 自動テスト (CLI Verification)

### 1-1. 新設フロントエンド障害注入 & プロパティテストの実行 (Targeted FE Run)
- **合否判定コマンド**:
  ```bash
  npm --prefix frontend test -- src/pages/GeneratePage/hooks/__tests__/useGenerateAction.fault.test.ts src/pages/GeneratePage/hooks/__tests__/usePromptTranslation.fault.test.ts src/pages/GeneratePage/hooks/__tests__/useLlmAction.fault.test.ts src/components/TagChipEditor/__tests__/useChipParser.property.test.ts --run
  ```
- **機械的合否判定基準 (AI「脳内テスト」抑止)**:
  1. シェル終了コードが `0`（正常終了）であること。
  2. Vitest 出力に `Test Files  4 passed (4)` が含まれること。
  3. 標準出力および標準エラー出力に `FAIL` または `failed` 文字列が一切含まれないこと（`0 failed`）。

### 1-2. 新設バックエンド障害注入 & プロパティテストの実行 (Targeted BE Run)
- **合否判定コマンド**:
  ```bash
  cd backend && pytest tests/test_comfy_proxy_fault.py tests/test_llm_service_fault.py tests/test_workflow_scanner_property.py -v
  ```
- **機械的合否判定基準**:
  1. シェル終了コードが `0` であること。
  2. pytest 出力に `3 passed`（または全テストケース PASSED）が含まれること。
  3. `FAILED` または `ERROR` が 0 件であること。

### 1-3. 全件リグレッション検証 (Full Suite Regression)
- **フロントエンド全件実行**:
  ```bash
  npm --prefix frontend test -- --run
  ```
  - 基準: 終了コード `0`、既存テストおよび新規テスト全件パス。
- **バックエンド全件実行 (ランダム順序検証含む)**:
  ```bash
  cd backend && pytest --randomly-seed=12345
  ```
  - 基準: 終了コード `0`、全件パス、DBコネクションリーク検知（`verify_db_pool_clean`）パス。

---

## 2. 結合・耐障害性検証 (Integration & Red Teaming Verification)

### 2-1. 障害注入・耐障害性シナリオ検証（定量的アサーション基準）

- **シナリオ 1 (ComfyUI HTTP 503 / ネットワーク切断時の UI 復旧)**:
  - 対象: `useGenerateAction.fault.test.ts`
  - 操作: MSW で `/api/comfy/prompt` に対して `503 Service Unavailable` または `HttpResponse.error()` を返却。
  - 期待値:
    - `useGenerationStore.getState().isGenerating` が `false` であること。
    - `useGenerationStore.getState().isBatchSubmitting` が `false` にリセットされていること。
    - `useGenerationStore.getState().errorToast` にエラーメッセージが格納されていること。

- **シナリオ 2 (翻訳API 10秒タイムアウト時の原文保護)**:
  - 対象: `usePromptTranslation.fault.test.ts`
  - 操作: MSW で `/api/translate/prompt` に 10 秒タイムアウト（504 Gateway Timeout または Abort）を注入。
  - 期待値:
    - `result.current.isTranslating` が `false` に復帰すること。
    - `result.current.sourceText` が入力された原文テキストと完全一致し、消去・破損されていないこと。
    - `result.current.error` にタイムアウトエラーメッセージが設定されていること。

- **シナリオ 3 (LLM シーン生成 / 監査 30秒タイムアウト時のロック解除)**:
  - 対象: `useLlmAction.fault.test.ts`
  - 操作: MSW で `/api/audit` および `/api/llm-prompts/scene-generate` に 30 秒タイムアウトを注入。
  - 期待値:
    - `useAuditAction` の `auditStatus` が `'error'` に遷移し、ローディング状態が解除されること。
    - `SceneGeneratorModal` の `isDrafting` が `false` に復帰し、UI の操作不能状態（フリーズ）が防止されること。

- **シナリオ 4 (ComfyUI / LLM プロキシのタイムアウト・不正レスポンス遮断)**:
  - 対象: `test_comfy_proxy_fault.py` & `test_llm_service_fault.py`
  - 操作: respx により `httpx.ConnectTimeout`, `httpx.ReadTimeout`, 不正な非JSONレスポンスを注入。
  - 期待値:
    - `/api/comfy/object_info` は `HTTPException(503)` を送出すること。
    - `/api/comfy/prompt` は `HTTPException(502)` を送出すること。
    - `/api/llm-prompts/scene-generate` は `HTTPException(500)` を送出し、スタックトレースではなく適切な detail を返却すること。

### 2-2. Red Teaming (プロパティベース境界値・ファジング検証)

- **Red Team 1 (TagChipEditor のファジング耐性)**:
  - 対象: `useChipParser.property.test.ts`
  - 手法: `fast-check` により 100 件の任意のランダム文字列（特殊記号、制御コード、Unicode 外字、壊れた括弧）を自動生成。
  - 期待値: `parseToChips`, `chipsToString`, `parseTagWeight`, `formatTagWeight` が一切例外をスローせず、有効タグの順序可逆性が保たれること。

- **Red Team 2 (破損 node JSON に対するスキャナー堅牢性)**:
  - 対象: `test_workflow_scanner_property.py`
  - 手法: `hypothesis` により `_meta` が数値、`class_type` が `None` や辞書、`inputs` が不正型などの極端に破損した JSON を自動生成。
  - 期待値: `scan_workflow` がクラッシュ（`AttributeError` 等）せず、安全に `warnings` を返却すること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **タスクカード自律性監査 (Local Model Audit)**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-236-T1.md
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-236-T2.md
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-236-T3.md
  ```
- **テスト計画客観性監査**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-236-test-plan.md
  ```
- **ガバナンスバリデーション**:
  ```bash
  python ${GLOBAL_SCRIPTS}\workflow_validator.py design-end REQ-236
  python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog/task/active
  ```
