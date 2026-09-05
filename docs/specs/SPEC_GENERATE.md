# Prompt Surgeon — Generate ページ仕様書 (SPEC_GENERATE)

**バージョン**: 2.1  
**最終更新**: 2026-09-01  
**実装ファイル**: `frontend/src/pages/GeneratePage.tsx`（モジュール分割完了済み）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md)

---

## 1. 概要

ComfyUI ワークフローを選択し、プロンプト・パラメータを編集して画像生成を実行するメインページ。  
PC/タブレット（`DesktopLayout`）およびモバイル（`MobileLayout`）を同一ルート `/` 内で画面幅に応じて自動的に切り替えて提供する。

---

## 2. デスクトップレイアウト (`DesktopLayout`)

2カラム + 上部ヘッダー構成。

```
┌────────────────────────────────────────────────────────────────┐
│ [Header] ワークフロー選択 / BaseModel / Presets / Bypass / Sync│
├──────────────────────────────┬─────────────────────────────────┤
│  左カラム（設定・入力）        │  右カラム（プレビュー・履歴）    │
│  - LLM Audit パネル          │  - メインプレビュー              │
│  - プロンプト入力（タブ切替）  │  - 履歴サムネイルストリップ      │
│  - 翻訳 / シーン生成ボタン   │  - スナップショット              │
│  - LoRA / TagSet アセット    │  - 生成コントロール              │
│  - パラメータ入力             │  - キュー管理ボタン              │
│  - マッピング確認             │                                 │
└──────────────────────────────┴─────────────────────────────────┘
```

### 2-1. ヘッダー

| 要素 | ID / 識別子 | 説明 |
|---|---|---|
| 接続インジケーター | — | ComfyUI WebSocket 接続状態（緑パルス: 接続中 / グレー: 未接続） |
| ワークフロー選択 | `#workflow-select` | セレクトボックス。「+ 新しいワークフローを追加」が先頭オプション |
| ワークフロー管理 | `#workflow-manage-btn` | 名称変更・複製（`POST /copy`）モーダルを開く |
| Presets ボタン | `#presets-toggle-btn` | プリセット管理パネル（`PresetManagerPanel`）の開閉 |
| Bypass ボタン | `#bypass-toggle-btn` | ノードバイパス設定モーダル（`BypassSettingsModal`）の開閉 |
| Param Sync ボタン | `#param-sync-btn` | パラメータ連動同期モーダル（`ParamSyncModal`）の開閉 |
| Rescan ボタン | `#rescan-btn` | ワークフローマッピングの再スキャン（`RescanModal`）を開く |
| Settings ボタン | `#settings-toggle-btn` | ComfyUI URL 設定ポップオーバーの開閉 |

### 2-2. LLM 支援パネル (Audit / Translate / Scene Generator)

アクセントカラーは `accent-purple`（`#7C6FDD`）を使用。外部 API はタイムアウト監視（翻訳: 10秒、シーン/監査: 30秒）を行い、失敗時はトースト警告を表示して安全にフォールバックする。

1. **LLM Audit パネル (`AuditPanel.tsx`)**:
   - 監査タイプの選択（`interference` / `vocabulary` / `physical`）
   - Intent 入力（やりたいこと・変更したいこと）
   - 実行結果: 干渉タグ（無効化イベント発行）、語彙サジェスト（追加イベント発行）
2. **プロンプト翻訳 (`PromptTranslationModal.tsx`)**:
   - 日本語入力テキストから英語プロンプト・タグへの自動翻訳（Google Cloud / DeepL / LLM 選択可能）。
   - 翻訳エラー時は元の日本語テキストを入力欄に挿入する安全フォールバック。
3. **シーン自動生成 (`SceneGeneratorModal.tsx`)**:
   - 日本語のシチュエーション文章から、各ロール（背景・構図・ポーズ・表情等）への最適なプロンプトタグを自動分解・一括生成。

### 2-3. プロンプト入力パネル

