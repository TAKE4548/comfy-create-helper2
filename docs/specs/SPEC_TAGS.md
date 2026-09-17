# Prompt Surgeon — Tags ページ仕様書 (SPEC_TAGS)

**バージョン**: 2.1  
**最終更新**: 2026-09-01  
**実装ファイル**: `frontend/src/pages/TagsPage.tsx`（`TagSetModals.tsx`, `CategoryManagerModal.tsx` 分割構成）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md)

---

## 1. 概要

よく使うタグの組み合わせをカテゴリ・BaseModel・サブセット（バリエーション）付きで登録・管理するページ。  
Generate ページのアセットパネルから role 単位で適用できる。

---

## 2. 機能一覧

| 機能 | 説明 |
|---|---|
| タグセット一覧 | Grid 表示。検索キーワード・カテゴリフィルタ・BaseModel フィルタ（**AND 結合**）対応 |
| タグセット新規作成 | モーダルダイアログ（`TagSetCreateModal`）で名前・カテゴリ・BaseModel・タグ・サブセットを入力して登録 |
| タグセット編集・詳細 | カードクリックで詳細/編集モーダル（`TagSetEditModal`, `TagSetDetailModal`）を開き更新 |
| タグセット削除 | 登録済みタグセットの削除（紐づくサブセットはカスケード削除） |
| タグサブセット管理 | 1つのタグセット内に複数のバリエーションタググループ（例: 「衣装通常」「衣装破損」「夏服」等）をサブセットとして保持・管理 |
| サムネイル切り抜き | `ImageCropper` による自由なアスペクト比でのサムネイル画像切り抜き・登録 |
| カテゴリ管理 | ページ内から直接カテゴリマスタの追加・編集・削除モーダル（`CategoryManagerModal`）を起動 |
| タグセット複数選択 | `Ctrl + クリック` / `Shift + クリック` / 長押しによる複数選択、D&Dでの一括並び替え (`reorder`)、およびカテゴリ・BaseModelの「一括編集」に対応 |

- **タグおよびサブセット表示・編集インタラクション**:
  - **登録・編集モーダル (`TagSetCreateModal`, `TagSetEditModal`)**:
    - メインタグおよびサブセット（バリエーション）のタグ入力領域は `TagChipEditor` を採用。
    - 初期表示（デフォルト）は「チップ表示」。トグルボタンによりカンマ区切りテキスト表示とシームレスに相互切替可能。
    - チップ表示時はドラッグ＆ドロップによる並び替え、インライン編集、タグ追加、削除（`×`ボタン）に対応。
  - **詳細モーダル (`TagSetDetailModal`)**:
    - メインタグおよびサブセット表示部は `TagChipViewer` を採用。
    - 初期表示（デフォルト）は「チップ表示」。トグルボタンによりカンマ区切りテキスト表示とシームレスに相互切替可能。
    - チップ表示時は閲覧専用（Read-only）ガードが適用され、並び替えやタグ削除・編集などの破壊的操作は不可。

---

## 3. レイアウト（カードグリッド ＋ モーダル方式）

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [検索バー] [カテゴリフィルタ] [BaseModelフィルタ] [Register Tag Set ボタン] │
├──────────────────────────────────────────────────────────────────────────┤
│  タグセット カード グリッド（D&D 並び替え対応）                           │
│  ┌────────────────────────────┐  ┌────────────────────────────┐          │
│  │ [サムネイル/Crop]           │  │ [サムネイル/Crop]           │          │
│  │ タグセット名                │  │ タグセット名                │          │
│  │ [カテゴリバッジ] [BaseModel] │  │ [カテゴリバッジ] [BaseModel] │          │
│  │ タグ: 1girl, solo, ...      │  │ タグ: smile, blush, ...     │          │
│  │ サブセット: [通常] [破損]   │  │ サブセット: [笑顔] [怒り]   │          │
│  └────────────────────────────┘  └────────────────────────────┘          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. タグセットデータモデル

```typescript
interface TagSet {
  id: number;
  name: string;
  description?: string;
  category_id?: number;
  category?: { id: number; name: string };
  tags: string[];               // デフォルトタグリスト
  thumbnail_path?: string;
  sort_order: number;
  base_models?: BaseModel[];     // GET 取得時に展開される BaseModel オブジェクト配列
  target_base_model_ids?: number[]; // POST/PUT 登録・更新時に送信する BaseModel ID 配列
  subsets?: TagSubset[];        // バリエーションサブセット（親削除時 CASCADE 削除）
}

interface TagSubset {
  id: number;
  tag_set_id: number;
  name: string;                  // サブセット名（例: 「衣装A」「水着」「破損差分」）
  tags: string[];                // サブセットのタグリスト
}
```

---

## 5. カテゴリマスタ & BaseModel マスタ

- **カテゴリ初期シード**: `キャラクター系`, `ポーズ・行動系`, `構図・画角系`, `表情系`, `背景・環境系`
- **BaseModel**: SD1.5, SDXL, Pony, Illustrious, Flux 等のマスタと関連付け可能。

---

## 6. API 呼び出し

| 操作 | エンドポイント | ペイロード / パラメータ |
|---|---|---|
| タグセット一覧 | `GET /api/tag-sets` | `?category_id={id}&base_model_id={id}&search={kw}` |
| タグセット登録 | `POST /api/tag-sets` | `{ "name": string, "target_base_model_ids": number[], "subsets": [...] }` |
| タグセット更新 | `PUT /api/tag-sets/{id}` | `{ "name": string, "target_base_model_ids": number[], "subsets": [...] }` |
| タグセット削除 | `DELETE /api/tag-sets/{id}` | |
| タグセット並び替え | `PUT /api/tag-sets/reorder` | `{ "ordered_ids": number[] }` |
| カテゴリ一覧・管理 | `GET/POST/PUT/DELETE /api/tagset-categories` | |
| ベースモデル一覧 | `GET /api/base-models` | |

---

*本ドキュメントは現行の TagsPage 実装に準拠した正本です。*
