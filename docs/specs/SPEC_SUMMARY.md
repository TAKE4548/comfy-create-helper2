# Prompt Surgeon — 基本仕様書 (SPEC_SUMMARY)

**バージョン**: 2.0  
**最終更新**: 2026-06-13  
**ステータス**: 現行実装に準拠（旧 Streamlit 移行記述は削除済み）

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
ComfyUI の API 版ワークフロー JSON を登録・管理し、プロンプト・パラメータをインタラクティブに編集して生成を実行する。LLM によるプロンプト監査・提案機能も備える。

### 主要機能

| # | 機能 | 概要 |
|---|---|---|
| 1 | ワークフロー管理 | ComfyUI API 版 JSON のアップロード・保存・マッピング設定 |
| 2 | 生成実行 | プロンプト・パラメータ編集 → ComfyUI へキュー投入 |
| 3 | リアルタイム進捗 | ComfyUI WebSocket 経由で生成進捗・プレビュー画像を表示 |
| 4 | スナップショット | 生成設定（プロンプト・パラメータ）と画像を紐づけて保存 |
| 5 | アルバム管理 | スナップショットをグループ化・並び替えで整理 |
| 6 | LoRA 管理 | LoRA モデルのメタ情報・トリガーワードセットを登録・管理 |
| 7 | タグセット管理 | よく使うタグの組み合わせをカテゴリ付きで登録・管理 |
| 8 | LLM 監査 | プロンプトの干渉タグ・語彙サジェスト・構図整合性を LLM で分析 |
| 9 | 基本設定 | ノードマッピングマスタ編集・ワークフロー削除 |

---

## 2. システム構成

```
React（フロント: Vite）
  ├─ REST / WebSocket ───── ComfyUI（キュー投入・進捗・画像取得）
  └─ REST ───────────────── FastAPI（バックエンド）
                              ├─ SQLite（データ永続化）
                              └─ LLM 中継 ──── ローカル LLM サーバー（Ollama / LMStudio 等）
```

- **ComfyUI へは React から直接アクセス**（ローカル同士なので CORS 問題なし）
- **FastAPI は SQLite CRUD + LLM 中継**に特化。ComfyUI のプロキシは担わない
- **ローカル LLM サーバー**は OpenAI 互換 API (`/v1/chat/completions`) に準拠するものなら何でも可

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
  │   │   │   ├─ HistoryModalPreview.tsx
  │   │   │   ├─ RescanModal.tsx
  │   │   │   ├─ TagChipInput.tsx
  │   │   │   └─ UploadWorkflowModal.tsx
  │   │   ├─ hooks/               # カスタムフック
  │   │   │   └─ useComfyWebSocket.ts
  │   │   ├─ pages/               # ページコンポーネント（マルチページ構成）
  │   │   │   ├─ GeneratePage.tsx  ← 🔴 リファクタリング対象（2427行）
  │   │   │   ├─ HistoryPage.tsx
  │   │   │   ├─ LoRAsPage.tsx
  │   │   │   ├─ SettingsPage.tsx
  │   │   │   └─ TagsPage.tsx
  │   │   ├─ store/               # グローバル状態管理（Zustand）
  │   │   │   └─ useGenerationStore.ts  ← 🔴 リファクタリング対象（692行）
  │   │   └─ App.tsx              # ルーティング定義
  │   ├─ package.json
  │   └─ vite.config.ts
  ├─ backend/                     # FastAPI（Python）
  │   ├─ app/
  │   │   ├─ main.py              ← 🔴 リファクタリング対象（シードデータ混在）
  │   │   ├─ models.py            # SQLAlchemy モデル
  │   │   ├─ schemas.py           ← 🟡 リファクタリング対象（321行・全スキーマ混在）
  │   │   ├─ config.py
  │   │   ├─ database.py
  │   │   ├─ routers/             # エンドポイント（リソース単位で分割済み）
  │   │   └─ services/            # ビジネスロジック
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
| 状態管理（グローバル） | Zustand | `useGenerationStore.ts` |
| 状態管理（サーバー） | TanStack Query (React Query) | v5 |
| HTTP クライアント | axios | `api/client.ts` でラップ |
| D&D | @dnd-kit/sortable | アルバム並び替え、TagChipEditor |

### バックエンド

| 役割 | 採用技術 | バージョン / 備考 |
|---|---|---|
| フレームワーク | FastAPI | Python 3.11+ |
| ORM | SQLAlchemy | |
| バリデーション | Pydantic v2 | |
| データストア | SQLite | ファイルベース・バックアップ容易 |
| OpenAPI | FastAPI 自動生成 | `backend/openapi.json` が SSoT |

---

## 5. ページ構成（マルチページ）

| ページ | ルート | ファイル | 詳細仕様 |
|---|---|---|---|
| Generate | `/` (デスクトップ) / `/mobile` (モバイル) | `pages/GeneratePage.tsx` | [SPEC_GENERATE.md](./SPEC_GENERATE.md) |
| History | `/history` | `pages/HistoryPage.tsx` | [SPEC_HISTORY.md](./SPEC_HISTORY.md) |
| LoRAs | `/loras` | `pages/LoRAsPage.tsx` | [SPEC_LORAS.md](./SPEC_LORAS.md) |
| Tags | `/tags` | `pages/TagsPage.tsx` | [SPEC_TAGS.md](./SPEC_TAGS.md) |
| Settings | `/settings` | `pages/SettingsPage.tsx` | [SPEC_SETTINGS.md](./SPEC_SETTINGS.md) |

---

## 6. DB 設計（SQLite）

### エンティティ一覧

