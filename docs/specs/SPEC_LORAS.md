# Prompt Surgeon — LoRAs ページ仕様書 (SPEC_LORAS)

**バージョン**: 1.0  
**最終更新**: 2026-06-13  
**実装ファイル**: `frontend/src/pages/LoRAsPage.tsx`（現行 569行 ← 🟡 リファクタリング対象）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md)

---

## 1. 概要

ComfyUI で使用可能な LoRA モデルのメタ情報・トリガーワードセットを管理するページ。  
ライブラリ管理（CRUD）に特化し、ワークフロー依存の有効/無効化はここでは行わない（Generate ページのアセットパネルで実施）。

---

## 2. 機能一覧

| 機能 | 説明 |
|---|---|
| LoRA 一覧表示 | Grid 表示。検索・カテゴリフィルタ対応 |
| LoRA 登録 | メタ情報・カテゴリ・推奨強度・トリガーワードセットを登録（ComfyUI 内のファイルパス自動補完サジェストに対応） |
| LoRA 編集 | 登録済み LoRA のメタ情報更新 |
| LoRA 削除 | 登録済み LoRA の削除 |
| トリガーワードセット管理 | 1つの LoRA に複数のトリガーワードセットを登録（例: 素体系・服装A・服装B） |
| カテゴリフィルタ | カテゴリ別にフィルタリング |
| LoRA 複数選択 | `Ctrl + クリック` / `Shift + クリック` / 長押しによる複数選択モード、ドラッグ＆ドロップでの一括順序変更 (reorder)、およびカテゴリ・推奨強度の「一括編集」に対応 |

---

## 3. レイアウト

```
┌─────────────────────────────────────────────────────────────┐
│ [検索バー] [カテゴリフィルタ] [Register Model ボタン]        │
├─────────────────────────────────────────────────────────────┤
│  LoRA カード グリッド                                        │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ [サムネイル]      │  │ [サムネイル]      │                 │
│  │ LoRA 名          │  │ LoRA 名          │                 │
│  │ [カテゴリバッジ]  │  │ [カテゴリバッジ]  │                 │
│  │ トリガーワード    │  │ トリガーワード    │                 │
│  │ 推奨強度: 0.8    │  │ 推奨強度: 0.6〜1 │                 │
│  └──────────────────┘  └──────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. LoRA カード

| 要素 | 仕様 |
|---|---|
| サムネイル | サムネイル画像がない場合は `ImageIcon` + "No Preview" プレースホルダー |
| カテゴリバッジ | カテゴリマスタから選択した値をバッジ表示 |
| トリガーワード | ホバー時にコピーボタン表示 |
| 推奨強度 | 下限〜上限（例: `0.6 ~ 1.0`）または単一値（例: `0.8`）。未設定も許容 |
| ファイルパス | フォルダアイコンをホバーで ComfyUI 側のファイルパスをツールチップ表示 |

---

## 5. 登録・編集モーダル（自動サジェスト補完機能）

登録・編集時に、ComfyUI のインストールフォルダ内にある LoRA モデルファイルの一覧をサジェスト入力する機能。

- **ファイルパスの自動補完**: 
  - `File Path` 入力欄にフォーカスまたは文字入力した際、バックエンドAPI（`/api/loras/comfy-models`）から取得した ComfyUI 側の全 LoRA ファイルパス（フォルダ構成を含む相対パス）の一覧がドロップダウン形式でサジェスト表示される。
  - すでに Prompt Surgeon 内に登録済みのファイルパスには「登録済み」バッジが表示され、重複登録できないよう選択が無効化される。
  - リストからパスを選択すると、`File Path` と `Model Name`（ファイルパスの末尾ファイル名から拡張子を除いたもの）が自動的に入力される。

---

## 6. LoRA データモデル

```typescript
interface Lora {
  id: number;
  model_name: string;            // ComfyUI でのモデル名（ファイル名）
  file_path?: string;            // ComfyUI 側のファイルパス
  description?: string;          // 自由記述（キャラ名・役割等）
  category_id?: number;
  category?: { id: number; name: string };
  recommended_strength_min?: number;
  recommended_strength_max?: number;
  thumbnail_path?: string;
  trigger_word_sets?: TriggerWordSet[];
}

interface TriggerWordSet {
  id: number;
  lora_id: number;
  name: string;                  // セット名（例: 「素体系」「服装A」）
  words: string[];               // トリガーワードのリスト
}
```

---

## 7. カテゴリマスタ

初期シードデータ:
- `キャラクター系`
- `ポーズ再現系`
- `スタイル系`
- `コンセプト系`

LoRA カテゴリはマスタから選択。設定ページでの追加/削除も可能。

---

## 8. API 呼び出し

| 操作 | エンドポイント |
|---|---|
| LoRA 一覧 | `GET /api/loras` |
| LoRA 登録 | `POST /api/loras` |
| LoRA 更新 | `PATCH /api/loras/{id}` |
| LoRA 削除 | `DELETE /api/loras/{id}` |
| LoRA 並び替え | `PUT /api/loras/reorder` |
| トリガーワードセット一覧 | `GET /api/loras/{id}/trigger-word-sets` |
| トリガーワードセット登録 | `POST /api/loras/{id}/trigger-word-sets` |
| トリガーワードセット更新 | `PATCH /api/loras/{id}/trigger-word-sets/{set_id}` |
| トリガーワードセット削除 | `DELETE /api/loras/{id}/trigger-word-sets/{set_id}` |
| カテゴリ一覧 | `GET /api/lora-categories` |
| ComfyUI 内 LoRA モデル取得 | `GET /api/loras/comfy-models` |

---

## 9. リファクタリング計画

現行 569行。hooks + sub-components に分割して各ファイル ~200行以内に収める。

```
pages/LoRAsPage/（分割後）
  index.tsx                   ← リスト表示・フィルタリングのみ（~150行）
  hooks/
    useLoraList.ts            ← 一覧取得・フィルタロジック
    useLoraForm.ts            ← 登録・編集フォーム状態管理
  components/
    LoraCard.tsx              ← カード1件のUI
    LoraFormModal.tsx         ← 登録・編集モーダル
    TriggerWordSetEditor.tsx  ← トリガーワードセット管理UI
```
