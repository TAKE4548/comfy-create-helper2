# Prompt Surgeon — LoRAs ページ仕様書 (SPEC_LORAS)

**バージョン**: 2.3
**最終更新**: 2026-10-20
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
| サムネイル切り抜き | `ImageCropper` による切り抜き・登録。LoRAカードでは縦長画像として表示 |
| 学習例画像 | 手動追加した順序付き例画像を管理。生成済み参照画像とは別に保持 |
| トリガーワードセット管理 | 1つの LoRA に複数のトリガーワードセットを登録（例: 素体系・服装A・服装B） |
| カテゴリ管理 | ページ内から直接カテゴリマスタの追加・編集・削除モーダル（`CategoryManagerModal`）を起動 |
| LoRA 複数選択 | 検索・フィルタ結果の全選択、`Shift + クリック`、500ms長押しによる複数選択、およびカテゴリ・推奨強度・BaseModelの一括編集に対応 |

---

## 3. レイアウト

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [検索バー] [カテゴリフィルタ] [BaseModelフィルタ] [Register Model ボタン] │
├─────────────────────────────────────────────────────────────────────────┤
│  LoRA カード グリッド（選択中はD&D無効）                                 │
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

- カードは高さ320pxの縦長表示とし、画像領域はカード高の約55〜60%を占める。画面幅に応じて2/3/4列で配置する。例画像はホバーまたはスワイプで確認できる。
- サムネイルの切り抜き比率は保存・再表示後も維持する。
- 例画像には手動登録した順序付き例画像を表示し、生成参照画像とは区別する。タグ語はコピーできる。
- 複数選択中は並び替えD&Dを無効にする。通常時の並び替えは専用ハンドルから開始する。「全選択」は検索・フィルタ後の全件に適用する。

---

## 5. 登録・編集モーダル（自動サジェスト補完機能）

登録・編集時に、ComfyUI のインストールフォルダ内にある LoRA モデルファイルの一覧をサジェスト入力する機能。

- **ファイルパスの自動補完**: 
  - `File Path` 入力欄にフォーカスまたは文字入力した際、バックエンドAPI（`/api/loras/comfy-models`）から取得した ComfyUI 側の全 LoRA ファイルパス（フォルダ構成を含む相対パス）の一覧がドロップダウン形式でサジェスト表示される。
  - すでに Prompt Surgeon 内に登録済みのファイルパスには「登録済み」バッジが表示され、重複登録できないよう選択が無効化される。
  - リストからパスを選択すると、`File Path` と `Model Name`（ファイルパスの末尾ファイル名から拡張子を除いたもの）が自動的に入力される。
  - ComfyUI オフライン時はエラー通知を表示し、手動によるファイルパス入力を許可する。

- **トリガーワードセット表示・編集インタラクション**:
  - **登録・編集モーダル (`LoraEditModal`)**:
    - トリガーワードセットのタグ入力領域は `TagChipEditor` を採用。
    - 初期表示（デフォルト）は「チップ表示」。トグルボタンによりカンマ区切りテキスト表示とシームレスに相互切替可能。
    - チップ表示時はドラッグ＆ドロップによる並び替え、インライン編集、タグ追加、削除（`×`ボタン）に対応。
  - **詳細モーダル (`LoraDetailModal`)**:
    - トリガーワードセット表示部は `TagChipViewer` を採用。
    - 初期表示（デフォルト）は「チップ表示」。トグルボタンによりカンマ区切りテキスト表示とシームレスに相互切替可能。
    - チップ表示時は閲覧専用（Read-only）ガードが適用され、並び替えやタグ削除・編集などの破壊的操作は不可。
    - **モバイルボトムシート構造（幅767px以下, REQ-377）**:
      - 3層ボトムシート構造: 最外層 Backdrop 下部寄せ、上端ドラッグハンドル、固定ヘッダー、単一縦スクロール本文 (`flex-1 overflow-y-auto overscroll-contain`)、固定アクションフッターで構成。最大高さ `max-h-[90dvh]`、上端角丸 `rounded-t-2xl`。
      - 固定アクションフッター配置（MUI-03, MUI-04）: 本文スクロール位置に依存せず最下部に常駐。セーフエリア対応（`pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]`）および最小44×44pxタップ領域（MUI-06 Hit-Slop）を確保。
        - 閲覧モード (View Mode): 左に `Close`（二次アクション・枠線）、右に `Edit`（一次アクション・強調）
        - 編集モード (Edit Mode): 左に `Cancel`（二次アクション・変更破棄）、右に `Save`（一次アクション・強調・保存実行）
      - 本文先頭の小型 Cover 導線（MUI-05）: 常駐の巨大画像プレビュー・グリッドを排除し、本文先頭に小型サムネイルと Related Snapshots 件数をまとめたコンパクトバナー（Chevron 誘導付き）を配置。
      - 画像ギャラリーサブビュー（同一モーダル内遷移）: 小型 Cover をタップすると、モーダルをネストせず同一ダイアログ内でギャラリーサブビュー（`isGalleryOpen = true`）へ遷移。Related Snapshots の拡大閲覧、Cover 指定（編集中）、画像アップロード（`ImageCropper` 連携）を提供。Cover 変更は編集ステートに保持され、シート本体の `Save` 押下で永続化（`Cancel` またはシート閉時は元の状態へ復元）。
    - **デスクトップ表示（幅768px以上）**: 左ペイン（画像プレビュー＆スナップショット一覧）と右ペイン（メタデータ・トリガーワード）の 2 列分割レイアウト基準（Baseline）を 100% 保持する。
- 登録・編集モーダルは幅768px未満でボトムシートとタブ表示、デスクトップでは最大680px・2列レイアウトを使う。
- 推奨強度は0.05刻みで編集し、下限は上限以下に保つ。生成画面のアセット追加トレイはLoRA IDごとの選択と強度を保持し、適用時は選択中のLoRAと強度を正確に反映する。

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
  example_paths?: string[];      // 手動登録した順序付き学習例画像。生成参照画像とは別管理
}

// 手動例画像は順序を保持した個別レコード（LoraExampleImage）として保存する。
// 更新時 example_paths 省略/null は既存を保持し、[] は全件クリアを表す。

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
| LoRA 登録 | `POST /api/loras` | `{ "model_name": string, "target_base_model_ids": number[], "example_paths"?: string[], ... }` |
| LoRA 更新 | `PUT /api/loras/{id}` | `{ "model_name": string, "target_base_model_ids": number[], "example_paths"?: string[] \| null, ... }`（省略/nullは保持、空配列はクリア） |
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


## REQ-334 最終一括操作契約

選択LoRAのカテゴリ・対応BaseModelを一括更新できる。全置換PUTでは編集しないBaseModel ID、手動作例、画像、トリガー、メタ情報を保持する。「選択をJSONエクスポート」は選択中のLoRAレコードだけのJSON配列を出力し、一時Blob URLを解放する。未選択LoRAへの更新・削除・出力は行わない。削除は対象名と件数の画面内確認を経て実行し、キャンセルでは変更しない。


## REQ-334 画像比率・面積の最終契約

カードはDesktop基準220×320px、画像フレームは設定のアセットサムネイル比率を維持する。幅W/高さHのカード内容領域と比率rに対し画像幅√(0.58rWH)、高さ√(0.58WH/r)で面積58%を確保し、object-fit:coverとする。外枠borderを含む実測は約57.1%。画像なしも同じフレームに09090B背景。残る本文はカード内スクロールで全操作へ到達できる。
