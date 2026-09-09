# REQ-235 実行可能テスト計画 (Test Plan)

## 1. 自動テスト (CLI Verification)

### 1-1. 新設コンポーネント・画面テストの実行 (Targeted Run)
- **合否判定コマンド**:
  ```bash
  npm --prefix frontend test -- src/pages/__tests__/LoRAsPage.test.tsx src/pages/__tests__/TagsPage.test.tsx src/components/__tests__/LoraModals.test.tsx src/components/__tests__/TagSetModals.test.tsx src/components/__tests__/CategoryManagerModal.test.tsx src/components/__tests__/BypassSettingsModal.test.tsx src/components/__tests__/ParamSyncModal.test.tsx --run
  ```
- **機械的合否判定基準 (AI「脳内テスト」抑止)**:
  1. シェル終了コードが `0`（正常終了）であること。
  2. Vitest 出力に `Test Files  7 passed (7)` が含まれること。
  3. 標準出力および標準エラー出力に `FAIL` または `failed` 文字列が一切含まれないこと（`0 failed`）。

### 1-2. フロントエンド全件リグレッション検証 (Full Suite Verification)
- **合否判定コマンド**:
  ```bash
  npm --prefix frontend test -- --run
  ```
- **機械的合否判定基準**:
  1. シェル終了コードが `0` であること。
  2. Vitest 出力に `Test Files  61 passed (61)`（既存 54 ファイル + 新規 7 ファイル）が含まれること。
  3. テスト全体の合格数が `Tests  >600 passed` であり、`failed` が 0 件であること。

---

## 2. 結合・耐障害性検証 (Integration & Red Teaming Verification)

### 2-1. 画面・モーダル統合シナリオ検証（定量的アサーション基準）

- **シナリオ 1 (LoRAsPage 複合検索 & 一括操作)**:
  - 初期表示で `MOCK_LORAS` 2件が表示されること（`screen.getByText('lora_alpha')`, `screen.getByText('lora_beta')`）。
  - 検索入力（`#lora-search`）に "alpha" を入力すると、`lora_alpha` のみ表示され、`lora_beta` は DOM から除外されること（`queryByText('lora_beta') === null`）。
  - チェックボックス選択で MultiSelectToolbar が出現し、一括削除で `window.confirm` 承認後に `lorasApi.delete(1)` が呼び出されること。

- **シナリオ 2 (TagsPage 一覧 & 並び替え)**:
  - `MOCK_TAG_SETS` の描画時、`+1 Subsets` バッジ（サブセット有）が表示されること。
  - DndContext の `onDragEnd` イベント（ID 1 から ID 2 へのドラッグ）発生時、`tagSetsApi.reorder([2, 1])` が呼び出されること。

- **シナリオ 3 (LoraModals 自動補完 & トリガーワードセット)**:
  - ファイルパス入力にフォーカス時、サジェストリスト（2件）が表示されること。
  - 未登録モデル `models/loras/available_model.safetensors` をクリックすると、ファイルパスおよびモデル名入力欄に `available_model` が自動設定されること。
  - 「+ Add Set」ボタンクリックでトリガーワードセット入力行が 1 件追加され、ゴミ箱アイコンクリックで該当行が削除されること。

- **シナリオ 4 (TagSetModals サブセット管理)**:
  - 「+ Add Subset」ボタンクリックでサブセット入力フォーム（名前・タグ）が 1 件追加され、削除ボタンで除外されること。

- **シナリオ 5 (CategoryManagerModal インライン編集 & 削除警告)**:
  - 新規作成入力に入力して送信時、`api.create('NewCat')` が呼び出されること。
  - 編集ボタンクリックでインライン入力に切り替わり、保存で `api.update(1, 'UpdatedCat')` が呼び出されること。

- **シナリオ 6 (BypassSettingsModal & ParamSyncModal ストア同期)**:
  - `BypassSettingsModal`: Escape キー押下で `onClose` コールバックが 1 回呼び出されること。
  - プロファイル作成実行時、`useGenerationStore.getState().createBypassProfile` が呼び出されること。

### 2-2. Red Teaming (異常系・境界値検証)

- **Red Team 1 (登録済みモデルの選択遮断)**:
  - 対象: `LoraModals.test.tsx`
  - 操作: `is_registered: true` である `models/loras/registered_model.safetensors` をクリック。
  - 期待値: フォームの `model_name` および `file_path` が変更されず空のままであること（`expect(screen.getByPlaceholderText('my_awesome_lora')).toHaveValue('')`）。

- **Red Team 2 (カテゴリ削除ダイアログ キャンセル時の保護)**:
  - 対象: `CategoryManagerModal.test.tsx`
  - 操作: `vi.spyOn(window, 'confirm').mockReturnValue(false)` を設定し、削除ボタンをクリック。
  - 期待値: `api.delete` が一切呼び出されないこと（`expect(api.delete).not.toHaveBeenCalled()`）。

- **Red Team 3 (ParamSyncModal における型不一致スレーブ候補の除外)**:
  - 対象: `ParamSyncModal.test.tsx`
  - 操作: `master_role` に整数型ロール `seed` (`input_type: 'int'`) を選択。
  - 期待値: 文字列型ロール `prompt` (`input_type: 'string'`) がスレーブ候補リストに表示されないこと（`expect(screen.queryByText('prompt')).not.toBeInTheDocument()`）。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **タスクカード自律性監査 (Local Model Audit)**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-235-T1.md
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-235-T2.md
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-235-T3.md
  ```
- **ガバナンスバリデーション**:
  ```bash
  python ${GLOBAL_SCRIPTS}\workflow_validator.py design-end REQ-235
  python ${GLOBAL_SCRIPTS}\backlog_linter.py
  python ${GLOBAL_SCRIPTS}\artifact_linter.py <task_dir>
  ```
