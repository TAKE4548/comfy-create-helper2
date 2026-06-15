# REQ-045 設計書: ワークフローデフォルト設定とスナップショットのLoRA・タグセットリンクの永続化とロード

## 1. 概要
本設計は、ComfyUIのワークフロー切り替え時に発生するUI不整合の修正、およびワークフローごとのデフォルト設定（LoRA・タグセットの適用情報含む）、スナップショットに紐づくLoRA・タグセットの適用情報をDBで永続化・ロードする機能を提供します。

## 2. データベーススキーマ変更
SQLite データベースに対して、以下のスキーマ変更を行います。

### 2.1 `workflows` テーブル
ワークフローごとのデフォルトの適用アセット情報（バッジ状態）を保持するカラムを追加します。
- `default_applied_assets`: `TEXT` (JSON文字列, Nullable)
  - 格納データ: `{"positive": [AppliedAsset, ...], "negative": [...]}`

### 2.2 `snapshot_loras` テーブル
LoRAが適用されていた入力エリア（ロール）を特定するためのカラムを追加します。
- `role`: `VARCHAR` (NotNull, デフォルト値: `'positive'`)

### 2.3 `snapshot_tag_sets` テーブル
タグセットが適用されていた入力エリア（ロール）を特定するためのカラムを追加します。
- `role`: `VARCHAR` (NotNull, デフォルト値: `'positive'`)

---

## 3. バックエンド API 変更

### 3.1 Pydantic スキーマ (`backend/app/schemas/`)

#### `workflow.py`
- `WorkflowUpdate` スキーマに `default_applied_assets` を追加 (Optional[str])
- `WorkflowRead` スキーマに `default_applied_assets` を追加 (Optional[str])

#### `snapshot.py`
- `SnapshotLoraCreate`, `SnapshotLoraRead` に `role` を追加 (str)
- `SnapshotTagSetCreate`, `SnapshotTagSetRead` に `role` を追加 (str)

### 3.2 ルーター (`backend/app/routers/`)

#### `workflows.py`
- `update_workflow` (`PUT /api/workflows/{workflow_id}`) にて `payload.default_applied_assets` が渡された場合、`Workflow` モデルの `default_applied_assets` カラムを更新するように変更。
- `get_workflow` (`GET /api/workflows/{workflow_id}`) にて `default_applied_assets` もレスポンスに含める。

#### `snapshots.py`
- `create_snapshot` (`POST /api/snapshots`) にて、`loras` と `tag_sets` を作成する際に、リクエストから送られてくる `role` をセットして `SnapshotLora` / `SnapshotTagSet` レコードを追加する。
- `get_snapshot` (`GET /api/snapshots/{snapshot_id}`) にて、紐づく LoRA / タグセットの `role` もレスポンスに含める。

---

## 4. フロントエンド変更

### 4.1 UI不整合の修正 (ワークフロー切り替えバグ)
- `frontend/src/store/useGenerationStore.ts`
  - `setSelectedWorkflowId(id)` 時に、全ロールにまたがる LoRA・タグセット of 適用状態 (`appliedAssets`) がそのまま引き継がれてしまう問題を解消。
  - ワークフローごとに LocalStorage に `LS_KEYS.APPLIED_ASSETS_PREFIX + id` の形式で `appliedAssets` を個別に保持し、切り替え時にそのキーから読み込む。存在しない場合は空オブジェクト `{}` をセットする。

### 4.2 ワークフローデフォルト設定の保存・復元
- `frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts`
  - `handleSaveDefaultParams` 実行時、現在の `paramValues`（パラメータ）をワークフローの `json_body` に保存するのに加え、現在の `appliedAssets` の内容を `default_applied_assets` として `workflowsApi.update` 経由で DB に保存する。
  - `useEffect` でワークフロー初期化時、および `handleResetDefaultParams` 実行時、DB から `default_applied_assets` が返ってきた場合はそれをデシリアライズして `appliedAssets` に適用し、LocalStorage にも書き込む。

### 4.3 スナップショットの保存とロード
- `frontend/src/pages/GeneratePage/hooks/useSnapshotActions.ts`
  - `saveSnapshot` 実行時、適用されている LoRA・タグセットが属する `role` を含めて `loras: {lora_id, strength, role}[]` / `tag_sets: {tag_set_id, role}[]` の形式で `snapshotsApi.create` に送信する。
- `frontend/src/pages/GeneratePage.tsx`
  - スナップショットロード時 (`handleLoadSnapshot(id)`)、まず `snapshotsApi.get(id)` でスナップショットの詳細情報を取得する。
  - 取得した詳細情報の `loras` と `tag_sets` を使って、各 `role` 毎に `appliedAssets` を再構築して store に設定し、LocalStorage にも書き込む。
  - LoRA / タグセット of バッジ情報を正しく表示するため、全LoRA / 全タグセットのリスト（通常 `GeneratePage` 上で読み込み済みのもの）から、一致するIDの `description` や `tags` 等を取得して `AppliedAsset` オブジェクトを組み立てる。
