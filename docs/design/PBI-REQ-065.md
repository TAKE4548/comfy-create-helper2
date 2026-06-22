# REQ-065: 複数選択後のアクション（並び替え・一括編集・マッピングマスタ並び替え）の設計

## 1. 変更方針

### 1.1 グループ並び替え（ドラッグ＆ドロップ）ロジックの改善
- **影響ファイル**:
  - `frontend/src/pages/LoRAsPage.tsx`
  - `frontend/src/pages/TagsPage.tsx`
- **修正内容**:
  - `handleDragEnd` 内のグループ移動処理において、ドロップ先ターゲットである `over.id` が現在選択されているグループの一部 (`selectedIds.has(over.id)`) の場合は移動処理を無視（早期リターン）し、誤った先頭移動を防ぐ。
  - ドラッグした `active.id` とドロップ先 `over.id` のインデックス順関係を判定し、ドロップ先がドラッグ元より後ろ（下方向への移動）ならドロップ先の後ろに、前（上方向への移動）ならドロップ先の直前にグループ全体を挿入するようにインデックスを計算する。

### 1.2 一括編集機能のデータマージ処理の追加
- **影響ファイル**:
  - `frontend/src/pages/LoRAsPage.tsx` (`bulkUpdateLoras`)
  - `frontend/src/pages/TagsPage.tsx` (`bulkUpdateTagSets`)
  - `frontend/src/pages/SettingsPage.tsx` (`bulkUpdateMasters`)
- **修正内容**:
  - 選択中のアイテムIDリスト（`selectedIds`）をループする際、各アイテムの既存データを配列 (`items` または `sortedMasters`) から検索。
  - 既存データに対して一括編集モーダルから渡された値（`values`）をマージする。
  - **マージ規則**:
    - `values` に含まれる非 `undefined` な値で既存データを上書き。
    - `trigger_word_sets` や `tags` 等の配列プロパティ、必須項目などを正しく維持してAPIに送信可能な完全なスキーマオブジェクトを作成する。
    - 作成した完全なオブジェクトを各更新API (`lorasApi.update`, `tagSetsApi.update`, `mappingMastersApi.update`) に送信する。

### 1.3 マッピングマスタ複数選択時の並び替え対応
- **影響ファイル**:
  - `frontend/src/components/SettingsComponents.tsx` (`SortableMasterRow`)
- **修正内容**:
  - `useSortable({ id: mm.id, disabled: false })` に設定し、複数選択モード中であってもドラッグ機能を無効化しない。
  - `isMultiSelectMode` が `true` の場合、1列目にチェックボックスのみを表示する代わりに、チェックボックスとドラッググリップアイコン (`GripVertical`) を横並び（または隣接）で両方表示する。
  - チェックボックスは行の選択/解除用、グリップボタンはドラッグ並び替え用として `{...attributes} {...listeners}` を紐づけて機能分担させる。

---

## 2. 影響範囲と依存関係
- バックエンドのAPI定義には一切変更を加えないため、フロントエンド側のみで完全にクローズした修正となる。
- 他のモジュールへの副作用はなく、マルチセレクト機能の堅牢性が向上する。
