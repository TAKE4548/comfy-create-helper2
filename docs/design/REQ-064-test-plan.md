# PBI-REQ-064 実行可能テスト計画

**バージョン**: 1.1（修正版）
**対象**: REQ-064 複数選択と一括操作機能

> **修正内容**: バックエンド変更なし確定を反映。DragOverlay テストシナリオ追加。TagsPage 対象を右カラムカードグリッドに限定。

---

## 1. 自動テスト (CLI Verification)

### 1-1. フロントエンド ユニットテスト（T1 実装後）

```bash
cd frontend
npx vitest run src/hooks/__tests__/useMultiSelect.test.ts
```

**テストケース（実装すること）**:
- `enterMultiSelectMode()` で `isMultiSelectMode === true` になること
- `enterMultiSelectMode(firstId)` で `selectedIds.has(firstId) === true` になること
- `handleItemClick(id, { ctrlKey: true })` で個別選択が追加されること（モード移行）
- 複数選択モード中に `handleItemClick(id, {})` で selectedIds がトグルされること
- `handleItemClick(id, { shiftKey: true })` で範囲選択が正しく機能すること（from → to の全 ID が含まれる）
- `exitMultiSelectMode()` で `isMultiSelectMode === false` かつ `selectedIds.size === 0` になること
- `selectAll()` で全 item.id が selectedIds に含まれること
- `clearSelection()` で `selectedIds.size === 0` になること
- 長押しハンドラが 500ms 後に `enterMultiSelectMode` を呼ぶこと（`jest.useFakeTimers` 使用）

---

## 2. ツール主導監査 (Tool-Driven Audit)

### 2-1. コード監査

```bash
python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-064.md
```

**期待値**: 全タスクの hermetic context が完全で外部検索不要の判定を受けること。

### 2-2. API 変更なし確認

バックエンドへの変更はないため、API 検証は不要。  
既存エンドポイントの利用確認（フロントエンドが正しい URL を呼んでいること）はブラウザ Network タブで確認する。

---

## 3. ブラウザ検証 (Browser Agent Verification)

### TC-01: Ctrl+クリックでの複数選択モード移行（LoRA管理ページ）

1. `http://localhost:5173/loras` を開く
2. LoRAカード1枚目を `Ctrl + クリック` する
3. **期待**: 複数選択モードに移行し、カード左上にチェックボックスアイコン表示。ハイライト（`ring-[#3ECF8E]`）が当たること
4. カード3枚目を `Ctrl + クリック` する
5. **期待**: カード1・3枚目が選択状態（2件選択）。`MultiSelectToolbar` に「2 / N 件選択中」と表示されること

---

### TC-02: Shift+クリックでの範囲選択（LoRA管理ページ）

1. `/loras` を開く
2. LoRAカード1枚目を `Ctrl + クリック` する（複数選択モード移行）
3. カード5枚目を `Shift + クリック` する
4. **期待**: カード1〜5枚目が全選択状態（5件選択）

---

### TC-03: 長押しでの複数選択モード移行（タグセット管理ページ）

1. `http://localhost:5173/tags` を開く
2. **右カラム**のタグセットカードを 500ms 長押しする
3. **期待**:
   - 複数選択モードに移行し、右カラム上部に `MultiSelectToolbar` が表示されること
   - 長押ししたカードが選択状態になること
   - **左カラムのエディタには何も変化しないこと**（対象外）

---

### TC-04: 複数選択モード解除（タグセット管理ページ）

1. TC-03 の状態から `MultiSelectToolbar` の「✕ 選択モード終了」をクリック
2. **期待**:
   - チェックボックスアイコンが非表示になること
   - 通常のクリック挙動（タグセット編集）に戻ること

---

### TC-05: LoRA 一括カテゴリ編集

1. `/loras` で LoRA カードを2枚 `Ctrl+クリック` で選択
2. `MultiSelectToolbar` の「一括編集」ボタンをクリック
3. `BulkEditModal` でカテゴリを「スタイル系」に変更して「Apply」
4. **期待**:
   - 選択した2件の LoRA のカテゴリが「スタイル系」に更新されること
   - Network タブ: `PUT /api/loras/{id}` が2回送信されること
   - `BulkEditModal` が閉じ、複数選択モードが終了すること

---

### TC-06: スナップショット一覧の Shift 範囲選択 + アルバム一括追加

1. `http://localhost:5173/history`（スナップショット一覧タブ）を開く
2. スナップショット1枚目を `Ctrl + クリック` する
3. スナップショット3枚目を `Shift + クリック` する
4. **期待**: 1〜3枚目が選択状態（3件）。`MultiSelectToolbar` に「3 件選択中」と表示
5. `MultiSelectToolbar` の「Add to Album」をクリック → アルバムを選択して追加
6. **期待**: 3枚が指定アルバムに追加されること

---

### TC-07: アルバム詳細 D&D グループ移動（DragOverlay 確認）

1. `/history` → アルバム詳細画面を開く
2. カードを2枚 `Ctrl + クリック` で選択
3. 選択アイテムのうち1枚をドラッグ開始する
4. **期待**（DragOverlay 確認）: ドラッグ中に先頭カードのゴースト表示と右下に「+1」バッジが表示されること
5. 別の位置にドロップする
6. **期待**:
   - 選択した2枚がひとかたまりとして移動すること
   - Network タブ: `PATCH /api/albums/{id}/order` が送信されること

---

### TC-08: GeneratePage 履歴サムネイル複数選択保存（history タブのみ）

1. 画像を生成し、複数枚の履歴がある状態で「history」タブを表示する
2. サムネイル1枚目を `Ctrl + クリック` する
3. サムネイル3枚目を `Ctrl + クリック` する（計2枚選択）
4. **期待**: 「選択した 2 枚を保存」ボタンが表示されること
5. ボタンをクリック → アルバム選択 → 確定
6. **期待**:
   - Network タブ: `POST /api/snapshots` が2回送信されること
   - 複数選択モードが終了すること
7. 「snapshots」タブに切り替える
8. **期待**: snapshots タブには複数選択 UI が表示されないこと（通常の単一クリック挙動のまま）

---

### TC-09: 設定ページ マッピングマスタ 複数選択 一括並び替え（DragOverlay 確認）

1. `http://localhost:5173/settings` → マッピングマスタ一覧を開く
2. 行を2件 `Ctrl + クリック` で選択
3. 選択行の1件をドラッグ開始する
4. **期待**（DragOverlay 確認）: ドラッグ中に行コンテンツのゴースト + 「+1」バッジが表示されること
5. 別の位置にドロップする
6. **期待**:
   - 選択した2行がグループ移動すること
   - Network タブ: `PUT /api/mapping-masters/reorder` が送信されること（既存エンドポイント）

---

### TC-10: 設定ページ マッピングマスタ 一括 Input Type 編集

1. `/settings` で行を2件選択
2. `MultiSelectToolbar` の「一括編集」→ `BulkEditModal` を開く
3. Input Type を `int` に変更して「Apply」
4. **期待**:
   - 選択した2行の `input_type` が `int` に更新されること
   - Network タブ: `PUT /api/mapping-masters/{id}` が2回送信されること

---

## 4. 検証エビデンス

- 各 TC のスクリーンショットを `.gemini/` に保存すること（10MB 未満）
- DragOverlay に関する TC（TC-07, TC-09）は**録画またはスクリーンショット**でオーバーレイ表示を視覚的に確認すること
- ブラウザの Network タブで送信 API コールとステータスコードを確認すること（200 / 204 であること）
