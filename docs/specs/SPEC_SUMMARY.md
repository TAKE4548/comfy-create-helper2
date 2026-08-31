# Prompt Surgeon — 基本仕様書 (SPEC_SUMMARY)

**バージョン**: 2.1  
**最終更新**: 2026-09-01  
**ステータス**: 現行実装に完全準拠（フキダシ・漫画化バッチ、BaseModel体系、プリセット、バイパス、パラメータ同期、翻訳、シーン生成等の全拡張仕様および分割済み構造を反映）

> 関連仕様書:
> - [SPEC_COMMON.md](./SPEC_COMMON.md) — デザインシステム・共通コンポーネント
> - [SPEC_GENERATE.md](./SPEC_GENERATE.md) — GeneratePage 詳細仕様
> - [SPEC_HISTORY.md](./SPEC_HISTORY.md) — HistoryPage 詳細仕様
> - [SPEC_LORAS.md](./SPEC_LORAS.md) — LoRAsPage 詳細仕様
> - [SPEC_TAGS.md](./SPEC_TAGS.md) — TagsPage 詳細仕様
> - [SPEC_SETTINGS.md](./SPEC_SETTINGS.md) — SettingsPage 詳細仕様

---

## 1. アプリケーション概要

**Prompt Surgeon** は ComfyUI を活用した画像生成のためのフロントエンドツールである。  
ComfyUI の API 版ワークフロー JSON を登録・管理し、プロンプト・パラメータをインタラクティブに編集して生成を実行する。LLM によるプロンプト監査・提案・翻訳・シーン生成機能、フキダシ・漫画化エフェクト合成、BaseModel マッピング、プリセット管理などを備える。

### 主要機能

| # | 機能 | 概要 |
|---|---|---|
| 1 | ワークフロー管理 | ComfyUI API 版 JSON のアップロード・保存・マッピング設定・複製・名前変更 |
| 2 | 生成実行 & 制御 | プロンプト・パラメータ編集 → ComfyUI へキュー投入・進捗確認・ジョブ割り込み/キャンセル |
| 3 | リアルタイム進捗 | ComfyUI WebSocket 経由で生成進捗・プレビュー画像を表示 |
| 4 | スナップショット | 生成設定（プロンプト・パラメータ・LoRA・TagSet）と画像を紐づけて保存（派生関係の保持） |
| 5 | アルバム管理 | スナップショットをグループ化・並び替え（D&D・カスタム順/日付順）・一括操作で整理 |
| 6 | フキダシ & 漫画化 | スナップショットへのフキダシ挿入（縦/横書き・フォント・漫画エフェクト・口調変換）、一括バッチ漫画化ジョブ |
| 7 | LoRA 管理 | LoRA モデルのメタ情報・BaseModel紐付け・推奨強度・トリガーワードセットを登録・管理 |
| 8 | タグセット & サブセット | よく使うタグの組み合わせをカテゴリ・BaseModel・サブセット（バリエーション）付きで登録・管理 |
| 9 | ベースモデル体系 | SD1.5 / SDXL / Pony / Illustrious / Flux などの定義と ComfyUI チェックポイントファイルとの自動紐付け |
| 10 | ワークフロープリセット | パラメータ・適用アセット・シード設定のセットを名前付きで保存・切替・並び替え・一括管理 |
| 11 | バイパスプロファイル | ワークフロー内の特定ノード（アップスケーラー等）をワンクリックで無効化/有効化切替 |
| 12 | パラメータ同期 | Master-Slave による複数ノードパラメータの自動連動同期 |
| 13 | LLM 支援 | 干渉タグ診断・語彙サジェスト・日英翻訳・シーン自動分解生成・セリフ下書き・口調変換 |
| 14 | 基本設定 | ノードマッピングマスタ、パラメータ型マスタ、LLMモデル・パラメータ、翻訳設定、接続ステータス管理 |

---

## 2. システム構成

```
React（フロント: Vite）
  ├─ REST / WebSocket ───── ComfyUI（キュー投入・進捗・画像取得）
  └─ REST ───────────────── FastAPI（バックエンド）
                              ├─ SQLite（データ永続化）
                              ├─ ComfyUI プロキシ ──── ComfyUI（object_info / prompt / queue / history / checkpoints）
                              └─ LLM 中継 ────────── ローカル/外部 LLM サーバー（Ollama / LMStudio / OpenAI互換）
```

- **フロントエンドからの通信**: ComfyUI WebSocket によるリアルタイム進捗購読に加え、FastAPI 経由の ComfyUI プロキシ API（`/api/comfy/*`）による安定したデータ取得および制御が可能。
- **FastAPI**: SQLite CRUD、ビジネスロジック、LLM 中継、ComfyUI プロキシ、OpenCV 画像解析（フキダシ自動検出）、バックグラウンドバッチジョブ（漫画化）を統合管理。
- **ローカル / 外部 LLM サーバー**: OpenAI 互換 API (`/v1/chat/completions`) に準拠するものに対応。モデル選択や詳細パラメータ（Temperature、Top-P等）は設定画面から動的に変更可能。

