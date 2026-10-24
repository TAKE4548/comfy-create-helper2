# Prompt Surgeon — Generate ページ仕様書 (SPEC_GENERATE)

**バージョン**: 2.8
**最終更新**: 2026-10-16
**実装ファイル**: `frontend/src/pages/GeneratePage.tsx`（モジュール分割完了済み）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md) / [REQ-332設計](../design/REQ-332.md) / [REQ-332検証計画](../design/REQ-332-test-plan.md) / [REQ-334設計](../design/REQ-334.md) / [REQ-334検証計画](../design/REQ-334-test-plan.md) / [REQ-334-T10正本同期](../backlog/task/archive/REQ-334-T10.md) / [REQ-347設計](../design/REQ-347.md) / [REQ-347-T10正本同期](../backlog/task/active/REQ-347-T10.md) / [REQ-344設計](../design/REQ-344.md) / [REQ-344検証計画](../design/REQ-344-test-plan.md) / [REQ-344最小差分検証記録](../design/REQ-344-minimal-verification.md) / [REQ-354稼働検証記録](../design/REQ-354-verification.md) / [REQ-346設計](../design/REQ-346.md)

---

## 1. 概要

ComfyUI ワークフローを選択し、プロンプト・パラメータを編集して画像生成を実行するメインページ。
画面幅768px以上では`DesktopLayout`、768px未満では`MobileLayout`を同一ルート `/` 内で切り替える。レスポンシブ境界と共通ナビゲーションは[SPEC_COMMON.md](./SPEC_COMMON.md)に従う。

---

## 2. デスクトップレイアウト (`DesktopLayout`)

画面最上部グローバルヘッダー + 全幅プリセットタブバー + 入力左ペイン/プレビュー右ペイン構成。幅800pxでは入力ペイン330pxを確保し、右側の永続ActionBarとプレビューを維持する。

```
┌────────────────────────────────────────────────────────────────┐
│ [Global Header] タイトル / ワークフロー選択 / Anima / Settings  │
├────────────────────────────────────────────────────────────────┤
│ [Preset Tabs Bar] プリセットタブ一覧（全幅・横スクロール）      │
├──────────────────────────────┬─────────────────────────────────┤
│  左カラム（入力・設定）        │  右カラム（プレビュー・履歴）    │
│  - ツールバー: プリセット名   │  - メインプレビュー              │
│    Undo/Redo, Add Set, 管理 │  - 履歴サムネイルストリップ      │
│  - LLM Audit パネル          │  - スナップショット              │
│  - Prompt 入力（stage group）  │  - 生成コントロール              │
│  - 翻訳 / シーン生成ボタン   │  - 永続ActionBar                 │
│  - LoRA / TagSet アセット    │                                 │
│  - パラメータ入力             │  - 生成 / batch / snapshot保存  │
│  - マッピング確認             │                                 │
└──────────────────────────────┴─────────────────────────────────┘
```

デスクトップ入力ペインは Prompt と Parameter を水平仕切りで分け、それぞれ独立したスクロール領域とする。各領域は既存のマッピングのみを対象にし、ワークフローstageの順序でstage groupを連続表示する。各groupの見出しは領域内スクロールに追従し、次groupが上端へ到達すると表示見出しを切り替える。stage groupingはDesktopのPrompt/Parameterで有効にする。ParamPanelの `stageGrouping` は既定値 `false` とし、既存Mobile Prompt tabsの表示・操作を変更しない。

入力ペインの上端には物理paddingを置かず、sticky見出しは高さ36px・不透明背景とする。上端の余白が必要な場合は本文側に設ける。通常時とgroup境界追従時の見出し表示、および入力欄を覆わないことを維持する。工程見出しの可視文字はStageMaster.nameのみとし、stageKeyを重ねて表示しない。nameが空白の場合は既定fallbackを使い、長名・同名の識別情報はARIA、title、data属性で提供する。schemaに独立したstage display_nameはなく、Prompt項目の `WorkflowMapping.display_name` とは別契約である。

### 2-1. ヘッダー

