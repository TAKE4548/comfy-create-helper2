---
title: Settings ページ仕様書 (SPEC_SETTINGS)
tags:
  - settings
  - REQ-314
related_paths:
  - docs/backlog/pbi/active/REQ-314.md
  - frontend/src/pages/SettingsPage
---

# Prompt Surgeon — Settings ページ仕様書 (SPEC_SETTINGS)

**バージョン**: 2.3
**最終更新**: 2026-10-04
**実装ファイル**: `frontend/src/pages/SettingsPage.tsx`（`SettingsPage/components/*` 分割構成）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md)

---

## 1. 概要

アプリケーション全体の基本設定、LLM モデル・パラメータ、プロンプト翻訳、フキダシ検出、口調プリセット、BaseModel・チェックポイントマッピング、ノードマッピングマスタ、ワークフロー、接続状態を一元管理するページ。

---

## 2. 機能一覧（設定セクション群）

| セクション | 説明 |
|---|---|
| **LLM 設定** | 使用する LLM モデル（ローカル/外部）の選択、システムプロンプト編集、詳細パラメータ（Temperature、Top-P、MaxTokens 等）の調整 |
| **翻訳設定** | プロンプト翻訳機能のプロバイダー設定（FuguMT [推奨・CPU常駐・初回自動配置・APIキー不要] / Google Cloud / DeepL / LLM）、APIキー、デバウンス時間、キャッシュクリア、翻訳統計確認 |
| **フキダシ検出設定** | 画像内のフキダシ自動検出パラメータ（最小面積 `min_area`、輝度閾値 `min_brightness`）の調整 |
| **セリフ口調プリセット** | キャラクター性に応じた口調変換プリセット（ツンデレ、お嬢様、敬語等）の CRUD とリアルタイム書き換えテスト |
| **ノードマッピングマスタ** | MappingMaster の一覧・登録・編集・削除・並び替え（D&D、`PUT /reorder`）・一括編集、カスタムパラメータ型マスタ（`ParamTypeMaster`）の管理 |
| **サムネイル表示設定** | アプリケーション全体でのサムネイル表示アスペクト比（1:1 正方形, 3:4 縦長, 4:3 横長, 16:9 ワイド等）の切り替え |
| **Base Model 設定** | ベースモデル（SD1.5, SDXL, Pony, Illustrious, Flux 等）の定義と、ComfyUI チェックポイントファイル（.safetensors）との自動マッピング管理 |
| **操作・ワークフロー・接続** | 複数選択モード起動の長押し時間設定、ワークフロー一覧・削除、FastAPI / ComfyUI のリアルタイム接続ステータス確認 |

---

## 3. レイアウトと状態（5タブ）

設定ページは目的別の5タブで構成する。タブIDは `workflows`（ワークフロー）、`prompt`（プロンプト）、`dialogue`（セリフ）、`translation`（翻訳）、`system`（システム）。タブは長い表示名とコンパクト表示名を持ち、狭い画面ではコンパクト表示名を使用する。各タブ内は目的別カードに分け、従来の13個の縦積みアコーディオンは使用しない。

| タブID | 長い表示名 / コンパクト表示名 | 主なカード |
|---|---|---|
| `workflows` | ① ワークフロー・モデル / ① モデル | ワークフロー、BaseModel、MappingMaster |
| `prompt` | ② プロンプト支援 / ② 呪文 | メインモデル、既存6種類のプロンプト、2種類のLLMパラメータ |
| `dialogue` | ③ セリフ支援 / ③ セリフ | 口調プリセット、VLM/LLM設定、フキダシ検出、3種類のロールプロンプト、1種類のLLMパラメータ |
| `translation` | ④ 翻訳 / ④ 翻訳 | プロバイダー、認証、デバウンス、プレビュー。LLMプロバイダー時のみ2種類の翻訳プロンプトと1種類のLLMパラメータ |
| `system` | ⑤ システム・一般 / ⑤ システム | 接続、VRAM、表示と操作 |

