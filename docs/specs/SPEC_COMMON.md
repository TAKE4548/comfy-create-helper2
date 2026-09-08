# Prompt Surgeon — 共通仕様書 (SPEC_COMMON)

**バージョン**: 2.1  
**最終更新**: 2026-09-01  
**ステータス**: 現行実装に完全準拠（TagChipパース規則・イベント型契約・キャッシュライフサイクル定義）

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
| `accent-purple` | `#7C6FDD` | LLM 機能・設定など特定の機能強調（限定使用） |
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

`frontend/src/components/layout/AppShell.tsx`

### 2-2. デスクトップ: サイドバー

- 左固定サイドバー（`w-56` デフォルト / `w-16` 折り畳み）
- 300ms のスムーズなトランジションで折り畳み切り替え
- 折り畳み状態は localStorage キー `prompt-surgeon-sidebar-collapsed` で永続化
- トグルボタン ID: `#sidebar-toggle`
- ナビゲーションアイテム:

| アイコン | ラベル | ルート |
|---|---|---|
| Zap | Generate | `/` |
| Layers | LoRAs | `/loras` |
| Tag | Tags | `/tags` |
| Clock | History | `/history` |
| Settings | Settings | `/settings` |

アクティブ状態: テキスト・アイコンを `accent-green`（`#3ECF8E`）でハイライト

### 2-3. モバイル: ボトムナビゲーション

- 画面下部固定（`fixed bottom-0`）
- アイコン ＋ ラベルテキスト（Generate / LoRAs / Tags / History / Settings）を表示
- 全ページで同一のルーティング（`/`, `/loras`, `/tags`, `/history`, `/settings`）を共有

---

## 3. TagChipEditor コンポーネント

### 3-1. 概要と位置づけ

`mapping_master.input_type === "textarea"` のフィールドに適用するタグ入力コンポーネント。  
各タグをチップとして視覚的に表示し、有効/無効のトグル、並び替え、タグ強度（重み）調整を可能にする。

### 3-2. ファイル構成

```
frontend/src/components/TagChipEditor/
  index.tsx           — メインコンポーネント（テキスト/チップ切替、イベントリスナー）
  TagChip.tsx         — 1チップの UI（有効/無効/編集中/重み調整メニュー）
  TagInput.tsx        — 新規タグ入力フィールド（カンマ・Enter確定・ペースト一括入力）
  useChipHistory.ts   — Undo/Redo 管理フック
  useChipParser.ts    — テキスト文字列 ↔ TagChip[] 相互変換
  idGenerator.ts      — チップユニーク ID 生成
  tagChipEditor.css   — ドラッグ中スタイル等
  __tests__/          — ユニットテスト
```

### 3-3. データ構造

```typescript
type TagChip = {
  id: string;          // 衝突耐性のあるユニークID (idGenerator.ts により生成)
  text: string;        // タグ文字列（trim 済み、(tag:1.2) のような重み付き文字列も含む）
  enabled: boolean;    // false = 無効化（グレーアウト）
  converting?: boolean; // 変換処理中フラグ（過渡的一時状態。API送信や永続化時には除外）
};
```

### 3-4. Props

```typescript
interface TagChipEditorProps {
  id?: string;
  value?: string;                         // カンマ区切りプロンプト文字列（フォールバック用）
  onChange?: (val: string) => void;       // 有効チップのみをカンマ連結した文字列を返す
  chips?: TagChip[];                      // 構造体チップ配列（SSoT）
  onChipsChange?: (chips: TagChip[]) => void; // チップ変更通知（無効タグ保持）
  placeholder?: string;
  variant?: string;
  defaultTextMode?: boolean;              // テキストモード初期状態
  isAnimaMode?: boolean;                  // 自然言語/Anima向けモード
  onTextModeToggle?: (isTextMode: boolean) => void;
}
```

### 3-4-1. ライフサイクル保持仕様
- 画面遷移、アコーディオン開閉、モバイルタブ切替、Multi-Set切替において、無効タグ（`enabled: false`）を含めた完全なトークン配列が親ストア（`useGenerationStore.promptChips`）と `chips` / `onChipsChange` を介して双方向同期・保持される。
- `chips` prop が渡されている状態でも、親コンポーネントからの `value`（平文文字列）の更新（セクションコピペ機能 `PromptSectionClipboardMenu` や翻訳適用、履歴貼り付け等）が行われた場合、`chipsToString(state) !== value` を検知して最新の文字列を基にタグチップが再パース・更新される。
- 各レイアウト（`DesktopLayout`, `MobileLayout`）における `TagChipEditor` のキーには `key={`${activeSetId}-${role}`}` を適用し、プリセット切替時にコンポーネントが適切なキーで分離され、`multiSetSlice.loadPresetData` において `paramValues` から初期 `promptChips` が確実に補完・同期される。
- ComfyUI投入時およびスナップショット生成時は、機械的導出ヘルパー `getEffectiveParamValues`（`chipsToString`）により有効チップ（`enabled: true`）のみが平文マップ（`effectiveParamValues`）として抽出され、安全かつ確定的に送信・記録される。

