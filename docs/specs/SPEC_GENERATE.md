# Prompt Surgeon — Generate ページ仕様書 (SPEC_GENERATE)

**バージョン**: 1.0  
**最終更新**: 2026-06-13  
**実装ファイル**: `frontend/src/pages/GeneratePage.tsx`（現行 2427行 ← 🔴 リファクタリング対象）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md)

---

## 1. 概要

ComfyUI ワークフローを選択し、プロンプト・パラメータを編集して画像生成を実行するメインページ。  
デスクトップ（PC・タブレット）とモバイル（`/mobile` ルート）で異なるレイアウトを提供する。

---

## 2. デスクトップレイアウト

2カラム + 上部ヘッダー構成。

```
┌────────────────────────────────────────────────────────────────┐
│ [Header] ワークフロー選択 / Rescan / Settings / Upload         │
├──────────────────────────────┬─────────────────────────────────┤
│  左カラム（設定・入力）        │  右カラム（プレビュー・履歴）    │
│  - LLM Audit パネル          │  - メインプレビュー              │
│  - プロンプト入力（タブ切替）  │  - 履歴サムネイルストリップ      │
│  - LoRA / TagSet アセット    │  - スナップショット              │
│  - パラメータ入力             │  - 生成コントロール              │
│  - マッピング確認             │                                 │
└──────────────────────────────┴─────────────────────────────────┘
```

### 2-1. ヘッダー

| 要素 | ID / 識別子 | 説明 |
|---|---|---|
| 接続インジケーター | — | ComfyUI WebSocket 接続状態（緑パルス / グレー） |
| ワークフロー選択 | `#workflow-select` | セレクトボックス。「+ 新しいワークフローを追加」が先頭オプション |
| Rescan ボタン | `#rescan-btn` | ワークフローマッピングの再スキャン（RescanModal を開く） |
| Settings ボタン | `#settings-toggle-btn` | ComfyUI URL 設定ポップオーバーの開閉 |

### 2-2. LLM Audit パネル

アクセントカラーは `accent-purple`（`#7C6FDD`）を使用。

- 「Run Audit」ボタンによる任意実行
- 監査タイプの選択（`audit_types`: interference / vocabulary / physical）
- Intent 入力（やりたいこと・変更したいこと）
- 実行状態: `idle` / `loading` / `done`
- 結果表示: 干渉タグ → TagChipEditor の `suggestedDisables` に連携、語彙サジェスト → `suggestedAdds` に連携

### 2-3. プロンプト入力パネル

