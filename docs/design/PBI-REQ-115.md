# PBI-REQ-115: 生成画面のLoRALoaderフィルタ・検索機能 設計書

## 1. 概要
生成画面のLoRALoader（LoRA Stack等）で、大量のLoRAモデルから目的のものを素早く選択できるようにするため、検索・フィルタヘッダを固定表示したカスタムドロップダウンコンポーネントを導入する。

## 2. 変更対象ファイル
- `frontend/src/components/SearchableLoraSelect.tsx` [NEW]
  - 検索およびフィルタ機能（ベースモデル、カテゴリ、フリーワード）を持ったスクロール固定ヘッダ付きのカスタムセレクトボックスコンポーネント。
- `frontend/src/components/LoraStackEditor.tsx` [MODIFY]
  - 既存の `<select>` 要素を `SearchableLoraSelect` に置き換え。
- `frontend/src/pages/GeneratePage/components/ParamPanel.tsx` [MODIFY]
  - 既存の `<select>` 要素（LoRA選択用）を `SearchableLoraSelect` に置き換え。

## 3. 詳細設計
### 3.1 `SearchableLoraSelect` コンポーネント (新規)
#### Props
- `value`: 現在選択されているモデルパス (`string`)
- `onChange`: 値変更時のコールバック (`(value: string) => void`)
- `loras`: 登録済みのLoRAデータ一覧 (`Lora[] | undefined`)
- `comfyModels`: ComfyUI側の全モデルファイル一覧 (`ComfyLoraModel[] | undefined`)
- `activeBaseModelId`: 現在選択されているベースモデルのID (`number | null | undefined`)。これが指定されている場合、デフォルトで該当ベースモデルに対応するLoRAにフィルタする。

#### UI/UX構成
- トリガーボタン：
  - 現在選択されているLoRAの表示名（登録済みの場合は description、未登録の場合はファイル名）を表示。
  - クリックするとドロップダウンリストが開閉する。
- ドロップダウンリスト（ポータル、または絶対配置）：
  - コンテナ：`max-h-80 overflow-y-auto relative`
  - 固定ヘッダ：`sticky top-0 bg-surface z-10 border-b border-[rgba(255,255,255,0.08)] p-2 space-y-2`
    - フリーワード検索入力：`Search` アイコンとテキスト入力欄。
    - フィルタ行（横並びまたは縦並び）：
      - ベースモデルフィルタ（すべてのベースモデル / 特定のベースモデル）
      - カテゴリフィルタ（すべてのカテゴリ / 特定のカテゴリ）
  - リスト項目：
    - `loras` と `comfyModels` の情報をマージし、フィルタ条件（フリーワード、ベースモデル、カテゴリ）に合致するモデルをレンダリング。
    - 選択中のアイテムはハイライト表示。

#### 検索・フィルタロジック
- フリーワード：
  - 入力値（大文字小文字を区別せずトリミング）で、登録名（`description`）、ファイルパス（`file_path`）、名称（`model_name`）を部分一致検索。
- ベースモデルフィルタ：
  - ドロップダウン内部で `baseModelsApi.list()` を React Query を用いて取得。
  - 選択されたベースモデルに対応する LoRA のみを表示。LoRAオブジェクトの `target_base_model_ids` に該当ベースモデルIDが含まれているか、または未設定のものを含める。
- カテゴリフィルタ：
  - ドロップダウン内部で `loraCategoriesApi.list()` を React Query を用いて取得。
  - 選択されたカテゴリID（`category_id`）に一致する LoRA のみを表示。

### 3.2 既存コンポーネントへの適用
- `LoraStackEditor.tsx` の LoRA 選択セレクトボックスを `SearchableLoraSelect` に置き換える。
- `ParamPanel.tsx` の LoRA 選択部分を `SearchableLoraSelect` に置き換える。

## 4. 懸念点・トレードオフ (Trade-off Disclosure)
- **UIの干渉とレイアウト崩れ**: カスタムドロップダウンリストは絶対配置（`absolute`）で描画するため、親要素の `overflow-hidden` や `overflow-y-auto` によって見切れる可能性がある。必要に応じてドキュメントボディに対するポータル描画にするか、ドロップダウンの表示位置を調整する。
- **パフォーマンスへの影響**: LoRAのモデル数が多い（数百個以上）場合、リストレンダリングの負荷が高まる可能性がある。表示件数が非常に多い場合は、簡易的な仮想スクロールか、検索条件に一致した上位件数のみを描画するなどの対策が必要になるが、まずは通常のリストレンダリングで検証する。