| テーブル | 概要 |
|---|---|
| `workflows` | ワークフロー（JSON本体・名称） |
| `workflow_mappings` | ワークフロー × ノード × MappingMaster の紐づけ |
| `mapping_masters` | ノードマッピングマスタ（role・param_name・input_type 等） |
| `snapshots` | スナップショット（画像パス・params・workflow_id） |
| `albums` | アルバム（スナップショットグループ） |
| `album_items` | アルバム × スナップショット（表示順を保持） |
| `loras` | LoRA モデル（メタ情報） |
| `trigger_word_sets` | LoRA トリガーワードセット |
| `tag_sets` | タグセット |
| `lora_categories` | LoRA カテゴリマスタ |
| `tagset_categories` | タグセットカテゴリマスタ |
| `llm_prompts` | LLM システムプロンプト（key / content / description） |

### MappingMaster の役割

ノードマッピングマスタはワークフロー JSON 内のどのノードがどの役割（role）を担うかを定義する。  
`role` 名（例: `Main_Positive_Prompt`, `Sampler_Seed`）を基準に、フロントエンドは動的に入力フォームを生成する。

**プリセット role 一覧（初期シードデータ）**:

| role | 入力タイプ | 表示名 |
|---|---|---|
| `Main_Positive_Prompt` | textarea | Main positive prompt |
| `Face_Positive_Prompt` | textarea | Face positive prompt |
| `Negative_Prompt` | textarea | Negative prompt |
| `Sampler_Seed` | int | Sampler Seed |
| `Sampler_Steps` | int | Sampler Steps |
| `Sampler_cfg` | float | Sampler CFG |
| `Sampler_denoise` | float | Sampler Denoise |
| `Prompt_Quality` | textarea | Quality Tags |
| `Prompt_Core` | textarea | Core Settings |
| `Prompt_Char_Series` | textarea | Character / Series |
| `Prompt_Char_Lora_Face` | textarea | Character LoRA Face |
| `Prompt_Char_Lora_Other` | textarea | Character LoRA Other |
| `Prompt_Char_Body_Outfit` | textarea | Body & Outfit |
| `Prompt_Pose_Action` | textarea | Pose & Action |
| `Prompt_Expression` | textarea | Expression |
| `Prompt_Composition` | textarea | Composition |
| `Prompt_Background_Environment` | textarea | Background & Environment |
| `Prompt_Lighting` | textarea | Lighting |
| `Character_Lora_Model` | select | Character LoRA Model |
| `Character_Lora_Strength_Model` | float | Character LoRA Strength (Model) |
| `FDetailer_Steps` | int | FaceDetailer Steps |
| `FDetailer_cfg` | float | FaceDetailer CFG |
| `FDetailer_denoise` | float | FaceDetailer Denoise |

---

## 7. API 概要

FastAPI が提供するエンドポイントの概要。詳細は `backend/openapi.json` を参照。

| リソース | ベースパス | 主な操作 |
|---|---|---|
| ワークフロー | `/api/workflows` | 一覧・取得・登録・更新・削除 |
| ノードマッピングマスタ | `/api/mapping-masters` | 一覧・登録・更新・削除 |
| スナップショット | `/api/snapshots` | 一覧・登録・削除 |
| アルバム | `/api/albums` | 一覧・登録・順序更新・削除 |
| LoRA | `/api/loras` | 一覧・登録・更新・削除 |
| トリガーワードセット | `/api/loras/{id}/trigger-word-sets` | 一覧・登録・更新・削除 |
| タグセット | `/api/tag-sets` | 一覧・登録・更新・削除 |
| カテゴリ（LoRA） | `/api/lora-categories` | 一覧・登録・削除 |
| カテゴリ（TagSet） | `/api/tagset-categories` | 一覧・登録・削除 |
| LLM プロンプト | `/api/llm-prompts` | 一覧・取得・更新 |
| LLM 監査実行 | `/api/audit/run` | 監査実行（POST） |
| ワークフロースキャン | `/api/workflows/scan` | JSON スキャン・マッピング候補返却 |
| 設定情報 | `/api/config` | ComfyUI URL 取得 |

**注**: ComfyUI への直接アクセス（生成キュー投入・WebSocket 進捗・画像取得）は FastAPI を経由しない。フロントエンドが ComfyUI に直接通信する。

---

## 8. LLM 監査機能

### システムプロンプト管理

LLM に渡すシステムプロンプトは `llm_prompts` テーブルで DB 管理する。`key` で識別し、フロントから監査タイプ指定で呼び出す。

| key | 用途 |
|---|---|
| `audit_interference` | 干渉タグ診断（SDXL/汎用）|
| `audit_interference_anima` | 干渉タグ診断（Anima/自然言語対応モデル）|
| `audit_vocabulary` | 語彙サジェスト（SDXL/汎用）|
| `audit_physical` | 物理・構図整合性チェック |

### レスポンス形式

LLM は XML タグで構造化された出力を返す。FastAPI がパースして JSON に変換してフロントへ返す。

```xml
<!-- 干渉タグ診断 -->
<remove_tags>
  <item>
    <tag>socks</tag>
    <reason_jp>クローズアップ意図と下半身タグが矛盾</reason_jp>
  </item>
</remove_tags>
```

---

## 9. レスポンシブ設計

| 幅 | 対象 | レイアウト |
|---|---|---|
| 1024px〜 | PC | 3カラム・フル機能 |
| 768px〜1023px | タブレット | 2カラム |
| 〜767px | スマホ | 専用設計（`/mobile` ルート） |

スマホ向けは `/mobile` を独立ルートとして設計。省略機能あり（詳細: [SPEC_GENERATE.md](./SPEC_GENERATE.md)）。

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

*このドキュメントは `docs/spec_and_migration.md` を現行実装に合わせて再構成したものです。*  
*旧ドキュメント (`spec_and_migration.md`) は参照用に保持されますが、本ファイルを正とします。*
