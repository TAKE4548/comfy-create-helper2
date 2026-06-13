# Prompt Surgeon（仮）- API仕様ドラフト

> [!WARNING]
> **このドキュメントはドラフトです。**  
> API の正本は `backend/openapi.json`（FastAPI 自動生成）です。  
> 概要は [`docs/specs/SPEC_SUMMARY.md §7`](./specs/SPEC_SUMMARY.md#7-api-概要) を参照してください。  
> 本ファイルは設計初期のドラフト記録として参照用に保持しています。

FastAPIが提供するエンドポイントのドラフト。`docs/openapi.yaml` 起こしの前段として、主要エンドポイントのリクエスト/レスポンスを整理する。

---

## 前提

- FastAPIは**SQLiteのCRUD**と**LLM監査の中継**を担当する
- 生成実行（ComfyUIへのキュー投入）・生成進捗（WebSocket）は、Reactから直接アクセスするためFastAPIには含まれない
- LLM監査はFastAPI経由とする（システムプロンプトをDB管理し、BEで組み立て・後処理・ログ出力を行うため）
- ベースパス：`/api`
- レスポンスは特記なき限り JSON

---

## 1. ワークフロー

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/api/workflows` | 一覧取得 | — | `Workflow[]`（json_body除く軽量版） |
| GET | `/api/workflows/{id}` | 単体取得 | — | `Workflow`（json_body・mappings含む） |
| POST | `/api/workflows` | 登録 | `WorkflowCreate` | `Workflow` |
| DELETE | `/api/workflows/{id}` | 削除 | — | `204 No Content` |

**WorkflowCreate**
```json
{
  "name": "portrait_v3",
  "json_body": { "...": "ComfyUI API形式のワークフローJSON" },
  "mappings": [
    { "master_id": 1, "node_id": "6" },
    { "master_id": 5, "node_id": "12" }
  ]
}
```

**Workflow（単体取得）**
```json
{
  "id": 1,
  "name": "portrait_v3",
  "json_body": { "...": "..." },
  "mappings": [
    { "id": 1, "master_id": 1, "node_id": "6", "role": "Main_positive",
      "param_name": "text", "input_type": "textarea", "display_name": "Main prompt" }
  ],
  "created_at": "2026-06-05T12:00:00Z"
}
```

マッピングはマスタの定義（role・param_name・input_type・display_name）をJOINして返すと、フロントは入力欄を即生成できる。

---

## 2. ノードマッピングマスタ

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/api/mapping-masters` | 一覧取得 | — | `MappingMaster[]` |
| POST | `/api/mapping-masters` | 登録 | `MappingMasterCreate` | `MappingMaster` |
| PUT | `/api/mapping-masters/{id}` | 更新 | `MappingMasterCreate` | `MappingMaster` |
| DELETE | `/api/mapping-masters/{id}` | 削除 | — | `204 No Content` |

**MappingMaster**
```json
{
  "id": 1,
  "role": "Main_positive",
  "expected_class_types": ["CLIPTextEncode", "PrimitiveNode"],
  "param_name": "text",
  "input_type": "textarea",
  "display_name": "Main prompt",
  "title_patterns": ["MainPrompt", "Main_positive"]
}
```

---

## 3. ワークフローのマッピング（自動抽出補助）

ワークフロー登録時の自動マッピングスキャンはBE（FastAPI）で行う。Streamlit版のPythonによるパースロジックをそのまま移植できるため。フロントはJSONをPOSTしてマッピング候補・警告を受け取る。

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| POST | `/api/workflows/scan` | JSONをスキャンしてマッピング候補を返す | `{ "json_body": {...} }` | `ScanResult` |

**ScanResult**
```json
{
  "matched": [
    { "master_id": 1, "role": "Main_positive", "node_id": "6", "node_title": "MainPrompt", "status": "ok" }
  ],
  "warnings": [
    { "master_id": 5, "role": "Face_positive", "status": "not_found" },
    { "master_id": 2, "role": "Main_negative", "status": "duplicated", "node_ids": ["7", "9"] },
    { "master_id": 6, "role": "MainSampler_cfg", "status": "class_type_mismatch", "node_id": "12", "actual_class_type": "KSamplerAdvanced" }
  ]
}
```

---

## 4. スナップショット

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/api/snapshots` | 一覧取得（`?workflow_id=` でフィルタ） | — | `Snapshot[]` |
| GET | `/api/snapshots/{id}` | 単体取得（ロード用、全パラメータ含む） | — | `Snapshot` |
| POST | `/api/snapshots` | 保存 | `SnapshotCreate` | `Snapshot` |
| DELETE | `/api/snapshots/{id}` | 削除 | — | `204 No Content` |

**SnapshotCreate**
```json
{
  "workflow_id": 1,
  "image_path": "/path/to/output/image.png",
  "params": {
    "Main_positive": "1girl, solo, ...",
    "Main_negative": "worst quality, ...",
    "MainSampler_cfg": 7.0,
    "MainSampler_steps": 28,
    "seed": 123456789
  }
}
```

`params` はロール名をキーにした可変構造。ワークフローのマッピング内容に依存するため、固定スキーマではなくJSONとして保持する。

---

## 5. アルバム

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/api/albums` | 一覧取得 | — | `Album[]` |
| GET | `/api/albums/{id}` | 単体取得（並び順込み） | — | `Album` |
| POST | `/api/albums` | 作成 | `AlbumCreate` | `Album` |
| PUT | `/api/albums/{id}/order` | 表示順更新 | `{ "snapshot_ids": [3, 1, 2] }` | `Album` |
| DELETE | `/api/albums/{id}` | 削除 | — | `204 No Content` |

表示順は `snapshot_ids` の配列順で表現する。D&D後にこの配列を送って永続化する。

---

## 6. LoRA

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/api/loras` | 一覧取得（`?category=` でフィルタ） | — | `Lora[]` |
| POST | `/api/loras` | 登録 | `LoraCreate` | `Lora` |
| PUT | `/api/loras/{id}` | 更新 | `LoraCreate` | `Lora` |
| DELETE | `/api/loras/{id}` | 削除 | — | `204 No Content` |

**Lora**
```json
{
  "id": 1,
  "model_name": "hanako_v2",
  "description": "花子 / オリジナルキャラ",
  "recommended_strength": 0.8,
  "category_id": 1,
  "trigger_word_sets": [
    { "id": 1, "name": "素体", "words": ["hanako", "black hair"] },
    { "id": 2, "name": "制服", "words": ["school uniform"] }
  ]
}
```

トリガーワードセットはLoRAに対して複数持てる。`recommended_strength` は任意（null許容）。

---

## 7. タグセット

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/api/tag-sets` | 一覧取得（`?category=` でフィルタ） | — | `TagSet[]` |
| POST | `/api/tag-sets` | 登録 | `TagSetCreate` | `TagSet` |
| PUT | `/api/tag-sets/{id}` | 更新 | `TagSetCreate` | `TagSet` |
| DELETE | `/api/tag-sets/{id}` | 削除 | — | `204 No Content` |

**TagSet**
```json
{
  "id": 1,
  "name": "正面ポートレート",
  "description": "顔をはっきり見せる正面構図",
  "category_id": 3,
  "tags": ["looking at viewer", "close-up", "front view"]
}
```

---

## 8. カテゴリマスタ

LoRAカテゴリとタグセットカテゴリは別テーブルで管理する（体系が異なり、共用するメリットが薄いため）。

**LoRAカテゴリ**

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/api/lora-categories` | 一覧取得 | — | `Category[]` |
| POST | `/api/lora-categories` | 追加 | `{ "name": "スタイル系" }` | `Category` |
| DELETE | `/api/lora-categories/{id}` | 削除（既存LoRAは未設定へ自動修正） | — | `204 No Content` |

**タグセットカテゴリ**

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/api/tagset-categories` | 一覧取得 | — | `Category[]` |
| POST | `/api/tagset-categories` | 追加 | `{ "name": "画角系" }` | `Category` |
| DELETE | `/api/tagset-categories/{id}` | 削除（既存タグセットは未設定へ自動修正） | — | `204 No Content` |

**Category**
```json
{ "id": 1, "name": "キャラクター系" }
```

カテゴリ削除時、そのカテゴリが付いていたLoRA・タグセットは「未設定」（category_id = null）に自動修正する。

---

## 9. LLM監査

監査リクエストはFastAPI経由。BEがSQLiteからシステムプロンプトを取得し、ユーザー入力と組み立ててLLMサーバー（OpenAI互換）に投げ、結果をパース・整形して返す。

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| POST | `/api/audit` | プロンプト監査実行 | `AuditRequest` | `AuditResult` |

**AuditRequest**
```json
{
  "audit_types": ["interference", "vocabulary", "physical"],
  "positive": "close-up face, smile, white shirt, socks",
  "negative": "worst quality, ...",
  "intent": "顔にもっと寄りたい",
  "model_hint": "SDXL"
}
```

`audit_types` で実行する監査の種類を指定（複数可）。`model_hint` はシステムプロンプトの分岐に使用（任意）。

**AuditResult**
```json
{
  "interference": [
    { "tag": "socks", "reason": "足元の描写を引き出し、引きの構図になりやすい" }
  ],
  "vocabulary": [
    { "suggestion": "close-up", "effect": "顔への寄りを強調" }
  ],
  "physical": {
    "status": "ok",
    "note": null,
    "alternatives": []
  }
}
```

監査種別ごとに結果を構造化して返すため、フロントは種別ごとに別々のUIで表示できる。

**ログ出力（BE側）**

LLM呼び出しの開始・完了・所要時間・エラー・使用モデル・トークン数をBEのログに出力する。ハング検知・プロンプト調整の判断材料として、起動時のターミナルログで確認する想定。UI上の生存確認表示は作らない（結果待ちは通常のローディング表示で十分）。

---

## 10. LLMシステムプロンプト管理

監査用システムプロンプトをSQLiteで管理し、UIから編集できる。精度調整やモデルのリリースに応じて、デプロイなしでプロンプトを更新するため。

| メソッド | パス | 用途 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/api/llm-prompts` | 一覧取得 | — | `LlmPrompt[]` |
| PUT | `/api/llm-prompts/{key}` | 更新 | `{ "content": "...", "description": "..." }` | `LlmPrompt` |

**LlmPrompt**
```json
{
  "id": 1,
  "key": "audit_interference",
  "content": "あなたは画像生成プロンプトの監査者です。...",
  "description": "干渉タグ診断用",
  "updated_at": "2026-06-05T12:00:00Z"
}
```

監査種別ごとにキーで管理（`audit_interference` / `audit_vocabulary` / `audit_physical` など）。

---

## 論点・要検討

- **画像の表示経路（要実装確認）**：生成画像をComfyUIの画像取得API（`/view?filename=...`）経由で表示しているか、出力ディレクトリを直読みしているか。現状の実装を確認して確定する（おそらくAPI経由）
- **スナップショット画像の保存方式（要実装確認・見直し候補）**：現状はDBにbase64で保存している可能性がある。スナップショットは育てていく前提のため、base64継続だとDB肥大化・一覧取得の遅延・バックアップ重量化のリスクがある。実装確認の上、ツール専用ディレクトリ（例 `db/snapshots/`）へのファイル保存＋DBはパスのみ保持、という方式への変更を検討する

---

*作成日: 2026-06-05*
