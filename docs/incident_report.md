# インシデントレポート

**報告日**: 2026-07-09  
**報告者**: Incident Analyst (自動生成)  
**関連PBI**: REQ-112 (アーカイブ)

---

## 1. 症状 (Symptoms)

| 項目 | 内容 |
|---|---|
| 報告内容 | プリセット管理モーダル内でプリセットを選択してもタブとして開けない |
| 期待動作 | プリセット管理モーダル内の任意プリセットをクリック/選択するとタブバーにタブとして追加され、アクティブになること |
| 実際の動作 | タブが一切開かれない。行クリックの操作自体が未実装 |
| 影響範囲 | GeneratePage — プリセット管理モーダル (`isPresetManagerOpen=true` 時) |

---

## 2. 再現手順 (Reproduction Steps)

1. GeneratePage を開く
2. ワークフローを選択する
3. タブバー右端の「📑 管理」ボタンをクリックしてプリセット管理モーダルを開く
4. プリセット一覧内の任意のプリセット行をクリックする
5. **結果**: タブバーに変化なし。タブが開かれない

---

## 3. 根本原因分析 (Root Cause Analysis)

### 分類: **Type A — 実装バグ（配線漏れ）**

Store インフラは完成しているが、UI コンポーネントへの配線が3箇所で欠落している。

| # | 欠落箇所 | ファイル | 証拠 |
|---|---|---|---|
| 1 | `PresetManagerPanelProps` に `onOpenAsTab` コールバックが未定義 | `PresetManagerPanel.tsx:10-22` | 型定義に該当 prop なし |
| 2 | `SortablePresetRow` にタブを開く UI 要素（ボタン / クリックハンドラ）がない | `PresetManagerPanel.tsx:295-377` | onClick 実装なし |
| 3 | `GeneratePage.tsx` のモーダル部でストアの `openPreset` を destructure せず、パネルに渡していない | `GeneratePage.tsx:29,159-178` | `openPreset` の配線なし |

### 既存インフラ（問題なし）

| 機能 | ファイル・行 | 状態 |
|---|---|---|
| `openPreset(id)` ストアアクション | `useGenerationStore.ts:1286-1292` | ✅ 実装済み |
| `openPreset` フック公開 | `useGeneratePageState.ts:126-127` | ✅ 公開済み |
| タブバーの `openPresetIds` フィルタリング | `DesktopLayout.tsx:255` | ✅ 動作中 |

---

## 4. 修正方針 (Recommended Fix Scope)

> ⚠️ 以下は **提案のみ**。実装は `/dev-design` または `/dev-task` ワークフローで行うこと。

修正対象は以下 3 ファイル:

1. **`PresetManagerPanel.tsx`**
   - `PresetManagerPanelProps` に `onOpenAsTab?: (id: number) => void` を追加
   - `SortablePresetRow` の props/UI にタブ開く操作を追加（例: 行クリックで `onOpenAsTab` を呼ぶ）

2. **`GeneratePage.tsx`**
   - `state` から `openPreset` を destructure
   - `<PresetManagerPanel>` に `onOpenAsTab={(id) => { openPreset(id); setActiveSetId(id); setIsPresetManagerOpen(false) }}` を渡す

---

## 5. 次アクション

- `/dev-design` ワークフローで実装計画を策定
- 上記 2 ファイルのみの変更で完結する見込み（影響範囲は小さい）
