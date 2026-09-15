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
  - セクションコピペ機能（`PromptSectionClipboardMenu`）や外部からの平文プロンプト文字列更新時、`TagChipEditor` は `chipsProp` を維持しつつ最新文字列を検知して正しくチップへ再パース・更新を行う。
  - プリセット切り替え時、`DesktopLayout` および `MobileLayout` で `key={`${activeSetId}-${role}`}` を適用することによりコンポーネントの再初期化を担保し、`multiSetSlice.loadPresetData` において `paramValues` から初期 `promptChips` を自動構築することで、プロンプトの消失・空欄化を防止する。
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

### 2-6. ワークフロープリセット (`PresetManagerPanel.tsx`, `usePresetState.ts`)

- 現在のプロンプト値、パラメータ値、適用アセット、バッチ枚数、シード設定を一括で名前付きプリセットとして保存。
- **端末間（マルチデバイス）同期とSSoT整合性 (REQ-229, REQ-255)**:
  - バックエンドDBを絶対的なSSoTとして扱い、5秒ポーリング（`refetchInterval: 5000`）およびウィンドウフォーカス時（`refetchOnWindowFocus: true`）に最新プリセットを取得。
  - **マージ順序**: サーバー最新値（`param_values`, `applied_assets`, `batch_size`, `seed_mode`, `seed`）を直接マッピング。
  - **Multi-Set タブ切り替えとメモリ内キャッシュ保護 (REQ-255)**:
    - Multi-Set タブバーで別プリセットのタブをクリックした際、`handleLoadPreset` による古いサーバーキャッシュ（DB値）での強制上書きを行わず、`handleSelectPresetTab` によりメモリ内のセット編集状態（`activeSetId`）をアクティブ化・維持する。
    - 他端末での更新（`updated_at` の進み）が発生している場合、未編集（`!isDirty`）ならサーバー最新版を自動ロードし、編集中の未保存状態（`isDirty`）なら即座に競合解消モーダルを表示する。
  - **未保存ガード (`isDirty`)**:
    - ローカル編集がない状態（`!isDirty`）で他端末による更新（`updated_at` の進み）を受信した場合は、`currentStore.loadPresetData` によりUIおよびストアを即時自動同期。
    - ローカルに未保存の編集がある状態（`isDirty`）で他端末の更新を受信した場合、ローカルドラフトを勝手に上書きせず、競合状態へ移行。
  - **競合解決モーダル (`PresetConflictModal.tsx`)**:
    - 409 Conflict発生時または未保存時のサーバー更新検知時に起動。
    - **PC表示 (`md:grid-cols-2`)**: 「サーバー最新版（他端末での編集）」と「この端末の編集（ローカルドラフト）」を左右2カラムで比較表示し、差分項目をハイライト表示。
    - **モバイル表示 (`md:hidden`)**: タブボタンによりサーバー版とローカル版を切り替え比較。
    - **3つの解決アクション**:
      1. **サーバー最新版を採用**: ローカル編集を破棄し、サーバー最新データをストアへ適用。
      2. **この端末の編集で上書き**: サーバー最新の更新日時をベースとしてローカル内容を強制保存。
      3. **別名で両方保存（推奨）**: ローカル編集を `Set 1 (別端末の編集)` などの別名プリセットとして新規作成・二重保存。
    - 複数プリセットが競合した場合に備えた競合プリセット切り替えタブUIを完備。
- **TagChipEditor テキスト入力同期保証 (REQ-255)**:
  - テキスト入力モードにおいて、入力中の文字列が外部 `chipsProp` の再通知によって勝手に巻き戻されたり消去されたりしないよう、自己更新フラグ（`isInternalChangeRef`）により親ストアからのエコーバックを遮断し、生の入力テキストが即座に `onChange`（`paramValues`）へ安全に反映される。
  - テキスト入力モードからチップモードへの切替時、またはフォーカス離脱（Blur）時に `parseToChips` によりチップ構造へ確定変換される。
- **プリセット適用のフォールトトレランス**:
  - ワークフローのノード構成変更や BaseModel 差異により存在しない mapping role の値が含まれる場合、存在する role のみを適用し、欠落した role は安全にスキップして警告トーストを表示する。
