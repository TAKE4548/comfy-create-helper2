# Prompt Surgeon — 共通仕様書 (SPEC_COMMON)

**バージョン**: 1.0  
**最終更新**: 2026-06-13

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md)

---

## 1. デザインシステム

### 1-1. カラーパレット（Design Tokens）

| トークン名 | 値 | 用途 |
|---|---|---|
| `base-bg` | `#0F0F11` | 最背面の背景色 |
| `surface` | `#18181C` | カード・サイドバー・ヘッダーパネル背景 |
| `surface-2` | `#1F1F25` | 入力欄・モーダル内部などの第2サーフェス |
| `accent-green` | `#3ECF8E` | 主要アクション・アクティブ状態・成功色 |
| `accent-purple` | `#7C6FDD` | LLM Audit 機能など特定の機能強調（限定使用） |
| `border` | `rgba(255,255,255,0.08)` | 汎用ボーダー（細線） |
| `text-primary` | `#E0E0E8` / `text-zinc-200` | 主要テキスト |
| `text-muted` | `text-zinc-400` / `text-zinc-500` | サブテキスト |

### 1-2. タイポグラフィ

- フォントファミリ: システムフォント（Tailwind デフォルト）
- ヘッダー・ラベル: `text-xs font-semibold` / `text-sm font-medium`
- ボディテキスト: `text-sm text-zinc-300`
- ミュートテキスト: `text-xs text-zinc-500`

### 1-3. 共通 UI ルール

- ボーダー: `border border-[rgba(255,255,255,0.08)]`（デフォルト）/ アクティブ時: `border-accent-green/50`
- 角丸: `rounded-lg`（標準）/ `rounded-xl`（カード・モーダル）
- スクロールバー: `.custom-scrollbar` クラスでカスタムスタイル適用（OS 標準非表示・細いダークスタイル）
- トランジション: `transition-all` / `transition-colors`（ホバー・アクティブの変化）
- アニメーション: `animate-pulse`（生成中インジケータ）/ `animate-fade-in`（モーダル等出現時）

---

## 2. App Shell（共通レイアウト）

### 2-1. 構成ファイル

`frontend/src/components/layout/AppShell.tsx`（138行）

### 2-2. デスクトップ: サイドバー

- 左固定サイドバー（`w-56` デフォルト / `w-16` 折り畳み）
- 300ms のスムーズなトランジションで折り畳み切り替え
- 折り畳み状態は localStorage キー `prompt-surgeon-sidebar-collapsed` で永続化
- トグルボタン ID: `#sidebar-toggle`
- ナビゲーションアイテム:

| アイコン | ラベル | ルート |
|---|---|---|
| Zap | Generate | `/` |
| Clock / History | History | `/history` |
| Image | LoRAs | `/loras` |
| Tag | Tags | `/tags` |
| Settings | Settings | `/settings` |

アクティブ状態: テキスト・アイコンを `accent-green`（`#3ECF8E`）でハイライト

### 2-3. モバイル: ボトムナビゲーション

- 画面下部固定
- アイコンのみ表示（テキストなし）
- ルート `/mobile` の場合は Generate ページの Mobile レイアウトへ遷移

---

## 3. TagChipEditor コンポーネント

**詳細**: 旧仕様書 `docs/spec_tag_chip_editor.md` をベースに、現行実装状況を反映。

### 3-1. 概要と位置づけ

`mapping_master.input_type === "textarea"` のフィールドに適用するタグ入力コンポーネント。  
各タグをチップとして視覚的に表示し、有効/無効のトグルや並び替えを可能にする。

### 3-2. ファイル構成

```
frontend/src/components/TagChipEditor/
  index.tsx           — メインコンポーネント（現行: 297行 ← リファクタリング対象）
  TagChip.tsx         — 1チップの UI（有効/無効/編集中 の 3状態）
  TagInput.tsx        — 新規タグ入力フィールド
  useChipHistory.ts   — Undo/Redo 管理フック
  useChipParser.ts    — テキスト文字列 ↔ TagChip[] 相互変換
  tagChipEditor.css   — ドラッグ中スタイル等 Tailwind で表現しにくいもの
  __tests__/          — ユニットテスト
```

### 3-3. データ構造

```typescript
type TagChip = {
  id: string;          // nanoid で生成したローカルキー
  text: string;        // タグ文字列（trim 済み）
  enabled: boolean;    // false = 無効化（グレーアウト）
  converting?: boolean; // LLM 変換キュー処理中フラグ
};
```

### 3-4. Props

```typescript
type TagChipEditorProps = {
  value: string;                          // カンマ区切りプロンプト文字列
  onChange: (value: string) => void;      // 有効チップのみをカンマ連結した文字列を返す
  placeholder?: string;
  disabled?: boolean;
  suggestedDisables?: string[];           // Audit 機能からの無効化候補
  suggestedAdds?: string[];               // Audit 機能からの追加候補
  llmCompletion?: {
    enabled: boolean;
    convert: (input: string) => Promise<string[]>;
  };
};
```

### 3-5. チップのインタラクション