タブは `tablist` / `tab` のARIAナビゲーションとして実装し、タブ名をARIAラベルとして提供する。初期選択は有効なURL hash、次に有効な `prompt-surgeon-settings-active-tab`、最後に `workflows` の順で決める。hashが無効または欠落している場合は選択結果をURL hashへ `replace` で正規化する。以後はURL履歴を優先し、ユーザーのタブ選択を履歴へ `push` することで戻る/進む操作を復元する。

詳細表示の開閉状態は `prompt-surgeon-settings-details-expanded-v2` にJSONオブジェクト `{ "prompt": boolean, "dialogue": boolean }` として保存する。既定値は両方閉 (`false`) で、欠落・不正JSON・不正な値は該当項目を閉状態として扱う。旧キー `prompt-surgeon-settings-sections-expanded` は読み書きせず、削除もしないため既存データはそのまま残る。

編集中のドラフトは再取得や非同期応答で上書きせず、保存・適用時に最新の入力値を送る。既存6種類のプロンプト制約は `prompt` タブにのみ適用する。接続設定ではFastAPI/ComfyUIの既存契約を使い、Backend URLおよびLM Studio URLの編集機能は追加しない。

systemタブは接続状態、VRAM、表示と操作の3論理カードで構成する。既存API、store、環境設定の境界は維持し、新しいAPIや設定保存契約を導入しない。

### 3-1. 設定ページのレスポンシブ動作

768px未満ではタブバーを横スクロール可能にし、スナップ位置をタブ単位にする。タブを画面幅へ均等縮小せず、選択タブが見える状態を保つ。操作ボタンなどのタッチ対象は最小44pxとし、狭い画面では各設定カードをモバイル向けに縦積み表示する。設定タブのレイアウト境界は768px、AppShell下部ナビゲーションの境界は1024pxで、設定ページから共通AppShellの仕様は変更しない。

---

## 4. データモデル

### 4-1. MappingMaster & ParamTypeMaster

`input_type` のうち `select_sampler` および `select_scheduler` は、ComfyUI の `/object_info` から最新のサンプラ・スケジューラ一覧を動的取得する（オフライン時は定数フォールバック）。

```typescript
interface MappingMaster {
  id: number;
  role: string;
  expected_class_types: string[];
  param_name: string;
  input_type: 'textarea' | 'int' | 'float' | 'select' | 'lora_stack' | 'select_sampler' | 'select_scheduler' | 'boolean';
  display_name: string;
  title_patterns: string[];
  sort_order: number;
}

interface ParamTypeMaster {
  id: number;
  name: string;
  widget_type: 'select' | 'int' | 'float' | 'textarea' | 'boolean';
  combo_options?: string[]; // select 時の選択肢配列
  min_value?: number;
  max_value?: number;
  step?: number;
}
```

### 4-2. BaseModel & CheckpointMapping

```typescript
interface BaseModel {
  id: number;
  name: string;
  description?: string;
}

interface CheckpointMapping {
  id: number;
  checkpoint_name: string;
  base_model_id: number;
  base_model?: BaseModel;
}
```

### 4-3. SpeechTonePreset

```typescript
interface SpeechTonePreset {
  id: number;
  name: string;
  prompt: string;
  description?: string;
  sort_order: number;
}
```

### 4-4. TranslationSettings

```typescript
interface TranslationSettings {
  provider: 'fugumt' | 'google' | 'deepl' | 'llm';
  api_key?: string;
  api_url?: string;
}
```

- **FuguMT 特記事項**:
  - `provider: 'fugumt'` 選択時は、API キーおよびカスタム API URL の入力が不要（UI 上で入力欄非表示、保存ペイロードにも含めない）。
  - 初回使用時に Hugging Face より `jkawamoto/fugumt-en-ja-ct2` がローカルの `models/fugumt-en-ja` へ自動ダウンロード・配置される。
  - CTranslate2 による完全 CPU 常駐推論（約 20-30ms の超低レイテンシ）で動作し、VRAM を消費せず画像生成と並行して安定稼働する。
  - **ハイブリッド和訳アーキテクチャ**:
    - Danbooru 辞書（`danbooruTagCompleteCsv_v1020250919.zip` 等）の先行照会（ハッシュ引き・O(1)）により、登録タグは即時変換。
    - ピリオド・改行等で文ブロックを分割し、辞書非マッチの自然文節はカンマ区切りを再結合した文単位で FuguMT に渡すことで、関係詞や分詞構文などの文脈を維持した高精度な和訳を行う。
    - 強調構文（`((...:1.2))`）は一時プレースホルダー化またはカッコ内個別処理により構文破壊を防止し、`repack: true` 指定時にカンマ区切りおよびピリオド区切りで安全に再パッキングする。

