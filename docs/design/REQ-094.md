# PBI-REQ-094 client.ts APIクライアントモジュールのテスト追加

## 概要
`frontend/src/api/client.ts` の API通信メソッド群に対する包括的なユニットテストを追加し、HTTPリクエストパラメータ、URL、メソッド、ヘッダー、エラーハンドリング（4xx, 5xxエラー）、および204レスポンス処理が正しく行われることを検証します。

---

## 修正対象・ファイル
- **新規テストファイル**: `frontend/src/api/__tests__/client.test.ts`
- **対象コード**: `frontend/src/api/client.ts`

---

## 設計詳細

### 1. テストのセットアップ
- `globalThis.fetch` を `vi.fn()` を使ってモックします。
- 各テストの実行前後でモックをクリアし、意図しない干渉を防ぎます。
- `beforeEach` および `afterEach` を用いて、`globalThis.fetch` の差し替えと復元を行います。

### 2. テストケース構成
1. **共通処理 (Request Helper)**
   - `request` 関数がデフォルトで `'Content-Type': 'application/json'` ヘッダーを送信することの検証
   - `res.status === 204` (No Content) の場合に `undefined` を返すことの検証
   - HTTPエラー（`!res.ok`）のときに、エラー文字列 `API error <status>: <text>` を投げることの検証

2. **workflowsApi**
   - `list()` -> `GET /api/workflows`
   - `get(id)` -> `GET /api/workflows/:id`
   - `create(data)` -> `POST /api/workflows`
   - `update(id, data)` -> `PUT /api/workflows/:id`
   - `delete(id)` -> `DELETE /api/workflows/:id`
   - `copy(id, name)` -> `POST /api/workflows/:id/copy`
   - `scan(json_body)` -> `POST /api/workflows/scan`

3. **mappingMastersApi**
   - `list()` -> `GET /api/mapping-masters`
   - `create(data)` -> `POST /api/mapping-masters`
   - `update(id, data)` -> `PUT /api/mapping-masters/:id`
   - `delete(id)` -> `DELETE /api/mapping-masters/:id`
   - `getUsages(id)` -> `GET /api/mapping-masters/:id/usages`
   - `reorder(ordered_ids)` -> `PUT /api/mapping-masters/reorder`

4. **snapshotsApi**
   - `list()` (引数なし) -> `GET /api/snapshots`
   - `list(workflow_id: number)` -> `GET /api/snapshots?workflow_id=123`
   - `list({ workflow_id, lora_id, tag_set_id })` -> `GET /api/snapshots?workflow_id=123&lora_id=456&tag_set_id=789` (複数かつ部分的な組み合わせテスト)
   - `get(id)` -> `GET /api/snapshots/:id`
   - `create(data)` -> `POST /api/snapshots`
   - `patch(id, data)` -> `PATCH /api/snapshots/:id`
   - `delete(id)` -> `DELETE /api/snapshots/:id`

5. **albumsApi**
   - `list()` -> `GET /api/albums`
   - `get(id)` -> `GET /api/albums/:id`
   - `create(data)` -> `POST /api/albums`
   - `updateOrder(id, snapshot_ids)` -> `PUT /api/albums/:id/order`
   - `delete(id)` -> `DELETE /api/albums/:id`
   - `deleteItems(id, snapshot_ids)` -> `POST /api/albums/:id/items/delete`
   - `addItems(id, snapshot_ids)` -> `POST /api/albums/:id/items`

6. **lorasApi**
   - `list()` -> `GET /api/loras`
   - `list(category_id)` -> `GET /api/loras?category_id=5`
   - `create(data)` -> `POST /api/loras`
   - `update(id, data)` -> `PUT /api/loras/:id`
   - `delete(id)` -> `DELETE /api/loras/:id`
   - `getComfyModels()` -> `GET /api/loras/comfy-models`
   - `reorder(ordered_ids)` -> `PUT /api/loras/reorder`

7. **tagSetsApi**
   - `list()` -> `GET /api/tag-sets`
   - `list(category_id)` -> `GET /api/tag-sets?category_id=7`
   - `create(data)` -> `POST /api/tag-sets`
   - `update(id, data)` -> `PUT /api/tag-sets/:id`
   - `delete(id)` -> `DELETE /api/tag-sets/:id`
   - `reorder(ordered_ids)` -> `PUT /api/tag-sets/reorder`

8. **loraCategoriesApi & tagsetCategoriesApi**
   - list/create/update/delete メソッドの検証

9. **auditApi**
   - `run(data)` -> `POST /api/audit`

10. **llmPromptsApi**
    - `list()` -> `GET /api/llm-prompts`
    - `update(key, data)` -> `PUT /api/llm-prompts/:key`

11. **configApi**
    - `get()` -> `GET /api/config`

12. **workflowPresetsApi**
    - `list()` -> `GET /api/workflow-presets`
    - `list(workflow_id)` -> `GET /api/workflow-presets?workflow_id=2`
    - `create(data)` -> `POST /api/workflow-presets`
    - `update(id, data)` -> `PUT /api/workflow-presets/:id`
    - `delete(id)` -> `DELETE /api/workflow-presets/:id`
    - `reorder(ordered_ids)` -> `PUT /api/workflow-presets/reorder`
