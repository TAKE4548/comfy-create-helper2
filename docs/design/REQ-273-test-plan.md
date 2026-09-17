# REQ-273 実行可能テスト計画: LoRA・タグセット管理における詳細・編集画面のタグチップ/テキスト切替および操作仕様の統一

## 0. 前提・受け入れ基準マッピング

| AC | 検証項目 | テスト種別 | 判定基準 |
|---|---|---|---|
| **AC-1** | タグセット登録・編集画面の初期チップ表示と切替 | コンポーネント単体/統合 | 初期レンダリングでチップ表示、トグルボタンでテキストモード切替可能 |
| **AC-2** | タグセット登録・編集画面のチップ操作（編集・並び替え・追加・削除） | コンポーネント統合 | `TagChipEditor` のチップ追加・削除・ドラッグ並び替えが動作し、親フォームに反映される |
| **AC-3** | LoRA登録・編集画面の初期チップ表示と切替・編集 | コンポーネント統合 | Trigger Word Sets 入力欄が初期チップ表示、トグル切替および編集・並び替えが可能 |
| **AC-4** | タグセット詳細画面の初期チップ表示、切替、閲覧専用ガード | コンポーネント単体/統合 | 初期表示チップ、トグルでテキスト表示切替可能。並び替えドラッグや削除×ボタン・インライン編集が存在しない |
| **AC-5** | LoRA詳細画面の初期チップ表示、切替、閲覧専用ガード | コンポーネント単体/統合 | Trigger Word Sets が初期表示チップ、トグルでテキスト切替可能。編集操作は不可 |
| **AC-6** | LoRAとタグセットで切替トグルおよびデフォルト挙動の統一 | コンポーネント統合 | 詳細・編集の各画面で同一のトグルアイコン・切替UIが提供され、デフォルトがチップ表示である |

---

## 1. 自動テスト (Automated Verification)

### 1-1. 新規 `TagChipViewer` 単体テスト
- **テストファイル**: `frontend/src/components/__tests__/TagChipViewer.test.tsx`
- **実行コマンド**: `npm test frontend/src/components/__tests__/TagChipViewer.test.tsx` (frontend ディレクトリ内)
- **テストケース**:
  1. `renders chips mode by default`: デフォルトで各タグがバッジ/チップとして表示されること。
  2. `toggles between chips mode and text mode on button click`: 切替ボタン押下でカンマ区切りテキスト表示に切り替わり、再度押すとチップ表示に戻ること。
  3. `renders read-only chips without edit/delete buttons or drag handles`: チップ内に削除ボタン（`x`）や入力フィールド、ドラッグハンドルが存在しないこと。
  4. `supports purple and green accent colors`: 指定したアクセントカラーに応じたクラス/スタイルが適用されること。
  5. `handles empty tags gracefully`: タグ配列が空の場合にクラッシュせず、プレースホルダーまたは空コンテナが表示されること。

### 1-2. `TagSetModals` 統合テスト
- **テストファイル**: `frontend/src/components/__tests__/TagSetModals.test.tsx`
- **実行コマンド**: `npm test frontend/src/components/__tests__/TagSetModals.test.tsx`
- **テストケース**:
  1. `TagSetCreateModal renders TagChipEditor for main tags with chips mode by default`: 新規作成モーダルでメインタグ入力欄がチップモードで初期表示されること。
  2. `TagSetCreateModal renders TagChipEditor for subsets`: サブセット追加時、サブセットのタグ入力欄も `TagChipEditor` で描画されること。
  3. `TagSetDetailModal renders TagChipViewer for main tags and subsets in read-only chip mode`: 詳細モーダルでメインタグおよびサブセットが `TagChipViewer` で描画され、初期表示がチップモードであること。
  4. `TagSetDetailModal allows toggling main tags to text mode without altering data`: 詳細モーダルでテキストモードに切り替えた際、カンマ区切りテキストが表示されること。

### 1-3. `LoraModals` 統合テスト
- **テストファイル**: `frontend/src/components/__tests__/LoraModals.test.tsx`
- **実行コマンド**: `npm test frontend/src/components/__tests__/LoraModals.test.tsx`
- **テストケース**:
  1. `LoraDetailModal renders trigger word sets using TagChipViewer in chips mode by default`: LoRA詳細モーダルの各トリガーワードセットが初期表示でチップ表示されること。
  2. `LoraDetailModal allows toggling trigger words to text mode`: トグルボタンでカンマ区切りテキストに切り替えられること。
  3. `LoraEditModal maintains TagChipEditor with default chip mode`: 編集モーダルで既存の `TagChipEditor` がチップモードで正しく機能すること。

---

## 2. Red Teaming (境界値・異常系検証)

### 2-1. 極端な入力値・特殊タグの境界値テスト
1. **空文字列 / 空配列**:
   - タグが空（`[]` または空文字のみ）の状態で詳細モーダルを開いた際、エラーなく表示され、トグル操作でもクラッシュしないこと。
2. **特殊記号やウェイト構文**:
   - `(masterpiece:1.2)`, `1girl, solo`, `<lora:name:1.0>` 等の特殊記号やコロン、丸括弧を含むタグが崩れずチップおよびテキストとして相互変換・表示されること。
3. **大量タグ（100件超）**:
   - 大量のタグが存在する場合、詳細モーダルおよび編集モーダル内で適切なスクロール・折り返しが行われ、レイアウト崩れが発生しないこと。

### 2-2. 高速トグル連打とモード同期
1. **切替ボタン連打**:
   - チップ/テキスト切替ボタンを短時間に連続クリックしても、状態の不整合や描画崩れが生じないこと。
2. **編集モーダルでのテキストモード保存**:
   - 編集モーダルでテキストモードのまま文字を追記し、チップモードに戻さずに「Save Changes」を押下した場合でも、親フォームに入力値が正しく反映されて保存されること。