| 要素 | ID / 識別子 | 説明 |
|---|---|---|
| 接続インジケーター | — | 8000番のメインAPI/イベント接続状態を表示する。ComfyUI上流WebSocketの状態はバックエンドが管理する。 |
| ワークフロー選択 | `#workflow-select` | セレクトボックス。「+ 新しいワークフローを追加」が先頭オプション |
| ワークフロー設定メニュー | `#workflow-actions-btn` | ベースモデル紐付け・デフォルト保存／リセット・名前変更・複製・ノード再スキャンを含む展開メニュー。ヘッダー下へ重ねて展開し、ヘッダー高さで切り詰めずメニュー内スクロールで末尾へ到達できる（[SPEC_COMMON §4-4-1](./SPEC_COMMON.md#4-4-1-共通ヘッダー展開アクション契約req-346) 参照） |
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

ワークフローの既存 `mappings` のうち `input_type === "textarea"` のフィールドだけを動的生成する。各フィールドは [TagChipEditor](./SPEC_COMMON.md#3-tagchipeditor-コンポーネント) で表示する。Desktopでは所属stageごとに連続したgroupへ配置し、各groupのsticky見出しをスクロール境界で切り替える。未マッピングのstage/roleの入力欄は追加しない。Mobileでは従来のPrompt tabsで複数プロンプト欄を切り替える。
- DesktopのPrompt項目名は、非空の `WorkflowMapping.display_name` を加工せず表示する。未設定時は `param_name`、`role`、`プロンプト` の順にfallbackする。項目名は16px/24px/600の独立したh4行とし、copy/history/translation/assetsおよびmode controlは次のwrap可能なtoolbar行へ置く。独立したmode captionは省略し、Mobile/Studioの既定captionと機能は維持する。
- Desktopのclipboard menuはstart配置、全幅anchor、最大幅100%で入力root内に収める。他の呼び出し元はdefault end配置を維持する。collapse controlのsr-only descriptionにはstageKeyと元roleを含め、可視設定名を追加しない。
- 各プロンプトフィールドに「+ LoRA / TagSet を追加」ボタンを配置。
- 「テキスト入力モード切替」エスケープハッチを完備。
- **構造化チップ（`promptChips`）の状態管理と保持規則**:
  - プロンプトのトークン構造（無効タグ `enabled: false` を含む配列）は、グローバルストア `useGenerationStore.promptChips`（`Record<string, TagChip[]>`）および `GenerationSet.promptChips` を SSoT として一元管理される。
  - アコーディオンの開閉、モバイル画面のタブ切り替え、Multi-Set切替・追加・複製を行っても、無効タグの状態は破棄されず完全に維持される。
  - セクションコピペ機能（`PromptSectionClipboardMenu`）や外部からの平文プロンプト文字列更新時、`TagChipEditor` は `chipsProp` を維持しつつ最新文字列を検知して正しくチップへ再パース・更新を行う。
  - プリセット切り替え時、`DesktopLayout` および `MobileLayout` で `key={`${activeSetId}-${role}`}` を適用することによりコンポーネントの再初期化を担保し、`multiSetSlice.loadPresetData` において `paramValues` から初期 `promptChips` を自動構築することで、プロンプトの消失・空欄化を防止する。
  - 生成要求時（単一セット / Multi-Set）は、機械的導出ヘルパー `getEffectiveParamValues` により有効タグ（`enabled: true`）のみが抽出された平文mapが作成され、ParamSyncを経た凍結graph/param valuesとしてGeneration batch APIへ渡される。バックエンドworkerがComfyUIへ上流投入するため、ブラウザーからComfyUIへ直接投入しない。無効タグは生成payloadや生成metadataに混入しない。

### 2-4. アセットパネル（LoRA / TagSet の適用）

`appliedAssets: Record<role, AppliedAsset[]>` で管理。role 単位でアセットを紐づける。
- アセットの有効/無効トグルで対応プロンプトフィールドに自動追加/除去。
- LoRA 追加時: `loraPromptString`（`<lora:filename:strength>`）とトリガーワードを注入。
- TagSet 追加時: タグ（または選択されたサブセット）を対応 role のプロンプトに追加。

### 2-5. パラメータ入力パネル (`ParamPanel.tsx`)

`input_type` が `int` / `float` / `select` / `lora_stack` / `select_sampler` / `select_scheduler` / `boolean` / `seed` の既存マッピングだけを動的生成する。Desktopでは所属stageごとに連続groupへ配置し、Prompt領域とは独立したスクロールとsticky見出しの境界切替を行う。未マッピングのstage/roleの入力欄は追加しない。`stageGrouping` は既定値 `false` とし、Mobileなど既存呼び出し元の表示を変えない。

- **サンプラ・スケジューラ選択 UI**: ComfyUI の `/object_info` から動的取得（オフライン時は定数フォールバック）。
- **動的 LoRA スタック UI (`LoraStackEditor.tsx`)**: 最大10スロットの動的追加・削除・詰め直し、説明文照合表示。
- **固定パラメータ**: Batch Size（枚数入力）、Seed（🎲 Shuffle / 🔒 Fixed）。
- **専用Seed欄**: `seed` mappingはslotごとに固定値またはランダムを選ぶ。Seed値はrole別に保存し、モードはmaster/variantの安定slot単位で保存する。legacy global Seedとは別のSSoTであり、専用欄の値をglobal Seedへ同期・上書きしない。legacy global Seed欄と専用欄が同じworkflowにあっても、それぞれ独立して扱う。自動移行は行わない。
- **専用Seedの実入力解決 (REQ-353)**: `GET /api/workflows/{workflow_id}` の `WorkflowRead.mappings` はmappingごとにeffective master metadataを返す。master metadataはworkflow mappingのdirect `master_id`を優先し、未設定の場合は`variant.master`を使う。`param_name`をprimary、nullableな`fallback_param_names`を登録順のaliasとして扱う（省略/null/空配列はaliasなし）。現在のnode inputsに存在する最初のown keyへ値を適用する。専用Seedで未登録の`value`、`noise_seed`等を推測したり、新しい入力keyを作成したりしない。primary/fallbackのいずれも存在しない場合は生成要求全体をComfyUI送信前に説明付きで拒否する。既存keyが配線（graph reference）なら他aliasへ切り替えず拒否する。初期値、バッチ検証、graph注入、生成履歴は同じ解決規則を使い、履歴値は送信graphの解決済みkeyから取得する。`value`入力を使うmappingはprimaryまたはfallbackとして明示登録する。legacy非seed global Seedおよび非seed一般parameterの既存処理は維持する。API schemaの同期・稼働比較とE2E証拠は[REQ-354稼働検証記録](../design/REQ-354-verification.md)を参照する。
- 固定値は10進整数 `0..4294967295`。バッチでは0始まりのindexを加算し、全件が範囲内か投入前に検証する。1件でもoverflowがあれば要求全体を拒否し、部分投入しない。ランダム値は各項目について `Math.floor(Math.random() * 2**32)` で生成する（重複を許す）。
- 同期対象Seedは同期親の確定実値を子へ共有し、子側で再抽選・再加算しない。モードmetadataの欠落・破損・未知形式、およびgraph参照Seedは専用Seedとして曖昧に解釈せず、投入前に拒否する。snapshot復元は保存済みSeed値とmodeを固定値として扱い、復元時にランダム化しない。

stage groupは入力欄の表示だけを整理する。role、`promptChips`、ParamSync、Seed値・modeおよび各入力値の既存保存・同期契約は変更しない。未マッピングのrole/fieldを生成入力欄へ追加する候補範囲の拡張はREQ-348の対象とする。

#### REQ-358 workflow mappingの無効化

workflowのMapping設定で無効にしたstage slotは、生成要求に使うworkflow cloneからだけ除外する。対象state keyはvariant slotの `v:<variant_id>` またはlegacy slotの `m:<master_id>`。`mapping_slot_states` の値が明示 `false` のmappingだけを、生成用 `mappings` 配列から元の順序を保って除外する。state省略、key欠落、trueは有効として保持する。`null`またはvariant未指定は、masterのslotが1つ、または保存role/既知master legacy roleとcomputed_roleが一意に完全一致する場合にそのvariant keyを参照し、なければlegacy keyへfallbackする。identity用定義には非活性variantも含める。複数slotへnode title/stage名から推定しない。これにより保存前の旧mappingにもv:falseが効き、Seedを含む無効slotの生成入力を表示しない。

無効slotのmappingはworkflowの保存データ、履歴、rollback、copy、exportに保持し、画面からの再有効化に備える。保持対象は実在する `mapping_masters` / `mapping_variants` に紐づく無効スロットであり、削除済み旧マスタや存在しないバリアントを参照する孤立マッピング（Orphaned Mappings）は保存時およびマイグレーション `Step 031` で除外・浄化される（REQ-369）。生成用cloneのfilterは元workflow、元mapping配列、record、state objectを変更しない。全件有効の場合も生成用workflowと配列は独立したcloneとする。無効mappingの除外はComfyUI graph自体のnodeやexecutionを停止せず、既存のparam/prompt/seed注入経路へ値を渡さないためのworkflow mapping選別である。

### 2-6. ワークフロープリセット (`PresetManagerPanel.tsx`, `usePresetState.ts`)

- 現在のプロンプト値、パラメータ値、適用アセット、バッチ枚数、シード設定を一括で名前付きプリセットとして保存。
- **端末間（マルチデバイス）同期とSSoT整合性 (REQ-229, REQ-255)**:
  - バックエンドDBを絶対的なSSoTとして扱い、5秒ポーリング（`refetchInterval: 5000`）およびウィンドウフォーカス時（`refetchOnWindowFocus: true`）に最新プリセットを取得。
  - **マージ順序とローカル編集値保護 (REQ-278, REQ-281)**:
    - サーバー同期時、`rawMappedSets` は Dirty 認識型 SSoT 同期を採用。ローカルで未編集（Clean）のプリセットはサーバー（React Query / DB）の最新値でインメモリセット（`sets`）を自動更新し、編集中の未保存（Dirty）プリセットのみローカル差分を保持する。これにより他端末の更新をローカルの古いメモリ値で上書き破棄することを根絶。
    - 新規プリセット作成（Add Set / 別名保存）時は `loadPresetData` により `paramValues`（L1 UI入力バッファ）と `sets`（L2 タブインメモリキャッシュ）をアトミックに同時更新し、React Query キャッシュ（L3）の同期注入および `presetUpdatedAtRef`（L4）の初期化を行うことで、直前に開いていたプリセットへの誤上書きや誤オートセーブ発火を完全に防ぐ。
    - 単一セット利用時（`existingSets.length === 1`）の `activeSetId` 未確定時フォールバックをメイン Effect にも統一適用し、未保存セット全体の再初期化を抑止。
    - 下流の `useGenerateAction.ts` からは過剰な対症療法的フォールバックをクリーンアップし、ストアが保持する最新の `GenerationSet` をシンプルかつ決定論的に ComfyUI 投入ペイロードへ注入する単一責任パイプラインを確立。
  - **Multi-Set タブ切り替えとメモリ内キャッシュ保護 (REQ-255, REQ-281)**:
    - Multi-Set タブバーで別プリセットのタブをクリックした際、`handleSelectPresetTab` の先頭で `flushAutoSave` を同期実行し、進行中のデバウンスタイマーを即時キャンセルして未保存ドラフトをサーバーへ確実にフラッシュ永続化する。
    - 切替先プリセットが他端末で更新されている場合（`updated_at` の進み）、自端末で未編集（Clean）ならサーバー最新版を自動ロードし、編集中の未保存状態（Dirty）なら即座に競合解消モーダルを表示する。
    - 全プリセットの更新タイムスタンプ（`presetUpdatedAtRef`）をバックグラウンドポーリング時にも継続追跡し、非アクティブなプリセットに対する他端末更新の検知脱落を根絶。
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
  - **プリセット状態管理アーキテクチャの責務分離 (REQ-284)**:
    - 巨大化していた `usePresetState.ts`（旧1,379行）を統合ファサードフックとして再設計し、以下の責務別サブフックおよび純粋サービスへ完全分離：
      - `services/presetBulkPatcher.ts`: 一括編集適用ロジック（`computePresetPatch`）を外部APIやReact Hookから独立した純粋関数として抽出。
      - `hooks/usePresetHistory.ts`: Undo/Redoスタックの `sessionStorage` 管理および入力要素フォーカス時ガード付き `Ctrl+Z` / `Ctrl+Y` キーボードショートカット制御。
      - `hooks/usePresetConflict.ts`: 409 OCC 競合状態管理および「サーバー最新採用」「ローカル上書き」「別名新規保存」の3-way解決ハンドラ。
      - `hooks/usePresetAutoSave.ts`: 1,000ms デバウンスタイマー、プロパティ順序非依存等価判定（`isStateEqual` / `isRecordEqual`）、およびジョブ投入直前の同期的インメモリ即時反映（`flushAutoSave`）。
      - `hooks/usePresetStoreSync.ts`: Multi-Setタブ切り替え時の直前タブ先行フラッシュ、5秒間隔ポーリングによる他端末更新検知、およびSSoT同期。
      - `hooks/presetStateUtils.ts`: 共通型定義（`HistoryState`, `PresetConflictData`, `UpdatePresetArgs`）およびタイムスタンプ正規化・差分判定。

### 2-7. ノードバイパス設定 (`BypassSettingsModal.tsx`)

- ワークフロー JSON を解析し、アップスケーラーや FaceDetailer 等の特定ノードをバイパス（無効化）するプロファイルを管理・適用。
- プロファイルごとの一括バイパス編集（`ProfileBulkEditModal`）に対応。

### 2-8. パラメータ同期グループ (`ParamSyncModal.tsx`)

- マスターロール（例: `Sampler_Steps`）の値変更時に、スレーブロール（例: `FDetailer_Steps`）の値を自動連動・同期。

### 2-9. メインプレビュー & キュー管理

- 生成中: WebSocket 経由の進捗バー表示。PC・モバイルの進捗率文字は整数へ丸め、バー幅の計算精度は維持する。進捗通知だけでpreview URLを合成せず、実画像URLの受信時だけ更新する。
- 完了後: 高解像度画像表示（ダウンロード、スナップショット保存）。
- **プレビュー自動追従 / 固定トグル (REQ-264, REQ-372)**:
  - デスクトップサムネイルヘッダー（`DesktopLayout`）、モバイル履歴ツールバー（`GenerationGallerySection`、`#preview-autofollow-toggle-mobile`）、モバイル画像シート（`MobileImageSheet`）、および全画面モーダルプレビュー（`HistoryModalPreview`）において、ワンタップで「自動追従（Auto-Follow）」と「固定（Lock）」を切り替え可能。
  - **自動追従**: 自セッションの生成完了時に、プレビュー表示およびフォーカスモーダルが自動的に最新の生成画像へ切り替わる（デフォルト: 有効）。完了原画を選ぶ時はその完了job自身の旧プレビューだけを解除し、後続jobが画像未受信でも旧frameで原画を覆わない。後続jobの実frameを受信済みならそのframeを維持し、進捗だけで消さない。
- **固定**: 新規生成が完了しても、現在閲覧している画像の表示を維持（REQ-240 と同様の閲覧コンテキスト保護）。
- **即時ジャンプ**: 固定状態から自動追従を ON に切り替えた際、即座に最新画像へ表示がジャンプ。
  - 設定値は `localStorage` (`prompt-surgeon-preview-auto-follow`) に永続化される。

- **プレビュー分割と並列結果閲覧 (REQ-334, REQ-339, REQ-362)**:
  - `DesktopLayout`の分割比率はドラッグ操作で変更し、保存した比率を次回表示時に復元する。比率サイクル操作で最大状態の次を選ぶと開始比率に戻す。幅800pxでは左入力ペインを330pxとし、右側にプレビューと生成アクションを残す。
  - `GenerateParallelPreview`はプレビューコンテナの利用可能高さに合わせて全画像の高さを揃え、各画像本来のアスペクト比に応じた幅を計算した上で、利用可能横幅に収まる最大枚数を動的に1行配置する（REQ-339）。画像本来のアスペクト比を保持して歪みやレターボックス/ピラーボックスを排除し、横長・正方形・縦長画像が混在する場合でも空きスペースの許す限り自動的に並列表示する。単一画像が横幅を超える場合は高さを自動縮小して全景を収める。表示ページ数は矢印ボタンや左右キーで切り替え、端では進行方向をclampする。選択とlive previewは既存のGenerate状態へ反映し、入力/ダイアログ内のキー操作を親の画像ナビゲーションへ重複伝播させない。
  - **プログレッシブプレビュー表示と三位一体キャッシュ高速化 (REQ-362)**:
    - `GenerateParallelPreview`でフルサイズWebP（`/api/comfy/view`）をロード中、キャッシュ済みサムネイルWebP（`/api/comfy/thumbnail`）をプレースホルダーとして先行描画し、ロード完了時にフェード切り替えを行う。フルサイズ画像ロード失敗時はサムネイル表示をフォールバックとして維持する。
    - **完全ゼロプローブ配信**: `/api/comfy/thumbnail` および `/api/comfy/view` は、メモリまたはローカルディスクキャッシュ（`db/thumbnail_cache/`, `db/full_cache/`）ヒット時にComfyUI本体への存在確認（HEAD通信）を一切行わず、5ms以内で即座に返却する。
    - **先行フルサイズWebP生成**: ジョブ完了時（WebSocket `executed` 受信時）、サムネイル生成と並行してQuality 90のフルサイズWebPをディスクキャッシュへ非同期先行生成する。
    - **200件三位一体整合**: ComfyUI履歴ウィンドウ（200件）、フルサイズWebPキャッシュ（220件超過時に古い順に200件へパージ）、SQLite `prompt_metadata`（未完了ジョブを保護した上で200件上限維持）の3者を200件で厳密に整合・同期する。
  - 生成状態はbatch全体と現在のnode/stepの進捗を分けて表示する。所要時間・残り時間が不明な場合は推測せず「未取得」と表示する。
- **右側ActionBar**: 生成、batch生成、snapshot保存、Queue管理はプレビュー側に常時残るActionBarで操作する。左入力ペインには生成実行ボタンを重複配置しない。
- **ジョブ割り込み / キャンセル**:
  - 生成要求は `POST /api/generation/batches` でメインAPI（8000番）へ送信する。`BatchRequest` は `request_id`、既存の利用者session identity、scope（`normal` / `studio`）、凍結itemsを持ち、Studioではproject IDを持つ。フロントエンドはワークフロー・graph・パラメータ・適用アセットを要求ごとに凍結し、受付DB transactionのcommit後に返る `202 Accepted` を受付完了とする。上流ComfyUIへの送信と専用 `client_id` はバックエンドが管理し、利用者の `session_id` と混同しない。上流POSTの結果が不明な場合は `unconfirmed` とし、自動再送しない。
  - ブラウザーは共有WebSocket `/api/ws` からGenerationのsnapshot/eventを受け取る。snapshotは `epoch` / `revision` と全状態を一体で扱い、古いrevisionやepochを現在状態へ部分mergeしない。WebSocket再接続中もAPI上のジョブ受付はバックエンドが処理し、ブラウザー接続断を理由に受付済ジョブを取り消さない。
  - 通常生成の `normal_group_id` は通常生成のまとまりを示し、session IDやStudioのproject IDとは別である。履歴の「自セッションのみ」は表示対象を切り替えるだけで、全体キャンセルの範囲を狭めない。他sessionの待機表示はこのfilterが有効な場合に限る。異なるscopeの待機jobがある場合は別scopeの待機を優先し、scopeを併記する。
  - 通常生成の進捗母数 `N` は取消済み・解除済み・状態未確認のjobを除外し、完了数 `F` は成功・失敗の合計とする。失敗は通知したうえで進捗上の完了として扱う。取消後のNと進捗率は残存jobから再計算する。状態未確認の件数は進捗と別に『状態未確認 n件』として表示し、待機中・実行中・準備中と同じ表示にしない。
  - Studio Step 1の各生成batchは独立したrequest/batchとして扱い、通常生成のgroupや他Studio batchへ合算しない。各batchの `N` はそのrequestの対象数、`F` は成功・失敗の合計とし、失敗は通知して完了として進める。キャンセルjobは進捗母数から除外し、batch停止後は停止済みとして表示する。解除済みjobは `N` から除外する（状態未確認はStudioの `N` に残る）。project scopeを示す場合はproject名を併記できる。Studioのstep遷移自体は本節の対象外。
  - Job管理は単件取消、待機queueのみ取消、実行中と待機queueの全取消を提供する。表示には凍結済みmetadataからsnapshotのprompt名/抜粋、node名とstep進捗を対応jobごとに示す。単件は選択行のIDだけを送る。一括操作は初期値「全生成（Studioを含む）」で、追加選択肢「通常生成のみ」を選べる。scopeはsession表示filterと独立し、通常生成のみは全sessionの識別済み通常jobだけを取消対象にし、Studio/未分類jobを保護する。保護対象が実行中または待機中の場合は、通常生成の実行中割り込みを見送り、skippedと保護理由を示して一括取消完了扱いにしない。部分成功/未確認の結果は表示したまま、利用者が次の操作を選べる。
  - 待機jobの取消は、取消前queueで対象が待機中であること、上流ACKが有効であること、成功した取消後queueでrunning/pendingの双方に不在であること、成功したhistory照会にterminal記録がないことを合わせて確認した場合に限り確認済みとする。queue不在だけ、ACKだけ、照会失敗、またはrunningへ遷移した競合は `unconfirmed` とする。`unconfirmed` のjobは確認済み終了ではないため `already_terminal` を返さず、単件・一括いずれも取消結果に確認済みの範囲と未確認を区別して含める（解除済みの記録に対する取消は `not_cancelled`）。実行中jobの割り込みはterminal状態を確認できるまで成功としない。対象のない全取消は、取消前後queue照会とACKがすべて成功し空であることを確認する。
  - 単件待機jobの削除は3秒間の予約として表示し、期限前のUndoまたはモーダルを閉じる操作で予約timerを解除する。この期間は取消APIを呼ばない。timer満了時は`only_queued` guardを付け、実行中へ移ったjobを割り込まない。
  - 正常完了を確認できた場合だけ一括操作を完了扱いにしてモーダルを閉じる。部分成功、未確認、protected jobによる割り込みskippedは確認済み・未確認の結果を表示してモーダルを維持する。処理後も状態未確認のまま残る記録は未確認の項目として必ず報告し、完了扱いにしない。キャンセルを失敗toastとして重複通知しない。
  - 再起動後に孤立した送信待ち（prompt_id 未確定の queued/submitting）は、待機として表示せず『状態未確認』の記録として表示する（自動再送しない）。
  - ジョブ管理は「状態未確認の記録」を待機キューと別の欄で表示し、各行に「取消を試行」と「記録を解除」を、欄に「状態未確認をすべて解除」を提供する。解除は確認ダイアログで『記録のみが対象でComfyUI側の取消ではない』『実行有無を確認しない』『待機へ戻らず自動再送しない』ことを示してから実行し、解除結果は解除できた件数と解除できなかった件数を分けて示す。解除済みの記録は同欄の折りたたみで直近10件を確認できる。Generate画面のQueueボタンには状態未確認の件数を併記する。
- キーボードナビ: `←` / `→` キーでサムネイル切替。
- Generateページの`Ctrl+Enter`はダイアログが開いていないときだけ生成を1回実行する。翻訳ダイアログは同じキーを親へ伝播させず、二重実行しない。`S` / `Space`は実際のプレビューにフォーカスがある場合だけsave/open操作に使い、入力欄の編集キー・IME変換・repeat・dialog内・`defaultPrevented`イベントは予約操作として横取りしない。

#### Generate通信・Manager復旧境界

- メインアプリのAPIおよび共有イベント接続は8000番を使用する。ブラウザーはGeneration APIと `/api/ws` に接続し、ComfyUIへのWebSocket/HTTP上流通信はバックエンドが仲介する。上流接続に使うComfyUI `client_id` はバックエンド専用である。
- Managerの管理UIはメインアプリ設定ページのシステム欄から使う。8000番のメインアプリが停止している場合の復旧操作には、既存8899番Managerの埋め込みFEを使う。
- `SYSTEM_STATS` の2.5秒配信と `VRAM_RECOVERED` は既存の型・意味を維持し、Generation snapshotの更新周期へ統合・変更しない。

### 2-10. PCリソース監視 HUD & モバイルチップ (REQ-288)

ComfyUI と連携した画像生成実行時のハードウェアリソース（CPU, RAM, GPU, VRAM）消費状況をリアルタイムに可視化し、VRAM 逼迫によるクラッシュ（OOM）を未然に防止する機能。

- **バックエンド配信基盤 (`/api/ws`)**:
  - FastAPI WebSocket エンドポイント `/api/ws` から 2.5 秒間隔で `SYSTEM_STATS` メッセージを Discriminated Union 形式でブロードキャスト。
  - CPU, RAM（使用量/総量/比率）、GPU 使用率、VRAM（使用量/総量/比率）をサンプリング。
  - Windows 環境（REQ-289, REQ-290）では `WindowsGpuMonitor`（DXGI による VRAM 総量動的検出およびプライマリ GPU LUID 抽出 + PDH による全エンジン網羅 `\GPU Engine(*)\Utilization Percentage` サンプリング）により、物理エンジン別プロセス合算の最大値（MAX across all engines）をタスクマネージャー準拠で算出。ComfyUI 画像生成やローカル LLM（LM Studio / Ollama）等のテンソル演算（Compute エンジン）負荷を確実に反映する。Linux/ROCm 環境では `rocm-smi` から取得し、取得不可時は `null`（UI 表示上は `--`）として安全にフォールバック。
- **フロントエンド連携 & 省電力設計 (`useSystemStats.ts`, `systemWsService.ts`)**:
  - 再接続時に指数バックオフ（1s, 2s, 4s, 最大10s）を適用。
  - Page Visibility API（`document.visibilityState === 'hidden'`）により、タブ非アクティブ時は接続を自動 suspend して CPU/GPU 負荷と描画を抑制し、タブ復帰時に resume。
- **ブラウザー保存量の推定表示 (`useBrowserStorageUsage.ts`)**:
  - localStorage と sessionStorage を別々に計測し、キーと値の文字列長合計に2 bytesを掛けて推定する（`Σ(key.length + value.length) × 2 bytes`）。これは各UTF-16コード単位の概算であり、ブラウザーの実使用容量・割当上限を示さない。
  - localStorageは現在のorigin全体、sessionStorageは現在のタブの値を対象とする。保存内容そのものは表示しない。
  - 初回表示時と可視状態で2.5秒ごとに計測する。hidden中は計測を停止し、visible復帰時に即時計測して周期を再開する。hardware stats用WebSocketの値や配信周期とは独立して計測する。
  - APIへのアクセス、列挙・読み取りが拒否された場合、列挙中に内容が変化した場合、または安全な整数範囲を超える場合は「取得不可」と表示する。数値は1 MiB未満をKiB、それ以上をMiBで小数1桁表示する。
- **UI 表示コンポーネント**:
  - **デスクトップ (`ResourceGaugeChips.tsx`, REQ-339)**: プレビューエリア内の重畳オーバーレイ（旧HUD）を撤去し、Global Header（`<h1>Generate</h1>` の右側コントロール領域）へ `ResourceGaugeChips` として移設配置。プレビューエリアの画像表示を遮蔽せず100%解放しつつ、各指標（CPU/RAM/GPU/VRAM）の現在値とストレージ推定量（localStorage/sessionStorage）をヘッダー部で常時視認可能とする。
  - **モバイル (`ResourceGaugeChips.tsx`, REQ-289)**: `MobileLayout.tsx` マウント時に `useSystemStats()` を起動し、ヘッダー1段目（`<h1>Generate</h1>` の右側、`justify-between` スペース）にコンパクトなチップ群として表示。2段目のワークフロー/設定行との幅競合・押し潰れを解消。
  - localStorage/sessionStorageの推定量もデスクトップヘッダーとモバイルチップに表示する。REQ-312の表示整理方針に従って重複を抑え、表示行数を3行に固定しない。今回の指標追加による行数増加を許容する。
  - **段階的警告カラー**: 通常時は `zinc-400`、85% 超過時は警告カラー `amber-400`、95% 超過時は危険カラー `red-400` へ視覚的警告を通知。取得不可時は `--`（`zinc-500`）表示。

### 2-11. サムネイルストリップ

- 表示対象: `filterOwnSession`（自セッション）/ 全履歴切替。
- タブ: `history`（生成履歴）/ `snapshots`（保存済みスナップショット）。
- 表示順: 「新しい順（降順）」「古い順（昇順）」切替。
- 複数選択一括保存: `Ctrl/Shift/長押し` で複数選択し、一括でスナップショットとしてアルバム保存可能。
- 履歴画像URLは同一originの `/view` 表現へ正規化し、`filename` / `subfolder` / `type` / `t` を保持する。一覧には既存thumbnailを使い、main/拡大表示には同一originのview URLを使う。旧hostと新hostの同一画像はfilename・subfolder・type identityで重複表示しない。`t` はURL/cache bust用で画像identityには含めない。
- 試行履歴の表示可否はPrompt Surgeonバックエンドが自立保持するWebPキャッシュ（最新200件フルサイズ・サムネイル）およびSQLiteメタデータを正本（SSoT）とする。Gallery rowのthumbnail描画時を含め、上流ComfyUIへの原画存在確認プローブ（HEAD/GET availability probe）は一切行わない（ゼロプローブ）。上流ComfyUI側の一時ファイル削除や404発生にかかわらず、BEキャッシュが存在する試行画像はギャラリー履歴から除外されることなく安定して表示・再利用される。明示再試行は同じthumbnail URLで行い、再試行操作は画像行の選択に伝播しない。保存Snapshot branchには適用しない。
- persisted queryの復元完了後、有効な非空の表示済みhistoryをbaselineとして、document reload epochごとに一度だけBE差分同期を行う。baselineが空なら要求しない。reloadで全件GETやhistory(200)の再取得、表示query全置換を行わず、BEが保持する未表示候補だけを既存表示へ追加する。既存項目のURL・相対順・選択・metadataは維持する。照合・追加はfilename/subfolder/type identityで行い、同一画像の重複を作らない。
- ComfyUI原画の確認プローブは廃止され、試行履歴・保存Snapshot branchの双方においてComfyUIファイル不在を理由とした強制除外は行わない。保存済みSnapshotの本体、params、表示は試行履歴と独立して保持する。サムネイル寸法/aspect比、cache品質・原画cache回復、30件local/1000件server metadata上限、IndexedDBの10分maxAgeを含む既存データライフサイクルは従来仕様を維持する。

---

## 3. モバイルレイアウト (`MobileLayout`)

画面幅 767px 以下で自動適用されるシングルカラム縦スクロール構成。

### 3-1. 常駐プレビューの撤去と画像確認アーキテクチャ (REQ-372)

- **常駐プレビューの撤去**:
  画面幅 767px 以下において、画面上部に常駐していた固定プレビューコンテナ（旧105px〜220px）を撤去し、プロンプト編集・タグ編集の有効縦スクロール領域を最大化する。PC表示（768px以上）ではプレビューを従来どおり維持する。
- **分離型画像確認フロー（サムネイル → ボトムシート → 全画面ビューア）**:
  画像の確認は常駐プレビューではなく、以下の3段階の遷移で行う：
  1. **3列正方形グリッド（サムネイル一覧）**: ページの縦スクロールに従う3列正方形グリッドで履歴画像を一覧表示。
  2. **画像ボトムシート (`MobileImageSheet`)**: サムネイルタップにより下端起点ボトムシート（`max-h-[88dvh]`）が展開し、元の縦横比（`max-h-[60dvh] object-contain`）で拡大確認。
  3. **全画面ビューア**: ボトムシート内画像タップで背景黒（`bg-black`）のエッジツーエッジ全画面ビューアへ切り替わり、没入閲覧を提供。

### 3-2. 最上部固定ステータスヘッダーと生成完了導線 (`MobileLayout.tsx`, REQ-372)

- 画面最上部に24px高のステータスヘッダー（`data-testid="mobile-sticky-status-header"`）を常時固定配置する。
- **生成中進捗表示**: ノード進捗バー、バッチ進捗バー、経過秒数、ETA、およびキュー数をリアルタイム表示。
- **生成完了通知と導線**: ジョブ完了直後、ヘッダー右側に「生成完了: 最新画像を表示」アクション導線を表示。タップするとアクティブセグメントが `history`（履歴タブ）へ自動切替され、最新の生成画像を選択・スクロール表示する。

### 3-3. 履歴3列正方形グリッド (`GenerationGallerySection.tsx`, REQ-372)

- モバイル時の横スクロールレール（`overflow-x-auto`）を完全廃止。
- ページの縦スクロールに従う3列縦スクロールグリッド（`grid grid-cols-3 gap-2 py-2`）を採用し、全履歴画像へ迷わず到達可能とする。
- サムネイルは `aspect-square rounded-lg border-2 object-cover` による正方形トリミングで描画。
- 履歴0件時は空状態メッセージを表示し、架空画像は描画しない。

### 3-4. 画像ボトムシート (`MobileImageSheet.tsx`, REQ-372)

- サムネイルタップで下端起点ボトムシート（`max-h-[88dvh]`）が展開。
- シート中央で画像を元のアスペクト比（`max-h-[60dvh] object-contain`）で表示。
- シートヘッダーにタイトル、画像ダウンロードボタン（`#download-btn-mobile`）、スナップショット保存ボタン、閉じるボタンを配置。
- フッターに「画像をタップして全画面で確認」ガイダンスを配置。
- 閉じる操作（閉じるボタン・Backdropタップ・Escape）でシートを閉じ、背後の履歴グリッドのスクロール位置を維持する。
- 画像読込失敗時は ImageOff アイコンと案内文を表示し、レイアウト崩れを防止する。

### 3-5. 全画面ビューアとスクリーン制御 (`MobileImageSheet.tsx`, REQ-372)

- ボトムシート内画像タップで、シートのクローム（ヘッダー・ハンドル・フッター）を非表示化し、黒背景（`bg-black`）の全面ビューア（`w-full h-full object-contain`）へ切り替える。
- 右上に `safe-area-inset-top` を考慮した 44×44px 以上のフローティング閉じるボタンを配置。
- **Fullscreen API 制御**: `requestFullscreen()` を呼び出してブラウザUIを非表示化。非対応環境（iOS Safari等）や権限拒否時は CSS 100dvh 全面表示へ安全に縮退フォールバックする。
- **Screen Wake Lock API 制御**:
  - 全画面ビューア表示中（`isFullscreen === true`）かつフォアグラウンド（`document.visibilityState === 'visible'`）時に `navigator.wakeLock.request('screen')` を取得し、画面の自動消灯を抑止。
  - 全画面解除時（画像タップ・右上閉じるボタン・Escape・OS戻る操作・fullscreenchange）、シート復帰時、タブ切替時、画面非表示時（`document.visibilityState === 'hidden'`）に直ちに `release()` して解除。
  - バックグラウンドから復帰時（`visibilitychange`）は全画面表示中であれば再取得を試行。
  - API非対応環境や拒否時も例外を捕捉して非阻害で閲覧を継続。
- 画像タップ・右上閉じるボタン・Escapeキー・OS戻る操作で全画面を解除し、ボトムシートへ復帰する。

### 3-6. 複数選択モードの保護 (`GenerationGallerySection.tsx`, REQ-372)

- サムネイル長押しで複数選択モードを起動。
- 複数選択モード中は、サムネイルタップ時に画像ボトムシートを開かず、当該画像の選択・解除トグル処理を実行する。
- 選択件数表示、全選択、選択解除、スナップショット一括保存、モード終了ツールバー操作を維持する。

### 3-7. 常駐プレビュー機能移行対応表 (REQ-372)

常駐プレビューが担っていた全6機能の移行先と操作仕様：

| 機能項目 | 移行先コンポーネント | 具体的操作仕様・UI導線 | 移行判定 |
| :--- | :--- | :--- | :--- |
| 1. 進捗・ETA・キュー数表示 | 最上部固定ステータスヘッダー (`MobileLayout.tsx`) | 24px固定ヘッダー内にリアルタイム描画。生成完了直後に新画像到達導線を表示 | 移行維持 |
| 2. 自動追従 / 固定 | 履歴ツールバー (`GenerationGallerySection.tsx`) | `#preview-autofollow-toggle-mobile` ボタンで新画像自動選択と手動固定をトグル | 移行維持 |
| 3. 画像ダウンロード | 画像ボトムシート (`MobileImageSheet.tsx`) | シートヘッダーの `#download-btn-mobile` ボタンから表示中画像を直接保存 | 移行維持 |
| 4. スナップショット保存 | 画像ボトムシート / 複数選択バー | ボトムシート保存ボタンおよび履歴複数選択バーからスナップショット保存モーダルを起動 | 移行維持 |
| 5. 画像エラー表示 | 履歴サムネイル / ボトムシート / 全画面 | 履歴サムネイルに再試行バッジ、シートおよび全画面に ImageOff アイコンと案内文を表示 | 移行維持 |
| 6. 複数選択モード | 3列履歴グリッド (`GenerationGallerySection.tsx`) | サムネイル長押しで起動。選択モード中はタップでシートを開かず個別トグルを実行 | 移行維持 |

### 3-8. 入力およびコントロール規約

プロンプトタブはshrink-0 whitespace-nowrapによる横スクロールに対応し、360px画面でもタブ折り返しによる重なりを防止する。
チェックボックス、ラジオ、レンジスライダー、各種ボタン等の非テキスト入力操作時にもGenerate Batchアクションバーを維持して操作可能とし、下部スクロールコンテナにはpb-[calc(54px+env(safe-area-inset-bottom)+72px)]のパディングを確保してアクションドックとの重なりを防止する。
プリセットマネージャーはmax-h-[75dvh]のボトムシートとして動作し、Safari下部アドレスバーによる被りを抑止するとともに、全選択/解除・保存・Scene Generator等のアクションバーを最下部にピン留め固定する。
パラメータパネル（ParamPanel.tsx）はラベル幅とセレクト/ステッパーを1行に収めるスマートレイアウトを採用し、アセット追加モーダル（AddAssetModal.tsx）はパディングを14px（p-3.5）に引き締めてモバイル表示を最適化する。
リソースホバーモニター（ResourceHoverMonitor.tsx）は、640px以上で資源チップへのホバー時に幅250pxのリソース詳細カード（hover型、`HeaderDropdown` の `hoverBridge` 付き）を、640px未満でVRAMピル（幅96px）のタップ時に幅240pxのリソース詳細オーバーレイ（click型）を表示する。いずれのパネルも `HeaderDropdown`（§4-4-1）でbodyへportalし、fixedでヘッダー下端＋6pxに配置する。重なり順は `--z-header-menu`（60）により、ボトムナビ（50）より前面・共通Modal（100）より背面とし、ヘッダータイトルの隠蔽やモーダルとの衝突を防止する。ActionBarは高さ54pxの共通bottom navigationとsafe-area上部に常時配置する。操作対象は44px以上とする。

### 3-9. 提供機能

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
    systemWsService.ts       — /api/ws共有接続とmessage購読の集約
  useGenerationStore.ts  — ルートストア結合（39行）
```

- **WebSocket 切断回復・キープアライブ (REQ-266)**:
  - **キープアライブ (Ping 送信)**: 接続確立中、25秒周期で定期的なキープアライブ Ping（`{"type":"ping"}`）を送信し、非アクティブ放置時における Chromium / OS のアイドルタイムアウト切断を能動防止する。
  - **指数バックオフ自動再接続**: `onClose` または `onError` 検知時、指数バックオフ（1s → 2s → 4s → 8s → 最大15s）で自動再接続を自律的・継続的に試行する。接続確立時にリトライ間隔を初期値（1秒系）へリセットする。
  - **タブ復帰時（VisibilityChange / Focus）即時回復**: ブラウザタブが非アクティブからアクティブ（`visibilityState === 'visible'` または `focus`）に復帰した際、WebSocket が未接続状態（`!isConnected`）であれば待機タイマーを待たずに即座に再接続初期化（`initialize({ force: true })`）を能動トリガーする。
  - **状態同期**: 再接続時は `GET /api/generation/state` と共有WebSocketの最新Generation snapshotを使ってjob状態を同期し、履歴画像の再取得はAPI経由のhistory照会で行う。進捗はsnapshot、表示履歴はhistoryデータを正本とし、上流queue/historyの欠落だけで取消済み・完了を推定しない。document reload epochの差分同期は、persisted query復元済みの非空baselineに対して一度だけ行い、空baselineでは要求しない。BE候補窓は既存の最新200件に限り、同期は最大20 page/200検査とする。上限到達などで全候補を検査できない場合はpartial状態を示し、自動タイマー再試行をしない。200件より古い履歴の回復は保証しない。

---

## 5. ワークフロー JSON へのパラメータ注入

生成実行時に `workflowParamInjector.ts`（純粋関数）を用いて以下を一元注入：
1. `paramValues` → input_type に応じた型変換・ノード入力代入
2. LoRA スタックノードの動的展開・余剰キークリア
3. バイパス対象ノードのバイパス処理
4. legacy global Seedの従来処理と、専用`seed` mappingの確定処理を分離する。専用Seedはslotごとに値/modeを解決し、固定時はbase + 0始まりbatch index、ランダム時は各jobの32bit値を生成する。同期親子は親の実値を共有する。専用Seedは全バッチの範囲・metadata・対応graphを検証し、全件が有効な場合だけ投入する（境界外や曖昧な設定は要求全体を事前拒否）。
   - 実入力名は`param_name`、続いて登録済み`fallback_param_names`の順に既存own inputから解決する。seed mappingでは暗黙の`value` fallbackや未登録keyの追加をしない。解決不能または選択keyがgraph referenceの場合は、ComfyUIへのPOST前に要求全体を拒否する。初期表示と履歴記録もこの解決済みkeyを使う。

### 5-2. 生成前バイパス処理およびスキーマ整合性保証 (REQ-230)

1. **バイパス前提条件（ComfyUI スキーマキャッシュ）**:
   - 有効化されたバイパスプロファイル（`bypassProfiles` の `is_enabled: true` かつ `bypassed_node_ids.length > 0`）が存在する場合、ノードの入出力スロットを安全に繋ぎ替えるために ComfyUI のノード定義スキーマ（`/api/comfy/object_info`）が必要となる。
2. **フェイルセーフ防御**:
   - 生成実行時（単一生成 `handleGenerate` / セット生成 `handleGenerateSets`）、アクティブなバイパスノードが存在するにもかかわらず `comfyObjectInfo` が未取得（空オブジェクトまたは未ロード）の場合、不完全なワークフロー投入による画像破損や意図しないノード接続破壊を防止するため、キュー投入を即座に中断する。
   - ユーザーへはエラートースト「`ComfyUIのノードスキーマ情報を取得できていないため、バイパス処理を実行できません。ComfyUIの接続を確認してください。`」を表示し、状態の破損（activeBatch の先行初期化やキュー投入）を防ぐ。
3. **ComfyUI 接続復帰時の自動再検証・取得**:
   - ComfyUI 接続が確立（`isConnected: true`）された契機で `comfy-object-info` クエリを自動再検証（`invalidateQueries`）し、最新スキーマを同期する。

### 5-3. パラメータ変更即時生成・セット整合性保証 (REQ-277, REQ-279)

1. **実行時最新ストア状態の取得 (`useGenerateAction`)**:
   - `handleGenerate` および `handleGenerateSets` の呼び出し時、フック生成時のクロージャスナップショットではなく、Zustand ストアから直接最新状態（`useGenerationStore.getState()`）を取得してキュー投入ペイロードを構築する。
   - これにより、パラメータ変更直後（1秒未満・オートセーブ非同期通信中）に即座に生成ボタンが押下された場合でも、画面表示中の最新 `paramValues`、`batchSize`、`seedMode`、`seed` を凍結したBatchRequestとしてメインAPIへ渡す。
2. **厳格なアクティブセット特定と他セット汚染防止 (REQ-279)**:
   - セットごとのパラメータマージにおいて、`String(setItem.id) === String(currentActiveSetId)` による型安全比較を行う。
   - `currentActiveSetId` が `null` または未設定の場合、あるいはアクティブセットではないセットに対しては画面の入力値（`currentParamValues` や画面の `batchSize`/`seed`）を強制上書き・マージせず、各セット自身の保持パラメータ（`setItem.paramValues` 等）を忠実に尊重して投入する。
   - チェック状態のセット数やセット総数に応じた安易なフォールバック（別セットへの画面値誤爆）を完全に遮断し、セット間の独立性を担保する。
3. **インメモリ先行同期 (`multiSetSlice` / `usePresetState`)**:
   - オートセーブ（`flushAutoSave`）実行時、バックエンドへの非同期 PUT 完了を待たず即座にインメモリの activeSet を最新 `currentState` で更新し、ストア内の整合性を維持する。
   - `multiSetSlice.updateActiveSet` においても、`activeSetId` が `null` の場合は安全にガードされ、他セットへの不要な上書きを防ぐ。

### 5-4. 生成前他プロセスVRAM競合防止と待機通知 (REQ-260)

1. **VRAM受付後ゲート（Preflight Guard）**:
   - BatchRequestの受付とユーザー操作はWebSocket接続や現在のVRAM空き量を待たずに行い、workerがComfyUI上流へ送る直前にホストGPU空きVRAM（`vram_free_gb`）を評価する。判定にはバックエンドのSYSTEM_STATSまたはオンデマンド計測を使い、低VRAMなら未投入jobをworker側で待機させる。ブラウザーが待機を監視・表示することは、ブラウザーからの上流送信やworker状態の代替を意味しない。
   - 空きVRAMが安全基準値（デフォルト4.0GB、`settings.vram_min_free_gb`）を下回る場合、受付済みrequestを維持して上流投入を保留する。受付済jobの通常キャンセルと、低VRAM wait中の未投入分キャンセルは区別する。
2. **専用ステータス表示 & UIフィードバック (AC-2)**:
   - 待機状態中は生成進行UI上に専用ステータス「VRAM解放待ち（他プロセスの終了待機中）」および「空き容量 / 必要容量 / 待機経過秒数」をリアルタイム表示する。WebSocketからの2.5秒周期プッシュにより、空き容量表示は自動追従する。
3. **長時間待機通知 (AC-3)**:
   - 待機状態が10秒以上継続した場合、画面上へ警告トーストを発行し、他プロセス（ローカルLLM等）の完了待機中である旨をユーザーへ明示する。
4. **即時待機キャンセル (AC-4)**:
   - 待機中、ユーザーはステータスバーやアクションバーの「待機キャンセル」から当該accepted requestの未投入jobだけを取り消せる。FEは既存のguard付きjob cancelを使い、取消時点でqueuedかつprompt ID未確定のjobだけをbackendが原子的に対象とする。ComfyUI上流へ既投入のjob、running job、Studioや別requestは中断しない。ブラウザー接続断はworkerを停止しない。
5. **WebSocketプッシュ駆動の自動再開 (AC-5)**:
   - workerは新しいVRAM状態を評価して安全になった待機jobを上流へ送る。FEは `SYSTEM_STATS`（`vram_safe: true`）または `VRAM_RECOVERED` とGeneration snapshotで待機表示を更新し、上流投入を重ねて行わない。通常の2.5秒SYSTEM_STATS周期を変更しない。

### 5-5. キュー投入失敗理由通知 (REQ-307)

1. `handleGenerate` と `handleGenerateSets` は、キュー投入に失敗した対象・バッチ位置・失敗理由・投入結果（失敗または結果未確認）を対応づけて記録し、処理終了後に一つのエラートーストへ行単位で集約して表示する。確定した失敗は「キュー投入に失敗しました」、通信タイムアウト等で結果未確認の場合は「キュー投入を確認できませんでした」と表示する。理由を取得できない場合は「理由を特定できませんでした」と表示し、トーストは `persistent: true` として全文を読めるようにする。
2. 単一生成は `batchSize` が 1 の場合に番号を省略し、複数回投入では `i/N` を付ける。複数セット生成は、各行を `[セット名] (i/N)` と理由で対応づける。
3. 失敗したジョブは `failed` 状態にし、後続の投入を継続する。キャンセルによる中断では失敗通知を表示しない。キュー取得更新が失敗しても、集約済みの投入失敗通知を表示する。

---


## 6. スナップショット保存および生成時パラメータ永続化 (REQ-227)

- **個別保存**: `AddSnapshotToAlbumModal` からアルバム選択・新規作成して `POST /api/snapshots`。
- **一括保存**: サムネイル複数選択時に `Promise.all` で並列保存。
- **派生スナップショット**: 親スナップショット ID（`source_snapshot_id`）を保持。親スナップショット削除時も DB の `SET NULL` により派生画像は独立して保持される。
- **生成時メタデータ永続化とスナップショット復元**:
  - 生成要求ごとに固定したworkflow ID、graph、param values、適用アセットをbatch itemとしてメインAPIへ渡す。バックエンドは受付時の同一DB transactionで `GenerationJob` と凍結metadataを保存し、commit後に `202 Accepted` を返す。最初にComfyUI prompt IDが確認された時点で、workflow ID・param values・applied assetsをprompt metadata recordへ同一transactionで対応付ける。妥当な `__prompt_surgeon_metadata_v1` があればそのrecord内に `queued_at` とprompt IDを追記し、それ以外のparam valuesは変更しない。生成完了時刻を受付時刻や既存 `created_at` の別意味として保存しない。
  - 生成記録のローカルreader `readLocalRecordedMetadata` は同期的にlocalStorageから一致する `prompt-surgeon-meta-*` 記録を読む。local記録がない場合の非同期resolverはserver metadataを照会する。prompt metadataはTanStack Queryの永続cacheには含めない。
  - スナップショット保存時は画像 URL の `t` からローカル/server記録を照会して保存する。記録欠落時に現在の入力値から生成条件を補完しない。保存済み `params` は空値を含めて正本とし、保存後に元のメタデータ記録が整理されても保存内容は独立して残る。
  - ローカルの `prompt-surgeon-meta-*` は生成時メタデータの一時キャッシュとして最大30件を保持する。新規記録の書き込み前に整理し、incoming record用の枠を先に確保して既存記録をtimestamp降順で残す（同時刻はkey順）。初回利用時も既存キャッシュをこの上限へ移行する。壊れたJSON、objectでない値、timestampが欠落・不正な記録は有効記録より先に削除する。保存済み画像のSnapshot `params` はキャッシュと独立した保存内容であり、キャッシュ整理の対象にしない。整理によりサーバー未保存の記録が失われる場合がある。サーバーのprompt metadataは最大1000件を維持し、非同期server保存を続ける。未保存画像の無期限保持は行わない。
  - スナップショットの `params` には、保存時点の生成記録に含まれるLoRA付属trigger setを `__metadata_associations_v1` にも保持する。このキーは生成時の不変記録とは別の現在関連情報である。

---

## 6-2. 履歴プレビューモーダル (`HistoryModalPreview.tsx`)

- スナップショット未保存の画像であっても、URL の `t` パラメータからメタデータを照会し、`<Info />` ボタンより生成時パラメータ（アスペクト比、サンプラー、スケジューラー、ステップ数、CFG、シード値、プロンプト）の確認パネルを表示可能。
- **追従/固定トグルボタン (REQ-264)**:
  - ヘッダー右側（Close ボタン左隣）にトグルボタンを配置。
  - 自動追従時は `Play` アイコン（アクセントグリーン）、固定時は `Pause` アイコン（ニュートラルグレー）で現在の状態を直感的に視認可能。
  - フォーカス閲覧中に新着画像が生成された場合、自動追従時（Play）は最新画像に切り替わり、固定時（Pause）は現在の表示位置（画像 URL）をブレずに維持。

---

### 6-3. 生成画像メタ情報（REQ-316）
- 生成画像の情報パネルは、Prompts と Parameters & Assets を切り替えて表示する。プロンプト欄は生成時の名前・role・順序と全文を示し、欄ごとの開閉・全開閉・コピーを提供する。記録された空欄と未記録を区別し、記録の完全性が不明な場合は警告する。文字数はUnicode書記素単位で算出し、clipboard失敗を通知する。
- Parameters & Assets には生成記録のmapping値および保存済みparamsの追加キーを名前付きで表示する。false、0、空文字、null、配列、objectを保持し、内部予約キーは通常項目として表示しない。実寸と比率は画像読込時のpixel寸法から導出し、画像形式は取得可能なMIME情報を表示する。
- 生成記録は投入graphに含まれる実使用seed、欄構成、workflow ID/名前、適用アセットとLoRA値を保持する。生成時入力のbypass状態・graph値・記録不足を区別する。過去に記録されていない内容を現在のworkflow/master/inputから推定復元しない。
- Workflow、Prompt ID、キュー受付時刻、メタ情報保存時刻、生成完了時刻、画像保存時刻は意味を分けて表示する。version1 recordのoptional `completed_at`は成功jobの実`finished_at`を同じtransactionで記録する。旧履歴は対応する成功jobが残る場合だけ取得時のcopyへ補い、時刻の根拠がないものは未記録とする。保存日時から完了日時を推測しない。現在のアルバム所属は生成時の事実と混同しない。
- LoRA、汎用適用TagSet、LoRA付属trigger setは別種の情報として表示する。保存済み画像では現在の汎用TagSet/trigger set関連をdraft編集し、追加・削除・保存・キャンセルできる。生成プレビューは読取専用。編集はtyped snapshot PATCHで関連だけを更新し、生成記録、LoRAのrole/strength、画像・アルバム等を変更しない。PATCH失敗時はdraftを保持して失敗を表示する。
- `prompt-surgeon-meta-*` のローカル生成時メタデータcacheはlocalStorageで最大30件とし、新規保存前にtimestamp順で整理する。破損・不正timestampの記録を先に削除し、incoming recordの枠を確保する。同期readerによる初回表示と、local記録がない場合のserver fallback、および不足する生成完了日時だけのserver補完を使う。Snapshot `params` はこのcache上限に含めず、保存済み生成記録を保持する。サーバーprompt metadataの上限1000件と非同期保存を維持する。旧画像の未記録値の再構成、未保存画像の無期限保持は行わない。API query cacheのIndexedDB保存契約は[SPEC_COMMON 6](./SPEC_COMMON.md)を参照する。
- 実装は局所typecheck/対象テストで確認済み。統合3-Gate、全体回帰、ブラウザーシナリオ、quota拒否時の実ブラウザー動作および実際のComfyUI生成を含む検証は、最終確認の記録ができるまで完了扱いにしない。設計・AC・実装タスクは[REQ-316](../design/REQ-316.md)と[REQ-332](../design/REQ-332.md)を参照。

## 7. コンポーネント & フック構成

```
pages/GeneratePage/
  components/
    DesktopLayout.tsx          — PC/タブレット用 2カラムレイアウト（配置特化）
    MobileLayout.tsx           — モバイル用シングルカラムレイアウト（配置特化）
    AuditPanel.tsx             — LLM 診断パネル
    ParamPanel.tsx             — パラメータ入力フォーム群
    AddAssetModal.tsx          — LoRA/TagSet 追加モーダル
    AppliedAssetChips.tsx      — 適用アセットチップ一覧
    PromptTranslationModal.tsx — プロンプト日英翻訳
    SettingsPopover.tsx        — ComfyUI 接続設定
  sections/
    GenerateModalsOverlay.tsx   — 共通モーダル群・トースト通知の集約オーバーレイ（REQ-282）
    SetTabsBar.tsx              — プリセットタブ一覧・追加・Undo/Redo制御バー（REQ-282）
    GenerationGallerySection.tsx — 生成画像・履歴・スナップショットギャラリー & 追従制御（REQ-282）
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


## REQ-334 最終時間表示契約

管理ジョブのETAは表示中の集約進捗と実行開始時刻、従来生成は全体進捗と生成開始時刻を使用する。開始時刻・有効な進捗・経過時間の根拠がないときは「未取得」。既知の経過時間・ETAは整数秒表示で、VRAM値・Seed・Queue件数とともに等幅字体・等幅数字を用いる。アセット追加のLoRA強度は既存0〜2範囲内で0.05刻み、範囲未定義のスタック倍率へ新たな範囲を課さない。

## REQ-344 GeneratePage回帰テスト契約

GeneratePage回帰テストは既存の13ケースを維持し、workflow未ロード時のDesktop/Mobileボタンdisabled状態から、workflow解決後にボタンがenabledになる状態遷移を対象とする。非同期テストは `get(1)` を待ち、deferred mockを広範囲の非同期`act`の外でresolveし、QueryClientのsuccessを待ってからボタンを再取得してenabledをassertする。この記述はテストの同期方法とカバレッジを記録するもので、製品/APIの動作を変更せず、将来の無条件な成功率も保証しない。詳細は[REQ-344設計](../design/REQ-344.md)、[検証計画](../design/REQ-344-test-plan.md)、[最小差分検証記録](../design/REQ-344-minimal-verification.md)を参照。
