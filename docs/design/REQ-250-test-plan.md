# REQ-250 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 フロントエンド 単体テスト (Vitest)
- **コマンド**: `npm --prefix frontend test frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx frontend/src/store/__tests__/slices/multiSetSlice.test.ts`
- **判定基準 (Exit Code & Assertions)**:
  - テストプロセス終了コード: `0`
  - 失敗数: 0件
  - **個別検証要件**:
    1. `setAllPromptChips`:
       - `useGenerationStore.getState().setAllPromptChips(chips)` を実行した際、ストアの `promptChips` および `activeSet.promptChips` が与えられた全ロールのチップ配列で一括更新されること。
    2. `handleBulkEditApply` におけるアクティブプリセット即時反映:
       - 現在アクティブなプリセットに対して一括編集（プロンプト上書き、追加等）を実行した際、`workflowPresetsApi.update` 呼び出し後にストアの `promptChips` が即座に最新チップ配列へ更新されること。
       - `useGenerationStore.getState().getEffectiveParamValues()` が一括編集後の最新文字列を返却すること。
    3. `handleBulkEditApply` における非アクティブ開いているタブの同期:
       - 複数開いているタブ（`sets`）に含まれる非アクティブプリセットが一括編集対象となった場合、`sets` 配列内の該当プリセットの `paramValues` および `promptChips` が更新されること。
       - タブ切り替え時に編集前の古いプロンプトや古いチップ配列が表示されないこと。

---

## 2. 結合・UI動作検証 (Integration & Manual Verification)

- **対象画面**: GeneratePage (`http://localhost:5173/generate`)
- **検証手順**:
  1. GeneratePage を開き、プリセット「Set 1」を選択（タブアクティブ）。Positive Prompt に `masterpiece, 1girl, solo` を入力・保存。
  2. プリセット管理パネルを開き、「Set 1」のチェックボックスをオンにして「一括編集」ボタンをクリック。
  3. ProfileBulkEditModal で「サフィックス追加」を選択し、`, high quality` を指定して「適用」をクリック。
  4. プリセット管理パネルを閉じ、メイン画面に戻る。
- **定量的合格条件**:
  - `TagChipEditor` のチップ表示に `high quality` が即時追加されていること（別のタブへ切り替え・復帰の操作を一切行わずに確認）。
  - 「生成」ボタンを押下した際、送信されるプロンプトに `high quality` が含まれていること。
  - 複数タブ（例: Set 1 と Set 2）を開いた状態で一括編集を行った場合、Set 2 のタブをクリックして開いた際にも編集後の最新チップが表示されること。

---

## 3. Red Teaming (境界値・異常系検証)

| シナリオ | 入力・条件 | 期待される定量的挙動 |
|---|---|---|
| **シナリオ 1: 空プロンプトへの一括編集** | プロンプトが空文字のプリセットに対して prefix / suffix を適用 | パースエラーやクラッシュが発生せず、追加された文字列のみの単一チップが正常生成されること。 |
| **シナリオ 2: 全タグ削除 (remove_tags)** | 既存タグをすべて削除する一括編集操作を実行 | `promptChips` が `{ role: [] }` となり、UI上も全チップが消去され、`getEffectiveParamValues()` が空文字を返却すること。 |
| **シナリオ 3: 非アクティブのみの一括編集** | 現在アクティブでないプリセットのみを選択して一括編集 | アクティブプリセットの `promptChips` に不要な影響を与えず、対象プリセットの `sets` 内データおよびクエリキャッシュのみが正常更新されること。 |
| **シナリオ 4: 重複カンマ・不正なSD記法のタグ** | `(tag::1.2),,, [tag2]` などの変則記法を含むプロンプト | `parseToChips` が例外を投げずに耐性を持ってチップ化し、UIがフリーズしないこと。 |

---

## 4. ガバナンス監査

- `python ${GLOBAL_SCRIPTS}\artifact_linter.py <task_dir>` -> `PASS`