### 3-5. チップのインタラクション

| 操作 | 動作 |
|---|---|
| クリック（テキスト部） | サブメニュー表示（タグ名直接編集、有効/無効トグル、**タグ強度（重み）スライダー調整**） |
| サブメニュー内タグ名入力 | タグ単語のインライン編集（Enter/Blurで確定、既存重みを維持、Escapeでキャンセル） |
| サブメニュー内強度スライダー | `(tag:0.5)` 〜 `(tag:2.0)` の範囲で強度をリアルタイム更新（1.0 の場合は通常タグに復帰） |
| `×` クリック | チップ削除 |
| ドラッグ&ドロップ | 並び替え（@dnd-kit/sortable、マウス最小8px移動 / タッチ最小5px移動） |
| ダブルクリック | チップ直接インライン編集モード |
| `Delete` / `Backspace`（フォーカス中） | チップ削除 |
| `Space`（フォーカス中） | 有効 ↔ 無効 トグル |
| `Ctrl+D`（フォーカス中） | チップ複製 |

### 3-6. 新規タグ入力（TagInput）

| 操作 | 動作 |
|---|---|
| カンマ / Enter / Tab | カーソル前テキストをチップ化・確定 |
| ペースト（カンマ区切り） | 複数チップを一括生成 |
| Backspace（フィールドが空） | 直前チップを削除 |

### 3-7. テキスト変換とパース規則

- **括弧・重み記法の保護**: `(tag:1.2)` や `(tag1, tag2:1.3)` のような括弧ネスト内のカンマは分割せず、1つのタグトークンとして保持する。
- **空トークン除外**: 連続カンマ `,,` や空白のみのトークンは自動的に `trim()` され除外される。

```typescript
// 文字列 → チップ配列
function parseToChips(text: string): TagChip[] {
  return text.split(",").map(s => s.trim()).filter(Boolean)
    .map(text => ({ id: generateChipId(), text, enabled: true }));
}

// チップ配列 → 文字列（ComfyUI 投入・onChange 用）
function chipsToString(chips: TagChip[]): string {
  return chips.filter(c => c.enabled).map(c => c.text).join(", ");
}
```

### 3-8. Undo/Redo

`useChipHistory.ts` で `useReducer` + `useRef` によりチップ列のスナップショット履歴を管理。履歴上限: 50件。

