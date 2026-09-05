---
id: PBI-REQ-082-test-plan
pbi: REQ-082
title: "RescanModal 候補ノードラベル表示改善 テストプラン"
---

# テストプラン: REQ-082

## テスト対象

- `frontend/src/components/RescanModal.tsx`

## TC-1: 正常系 — ラベル形式の確認

**目的**: AC-1 の検証  
**前提条件**: `workflowJson` にノードID `10` が存在し、`_meta.title = "positive"`, `class_type = "KSampler"` を持つ

**手順**:
1. 生成画面で再マッピングモーダルを開く
2. スキャン完了後、候補ノードのドロップダウンを確認する

**期待値**: オプションラベルが `10 - [positive] (KSampler)` の形式で表示されること

**CLI検証コマンド**:
```bash
# フロントエンド開発サーバ起動
cd frontend && npm run dev
```

---

## TC-2: フォールバック — ノード情報なし

**目的**: AC-2 の検証（`workflowJson` にノードが存在しない場合）

**手順**:
1. `workflowJson` に候補のノードIDが存在しない状態をシミュレートする
2. 候補ドロップダウンを確認する

**期待値**: ノードIDのみ（例: `10`）が表示されること。クラッシュしないこと

---

## TC-3: フォールバック — title/class_type 欠落

**目的**: AC-2 の検証（ノード情報の一部欠落）

**手順**:
1. `_meta.title` または `class_type` が欠落したノードを含む `workflowJson` を使用する

**期待値**:
- `_meta.title` 欠落 → `10 - [] (KSampler)` のように表示
- `class_type` 欠落 → `10 - [positive] ()` のように表示
- いずれもクラッシュしないこと

---

## TC-4: 動作保全 — value 値が変わらないこと

**目的**: ドロップダウンの選択後に保存される値がノードID（数値/文字列）のままであることを確認

**手順**:
1. ドロップダウンからノードを選択する
2. 「適用・保存」ボタンを押す

**期待値**: API に送信されるマッピングの `node_id` フィールドがラベルではなく元のIDであること
