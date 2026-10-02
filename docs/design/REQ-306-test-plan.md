# REQ-306 実行可能テスト計画 (Test Plan)

## 1. 自動テスト (CLI Verification Baseline)
### 1.1 型チェック (Gate 1)
- **コマンド**: `cd frontend; npm run typecheck`
- **期待値**: TypeScript エラー 0 件 (終了コード 0)

### 1.2 単体テスト (TDD / Gate 2)
- **コマンド**:
  - `cd frontend; npx vitest run src/store/__tests__/slices/multiSetSlice.test.ts`
  - `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.test.ts`
  - `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/DesktopLayout.tabs.test.tsx`
  - `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx`
- **期待値**: 全テストケース PASS

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 シナリオ 1: Animaモードでのタブ切替時のチップ分割維持 (AC-1)
- **前提**: `isAnimaMode: true`。Set 1 の `Main_Positive_Prompt` に `1girl., solo., red dress.` の3チップが設定されている。
- **操作**: プリセットタブを Set 2 に切り替えた後、再度 Set 1 に戻す。
- **検証項目**: Set 1 の `promptChips` が単一チップ `["1girl., solo., red dress."]` に結合されず、`["1girl.", "solo.", "red dress."]` の3チップとして維持されていること。

### 2.2 シナリオ 2: 画面遷移（History往復）後のチップ分割維持 (AC-2)
- **前提**: `isAnimaMode: true`。ピリオド区切りのタグチップが設定された状態で Generate 画面を表示中。
- **操作**: ナビゲーションメニューから History 画面へ遷移し、再度 Generate 画面へ復帰する。
- **検証項目**: 再マウント後の `TagChipEditor` において、タグチップがピリオド区切りの分割状態を維持してレンダリングされること。

### 2.3 シナリオ 3: ワークフロー選択とグローバルストア同期 (AC-3)
- **前提**: BaseModel が "Anima" であるワークフローを選択。
- **操作**: `useWorkflowManagement` がワークフローを読み込む。
- **検証項目**: `useGenerationStore.getState().isAnimaMode` が `true` に同期されていること。通常モデル選択時は `false` に同期されること。

### 2.4 シナリオ 4: Animaモード初期表示時のチップモード基本化とモード維持 (AC-4)
- **前提**: `isAnimaMode: true`。Anima対応ワークフローを選択。
- **検証項目 (初期状態)**: 初期表示時点で `TagChipEditor` がテキストモード（textarea）ではなくタグチップモード（TagChip一覧）としてレンダリングされること。
- **操作**: ユーザーがトグルボタンをクリックして「テキストモード」へ明示的に切り替える。その後、プリセットタブ切替（Set 1 → Set 2 → Set 1）または別画面への遷移を行う。
- **検証項目 (切替後維持)**: 画面復帰後もユーザーの選択したテキストモード（textarea）が維持されること。再度チップモードへ戻した場合も同様にチップモードが維持されること。

### 2.5 シナリオ 5: 通常モード（非Animaモード）の後方互換性 (AC-5)
- **前提**: 通常モデル（例: SD 1.5, SDXL）のワークフローを選択（`isAnimaMode: false`）。
- **操作**: カンマ区切りのタグチップ（例: `1girl, solo, red dress`）を設定し、タブ切替および保存を実行。
- **検証項目**: 従来通りのカンマ区切りによるチップ分割・文字列結合が行われ、既存の動作に一切の影響を与えないこと。

### 2.6 シナリオ 6: Animaモードでのタグ強度フォーマット正常化 (AC-6)
- **前提**: `isAnimaMode: true`。ピリオド区切りタグ `1girl.` または `1girl` がチップとして存在。
- **操作**: サブメニューまたはステップボタン（+0.5等）で強度を 1.5 に変更。
- **検証項目**:
  - チップ内部のテキストが `(1girl:1.5).` となり、括弧内末尾にピリオドが入らないこと。
  - 後続タグ（例: `solo.`）と結合されたプロンプト文字列が `(1girl:1.5). solo.` となり、`, ` ではなく空白区切りになること。
  - 強度を 1.0 に戻した際、`1girl.` として正しく復帰すること。

---

## 3. Red Teaming (境界値・異常系テスト)

### 3.1 境界ケース 1: 数値小数点を含むプロンプト（例: `weight: 1.5, girl.`）
- **操作**: ピリオドが数値の小数点（`1.5`）として含まれるテキストをパース。
- **期待値**: 小数点は文区切りのピリオドとして誤分割されず、数値部分が壊れないこと。

### 3.2 境界ケース 2: 空白・ピリオドのみの連続入力（例: `...   ..`）
- **操作**: 空または無効なピリオド連続文字列をプリセットから読み込み。
- **期待値**: クラッシュせず、空のチップ配列または適切なサニタイズが行われること。

### 3.3 異常系ケース 3: ストアの未初期化状態での `loadPresetData`
- **操作**: `isAnimaMode` が undefined の状態で `loadPresetData` を実行。
- **期待値**: 例外をスローせず、`false` として安全にフォールバック処理されること。

### 3.4 境界ケース 4: 旧フォーマット `(1girl.:1.2)` や `((tag:1.1):1.2).` のパースと修復
- **操作**: 過去に誤って括弧内にピリオドが含まれた文字列 `(1girl.:1.2)` をパース・強度再設定。
- **期待値**: `parseTagWeight` がベーステキストを `1girl.` として適切に抽出し、再フォーマット時に `(1girl:1.2).` へ自動修復されること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit`
- **合否判定**: 重大度 High/Medium 指摘 0 件