| 操作 | 動作 |
|---|---|
| クリック（テキスト部） | 有効 ↔ 無効 トグル |
| `×` クリック | チップ削除 |
| ドラッグ&ドロップ | 並び替え（@dnd-kit/sortable） |
| ダブルクリック | インライン編集モード |
| `Delete` / `Backspace`（フォーカス中） | チップ削除 |
| `Space`（フォーカス中） | 有効 ↔ 無効 トグル |

### 3-6. 新規タグ入力（TagInput）

| 操作 | 動作 |
|---|---|
| カンマ / Enter / Tab | カーソル前テキストをチップ化・確定 |
| ペースト（カンマ区切り） | 複数チップを一括生成 |
| Backspace（フィールドが空） | 直前チップを削除 |

### 3-7. テキスト変換

```typescript
// 文字列 → チップ配列
function parseToChips(text: string): TagChip[] {
  return text.split(",").map(s => s.trim()).filter(Boolean)
    .map(text => ({ id: nanoid(), text, enabled: true }));
}

// チップ配列 → 文字列（ComfyUI 投入・onChange 用）
function chipsToString(chips: TagChip[]): string {
  return chips.filter(c => c.enabled).map(c => c.text).join(", ");
}
```

### 3-8. Undo/Redo

`useChipHistory.ts` で `useReducer` + `useRef` によりチップ列のスナップショット履歴を管理。  
履歴上限: 50件。

```typescript
type ChipAction =
  | { type: "ADD"; chip: TagChip }
  | { type: "REMOVE"; id: string }
  | { type: "TOGGLE"; id: string }
  | { type: "REORDER"; chips: TagChip[] }
  | { type: "EDIT"; id: string; text: string }
  | { type: "CONVERT"; id: string; text: string }
  | { type: "UNDO" }
  | { type: "REDO" };
```

| ショートカット | 動作 |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+A`（入力フィールド空） | 全チップ選択 |
| `Ctrl+D`（フォーカス中） | チップ複製 |

### 3-9. テキスト入力モード（エスケープハッチ）

右上の「テキスト入力モードに切替」で `textarea` に戻せる。  
- チップ → textarea: 有効チップのみをカンマ連結して反映  
- textarea → チップ: テキストをカンマ分割して再チップ化（無効チップは復元されない）

### 3-10. スマホ（/mobile）での扱い

`/mobile` ルートのプロンプト入力は textarea のまま（チップエディタ非適用）。

### 3-11. Audit 機能との連携

props による静的な受け渡しではなく、親（GeneratePage等）とチップエディタ間の疎結合を保つためにグローバルなカスタムイベントを利用して動的に連携する。
- **干渉タグ診断結果（無効化）**:
  - 親側の無効化ボタン押下時に `window.dispatchEvent(new CustomEvent('tag-chip-editor:disable-tag', { detail: { tag } }))` が発行される。
  - チップエディタ側でこのイベントを検知し、一致するタグチップの `enabled` ステータスを `false` にトグル（無効化・グレーアウト）する。
- **語彙サジェスト結果（追加）**:
  - 親側の追加ボタン押下時に `window.dispatchEvent(new CustomEvent('tag-chip-editor:add-tag', { detail: { tag } }))` が発行される。
  - チップエディタ側でこのイベントを検知し、新規タグチップとして末尾に追加する。

### 3-12. スナップショット保存時

`params` には有効チップのみをカンマ連結した文字列を保存する。無効チップは保存しない。

### 3-13. アクセシビリティ

| 要素 | ARIA 設定 |
|---|---|
| チップリスト全体 | `role="listbox"`, `aria-label="[フィールド名] のタグ"` |
| 個別チップ | `role="option"`, `aria-selected` で有効/無効を表現 |
| 無効チップ | `aria-label="[タグ名]（無効）"` |
| `×` ボタン | `aria-label="[タグ名] を削除"` |

### 3-14. 実装フェーズ状況

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 1 | チップ表示・有効/無効トグル・追加・削除・ペースト・D&D・テキストモード切替 | ✅ 実装済み |
| Phase 2 | インライン編集 | ✅ 実装済み |
| Phase 3 | Undo/Redo・Audit 連携 (`suggestedDisables` / `suggestedAdds`) | ✅ 実装済み |
| 拡張 | LLM 補完オプション（`llmCompletion` props）| 🔲 未実装 |
| 拡張 | 履歴ベースのタグサジェスト | 🔲 未実装 |

---

## 4. 未解決・判断保留事項（共通）

- **重み付き記法** `(tag:1.3)` や `[tag]` の扱い: 現状は記法込みで1チップとして扱う。重みの可視化 UI は将来拡張
- **LoRA タグ** `<lora:name:0.8>` のチップ表示/別枠扱いは未定
- **スナップショット復元時の無効チップ復元オプション**: 現状は持たない（保存時に有効チップのみが保存されるため不要）

---

*このドキュメントは `docs/spec_tag_chip_editor.md` および `docs/Prompt Surgeon FEデザイン・実装仕様書.md` のデザインシステム部分を統合・再構成したものです。*