ワークフローの `mappings` から `input_type === "textarea"` のフィールドを動的生成。  
各フィールドは [TagChipEditor](./SPEC_COMMON.md#3-tagchipeditor-コンポーネント) で表示。

- タブ切り替えで複数プロンプトフィールドを切り替える
- 各プロンプトフィールドに「+ LoRA / TagSet を追加」ボタンを配置

### 2-4. アセットパネル（LoRA / TagSet の適用）

`appliedAssets: Record<role, AppliedAsset[]>` で管理。role 単位でアセットを紐づける。

```typescript
interface AppliedAsset {
  id: string;              // ユニークキー（例: `lora-1-12345`）
  type: 'lora' | 'tagset';
  assetId: number;         // DB ID
  name: string;            // 表示名
  enabled: boolean;        // トグル状態
  tags: string[];          // TagSet のタグ / LoRA のトリガーワード
  loraPromptString?: string; // `<lora:filename:strength>` 形式
}
```

- アセットの有効/無効トグルで対応プロンプトフィールドに自動追加/除去
- LoRA 追加時: `loraPromptString`（`<lora:filename:strength>`）とトリガーワードを注入
- TagSet 追加時: タグを対応 role のプロンプトに追加

### 2-5. パラメータ入力パネル

`input_type` が `int` / `float` / `select` / `lora_stack` / `select_sampler` / `select_scheduler` のマッピングを動的生成。

**サンプラ・スケジューラ選択 UI (select_sampler / select_scheduler)**:
- `m.input_type === 'select_sampler'` の場合：ComfyUI の `/object_info` から KSampler / KSamplerAdvanced ノードの `sampler_name` の選択肢を取得してドロップダウンに表示。オフライン時は `DEFAULT_SAMPLERS` にフォールバックする。
- `m.input_type === 'select_scheduler'` の場合：同様に ComfyUI の `/object_info` から KSampler / KSamplerAdvanced ノードの `scheduler` の選択肢を取得してドロップダウンに表示。オフライン時は `DEFAULT_SCHEDULERS` にフォールバックする。

**動的 LoRA スタック UI (lora_stack)**:
- `m.input_type === 'lora_stack'` のマッピングが存在する場合、専用の `LoraStackEditor` コンポーネントを表示。
- **機能**:
  - 「+ Add LoRA」ボタンにより LoRA のスロットを最大 10 個まで動的追加（10個に達するとボタン非活性化）。
  - スロットごとに、物理ファイル（`file_path`）選択のドロップダウン、LoRA ウェイト（`lora_wt`）、モデル強度（`model_str`）、CLIP 強度（`clip_str`）の入力フィールドを提供。
  - スロット選択肢の表示名：登録済みの LoRA マスタと照合し、`description`（説明文）があれば説明文を、無ければ `file_path` をそのまま表示。選択値自体は `file_path` をバインド。
  - 削除ボタンをクリックすることで特定のスロットを削除し、後続のスロット情報を自動的に前方に詰める（スロットの詰め直し）。

**常時表示される固定パラメータ**:
1. **Batch Size**: 生成枚数（数値入力）
2. **Seed**: ランダム（🎲 Shuffle）/ Fixed（🔒 Lock）切り替え、Fixed 時は数値入力

### 2-6. マッピング確認パネル

ワークフローの全 mapping を一覧表示。`master_id` を変更して role を修正できる。  
「Update Mapping」ボタンで保存（`PATCH /api/workflows/{id}`）。

### 2-7. メインプレビュー（右カラム）

- 生成中: 進捗バー（ComfyUI WebSocket `progress` イベントから取得）
- 完了後: 画像を大きく表示（ホバーでダウンロードボタン表示）
- キーボードナビ: `←` / `→` キーでサムネイルを切り替え（テキスト入力中は無効）

### 2-8. サムネイルストリップ

- 表示対象: `filterOwnSession` 時は自セッションの生成履歴、OFF 時は ComfyUI の全履歴
- タブ切り替え: `history`（生成履歴）/ `snapshots`（保存済みスナップショット）
- クリックでメインプレビューに表示
- 表示順トグル: サムネイル履歴を「新しい順（降順）」「古い順（昇順）」でソートして表示を切り替えるトグルが実装されている。

### 2-9. 生成コントロール

| 要素 | 説明 |
|---|---|
| 「Generate Batch」ボタン | 生成実行。生成中はスピナー + `Processing...`・無効化 |
| 「Save Snapshot」ボタン | 現在の画像・パラメータをスナップショットとして保存 |
| アルバム選択（保存時） | 既存アルバム選択 / 新規アルバム名入力 |

---

## 3. モバイルレイアウト（`/mobile`）

シングルカラム・縦スクロール構成。画面幅 767px 以下 または `/mobile` ルートで適用。

### 3-1. 提供機能

| 機能 | 提供 |
|---|---|
| 生成実行 | ✅ |
| 進捗・プレビュー表示（WebSocket）| ✅ |
| バッチ生成サムネイル履歴 | ✅ |
| プロンプト編集（タブ切替 + 共用 textarea）| ✅（textarea。チップエディタ非適用）|
| パラメータ確認・編集（CFG・Steps・Batch）| ✅ |
| シード切り替え（Random / Fixed）| ✅ |
| スナップショット保存 | ✅ |
| 接続中 ComfyUI 設定（URL）| ✅ |
| マッピングの再スキャン・修正 (Rescan) | ✅ |
| 過去スナップショット履歴（パラメータ値）選択・ロード | ✅ |

### 3-2. 省略機能（PC のみ）

- LoRA メタデータライブラリ管理・タグセットライブラリ管理
- スナップショット一覧閲覧・アルバム作成・編集
- 新しいワークフローのアップロード・新規登録（登録後の再スキャン・マッピング修正はモバイルでも可能）
- プロンプト監査（LLM Audit）

### 3-3. プロンプト入力 UI（モバイル）

```
[ Main + ][ Main − ][ Face + ][ Face − ]  ← 横スクロール対応タブ
┌─────────────────────────────────────────┐
│ 選択中のプロンプトを編集                 │ ← 共用 textarea
│ （タブ切り替えで内容が変わる）           │
└─────────────────────────────────────────┘
```

---

## 4. 状態管理

### 4-1. Zustand ストア（`useGenerationStore.ts`）🔴 リファクタリング対象

現行の `useGenerationStore` が保持する主な状態:

| 状態 | 型 | 説明 |
|---|---|---|
| `clientId` | `string` | このブラウザセッションの識別子 |
| `isConnected` | `boolean` | ComfyUI WebSocket 接続状態 |
| `isGenerating` | `boolean` | 生成中フラグ |
| `progress` | `ComfyProgress \| null` | 生成進捗（value / max / percentage）|
| `previewImage` | `string \| null` | プレビュー画像 URL |
| `activeClientId` | `string \| null` | 現在生成中のセッション ID |
| `filterOwnSession` | `boolean` | 自セッションのみ表示するフィルタ |
| `selectedWorkflowId` | `number \| null` | 選択中ワークフロー ID |
| `paramValues` | `Record<string, string>` | プロンプト・パラメータの入力値 |
| `batchSize` | `number` | バッチ枚数 |
| `seedMode` | `'random' \| 'fixed'` | シードモード |
| `seed` | `number` | シード値 |
| `batchImages` | `string[]` | 直近バッチ生成の画像 URL 一覧 |
| `selectedImg` | `string \| null` | 選択中の画像 URL |
| `comfyHistoryImages` | `string[]` | ComfyUI 全体の生成履歴画像 |
| `appliedAssets` | `Record<string, AppliedAsset[]>` | role 別の適用アセット |
| `queueRunning` | `Array` | ComfyUI キュー（実行中）|
| `queuePending` | `Array` | ComfyUI キュー（待機中）|
| `comfyUrl` | `string \| null` | ComfyUI の URL |

### 4-2. localStorage 永続化

| キー | 内容 |
|---|---|
| `prompt-surgeon-client-id` | セッション識別子 |
| `prompt-surgeon-filter-own` | 自セッションフィルタ設定 |
| `prompt-surgeon-workflow-id` | 選択中ワークフロー ID |
| `prompt-surgeon-params-wf-{id}` | ワークフロー別のパラメータ値 |
| `prompt-surgeon-applied-assets` | 適用アセット状態 |
| `prompt-surgeon-batch-size` | バッチ枚数 |
| `prompt-surgeon-seed-mode` | シードモード |
| `prompt-surgeon-seed` | シード値 |
| `prompt-surgeon-batch-images` | 直近バッチ画像 URL |
| `prompt-surgeon-selected-img` | 選択中画像 URL |
| `prompt-surgeon-current-prompt-id` | 現在生成中のプロンプト ID |

---

## 5. ワークフロー JSON へのパラメータ注入

生成実行時に `paramValues` を ComfyUI ワークフロー JSON に注入する。

```typescript
// 各マッピングについて
mapping.role → paramValues[mapping.role]
  → input_type に応じて parseInt / parseFloat / string
  → node.inputs[param_name] または node.inputs['value'] に代入
```

**シード注入**: `Sampler_Seed` role のノードに対して、  
- `random` モード: `Math.floor(Math.random() * 2**32)` を注入  
- `fixed` モード: `seed + バッチインデックス` を注入

---

## 6. ワークフロー管理（アップロード）

### 6-1. アップロードフロー

1. JSON ファイルをドラッグ&ドロップ または ファイル選択
2. `UploadWorkflowModal` を開き、スキャン（`POST /api/workflows/scan`）で自動マッピング候補を取得
3. ユーザーがマッピングを確認・修正
4. `POST /api/workflows` で DB に登録
5. ワークフロー選択セレクトを更新

### 6-2. アップロード UI

- ドラッグ&ドロップエリア: ワークフローが未登録の場合はメインエリアに表示
- ファイル入力 ID: `#workflow-file-input`
- `.json` 拡張子のみ受け付ける

---

## 7. スナップショット保存（個別保存と一括保存）

### 7-1. 個別保存
- 「Save Snapshot」クリック
  → 保存モーダル表示（アルバム選択 / 新規アルバム名）
  → `POST /api/snapshots`
    body: {
      workflow_id: selectedWorkflowId,
      image_path: selectedImg,
      params: paramValues（有効チップのみのカンマ連結文字列）,
      album_id?: number,
      new_album_name?: string,
      loras: [{ lora_id, strength }],
      tag_sets: [{ tag_set_id }]
    }

### 7-2. 履歴サムネイルの複数選択・一括保存 (Bulk Save)
- 「履歴 (History)」タブ内のサムネイル画像において、`Ctrl + クリック` / `Shift + クリック` / 長押しにより、複数選択モードに入ることができます。
- 複数選択中、サムネイルストリップの上部に「選択した {N} 枚を保存」ボタンが表示されます（通常の「Save Snapshot」ボタンは無効化されます）。
- モーダルでのアルバム選択（または新規作成）後、`Promise.all` を用いて選択された全画像の `POST /api/snapshots` を並列して送信します（各画像の params、loras、tag_sets は共通の設定が適用され、`image_path` のみ各画像のものに切り替わります）。
- 一括保存が成功した際、キャッシュクリアと共に複数選択モードが自動的に解除（終了）されます。
- ※「スナップショット (Snapshots)」タブのサムネイルには複数選択モードは適用されず、通常のクリック動作が維持されます。

---

## 8. Rescan（ワークフローマッピング再スキャン）

`RescanModal` コンポーネント（454行 ← 🟡 リファクタリング対象）で提供。

- 選択中ワークフローの JSON を再スキャンし、マッピング候補を更新
- マッピングの確認・修正後に `PATCH /api/workflows/{id}` で保存

---

## 9. リファクタリング計画

> 詳細は実装計画（`implementation_plan.md`）を参照。

```
pages/GeneratePage/（分割後）
  index.tsx                     ← ルーティング・Desktop/Mobile振り分け（～50行）
  GeneratePageDesktop.tsx       ← Desktopレイアウト（～200行）
  GeneratePageMobile.tsx        ← Mobileレイアウト（～200行）
  hooks/
    useWorkflowParams.ts        ← ワークフローパラメータ初期化・保存・リセット
    useGenerateAction.ts        ← 生成実行・バッチ処理ロジック
    useImageNavigation.ts       ← 画像選択・キーボードナビ
    useSnapshotActions.ts       ← スナップショット保存・ロード
    useAuditAction.ts           ← LLM Audit 実行ロジック
    useWorkflowUpload.ts        ← JSON ファイル D&D・アップロード処理
  components/
    WorkflowSelector.tsx
    PromptPanel.tsx
    ParamPanel.tsx
    AssetPanel.tsx
    ImagePreview.tsx
    GenerateControls.tsx
    AuditPanel.tsx
    MappingPanel.tsx
    SettingsPopover.tsx
```