ワークフローの `mappings` から `input_type === "textarea"` のフィールドを動的生成。各フィールドは [TagChipEditor](./SPEC_COMMON.md#3-tagchipeditor-コンポーネント) で表示。
- タブ切り替えで複数プロンプトフィールドを切り替え。
- 各プロンプトフィールドに「+ LoRA / TagSet を追加」ボタンを配置。
- 「テキスト入力モード切替」エスケープハッチを完備。
- **構造化チップ（`promptChips`）の状態管理と保持規則**:
  - プロンプトのトークン構造（無効タグ `enabled: false` を含む配列）は、グローバルストア `useGenerationStore.promptChips`（`Record<string, TagChip[]>`）および `GenerationSet.promptChips` を SSoT として一元管理される。
  - アコーディオンの開閉、モバイル画面のタブ切り替え、Multi-Set切替・追加・複製を行っても、無効タグの状態は破棄されず完全に維持される。
  - ComfyUIへのキュー投入時（単一セット / Multi-Set）は、機械的導出ヘルパー `getEffectiveParamValues` により有効タグ（`enabled: true`）のみが抽出された平文マップが作成され、パラメータ同期（ParamSync）を経てComfyUI APIへ投入される。これにより無効タグが画像生成やメタデータ記録に混入することはない。

### 2-4. アセットパネル（LoRA / TagSet の適用）

`appliedAssets: Record<role, AppliedAsset[]>` で管理。role 単位でアセットを紐づける。
- アセットの有効/無効トグルで対応プロンプトフィールドに自動追加/除去。
- LoRA 追加時: `loraPromptString`（`<lora:filename:strength>`）とトリガーワードを注入。
- TagSet 追加時: タグ（または選択されたサブセット）を対応 role のプロンプトに追加。

### 2-5. パラメータ入力パネル (`ParamPanel.tsx`)

`input_type` が `int` / `float` / `select` / `lora_stack` / `select_sampler` / `select_scheduler` / `boolean` のマッピングを動的生成。

- **サンプラ・スケジューラ選択 UI**: ComfyUI の `/object_info` から動的取得（オフライン時は定数フォールバック）。
- **動的 LoRA スタック UI (`LoraStackEditor.tsx`)**: 最大10スロットの動的追加・削除・詰め直し、説明文照合表示。
- **固定パラメータ**: Batch Size（枚数入力）、Seed（🎲 Shuffle / 🔒 Fixed）。

### 2-6. ワークフロープリセット (`PresetManagerPanel.tsx`)

- 現在のプロンプト値、パラメータ値、適用アセット、バッチ枚数、シード設定を一括で名前付きプリセットとして保存。
- **プリセット適用のフォールトトレランス**:
  - ワークフローのノード構成変更や BaseModel 差異により存在しない mapping role の値が含まれる場合、存在する role のみを適用し、欠落した role は安全にスキップして警告トーストを表示する。
- プリセットのワンクリックロード、更新、削除、並び替え（`PUT /api/presets/reorder`）、一括削除・編集（`ProfileBulkEditModal`）に対応。
  - プロンプトの一括編集における先頭追加（`prefix`）・末尾追加（`suffix`）では、境界デリミタ（カンマ `, `）の自動補正および重複カンマ・不要空白の正規化（`prependToPrompt` / `appendToPrompt`）が行われる。

### 2-7. ノードバイパス設定 (`BypassSettingsModal.tsx`)

- ワークフロー JSON を解析し、アップスケーラーや FaceDetailer 等の特定ノードをバイパス（無効化）するプロファイルを管理・適用。
- プロファイルごとの一括バイパス編集（`ProfileBulkEditModal`）に対応。

### 2-8. パラメータ同期グループ (`ParamSyncModal.tsx`)

- マスターロール（例: `Sampler_Steps`）の値変更時に、スレーブロール（例: `FDetailer_Steps`）の値を自動連動・同期。

### 2-9. メインプレビュー & キュー管理

- 生成中: WebSocket 経由の進捗バー表示。
- 完了後: 高解像度画像表示（ダウンロード、スナップショット保存）。
- **ジョブ割り込み / キャンセル**:
  - キャンセルボタン押下時、フロントエンドは直ちに `isGenerating: false` へ復帰し、`POST /api/comfy/interrupt` を発行して ComfyUI 側実行を即時中断。
- ジョブ管理モーダル（`JobManagementModal.tsx`）: ComfyUI キュー一覧の確認、割り込み、キャンセル。
- キーボードナビ: `←` / `→` キーでサムネイル切替。

### 2-10. サムネイルストリップ

- 表示対象: `filterOwnSession`（自セッション）/ 全履歴切替。
- タブ: `history`（生成履歴）/ `snapshots`（保存済みスナップショット）。
- 表示順: 「新しい順（降順）」「古い順（昇順）」切替。
- 複数選択一括保存: `Ctrl/Shift/長押し` で複数選択し、一括でスナップショットとしてアルバム保存可能。

---

## 3. モバイルレイアウト (`MobileLayout`)

画面幅 767px 以下で自動適用されるシングルカラム縦スクロール構成。

### 3-1. 提供機能

| 機能 | 提供 |
|---|---|
| 生成実行 & 進捗表示（WebSocket）| ✅ |
| バッチ生成サムネイル履歴 | ✅ |
| プロンプト編集（タブ切替 + 共用 textarea）| ✅ |
| パラメータ確認・編集（CFG・Steps・Batch）| ✅ |
| シード切り替え（Random / Fixed）| ✅ |
| プリセット適用・切替 | ✅ |
| スナップショット保存 | ✅ |
| 接続中 ComfyUI 設定（URL）| ✅ |
| マッピング再スキャン (Rescan) | ✅ |

---

## 4. 状態管理（Zustand スライス構成 & 切断回復）

`store/useGenerationStore.ts` は機能別にスライス分割して管理。

```
frontend/src/store/
  slices/
    connectionSlice.ts   — WebSocket 接続状態、ノード情報、プレビュー画像
    jobQueueSlice.ts     — キュー管理、履歴、プロンプト投入、キャンセル
    multiSetSlice.ts     — パラメータ値、プリセット、適用アセット、シード
    bypassSlice.ts       — バイパスプロファイル、キャッシュ
    paramSyncSlice.ts    — パラメータ同期グループ、キャッシュ
  services/
    comfyWebSocketService.ts — WebSocket 通信シングルトンサービス
  useGenerationStore.ts  — ルートストア結合（39行）
```

- **WebSocket 切断回復**:
  - 切断検知時、指数バックオフで自動再接続を試行。
  - 再接続時、`/api/comfy/queue` を照会して進行中ジョブを再検知し、進捗バー・プレビューに自動復帰する。

---

## 5. ワークフロー JSON へのパラメータ注入

生成実行時に `workflowParamInjector.ts`（純粋関数）を用いて以下を一元注入：
1. `paramValues` → input_type に応じた型変換・ノード入力代入
2. LoRA スタックノードの動的展開・余剰キークリア
3. バイパス対象ノードのバイパス処理
4. シード値（Random時は 32bit乱数 / Fixed時は seed + batchIndex）

---

## 6. スナップショット保存

- **個別保存**: `AddSnapshotToAlbumModal` からアルバム選択・新規作成して `POST /api/snapshots`。
- **一括保存**: サムネイル複数選択時に `Promise.all` で並列保存。
- **派生スナップショット**: 親スナップショット ID（`source_snapshot_id`）を保持。親スナップショット削除時も DB の `SET NULL` により派生画像は独立して保持される。

---

## 7. コンポーネント & フック構成

```
pages/GeneratePage/
  components/
    DesktopLayout.tsx          — PC/タブレット用 2カラムレイアウト
    MobileLayout.tsx           — モバイル用シングルカラムレイアウト
    AuditPanel.tsx             — LLM 診断パネル
    ParamPanel.tsx             — パラメータ入力フォーム群
    AddAssetModal.tsx          — LoRA/TagSet 追加モーダル
    AppliedAssetChips.tsx      — 適用アセットチップ一覧
    PromptTranslationModal.tsx — プロンプト日英翻訳
    SettingsPopover.tsx        — ComfyUI 接続設定
  hooks/
    useGeneratePageState.ts    — Generate ページの全体状態統合
    useGenerateAction.ts       — 生成キュー投入・バッチ処理
    usePresetState.ts          — プリセット CRUD・一括操作
    useWorkflowManagement.ts   — ワークフロー選択・複製・管理
    useWorkflowParams.ts       — パラメータ初期化・キャッシュ
    usePromptTranslation.ts    — 翻訳 API 連携
    useSceneGenerator.ts       — シーン生成 API 連携
    useSnapshotActions.ts      — スナップショット保存
    useImageNavigation.ts      — キーボード・画像切替
```

---

*本ドキュメントは現行の GeneratePage 実装に準拠した正本です。*
