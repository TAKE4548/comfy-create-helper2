# REQ-144 テスト計画書 (Test Plan)

## 1. 概要 (Overview)
- **対象PBI**: `REQ-144`
- **機能**: セリフ編集のベース画像差し替えにおける全履歴対応・履歴フィルタおよびアルバム選択機能

---

## 2. 自動テスト計画 (Automated Tests)

### 2.1 ユニットテスト (`frontend/src/components/__tests__/BaseImageSelectModal.test.tsx`)

#### Test Case 1: 初期レンダリングとタブ切り替え
- **前提条件**: `workflowId={1}`, `currentSnapshotId={10}` でモーダルをレンダリング。
- **検証条件**:
  - `#tab-snapshots` ボタンがアクティブ状態（`bg-accent-green` または `bg-surface-2 text-white` 等のアクティブクラス適用）であること。
  - `snapshotsApi.list` が `{ workflow_id: 1 }` で呼び出されること。
  - `#tab-albums` をクリックした際、`albumsApi.list()` が呼び出され、アルバムカードが DOM 上に描画されること。

#### Test Case 2: スナップショットのフィルタリングとソート
- **操作手順**:
  - ワークフローセレクトを「All Workflows」に変更。
  - LoRA セレクトを `lora_id=2`、TagSet セレクトを `tag_set_id=3` に変更。
- **検証条件**:
  - `snapshotsApi.list` が `{ workflow_id: undefined, lora_id: 2, tag_set_id: 3 }` で呼び出されること。
  - 「古い順 (`#sort-asc`)」ボタンをクリックした際、スナップショット一覧の先頭要素が最古日付（`created_at` 昇順）のカードになること。
  - 「新しい順 (`#sort-desc`)」ボタンをクリックした際、先頭要素が最新日付（`created_at` 降順）のカードになること。

#### Test Case 3: スナップショットの選択 (`onSelect`)
- **操作手順**: スナップショットカード `#snap-card-20`（`{ id: 20, image_path: '/snap-20.png' }`）をクリック。
- **検証条件**:
  - `mockOnSelect` が引数 `expect.objectContaining({ id: 20, image_path: '/snap-20.png' })` で厳密に 1 回（`toHaveBeenCalledTimes(1)`）呼び出されること。

#### Test Case 4: アルバムの閲覧とアイテム選択
- **操作手順**:
  - 「アルバム」タブに切り替え、アルバムカード `#album-card-5` をクリック。
- **検証条件**:
  - `albumsApi.get(5)` が呼び出され、アルバム名およびアルバム内アイテムが表示されること。
  - アルバム内アイテムカード `#album-item-30` をクリックした際、`mockOnSelect` が `expect.objectContaining({ id: 30, image_path: '/album-item-30.png' })` で厳密に 1 回（`toHaveBeenCalledTimes(1)`）呼び出されること。
  - 戻るボタン `#album-back-btn` クリックでアルバム一覧画面に戻り、アルバム一覧が再表示されること。

#### Test Case 5: 空状態（Empty States）およびエラー処理
- **検証条件**:
  - スナップショットが 0 件の場合に「利用可能なスナップショットが見つかりませんでした」のメッセージが表示されること。
  - アルバム内のアイテムが 0 件の場合に「アルバム内に画像がありません」のメッセージが表示されること。

### 2.2 統合テスト (`frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx`)
- **操作手順**:
  - 吹き出しが 2 件配置された状態でヘッダーの「ベース画像差し替え」ボタンをクリック。
  - `BaseImageSelectModal` から別画像（`id: 99`, `image_path: '/new-base.png'`）を選択。
- **検証条件**:
  - `currentSourceSnapshotId` が `99` に更新され、`currentImageUrl` が `'/new-base.png'` に切り替わること。
  - 既存の 2 件の吹き出し（`bubbles` 配列の要素数、テキスト、座標）が欠落・リセットされることなくそのまま維持されること。

---

## 3. 実行コマンド (CLI Verification Commands)

```bash
# Frontend Unit Tests
cd frontend
npm test -- src/components/__tests__/BaseImageSelectModal.test.tsx --run
npm test -- src/components/__tests__/SpeechBubbleEditorModal.test.tsx --run
```

---

## 4. 手動検証チェックリスト (Manual Verification Checklist)

1. [ ] セリフ編集モーダルを開き、ヘッダーの「ベース画像差し替え」ボタンをクリックする。
   - **判定基準**: モーダルが開き、現在のワークフローのスナップショット一覧が表示され、現在の画像に「現在」バッジが付与されていること。
2. [ ] 履歴タブで「All Workflows」を選択する。
   - **判定基準**: 全ワークフローのスナップショットが取得され、グリッドに一覧表示されること。
3. [ ] LoRA / TagSet フィルタを選択する。
   - **判定基準**: 対象 LoRA / TagSet が付与されたスナップショットのみに表示が絞り込まれること。
4. [ ] 「古い順」および「新しい順」を切り替える。
   - **判定基準**: 画像カードの表示順が日時の昇順・降順に正しく反転すること。
5. [ ] 「アルバム」タブに切り替える。
   - **判定基準**: アルバム一覧が表示され、各アルバムのカバー画像と登録枚数が表示されること。
6. [ ] アルバムをクリックしてアイテムを選択する。
   - **判定基準**: モーダルが閉じ、セリフ編集画面の背景画像が選択したアルバム画像に差し替わり、既存の吹き出しテキスト・位置がそのまま維持されていること。