---

## 3. リポジトリ構成

```
comfy-create-helper2/
  ├─ frontend/                    # React (Vite + TypeScript)
  │   ├─ src/
  │   │   ├─ api/                 # API クライアント・型定義
  │   │   │   ├─ client.ts        # axios ベースのクライアント
  │   │   │   └─ types.ts         # レスポンス型定義
  │   │   ├─ components/          # 共通コンポーネント
  │   │   │   ├─ TagChipEditor/   # タグチップエディタ（詳細: SPEC_COMMON.md）
  │   │   │   ├─ layout/          # AppShell 等
  │   │   │   ├─ common/          # PageHeader 等
  │   │   │   ├─ HistoryModalPreview.tsx
  │   │   │   ├─ SpeechBubbleEditorModal.tsx
  │   │   │   ├─ BatchSpeechTransformModal.tsx
  │   │   │   ├─ PresetManagerPanel.tsx
  │   │   │   ├─ BypassSettingsModal.tsx
  │   │   │   ├─ ParamSyncModal.tsx
  │   │   │   ├─ ImageCropper.tsx
  │   │   │   └─ ...
  │   │   ├─ hooks/               # 共通カスタムフック
  │   │   │   ├─ useMultiSelect.ts
  │   │   │   ├─ useThumbnailAspectRatio.ts
  │   │   │   └─ ...
  │   │   ├─ pages/               # ページコンポーネント（分割済み）
  │   │   │   ├─ GeneratePage/    # DesktopLayout, MobileLayout, components, hooks
  │   │   │   ├─ GeneratePage.tsx # エントリポイント
  │   │   │   ├─ HistoryPage/     # AlbumListView, AlbumDetailView, hooks
  │   │   │   ├─ HistoryPage.tsx
  │   │   │   ├─ LoRAsPage.tsx
  │   │   │   ├─ SettingsPage/    # BaseModelSection, Translation, SpeechTone, Llm 等
  │   │   │   ├─ SettingsPage.tsx
  │   │   │   └─ TagsPage.tsx
  │   │   ├─ store/               # グローバル状態管理（Zustand スライス構成）
  │   │   │   ├─ slices/          # connection, jobQueue, multiSet, bypass, paramSync
  │   │   │   ├─ services/        # comfyWebSocketService
  │   │   │   └─ useGenerationStore.ts
  │   │   └─ App.tsx              # ルーティング定義
  │   ├─ package.json
  │   └─ vite.config.ts
  ├─ backend/                     # FastAPI（Python）
  │   ├─ app/
  │   │   ├─ main.py              # FastAPI エントリポイント・CORS・ルーター登録
  │   │   ├─ models.py            # SQLAlchemy モデル（全18+テーブル）
  │   │   ├─ schemas/             # Pydantic v2 スキーマ（リソース単位で分割済み）
  │   │   ├─ seeder.py            # 初期マスターデータ投入
  │   │   ├─ migrations/          # SQLite スキーマ自動マイグレーション
  │   │   ├─ config.py            # 環境変数・設定
  │   │   ├─ database.py          # SQLAlchemy Session / Engine
  │   │   └─ routers/             # エンドポイント（全20ルーター）
  │   ├─ openapi.json             # FastAPI 自動生成（SSoT）
  │   └─ requirements.txt
  ├─ docs/
  │   ├─ specs/                   # ← 統合仕様書（本ドキュメント群）
  │   └─ backlog/                 # PBI・タスク管理
  └─ README.md
```

---

## 4. 技術スタック

### フロントエンド

| 役割 | 採用技術 | バージョン / 備考 |
|---|---|---|
| フレームワーク | React + Vite | TypeScript |
| スタイリング | Tailwind CSS | カスタムテーマ適用（SPEC_COMMON 参照） |
| アイコン | lucide-react | |
| 状態管理（グローバル） | Zustand | スライス分割構成（`store/useGenerationStore.ts`） |
| 状態管理（サーバー） | TanStack Query (React Query) | v5 + PersistQueryClientProvider |
| HTTP クライアント | axios | `api/client.ts` でラップ |
| D&D | @dnd-kit/sortable | アルバム、LoRA、TagSet、MappingMaster、TagChipEditor |

### バックエンド

| 役割 | 採用技術 | バージョン / 備考 |
|---|---|---|
| フレームワーク | FastAPI | Python 3.11+ |
| ORM | SQLAlchemy | 2.0+ (Mapped Annotations) |
| バリデーション | Pydantic v2 | `app/schemas/` パッケージ |
| 画像処理・解析 | Pillow / OpenCV | フキダシ自動検出、WebP 変換、サムネイル生成 |
| データストア | SQLite | ファイルベース・自動マイグレーション対応 |
| OpenAPI | FastAPI 自動生成 | `backend/openapi.json` が SSoT |

