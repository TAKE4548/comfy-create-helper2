# Prompt Surgeon — LoRAs ページ仕様書 (SPEC_LORAS)

**バージョン**: 2.1  
**最終更新**: 2026-09-01  
**実装ファイル**: `frontend/src/pages/LoRAsPage.tsx`（`LoraModals.tsx`, `CategoryManagerModal.tsx` 等の分割構成）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md)

---

## 1. 概要

ComfyUI で使用可能な LoRA モデルのメタ情報・BaseModel紐付け・トリガーワードセットを管理するページ。  
ライブラリ管理（CRUD）に特化し、ワークフロー依存の有効/無効化は Generate ページのアセットパネルで実施する。

---

## 2. 機能一覧

| 機能 | 説明 |
|---|---|
| LoRA 一覧表示 | Grid 表示。検索・カテゴリフィルタ・BaseModel フィルタ対応 |
| LoRA 登録 | メタ情報・カテゴリ・BaseModel・推奨強度・トリガーワードセットを登録（ComfyUI 内ファイルパス自動補完対応） |
| LoRA 編集 | 登録済み LoRA のメタ情報・BaseModel 紐付け更新 |
| LoRA 削除 | 登録済み LoRA の削除 |
| サムネイル切り抜き | `ImageCropper` による自由なアスペクト比でのサムネイル画像切り抜き・登録 |
| トリガーワードセット管理 | 1つの LoRA に複数のトリガーワードセットを登録（例: 素体系・服装A・服装B） |
| カテゴリ管理 | ページ内から直接カテゴリマスタの追加・編集・削除モーダル（`CategoryManagerModal`）を起動 |
| LoRA 複数選択 | `Ctrl + クリック` / `Shift + クリック` / 長押しによる複数選択、D&Dでの一括並び替え (`reorder`)、およびカテゴリ・推奨強度・BaseModelの「一括編集」に対応 |

---

## 3. レイアウト

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [検索バー] [カテゴリフィルタ] [BaseModelフィルタ] [Register Model ボタン] │
├─────────────────────────────────────────────────────────────────────────┤
│  LoRA カード グリッド（D&D 並び替え対応）                                │
│  ┌──────────────────┐  ┌──────────────────┐                             │
│  │ [サムネイル/Crop] │  │ [サムネイル/Crop] │                             │
│  │ LoRA 名          │  │ LoRA 名          │                             │
│  │ [カテゴリバッジ]  │  │ [カテゴリバッジ]  │                             │
│  │ [BaseModelバッジ]│  │ [BaseModelバッジ]│                             │
│  │ トリガーワード    │  │ トリガーワード    │                             │
│  │ 推奨強度: 0.8    │  │ 推奨強度: 0.6〜1 │                             │
│  └──────────────────┘  └──────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. LoRA カード

| 要素 | 仕様 |
|---|---|
| サムネイル | 登録画像を表示。ない場合は `ImageIcon` プレースホルダー。アスペクト比設定連動 |
| カテゴリバッジ | カテゴリマスタから選択した値をバッジ表示 |
| BaseModel バッジ | 紐付けられているベースモデル名（SDXL, Pony 等）を表示 |
| トリガーワード | ホバー時にワンクリックコピーボタン表示 |
| 推奨強度 | 下限〜上限（例: `0.6 ~ 1.0`）または単一値（例: `0.8`。単一値指定時は `min` / `max` の双方に同値が保存される） |
| ファイルパス | フォルダアイコンをホバーで ComfyUI 側のファイルパスをツールチップ表示 |

---

## 5. 登録・編集モーダル（自動サジェスト補完機能）

登録・編集時に、ComfyUI のインストールフォルダ内にある LoRA モデルファイルの一覧をサジェスト入力する機能。

- **ファイルパスの自動補完**: 
  - `File Path` 入力欄にフォーカスまたは文字入力した際、バックエンドAPI（`/api/loras/comfy-models`）から取得した ComfyUI 側の全 LoRA ファイルパス（フォルダ構成を含む相対パス）の一覧がドロップダウン形式でサジェスト表示される。
  - すでに Prompt Surgeon 内に登録済みのファイルパスには「登録済み」バッジが表示され、重複登録できないよう選択が無効化される。
  - リストからパスを選択すると、`File Path` と `Model Name`（ファイルパスの末尾ファイル名から拡張子を除いたもの）が自動的に入力される。
  - ComfyUI オフライン時はエラー通知を表示し、手動によるファイルパス入力を許可する。

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
  sort_order: number;
  base_models?: BaseModel[];     // GET 取得時に展開される BaseModel オブジェクト配列
  target_base_model_ids?: number[]; // POST/PUT 登録・更新時に送信する BaseModel ID 配列
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

## 7. カテゴリマスタ & BaseModel マスタ

- **カテゴリ初期シード**: `キャラクター系`, `ポーズ再現系`, `スタイル系`, `コンセプト系`
- **BaseModel**: SD1.5, SDXL, Pony, Illustrious, Flux 等のマスタと関連付け可能。

---

## 8. API 呼び出し

| 操作 | エンドポイント | ペイロード / パラメータ |
|---|---|---|
| LoRA 一覧 | `GET /api/loras` | `?category_id={id}&base_model_id={id}&search={kw}` |
| LoRA 登録 | `POST /api/loras` | `{ "model_name": string, "target_base_model_ids": number[], ... }` |
| LoRA 更新 | `PUT /api/loras/{id}` | `{ "model_name": string, "target_base_model_ids": number[], ... }` |
| LoRA 削除 | `DELETE /api/loras/{id}` | |
| LoRA 並び替え | `PUT /api/loras/reorder` | `{ "ordered_ids": number[] }` |
| トリガーワードセット一覧 | `GET /api/loras/{id}/trigger-word-sets` | |
| トリガーワードセット登録 | `POST /api/loras/{id}/trigger-word-sets` | `{ "name": string, "words": string[] }` |
| トリガーワードセット更新 | `PUT /api/loras/{id}/trigger-word-sets/{set_id}` | `{ "name": string, "words": string[] }` |
| トリガーワードセット削除 | `DELETE /api/loras/{id}/trigger-word-sets/{set_id}` | |
| カテゴリ一覧・管理 | `GET/POST/PUT/DELETE /api/lora-categories` | |
| ベースモデル一覧 | `GET /api/base-models` | |
| ComfyUI 内 LoRA モデル取得 | `GET /api/loras/comfy-models` | |

---

*本ドキュメントは現行の LoRAsPage 実装に準拠した正本です。*
