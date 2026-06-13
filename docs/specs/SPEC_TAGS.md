# Prompt Surgeon — Tags ページ仕様書 (SPEC_TAGS)

**バージョン**: 1.0  
**最終更新**: 2026-06-13  
**実装ファイル**: `frontend/src/pages/TagsPage.tsx`（現行 500行 ← 🟡 リファクタリング対象）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md)

---

## 1. 概要

よく使うタグの組み合わせをカテゴリ付きで登録・管理するページ。  
Generate ページのアセットパネルから role 単位で適用できる。

---

## 2. 機能一覧

| 機能 | 説明 |
|---|---|
| タグセット一覧 | ライブラリ（右カラム）に一覧表示。検索・カテゴリフィルタ対応 |
| タグセット新規作成 | エディタ（左カラム）で Set Name / Category / Tags を入力して保存 |
| タグセット編集 | ライブラリのカードをクリックしてエディタにロード |
| タグセット削除 | 編集中のタグセットを削除 |
| カテゴリ管理 | カテゴリの追加/削除（削除時は既存レコードを「未設定」に変更） |

---

## 3. レイアウト

左右2カラム構成。

```
┌──────────────────────┬─────────────────────────────────────┐
│  エディタ（左）        │  ライブラリ（右）                    │
│                      │  [検索バー] [カテゴリフィルタ]         │
│  [New Set ボタン]     │  [Manage Categories ⚙ ボタン]        │
│                      ├─────────────────────────────────────┤
│  Set Name:           │  ┌────────────────────────────┐      │
│  [______________]    │  │ タグセット名                │      │
│                      │  │ [カテゴリバッジ]            │      │
│  Category:           │  │ タグ: foo, bar, baz...     │      │
│  [セレクトボックス]   │  └────────────────────────────┘      │
│                      │                                     │
│  Tags:               │  ┌────────────────────────────┐      │
│  [textarea]          │  │ タグセット名                │      │
│                      │  └────────────────────────────┘      │
│  [Save Tag Set]      │                                     │
│  [Delete]            │                                     │
└──────────────────────┴─────────────────────────────────────┘
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
  tags: string[];               // タグのリスト
}
```

**注**: Positive / Negative の属性は持たない設計。role 別の適用は Generate ページで制御する。

---

## 5. カテゴリマスタ

初期シードデータ:
- `キャラクター系`
- `ポーズ・行動系`
- `構図・画角系`
- `表情系`
- `背景・環境系`

カテゴリは任意追加・削除可能。  
削除時: 該当カテゴリが付いている既存レコードは「未設定」に自動変更。

---

## 6. API 呼び出し

| 操作 | エンドポイント |
|---|---|
| タグセット一覧 | `GET /api/tag-sets` |
| タグセット登録 | `POST /api/tag-sets` |
| タグセット更新 | `PATCH /api/tag-sets/{id}` |
| タグセット削除 | `DELETE /api/tag-sets/{id}` |
| カテゴリ一覧 | `GET /api/tagset-categories` |
| カテゴリ登録 | `POST /api/tagset-categories` |
| カテゴリ削除 | `DELETE /api/tagset-categories/{id}` |

---

## 7. リファクタリング計画

現行 500行。hooks + sub-components に分割して各ファイル ~200行以内に収める。

```
pages/TagsPage/（分割後）
  index.tsx                   ← レイアウト・ページ制御のみ（~100行）
  hooks/
    useTagSetList.ts          ← 一覧取得・フィルタロジック
    useTagSetEditor.ts        ← エディタ状態管理（新規・編集切り替え）
    useCategoryManager.ts     ← カテゴリ CRUD
  components/
    TagSetCard.tsx            ← ライブラリカード1件のUI
    TagSetEditor.tsx          ← 左カラムエディタUI
    CategoryManagerModal.tsx  ← カテゴリ管理モーダル
```