---

## 5. ページ構成（マルチページ & レスポンシブ）

| ページ | ルート | ファイル | 詳細仕様 |
|---|---|---|---|
| Generate | `/` (PC / モバイル共通) | `pages/GeneratePage.tsx` | [SPEC_GENERATE.md](./SPEC_GENERATE.md) |
| History | `/history` | `pages/HistoryPage.tsx` | [SPEC_HISTORY.md](./SPEC_HISTORY.md) |
| LoRAs | `/loras` | `pages/LoRAsPage.tsx` | [SPEC_LORAS.md](./SPEC_LORAS.md) |
| Tags | `/tags` | `pages/TagsPage.tsx` | [SPEC_TAGS.md](./SPEC_TAGS.md) |
| Settings | `/settings` | `pages/SettingsPage.tsx` | [SPEC_SETTINGS.md](./SPEC_SETTINGS.md) |

※ スマホ（画面幅 767px 以下）では、同一ルート `/` の中で `GeneratePage` が自動的に `MobileLayout` コンポーネントを描画します。

---

## 6. DB 設計（SQLite）

### エンティティ一覧

| テーブル | 概要 |
|---|---|
| `workflows` | ワークフロー本体（JSON、名称、target_base_model_id、default_applied_assets） |
| `workflow_mappings` | ワークフロー × ノード × MappingMaster の紐づけ |
| `mapping_master` | ノードマッピングマスタ（role、param_name、input_type、sort_order 等） |
| `param_type_masters` | カスタムパラメータ型マスタ（select / int / float / textarea / boolean 等） |
| `base_models` | ベースモデル定義（SD1.5, SDXL, Pony, Illustrious, Flux 等） |
| `checkpoint_mappings` | ComfyUI チェックポイントファイル名と BaseModel の紐付けマスタ |
| `lora_base_models` | LoRA と BaseModel の多対多中間テーブル |
| `tagset_base_models` | TagSet と BaseModel の多対多中間テーブル |
| `snapshots` | スナップショット（画像パス、サムネイル、params、source_snapshot_id、workflow_id） |
| `snapshot_loras` | スナップショット × LoRA の中間テーブル（適用強度・role を保持） |
| `snapshot_tag_sets` | スナップショット × TagSet の中間テーブル（role を保持） |
| `albums` | アルバム（スナップショットグループ） |
| `album_items` | アルバム × スナップショット（表示順序 `sequence_order` を保持） |
| `loras` | LoRA モデル（メタ情報、ファイルパス、推奨強度、サムネイル、sort_order） |
| `lora_trigger_word_sets` | LoRA トリガーワードセット（名前・単語配列） |
| `tag_sets` | タグセット（名称、タグ配列、サムネイル、sort_order） |
| `tag_subsets` | タグセット内のサブセット（バリエーションタググループ） |
| `lora_categories` | LoRA カテゴリマスタ |
| `tagset_categories` | タグセットカテゴリマスタ |
| `workflow_presets` | ワークフロープリセット（パラメータ・アセット・シード設定一式） |
| `bypass_profiles` | ワークフローごとのノードバイパス設定プロファイル |
| `param_sync_groups` | パラメータ同期グループ（Master-Slave 連動） |
| `llm_prompts` | LLM システムプロンプト・設定パラメータ（key / content / description） |
| `speech_bubble_presets` | セリフ装飾プリセット（shape / font / border / effects_json / orientation 等） |
| `speech_tone_presets` | セリフ口調変換プリセット（ツンデレ、お嬢様、敬語等） |

---

## 7. API 概要

FastAPI が提供するエンドポイントの概要。詳細は `backend/openapi.json` を参照。

