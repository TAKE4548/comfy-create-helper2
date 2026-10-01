# REQ-303 実行可能テスト計画: Animaモードにおけるピリオド区切りタグチップ分割とプロンプト結合制御

## 1. 自動テスト (CLI Verification)

### 1-1. 単体テスト (TDD / Unit Tests)
- **コマンド**:
  ```bash
  cd frontend; npx vitest run src/components/TagChipEditor/__tests__/useChipParser.test.ts
  cd frontend; npx vitest run src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx
  cd frontend; npx vitest run src/store/__tests__/slices/multiSetSlice.test.ts
  ```
- **検証項目**:
  - `useChipParser.test.ts`:
    - `parseToChips` で `isAnimaMode: true` 時の `.` 区切り分割および末尾 `.` 保持。
    - `(tag:1.2)` や `((test:1.5))` のような括弧ネスト内の `.` 保護。
    - 小数点 `1.5` が区切りとして誤認されないこと。
    - `..` や `, .` などの連続区切り記号による空チップ除外。
    - `chipsToString` での動的空白結合（直前チップが `.` 終端の場合は `" "`、それ以外は `", "`）。
    - 無効化チップ（`enabled: false`）の除外と空白結合の整合性。
    - `isAnimaMode: false` 時の完全な後方互換性（カンマ区切りおよび一律 `", "` 結合）。
  - `TagChipEditor.test.tsx`:
    - `TagInput` での `.` 入力によるタグ確定。
    - 複数センテンスのペースト時のチップ一括生成。
    - テキスト入力モード（textarea）との相互切替におけるデータ整合性（ラウンドトリップ）。
  - `multiSetSlice.test.ts`:
    - `getEffectiveParamValues` における `isAnimaMode` 伝播とプロンプト結合結果の検証。

### 1-2. 型チェック (Typecheck Baseline)
- **コマンド**:
  ```bash
  cd frontend; npm run typecheck
  ```
- **期待値**: 0 errors。

### 1-3. 全体テストスイート (Full Test Suite Baseline)
- **コマンド**:
  ```bash
  cd frontend; npm test
  ```
- **期待値**: 0 failures。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2-1. シナリオ検証パス
1. **シナリオ 1: Animaモードでの手動入力確定 (AC-1)**
   - 条件: `isAnimaMode: true`
   - 操作: `TagInput` に `1girl.` と入力。
   - 期待値: 入力確定時に `1girl.`（末尾ピリオド保持）というタグチップが1つ生成され、入力欄がクリアされる。
2. **シナリオ 2: 複合デリミタを含むテキストペースト (AC-2, AC-3)**
   - 条件: `isAnimaMode: true`
   - 操作: `1girl, solo. red dress. (tag:1.2), masterpiece` をペースト。
   - 期待値: 5つのチップ `1girl` / `solo.` / `red dress.` / `(tag:1.2)` / `masterpiece` に正しく分割され、空チップが発生しないこと。
3. **シナリオ 3: 送信プロンプト平文シリアライズ (AC-4, AC-5)**
   - 条件: `isAnimaMode: true`
   - 操作: `masterpiece`（有効）、`1girl.`（有効）、`bad tag`（無効）、`red dress.`（有効）のチップ列を平文変換。
   - 期待値: `masterpiece, 1girl. red dress.` となり、ピリオドの後は半角スペース1文字、カンマの後はカンマ空白で結合され、無効チップは除外される。
4. **シナリオ 4: 通常モード（非Animaモード）との互換性 (AC-6)**
   - 条件: `isAnimaMode: false`
   - 操作: `1girl. red dress` を入力・パースし、シリアライズ。
   - 期待値: `.` では分割されず、チップ間結合は一律 `", "` で行われる。
5. **シナリオ 5: テキストモード相互切替 (AC-7)**
   - 条件: `isAnimaMode: true`
   - 操作: チップ列からテキストエリアモードに切り替え、再度チップモードに復帰。
   - 期待値: チップの構造・ピリオド・カンマ関係が劣化なく復元される。

---

## 3. Red Teaming (境界値・異常系検証)

### 3-1. 境界値・異常系テストケース
- **RT-1: 連続区切り記号の入力 (Boundary / Spam Input)**
  - 入力値: `"hello.... world,,  ..  ,, .  test."`
  - 期待値: 例外をスローせず、`"hello."`、`"world"`、`"test."` の3チップのみが抽出され、空文字や `.` 単独のゴミチップが生成されないこと。
- **RT-2: 文中の小数点および単位表記 (Decimal / Unit Protection)**
  - 入力値: `"width 1.5 ratio. height 2.0 meter."`
  - 期待値: `1.5` や `2.0` のピリオドでは分割されず、`"width 1.5 ratio."` と `"height 2.0 meter."` の2チップに正しく分割されること。
- **RT-3: 未閉じ・不正な括弧ネスト (Unbalanced Parentheses)**
  - 入力値: `"((tag:1.2. unfinished bracket"`
  - 期待値: 無限ループや構文エラーを起こさず安全に処理が完了すること。
- **RT-4: 全チップ無効化または空配列 (Empty / All-disabled State)**
  - 入力値: 有効チップが0件の状態で `chipsToString` を呼び出し。
  - 期待値: 前後に余分なスペースやカンマがつかず、厳密に空文字列 `""` を返却すること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **BA Audit**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py ba-audit`
- **QA Audit**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py qa-audit`
- **Pre-commit Linter**: `python ${GLOBAL_SCRIPTS}/pre_commit_linter.py`
