# REQ-320 実行可能テスト計画 (Test Plan)

## 1. 自動テスト (CLI Verification)

### Gate 1: 静的型検査 & Lint
- **Frontend Typecheck**:
  `cd frontend; npm run typecheck`
  - 期待値: 0 エラー (Exit code 0)。TypeScript 型定義の不整合がないこと。
- **Backend Typecheck**:
  `backend\.venv\Scripts\python -m mypy backend`
  - 期待値: 0 エラー (Exit code 0)。Pydantic v2 スキーマおよび SQLAlchemy モデル注釈の整合性。

### Gate 2: 単体テスト実行 (Unit Test Baseline)
- **Frontend Unit Tests**:
  `cd frontend; npx vitest run src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx`
  - 期待値: 全テスト PASS。以下のテストケースを包含：
    1. `it('displays resolved positive and negative node info for selected workflow')` (AC-1)
    2. `it('opens NodeRemapModal and updates workflow mappings via workflowsApi.update')` (AC-2)
    3. `it('renders Negative Prompt TagChipEditor and auto-loads default value from workflow preset')` (AC-3)
    4. `it('injects raw_prompt to positive node and negative_prompt to negative node correctly in injectPromptAndSeed')` (AC-4)
    5. `it('persists prompt_negative to DatasetProject and restores it upon reload')` (AC-5)
- **Backend Unit Tests**:
  `backend\.venv\Scripts\python -m pytest backend/tests/test_dataset_router.py backend/tests/test_dataset_db.py -v`
  - 期待値: 全テスト PASS。`prompt_negative` の CRUD 永続化とマイグレーションの正常動作。

---

## 2. 結合・E2E & Red Teaming 検証 (Integration & Scenario Verification)

### シナリオ検証 (AC Compliance)
- **AC-1 (ノードマッピング明示)**:
  - 操作: Step 1 でワークフローを選択。
  - 期待結果: ワークフローの `mappings` に基づき Positive 対象ノード（例: Node ID 6, CLIPTextEncode）および Negative 対象ノード（例: Node ID 7, CLIPTextEncode）が情報バッジとして表示される。
- **AC-2 (シームレスリマッピング)**:
  - 操作: 「ノード再割当」をクリックし、モーダルで Positive を Node 12、Negative を Node 15 に変更して保存。
  - 期待結果: `workflowsApi.update` が実行され、他ロールを維持したままワークフローのマッピングが更新され、バッジ表示が即座に切り替わる。
- **AC-3 (Negative Prompt 編集)**:
  - 操作: Step 1 の「Negative プロンプト」入力枠を確認し、タグ追加（`blurry`）、タグ削除、テキスト編集を実施。
  - 期待結果: TagChipEditor でスムーズに編集でき、文字数カウントが表示される。
- **AC-4 (ComfyUI 個別注入投入)**:
  - 操作: バッチ投入を実行。
  - 期待結果: 生成された ComfyUI プロンプトペイロードにおいて、Positive ノードの inputs.text に DOE 合成プロンプトが、Negative ノードの inputs.text に設定された負プロンプトが正確に個別注入されている。
- **AC-5 (プロジェクト保存・復元)**:
  - 操作: プロジェクトを保存し、ページリロードまたは再ロードを実施。
  - 期待結果: 保存された Negative プロンプトが正しく復元される。

### Red Teaming (境界値・異常系検証)
- **テストケース R-1 (存在しないノード ID のマッピング)**:
  - 状況: ワークフロー JSON からマッピング先ノードが外部削除されていた場合。
  - 期待挙動: クラッシュせず、自動探索フォールバック（デフォルトの CLIPTextEncode 検出）が発動し、ユーザーに警告バッジを表示する。
- **テストケース R-2 (テキスト入力ノードが存在しない空ワークフロー)**:
  - 状況: ワークフロー JSON に CLIPTextEncode 等のテキストノードが一切含まれない。
  - 期待挙動: `injectPromptAndSeed` が標準ノード（ID 6, 3）を自動フォールバック生成し、投入エラーを防ぐ。
- **テストケース R-3 (Negative Prompt が空文字列の場合)**:
  - 状況: ユーザーが Negative Prompt をすべてクリアして空にする。
  - 期待挙動: `inputs.text` に `undefined` や `null` ではなく空文字 `""` が注入され、ComfyUI が 400 エラーを出さずに正常受理される。