- プリセットのワンクリックロード、更新、削除、並び替え（`PUT /api/presets/reorder`）、一括削除・編集（`ProfileBulkEditModal`）に対応。
  - **プリセット一括編集モーダル (`ProfileBulkEditModal`)**:
    - **タブ構成**: 「プロンプト」「パラメータ」の2タブ構成（旧LoRAタブはパラメータタブ内へ一元化統合）。
    - **プロンプト一括編集**: 単語・タグの追加（先頭 `prefix` / 末尾 `suffix`、境界カンマ自動補正 `prependToPrompt` / `appendToPrompt`）、検索・置換、共通タグ削除、アセット（TagSet/LoRA）のトリガータグ追加。
    - **パラメータ一括編集**:
      - 一般パラメータ: 個別有効化チェックボックス付きの入力（数値、選択肢等）。サンプラ（`select_sampler`）およびスケジューラ（`select_scheduler`）は `comfyObjectInfo`（`/object_info`）から動的取得した選択肢を優先表示し、ComfyUI 未接続・定義不在時は `ParamPanel` の定数フォールバック（`DEFAULT_SAMPLERS` / `DEFAULT_SCHEDULERS`）を用いて確実に選択肢を描画する。
      - **LoRA Stack (`lora_stack`)**:
        - 個別有効化チェックボックスを完備。
        - **差分編集モード**: `computeCommonLoras` により選択プリセット全件で共通適用されているLoRA（積集合）を自動抽出し、共通LoRAの削除指定（除外）や強度更新、および新規LoRAの追記（追加スロット）が可能。
        - **ComfyUIモデル連携**: 通常の `LoraStackEditor` と同様に、ComfyUI 側認識済みモデル（`/api/loras/comfy-models`）と連携し、DB未登録LoRA（`Unregistered` バッジ付き）も検索・選択・一括反映可能。登録済みLoRAは登録名（説明文・モデル名）を優先表示。
        - **完全上書きモード**: `LoraStackEditor` を用いて、既存LoRAスロットを全置換する新スロット群を一括設定可能（`activeBaseModelId` 連携対応）。
        - `usePresetState.handleBulkEditApply` により各プリセットへ `loraStackOps` が正確に反映・永続化される。

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

### 5-2. 生成前バイパス処理およびスキーマ整合性保証 (REQ-230)

1. **バイパス前提条件（ComfyUI スキーマキャッシュ）**:
   - 有効化されたバイパスプロファイル（`bypassProfiles` の `is_enabled: true` かつ `bypassed_node_ids.length > 0`）が存在する場合、ノードの入出力スロットを安全に繋ぎ替えるために ComfyUI のノード定義スキーマ（`/api/comfy/object_info`）が必要となる。
2. **フェイルセーフ防御**:
   - 生成実行時（単一生成 `handleGenerate` / セット生成 `handleGenerateSets`）、アクティブなバイパスノードが存在するにもかかわらず `comfyObjectInfo` が未取得（空オブジェクトまたは未ロード）の場合、不完全なワークフロー投入による画像破損や意図しないノード接続破壊を防止するため、キュー投入を即座に中断する。
   - ユーザーへはエラートースト「`ComfyUIのノードスキーマ情報を取得できていないため、バイパス処理を実行できません。ComfyUIの接続を確認してください。`」を表示し、状態の破損（activeBatch の先行初期化やキュー投入）を防ぐ。
3. **ComfyUI 接続復帰時の自動再検証・取得**:
   - ComfyUI 接続が確立（`isConnected: true`）された契機で `comfy-object-info` クエリを自動再検証（`invalidateQueries`）し、最新スキーマを同期する。

---

## 6. スナップショット保存および生成時パラメータ永続化 (REQ-227)

- **個別保存**: `AddSnapshotToAlbumModal` からアルバム選択・新規作成して `POST /api/snapshots`。
- **一括保存**: サムネイル複数選択時に `Promise.all` で並列保存。
- **派生スナップショット**: 親スナップショット ID（`source_snapshot_id`）を保持。親スナップショット削除時も DB の `SET NULL` により派生画像は独立して保持される。
- **生成時メタデータ永続化とスナップショット復元**:
  - キュー投入時（バッチ中間ジョブ含む全ジョブ）、各プロンプト ID に対して生成パラメータ・適用アセットを `localStorage` およびサーバーDB（`POST /api/prompt-metadata`）へ二重永続化。
  - スナップショット保存時、画像 URL の `t` パラメータからローカルキャッシュまたはサーバーDB（`GET /api/prompt-metadata/{prompt_id}`）を照会し、実際にその画像を生成したパラメータを復元して保存。別ブラウザ・別端末からの保存時も現在の画面設定値による汚染を防ぐ。

---

## 6-2. 履歴プレビューモーダル (`HistoryModalPreview.tsx`)

- スナップショット未保存の画像であっても、URL の `t` パラメータからメタデータを照会し、`<Info />` ボタンより生成時パラメータ（アスペクト比、サンプラー、スケジューラー、ステップ数、CFG、シード値、プロンプト）の確認パネルを表示可能。

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