| ショートカット | 動作 |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+D`（フォーカス中） | チップ複製 |
| `Space`（フォーカス中） | 有効 / 無効 切り替え |
| `Delete`（フォーカス中） | チップ削除 |

### 3-9. テキスト入力モード（エスケープハッチ）

右上の「テキスト入力モードに切替」で `textarea` に戻せる。  
- チップ → textarea: 有効チップのみをカンマ連結して反映  
- textarea → チップ: テキストをカンマ分割して再チップ化（無効チップは復元されない）

### 3-10. Audit 機能との連携（カスタムイベント契約）

親（GeneratePage等）とチップエディタ間の疎結合を保つためにグローバルなカスタムイベントを利用して動的に連携する。

```typescript
// イベントペイロード型定義
interface TagChipEventDetail {
  tag: string;
}
```

- **干渉タグ診断結果（無効化）**:
  - 親側の無効化ボタン押下時に `window.dispatchEvent(new CustomEvent('tag-chip-editor:disable-tag', { detail: { tag } }))` が発行される。
  - チップエディタ側でこのイベントを検知し、一致するタグチップの `enabled` ステータスを `false` にトグル（無効化・グレーアウト）する。
- **語彙サジェスト結果（追加）**:
  - 親側の追加ボタン押下時に `window.dispatchEvent(new CustomEvent('tag-chip-editor:add-tag', { detail: { tag } }))` が発行される。
  - チップエディタ側でこのイベントを検知し、新規タグチップとして末尾に追加する。

---

## 4. 共通 UI コンポーネント & フック

### 4-1. ImageCropper (`components/ImageCropper.tsx`)
- LoRA / TagSet のサムネイル画像登録時に、プレビュー画像の自由なアスペクト比切り抜きを行うモーダルコンポーネント。

### 4-2. ImageCarousel (`components/ImageCarousel.tsx`)
- 複数枚のプレビュー画像やスナップショット画像を一覧表示・スライド切替する軽量カルーセル。

### 4-3. InlineCategorySelect (`components/InlineCategorySelect.tsx`)
- カード内やリスト内でカテゴリをワンクリックで直接切替可能なドロップダウン。

### 4-4. PageHeader (`components/common/PageHeader.tsx`)
- アイコン・ページタイトル・アクションボタンを一貫して配置する共通ヘッダーコンポーネント。

### 4-5. useThumbnailAspectRatio (`hooks/useThumbnailAspectRatio.ts`)
- アプリケーション全体（History、LoRAs、Tags）のサムネイル表示アスペクト比（1:1, 3:4, 4:3, 16:9 等）を localStorage で一元管理し、CSS クラス・スタイルを提供するフック。

---

## 5. 複数選択 UI パターン (Multi-Select UI Patterns)

各画面（LoRAsPage、TagsPage、HistoryPage、SettingsPage、GeneratePage）で統一して使用される複数選択および一括操作機能の共通設計仕様。

### 5-1. useMultiSelect フック
- **状態管理**: `isMultiSelectMode`, `selectedIds` (Set) を管理。
- **操作トリガー**:
  - `Ctrl + クリック` / `Meta + クリック`: 対象アイテムを選択しつつ、複数選択モードをON。
  - `Shift + クリック`: 最後に選択したアイテムから、今回クリックしたアイテムまでの範囲をまとめて選択状態。
  - **長押し (Long Press)**: アイテムを 500ms 以上長押し（タッチ長押し含む）することで複数選択モードを起動。長押し時間は設定画面でカスタマイズ可能。
- **選択解除/終了**: `exitMultiSelectMode()` により選択モードをOFFにし、選択状態を全てクリア。

### 5-2. 複数選択ツールバー (MultiSelectToolbar)
- 複数選択モードが有効な際、画面上部にスライド表示される共通ツールバー。
- **表示内容**: 選択件数 / 全体件数、全選択、選択解除、選択モード終了ボタン、画面固有アクションボタン。

### 5-3. 一括編集モーダル (BulkEditModal)
- 複数選択されたアイテムのフィールドを一括で更新するためのモーダルダイアログ。
- カテゴリ、推奨強度範囲、テキスト入力、対象BaseModel等を一括更新（`Promise.all` で送信）。

### 5-4. ドラッグ＆ドロップ（グループ移動オーバーレイ）
- 複数選択モード中のドラッグ操作時は、ドラッグ中アイテムに加えて `+N` バッジが浮遊表示され、選択アイテムが並び順を維持したまま一括で移動・並び替え（`reorder`）される。

---

## 6. フロントエンドキャッシュ・データフェッチ仕様

### 6-1. キャッシュ基本方針
- TanStack Query (React Query v5) + `PersistQueryClientProvider` による localStorage 永続化（10分間キャッシュ有効）。
- Stale-While-Revalidate（SWR）モデルにより、UI 遷移時のフリッカーを排除しつつバックグラウンドで最新データを同期。
- **永続化除外クエリ (`App.tsx` の `shouldDehydrateQuery`)**:
  - `comfy-object-info`: ComfyUI の動的ノード定義。
  - `snapshots`: 頻繁に更新されるスナップショット。
  - `workflow-presets`: マルチデバイス間でのプリセット同期（REQ-229）において、アプリ起動時に古いローカルキャッシュが初期化ステートを上書き・破壊するのを防ぐため永続化から除外。
- `Infinity` 設定の静的データ（`config`, `fonts`）は、アプリ再読み込み時または設定画面での明示的リフレッシュ時に再取得される。

### 6-2. staleTime 定数テーブル (`frontend/src/constants/staleTimes.ts`)

| データ分類 | 該当データ・API | `staleTime` |
|---|---|---|
| 静的・不変 | `config`, `fonts` | `Infinity` |
| 準静的マスター | `base-models`, `lora-categories`, `tagset-categories`, `llm-prompts` | 10分 (`10 * 60 * 1000`) |
| マスター設定 | `param-type-masters`, `mapping-masters`, `speech-bubble-presets`, `snapshots/:id` (詳細) | 5分 (`5 * 60 * 1000`) |
| 頻出アセット | `workflows`, `loras`, `tag-sets`, `albums`, `presets` | 1分 (`60 * 1000`) |
| 動的データ | `snapshots` (一覧), `speech-batch-active-job` | 15秒 (`15 * 1000`) |

---

*本ドキュメントは現行の共通コンポーネントおよびデザインシステム実装に準拠した正本です。*

