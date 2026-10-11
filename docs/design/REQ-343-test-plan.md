# REQ-343 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **Frontend コマンド**: `cd frontend; npm run typecheck`
- **Backend コマンド**: `mypy backend`
- **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **Backend ユニットテスト**: `backend\.venv\Scripts\python -m pytest backend/tests/test_req343_workflow_variant_scan.py`
- **Frontend ユニットテスト**:
  - `cd frontend; npx vitest run src/hooks/__tests__/useMasterMappingRows.test.ts`
  - `cd frontend; npx vitest run src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.config.test.ts`
  - `cd frontend; npx vitest run src/components/__tests__/WorkflowModalMultiStage.test.tsx`
- **Full Suite コマンド**:
  - `backend\.venv\Scripts\python -m pytest`
  - `cd frontend; npm test`
- **期待値**: 全テスト PASS (Exit code 0)。脳内推論代用は厳禁。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1 (AC-1: Role×有効ステージの複数ノードマッピング)
- **Given**: Main および Rough の2つのサンプラーステージを含むワークフローJSONを用意
- **When**: ワークフローアップロード画面（`UploadWorkflowModal`）または再スキャン画面（`RescanModal`）を開く
- **Then**:
  - `steps` ロールに対して「Main」と「Rough」の2つのスロットが表示される
  - それぞれのスロットに該当ステージのノード（Main用KSampler, Rough用KSampler）がサジェストされる
  - 異なるノードを割り当てて保存が完了する

### シナリオ 2 (AC-2: 不要な組み合わせの未設定化・オプトアウト)
- **Given**: 多段階ワークフローにおいて、Roughステージには特定のRole（例: positive prompt）が不要な構成
- **When**: 当該ステージスロットのドロップダウンで「未設定」を選択するか、右側のクリアボタン（✕）をクリックする
- **Then**:
  - 当該スロットの node_id が未割り当て（空文字）状態となる
  - 保存ボタンを押下した際、バリデーションエラーが発生せず、未設定のスロットを除外して正常に保存・更新される

### シナリオ 3 (AC-3: 設定画面でのバリアント配線保存と重複master_id許容)
- **Given**: 設定画面（`WorkflowConnectionSection`）にて、同一マスタ（例: steps）に対してMainバリアントとRoughバリアントの両方が設定されたワークフローを開く
- **When**: 配線設定の保存処理または設定JSONのエクスポート/インポートを実行する
- **Then**:
  - `validateConfig` で重複エラーが発生しない
  - `variant_id` が保持された状態でバックエンドに送信され、DBに永続化される

### シナリオ 4 (AC-4: バックエンド /api/workflows/scan のバリアント検出)
- **Given**: バックエンドの `/api/workflows/scan` に複数ステージノードを含むJSONをPOST送信
- **When**: レスポンスを受信
- **Then**:
  - `matched` 配列の各要素に `variant_id`, `stage_id`, `stage_key` が含まれる
  - ステージ別キーワードに基づくスコアリングにより最適なノードが選定されている

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### 異常系 1 (全スロットを「未設定」にした場合の保存耐性)
- **手順**: 全てのスロットに対してクリアボタンを押下し、マッピングが0件の状態でワークフローの作成・更新を実行する。
- **期待結果**: アプリケーションがクラッシュせず、空のマッピングリストとして正常に保存が完了する。

### 異常系 2 (不正なJSONまたはノードが存在しないワークフローのスキャン)
- **手順**: 空のオブジェクト `{}` やノード定義が破損したJSONを `/api/workflows/scan` に送信する。
- **期待結果**: 500エラーとならず、`matched: []`, `warnings: [...]` を安全に返却し、フロントエンドもエラーフォールバックして手動直接入力が可能となる。

### 異常系 3 (旧バージョン形式の設定JSONインポートの互換性)
- **手順**: `variant_id` を持たないレガシーな設定JSON（旧形式の `mappings: [{master_id: 1, node_id: "6"}]`）をインポートする。
- **期待結果**: `validateConfig` でエラーとならず正常に読み取れ、プレビューおよび適用が成功する。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py qa-audit docs/design/REQ-343-test-plan.md`
- **アンロード**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py unload`