| リソース | ベースパス | 主な操作 |
|---|---|---|
| ワークフロー | `/api/workflows` | 一覧・取得・登録・更新・削除・複製 (`/copy`)・JSONスキャン (`/scan`) |
| ノードマッピングマスタ | `/api/mapping-masters` | 一覧・登録・更新・削除・並び替え (`/reorder`) |
| パラメータ型マスタ | `/api/param-type-masters` | 一覧・登録・更新・削除 |
| ベースモデル | `/api/base-models` | 一覧・登録・更新・削除 |
| チェックポイントマッピング | `/api/checkpoint-mappings` | 一覧・登録・削除 |
| バイパスプロファイル | `/api/workflows/{id}/bypass-profiles` | 一覧・登録・更新・削除 |
| パラメータ同期グループ | `/api/workflows/{id}/param-sync-groups` | 一覧・登録・更新・削除 |
| ワークフロープリセット | `/api/presets` | 一覧・登録・更新・削除・並び替え (`/reorder`)・一括削除 (`/bulk`) |
| スナップショット | `/api/snapshots` | 一覧・取得・登録・削除・更新・アップロード・ダウンロード・フキダシ自動検出 (`/detect-bubble`) |
| アルバム | `/api/albums` | 一覧・取得・登録・更新・削除・並び替え (`/reorder`, `/{id}/order`)・アイテム一括削除 (`/{id}/items/delete`) |
| LoRA | `/api/loras` | 一覧・登録・更新・削除・並び替え (`/reorder`)・ComfyUIモデル一覧取得 (`/comfy-models`) |
| トリガーワードセット | `/api/loras/{id}/trigger-word-sets` | 一覧・登録・更新・削除 |
| タグセット | `/api/tag-sets` | 一覧・登録・更新・削除・並び替え (`/reorder`) |
| カテゴリ（LoRA） | `/api/lora-categories` | 一覧・登録・更新・削除 |
| カテゴリ（TagSet） | `/api/tagset-categories` | 一覧・登録・更新・削除 |
| LLM プロンプト & 設定 | `/api/llm-prompts` | 一覧・更新・モデル一覧取得 (`/models`)・現在モデル取得/更新 (`/current-model`)・シーン生成 (`/scene-generate`)・スピーチ下書き (`/speech-draft`) |
| LLM 監査実行 | `/api/audit` | プロンプト診断実行（POST） |
| プロンプト翻訳 | `/api/translate` | プロンプト翻訳 (`/prompt`)・接続テスト (`/test`)・統計 (`/stats`)・キャッシュクリア (`/clear-cache`) |
| セリフ口調プリセット | `/api/speech-tone-presets` | 一覧・登録・更新・削除・口調書き換え実行 (`/rewrite`) |
| フキダシ装飾プリセット | `/api/speech-bubble-presets` | 一覧・登録・更新・削除 |
| 漫画化一括バッチ | `/api/speech-batch` | ジョブ登録 (`/jobs`)・アクティブジョブ取得 (`/jobs/active`)・詳細取得・キャンセル・再試行 |
| フォント管理 | `/api/fonts` | 利用可能フォント一覧取得・フォントファイル配信 |
| ComfyUI プロキシ | `/api/comfy` | ノード情報 (`/object_info`)・キュー投入 (`/prompt`)・キュー確認 (`/queue`)・割り込み (`/interrupt`)・履歴 (`/history`)・チェックポイント一覧 (`/checkpoints`) |
| アプリケーション設定 | `/api/config` | ComfyUI URL 取得 |

---

## 8. LLM 支援機能

### システムプロンプト & パラメータ管理

LLM に渡すシステムプロンプトや詳細設定は `llm_prompts` テーブルで一元管理される。

| key | 用途 |
|---|---|
| `audit_interference` | 干渉タグ診断（SDXL/汎用）|
| `audit_interference_anima` | 干渉タグ診断（Anima/自然言語対応モデル）|
| `audit_vocabulary` | 語彙サジェスト（SDXL/汎用）|
| `audit_physical` | 物理・構図整合性チェック |
| `scene_generate` | シーン自動生成（シチュエーション文から各ロールへのプロンプト自動分解）|
| `scene_generate_anima` | シーン自動生成（Anima向け自然言語記述）|
| `translation_ja_to_en` | プロンプト翻訳（日 → 英）|
| `translation_en_to_ja` | プロンプト翻訳（英 → 日）|
| `speech_rewrite_system_prompt` | セリフ口調書き換え用プロンプト |
| `speech_draft_llm_prompt` | 画像とプロンプトからのセリフ下書き生成 |
| `bubble_detection_params` | フキダシ自動検出画像処理パラメータ |
| `llm_params_audit` / `llm_params_scene_generate` / `llm_params_translation` | 各機能別の LLM パラメータ（Temperature, MaxTokens 等） |

---

## 9. レスポンシブ設計

| 幅 | 対象 | レイアウト |
|---|---|---|
| 1024px〜 | PC / デスクトップ | 2カラム（左: 入力パネル群 / 右: プレビュー・履歴・生成コントロール） |
| 768px〜1023px | タブレット | 2カラム最適化 |
| 〜767px | スマホ | シングルカラム縦スクロール（`MobileLayout`、同一ルート `/`） |

---

## 10. 設定・環境変数

バックエンド `.env` で管理:

```env
DATABASE_URL=sqlite:///./prompt_surgeon.db
COMFY_URL=http://localhost:8188
LLM_BASE_URL=http://localhost:11434/v1   # Ollama
# LLM_BASE_URL=http://localhost:1234/v1  # LMStudio
CORS_ORIGINS=http://localhost:5173
```

---

*本ドキュメントは現行の全バックエンド・フロントエンド実装および SSoT 仕様に合わせて改訂された正本です。*
