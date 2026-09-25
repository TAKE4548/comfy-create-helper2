# REQ-283 実行可能テスト計画: ProfileBulkEditModal のドメイン計算分離と 2 タブ階層化・セクション化

## 0. 前提条件・判定基準マトリクス (Standardized Verification Matrix)

| 検証項目 | 対象モジュール | 判定基準 (Explicit DOM / Payload Criteria) | 対応AC |
|---|---|---|---|
| **純粋ロジック単体テスト** | `ProfileBulkEditModal/utils.ts` | `parseTagWeight`, `formatTagWithWeight`, `computeCommonTags`, `computeCommonLoras` に対する Vitest 単体テストが 100% PASS すること | AC-2 |
| **一括編集コンポーネント挙動** | `ProfileBulkEditModal/index.tsx` | 検索置換、共通タグ強度変更(+0.1/-0.1)・削除、LoRAスタック差分編集、パラメータパッチ適用時に `expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ promptOps: expect.any(Array), paramPatch: expect.any(Object) }))` 等のスキーマ合致オブジェクトが渡されること | AC-1 |
| **ファイル行数制限遵守** | `ProfileBulkEditModal/**` | 分割後の各ファイル（`index.tsx`, `types.ts`, `utils.ts`, `BulkEditConfirmView.tsx`, 各タブセクション）がすべて 250 行以下であること（終了コード 0、違反ファイル 0 件） | AC-3 |
| **静的型検査 (Gate 1)** | `frontend` 全体 | `cd frontend && npm run typecheck`（`tsc -b --noEmit`）がエラー 0 件（ExitCode = 0）で PASS すること | AC-4 |
| **全自動テスト回帰検証 (Gate 2)**| `frontend` 全体 | `cd frontend && npx vitest run` で既存テストおよび新規テスト全件が PASS すること（ExitCode = 0） | AC-5 |

---

## 1. 自動テスト (CLI Verification)

### 1-1. `utils.ts` ドメイン計算単体テスト (AC-2)
- **実行ディレクトリ**: `frontend`
- **コマンド**: `npm run test -- src/components/ProfileBulkEditModal/__tests__/utils.test.ts`
- **合格判定基準 (Explicit Pass Criteria)**:
  - 終了コード: `ExitCode = 0`
  - テスト結果: 全件 PASS
  - **検証ケース**:
    1. `parseTagWeight`: `(tag:1.2)` -> `{ base: 'tag', weight: 1.2, isParenthesized: true }`
    2. `parseTagWeight`: `(tag)` -> `{ base: 'tag', weight: null, isParenthesized: true }`
    3. `parseTagWeight`: `tag` -> `{ base: 'tag', weight: null, isParenthesized: false }`
    4. `formatTagWithWeight`: `weight === null` または `1.0` で括弧なしベース名、それ以外で `(base:weight)` を返却
    5. `computeCommonTags`: 複数プリセット間で共通するタグの積集合を大文字小文字不問で抽出
    6. `computeCommonTags`: プリセットが空、または共通タグが存在しない場合は空配列 `[]` を返却（Red Teaming）
    7. `computeCommonLoras`: 複数プリセット間で共通する LoRA スロットを抽出
    8. `computeCommonLoras`: カウント不整合や未登録スロットのフォールバック

### 1-2. モーダル既存テスト互換性検証 (AC-1, AC-5)
- **実行ディレクトリ**: `frontend`
- **コマンド**: `npm run test -- src/components/__tests__/ProfileBulkEditModal.test.tsx`
- **合格判定基準**:
  - 終了コード: `ExitCode = 0`
  - 既存の 15 テストケース（検索置換、タグ削除、LoRA差分、パラメータ適用、定数フォールバック等）が全件 100% PASS すること。

### 1-3. 最大行数制限検証 (AC-3)
- **実行ディレクトリ**: `.`
- **コマンド**:
  ```powershell
  Get-ChildItem -Path frontend/src/components/ProfileBulkEditModal -Recurse -Filter *.ts* | ForEach-Object { [PSCustomObject]@{ File = $_.Name; Lines = (Get-Content $_.FullName).Count } }
  ```
- **合格判定基準**:
  - 対象ディレクトリ内のすべてのファイル行数が `Lines <= 250` であること。

### 1-4. 静的型チェック (AC-4)
- **実行ディレクトリ**: `frontend`
- **コマンド**: `npm run typecheck`
- **合格判定基準**:
  - 終了コード: `ExitCode = 0`、エラー 0 件。

---

## 2. 結合・シナリオ検証 (Integration Verification)

### 2-1. GeneratePage との Props 結合検証
- **実行ディレクトリ**: `frontend`
- **コマンド**: `npm run test -- src/components/__tests__/ProfileBulkEditModal.test.tsx src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx`
- **合格判定基準**:
  - `ProfileBulkEditModal` のモジュール解決エラーがなく、Props（`selectedPresets`, `mappingMasters`, `comfyObjectInfo` 等）が正常にバインドされること。

---

## 3. Red Teaming (境界値・異常系検証)

### 3-1. 異常系シナリオ: 空プリセット / 特殊文字タグ / ゼロ件パラメータ
- **テスト内容**:
  1. `selectedPresets: []`（空配列）が渡された際、クラッシュせずに「0 件のプリセットに適用」と表示され、共通タグ・共通LoRAが空になること。
  2. 多重括弧や特殊文字を含むタグ（例: `(((masterpiece:1.4))), <lora:test:0.8>`）が `parseTagWeight` に入力された際、正規表現エラーや例外をスローせず安全にパースされること。
  3. `mappingMasters` に `textarea` や `lora_stack` が 1 件も含まれない場合、各タブで空表示メッセージが描画され未捕捉例外が発生しないこと。
