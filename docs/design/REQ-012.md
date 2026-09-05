# 設計書 - REQ-012: プロンプトのタグチップ化とLoRA/タグセットのトグル適用

## 1. 目的と概要
プロンプト入力欄（Positive/Negative等）を従来の単純なテキストエリアから、タグ単位で視覚的に管理できる「タグチップ入力UI」にリプレイスします。これにより、カンマの消し忘れや重複などのミスを防ぎ、Enterキーやカンマ入力で即座にタグを確定できる快適な入力体験を提供します。
また、LoRAやタグセットを「アセットチップ」として適用し、チェックボックスやトグルによる有効/無効の切り替えと、画像生成時のプロンプトテキストへの動的反映（`<lora:filename:strength>` 等の自動埋め込み・除外）をサポートすることで、生成時の試行錯誤をシームレスに行えるようにします。

## 2. アーキテクチャ設計

### 2.1 フロントエンド（React + TypeScript）

#### 1. 新規コンポーネント: `TagChipInput.tsx`
- **概要**: 既存の `textarea` を置き換え、タグチップ表示とインライン入力を行うUI。
- **データ構造**:
  - 親から受け取る `value` は従来通りカンマ区切りの文字列（`string`）。内部で `,` で分割して `string[]` としてチップレンダリングし、変更時は結合して `onChange(newValue: string)` を発火する。
- **配色テーマ**:
  - `variant?: 'positive' | 'negative' | 'neutral'`
  - positive (緑系アクセント), negative (赤/ローズ系アクセント), neutral (グレー系アクセント)。
- **キーボードイベント**:
  - `,` (カンマ) 入力時、または `Enter` キー押下で入力中の文字列をチップ化して追加。
  - 入力欄が空の状態で `Backspace` 押下時、末尾のチップを削除。
- **ペーストイベント (`onPaste`)**:
  - ペーストした文字列をカンマで分割し、トリミングして空文字を除外した上で、複数のチップとして一括追加。

#### 2. グローバル状態管理の拡張 (`useGenerationStore.ts`)
- **状態定義**:
  - `appliedAssets`: `Record<string, AppliedAsset[]>` (キーはプロンプトの `role` 名)
- **AppliedAsset 型**:
  ```typescript
  export interface AppliedAsset {
    id: string; // 一意なキー (e.g. `lora-1-1718000000`)
    type: 'lora' | 'tagset';
    assetId: number; // DBのID
    name: string; // 表示名
    enabled: boolean; // トグル状態
    tags: string[]; // タグセットのタグ、またはLoRAのトリガーワード
    loraPromptString?: string; // LoRAの場合の埋め込み文字列 `<lora:filename:strength>`
  }
  ```
- **永続化**:
  - アクション実行時およびストア初期化時に `localStorage`（キー: `prompt-surgeon-applied-assets`）と同期する。

#### 3. 生成処理の統合と動的反映 (`GeneratePage.tsx`)
- **+ Add Asset ポップオーバー**:
  - 各プロンプトヘッダーに配置。クリック時に登録されている LoRA/タグセットを一覧表示し、クリックでアセットを追加。
- **LoRAの推奨強度自動算出**:
  - `min` と `max` が両方存在する場合: その中間値 `(min + max) / 2` を算出して小数第一位に丸める。
  - 片方のみ存在する場合: その値。
  - どちらも存在しない場合: `1.0`。
- **プロンプト結合ロジック (`handleGenerate`)**:
  - `handleGenerate` の実行時に、対応する `role` の有効なアセットから、タグセットの `tags` と LoRAの `loraPromptString` を抽出し、テキストエリアの生プロンプトテキストと結合してComfyUIノードへ送信する。
  - `finalPrompt = [rawPromptText, ...enabledAssetTags, ...enabledLoraPromptStrings].filter(Boolean).join(', ')`
  - LoRAローダーのノードパラメータ（`Character_Lora_Model` 等）は上書きせず、そのまま送信する。

## 3. UI/UX デザイン設計

### 3.1 タグチップ入力UI (TagChipInput)
```
+-------------------------------------------------------------+
|  [ 1girl x ]  [ solo x ]  [ black hair x ]  long_           |  <- チップとインライン入力
+-------------------------------------------------------------+
```
- コンテナは `border-zinc-800` からフォーカス時に `border-accent-green/40`（ポジティブ）または `border-rose-500/40`（ネガティブ）へ遷移。
- チップはホバー時に `×` ボタンが強調表示され、クリックでフェードアウトアニメーションを伴い削除される。

### 3.2 アセットチップの配置とレイアウト
```
[ Main positive prompt ]                               [ + Add Asset ]
+--------------------------------------------------------------------+
|  [ 1girl x ]  [ solo x ]  [ beautiful eyes x ]                     |
+--------------------------------------------------------------------+
  適用中のアセット:
  [X] LoRA: hanako_v2 (強度: 0.8) [x]    [ ] TagSet: 水着セット [x]
  (有効: 通常表示)                       (無効: グレーアウト)
```
- アセットチップはプロンプト入力エリアの直下に表示。
- チェックボックスまたはスイッチトグルのクリックで「有効/無効」を即座に切り替え可能。
- 無効化時は不透明度を下げてグレーアウト（`opacity-40` 等）し、削除ボタン（`x`）でアセットの割り当て自体を解除。
