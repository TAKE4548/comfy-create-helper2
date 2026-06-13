# 設計書: REQ-038 LoRAトリガーワードセットのCRUD管理機能追加

## 1. 概要
LoRA登録および編集モーダルにおいて、トリガーワードセット（`LoraTriggerWordSet`）を動的に追加・編集・削除できるようにします。
また、トリガーワードの入力インターフェースには、既存のタグチップエディタ（`TagChipEditor`）を統合し、生成画面と一貫した操作性を提供します。

## 2. 影響範囲と依存関係
- **frontend**:
  - `frontend/src/components/LoraModals.tsx`:
    - `LoraFormFields` にトリガーワードセットの管理セクション（追加・編集・削除）を追加。
    - `TagChipEditor` コポーネントおよび `Trash2` アイコンをインポート。
    - トリガーワードの編集用入力欄に `TagChipEditor` を適用。
    - トリガーワードセットの追加・削除・更新用ハンドラ（`handleAddTriggerSet`, `handleRemoveTriggerSet`, `handleUpdateTriggerSetName`, `handleUpdateTriggerWords`）を実装。
  - `frontend/src/pages/LoRAsPage.tsx`:
    - すでに登録・編集用のAPI呼び出し時、および編集フォーム初期化時に `trigger_word_sets` を適切にシリアライズ/デシリアライズしているため、データフローはそのまま維持。

## 3. 詳細設計

### 3.1. トリガーワードセット管理UIの統合
`LoraFormFields` 内に以下のUI要素を追加します：
1. **セクションヘッダーと追加ボタン**:
   - `Trigger Word Sets` というラベルと、`+ Add Set` ボタンを表示。
   - `+ Add Set` ボタンをクリックすると、フォーム状態の `trigger_word_sets` に `{ name: '', words: '' }` が追加される。
2. **トリガーワードセットリスト**:
   - `form.trigger_word_sets` の各要素について、カード型の入力ブロックを描画。
   - **セット名（Set Name）**: テキスト入力欄。プレースホルダーは `e.g. Default, Outfit 1...`。
   - **トリガーワード（Trigger Words）**: `TagChipEditor` を配置。
   - **削除ボタン**: 各入力ブロックの右上に `Trash2` アイコンを配置し、クリック時にそのインデックスのセットを削除する。

### 3.2. フォーム状態更新ハンドラ
`LoraFormFields` 内で、`setForm` を用いて以下の状態更新を行います：
- **追加 (Add)**:
  ```typescript
  const handleAddTriggerSet = () => {
    setForm((f) => ({
      ...f,
      trigger_word_sets: [...f.trigger_word_sets, { name: '', words: '' }],
    }))
  }
  ```
- **削除 (Remove)**:
  ```typescript
  const handleRemoveTriggerSet = (index: number) => {
    setForm((f) => ({
      ...f,
      trigger_word_sets: f.trigger_word_sets.filter((_, i) => i !== index),
    }))
  }
  ```
- **セット名更新 (Update Name)**:
  ```typescript
  const handleUpdateTriggerSetName = (index: number, name: string) => {
    setForm((f) => ({
      ...f,
      trigger_word_sets: f.trigger_word_sets.map((tws, i) =>
        i === index ? { ...tws, name } : tws
      ),
    }))
  }
  ```
- **トリガーワード更新 (Update Words)**:
  ```typescript
  const handleUpdateTriggerWords = (index: number, words: string) => {
    setForm((f) => ({
      ...f,
      trigger_word_sets: f.trigger_word_sets.map((tws, i) =>
        i === index ? { ...tws, words } : tws
      ),
    }))
  }
  ```

### 3.3. モーダルのスクロール対応
トリガーワードセットが複数追加された場合、モーダル全体の高さがビューポートを上回る可能性があります。
モーダルのフォーム入力コンテナに `max-h-[70vh] overflow-y-auto custom-scrollbar` などのスクロールスタイルを適用し、操作性を担保します。
