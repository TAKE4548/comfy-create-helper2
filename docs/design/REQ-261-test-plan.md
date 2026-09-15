# REQ-261 実行可能テスト計画: 生成プリセット一括編集モーダルでのサンプラ・スケジューラ選択肢の正常表示

## 0. 前提条件・判定基準マトリクス (Standardized Verification Matrix)

| 検証項目 | 対象コンポーネント | 判定基準 (Explicit DOM / Payload Criteria) | 対応AC |
|---|---|---|---|
| **定数フォールバック表示** | `ProfileBulkEditModal.tsx` | `comfyObjectInfo` が `undefined` または `{}` の際、`select` 内に `<option value="euler">` および `<option value="normal">` が DOM 上にレンダリングされ、総オプション数が `DEFAULT_SAMPLERS.length + 1` および `DEFAULT_SCHEDULERS.length + 1` と一致すること | AC-1, AC-2, AC-3 |
| **ComfyUI 優先表示** | `ProfileBulkEditModal.tsx` | `comfyObjectInfo` が指定された場合、提供された `sampler_name` 配列の要素のみが `<option>` としてレンダリングされること | AC-1, AC-2 |
| **Props 伝達整合性** | `GeneratePage.tsx` | `GeneratePage` のレンダリング時に `<ProfileBulkEditModal comfyObjectInfo={state.comfyObjectInfo}>` として `undefined` ではなく `state.comfyObjectInfo` が渡されること | AC-1, AC-2 |
| **パラメータ適用** | `ProfileBulkEditModal.tsx` | サンプラ・スケジューラを選択して適用時、`onApply` が `toHaveBeenCalledWith(expect.objectContaining({ paramPatch: expect.objectContaining({ sampler_name: 'euler' }) }))` で呼ばれること | AC-4 |

---

## 1. 自動テスト (CLI Verification)

### 1-1. フロントエンド単体テスト
- **実行ディレクトリ**: `frontend`
- **コマンド**: `npm run test -- src/components/__tests__/ProfileBulkEditModal.test.tsx`
- **合格判定基準 (Explicit Pass Criteria)**:
  - 終了コード: `ExitCode = 0`
  - テスト結果: 全件 PASS（既存テスト + 以下の厳密検証ケース）
  - **テストケース 1: オフライン時の定数フォールバック検証 (AC-1, AC-2, AC-3)**
    - `comfyObjectInfo` 未指定の状態でパラメータタブを開く。
    - サンプラ選択チェックボックスをクリックして有効化。
    - `screen.getByDisplayValue('サンプラーを選択…')` の `<select>` 内の `<option>` 一覧を取得し、`DEFAULT_SAMPLERS` の各値（`euler`, `dpmpp_2m` 等）が `HTMLOptionElement` として存在することを `expect(screen.getByRole('option', { name: 'euler' })).toBeInTheDocument()` で検証。
    - スケジューラも同様に `DEFAULT_SCHEDULERS` の各値（`normal`, `karras` 等）が `<option>` として存在することを検証。
  - **テストケース 2: ComfyUI object_info 優先適用と onApply ペイロード検証 (AC-1, AC-2, AC-4)**
    - `mockComfyObjectInfo` を渡してレンダリング。
    - サンプラで `dpmpp_2m` を選択、スケジューラで `karras` を選択。
    - 「適用する」を実行し、`expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ paramPatch: { sampler_name: 'dpmpp_2m', scheduler: 'karras' } }))` を厳密検証。

### 1-2. 型チェック (Type Integrity Verification)
- **実行ディレクトリ**: `frontend`
- **コマンド**: `npx tsc --noEmit`
- **合格判定基準**:
  - 終了コード: `ExitCode = 0`
  - エラー 0 件（Props 追加および定数 export/import における型不整合ゼロの証明）。

---

## 2. 結合・E2E検証 (Integration & Scenario Verification)

### 2-1. GeneratePage と ProfileBulkEditModal の Props 結合検証
- **実行ディレクトリ**: `frontend`
- **コマンド**: `npm run test -- src/components/__tests__/ProfileBulkEditModal.test.tsx src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx`
- **合格判定基準**:
  - 終了コード: `ExitCode = 0`
  - `GeneratePage` のレンダリングツリーにおいて、`ProfileBulkEditModal` に `comfyObjectInfo` が正しくバインドされ、React 警告（`Warning: Failed prop type` 等）および未捕捉例外（`TypeError` 等）が 0 件であること。

---

## 3. Red Teaming (境界値・異常系検証)

### 3-1. 異常系シナリオ: ComfyUI 未接続・object_info 破損シミュレーション (AC-3 検証)
- **テスト手順**:
  - `comfyObjectInfo={}`（空オブジェクト）、および `comfyObjectInfo={{ KSampler: { input: {} } }}`（必須キー欠落オブジェクト）を渡してモーダルをレンダリングする。
- **合格判定基準**:
  - `renderWithClient` 実行時に `TypeError: Cannot read properties of undefined` 例外が一切スローされないこと（`expect(() => ...).not.toThrow()`）。
  - フォールバック定数（`DEFAULT_SAMPLERS` / `DEFAULT_SCHEDULERS`）の選択肢が 100% 描画され、空ドロップダウンにならないこと。

### 3-2. 境界値シナリオ: 空文字列選択によるパラメータ解除検証
- **テスト手順**:
  - 一度選択したサンプラドロップダウンで初期値「サンプラーを選択…」（`value=""`）を再選択して「適用する」を実行する。
- **合格判定基準**:
  - `onApply` に渡される `paramPatch` が `{ sampler_name: "" }` となり、UI フリーズや例外なく処理が完了すること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-261-test-plan.md`
- **期待値**: 判定基準の厳密化（DOM検証＋引数ペイロード検証）による客観的監査の合格。