---

## 5. 接続ステータス (Connections)

- **FastAPI Backend**: フロントエンドが稼働しているオリジンの `/api/config` へリクエストを送信して疎通確認（タイムアウト: 5000ms、4xx/5xx は切断判定）。
- **ComfyUI**: 設定されている ComfyUI URL（WebSocket / REST）の稼働状態をリアルタイム確認。

---

## 6. API 呼び出し

| 操作 | エンドポイント | ペイロード / パラメータ |
|---|---|---|
| マッピングマスタ一覧・管理 | `GET/POST/PUT/DELETE /api/mapping-masters` | `{ "role": string, ... }` |
| マッピングマスタ並び替え | `PUT /api/mapping-masters/reorder` | `{ "item_ids": number[] }` |
| パラメータ型マスタ一覧・管理 | `GET/POST/PUT/DELETE /api/param-type-masters` | |
| ベースモデル一覧・管理 | `GET/POST/PUT/DELETE /api/base-models` | |
| チェックポイントマッピング一覧・管理 | `GET/POST/DELETE /api/checkpoint-mappings` | `GET /api/comfy/checkpoints` |
| ワークフロー一覧・削除 | `GET/DELETE /api/workflows` | |
| ワークフロー差分推測・トポロジー解析 | `POST /api/workflows/{id}/diff-analyze` | `{ "json_body": object }` |
| ワークフロー置換確定（自動履歴バックアップ） | `PUT /api/workflows/{id}` | `{ "json_body": object, "mappings": array }` |
| ワークフロー直前スナップショット復元（ロールバック） | `POST /api/workflows/{id}/rollback` | |
| ワークフロー履歴状態確認 | `GET /api/workflows/{id}/history-status` | |
| LLM プロンプト一覧・更新 | `GET/PUT /api/llm-prompts/{key}` | |
| LLM モデル一覧取得・現在モデル切替 | `GET /api/llm-prompts/models`, `GET/PUT /api/llm-prompts/current-model` | |
| 翻訳設定・テスト・キャッシュクリア | `POST /api/translate/prompt`, `POST /test`, `GET /stats`, `POST /clear-cache` | プロバイダー種別: `fugumt`（推奨・APIキー不要・`jkawamoto/fugumt-en-ja-ct2` 初回自動配置）, `google`, `deepl`, `llm` |
| セリフ口調プリセット一覧・管理・テスト | `GET/POST/PUT/DELETE /api/speech-tone-presets` | `POST /rewrite` |
| セリフ口調プリセット並び替え | `PUT /api/speech-tone-presets/reorder` | `{ "ordered_ids": number[] }` |

---

## 7. コンポーネント構成

```
pages/SettingsPage/
  index.tsx                      — メインページ・セクション開閉状態管理
  components/
    LlmSettingsSection.tsx       — LLM モデル選択・プロンプト・パラメータ
    TranslationSettingsSection.tsx — プロンプト翻訳設定・統計・テスト
    BubbleDetectionSection.tsx   — フキダシ自動検出パラメータ
    SpeechToneSection.tsx        — 口調プリセット管理 & 書き換えテスト
    MappingMasterSection.tsx     — マッピングマスタ & パラメータ型マスタ
    BaseModelSection.tsx         — BaseModel & Checkpoint マッピング
    ThumbnailSettingsSection.tsx — サムネイル表示アスペクト比
    WorkflowConnectionSection.tsx— 長押し設定、ワークフロー削除、接続確認
```

---

*本ドキュメントは現行の SettingsPage 実装に準拠した正本です。*
