# REQ-227 テスト計画書 (Option A: サーバー永続化対応)

## 1. テスト戦略概要
REQ-227 では、アスペクト比の送信不具合およびオートセーブ時の巻き戻り防止（フロントエンド）、ならびに生成パラメータのサーバーDB永続化（バックエンド）と端末間同期（フロントエンド）を検証する。

---

## 2. 自動テスト計画

### 2.1 バックエンドテスト (Pytest)

#### 1) マイグレーション検証 (`backend/tests/test_migrations.py` または `test_prompt_metadata.py`)
- **テスト項目**: `step_010_create_prompt_metadata` が正常に実行され、`prompt_metadata` テーブルが作成されること。
- **検証内容**: テーブル構造（`prompt_id`, `workflow_id`, `param_values`, `applied_assets`, `created_at`）の確認。

#### 2) REST API エンドポイント検証 (`backend/tests/test_prompt_metadata.py`)
- **POST `/api/prompt-metadata`**:
  - 正常系: メタデータ（`prompt_id`, `param_values`, `applied_assets`）が正しく保存されること。
  - UPSERT検証: 同一 `prompt_id` に対する再送時に更新されること。
- **GET `/api/prompt-metadata/{prompt_id}`**:
  - 正常系: 登録されたメタデータが正しく取得できること。
  - 異常系: 未登録の `prompt_id` に対して 404 Not Found が返却されること。

### 2.2 フロントエンド単体テスト (Vitest)

#### 1) ストア & キューの検証 (`frontend/src/store/__tests/useGenerationStore.test.ts`)
- `queuePrompt` 実行時、バッチ中間ジョブ（`isBatchIntermediate: true`）であっても `promptMetadataApi.create` が呼び出され、メタデータがサーバー保存されること。
- 同時にローカルキャッシュ（`prompt-surgeon-meta-${promptId}`）も保存されること。

#### 2) プリセット再同期時のパラメータ保護検証 (`frontend/src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts`)
- プリセット再取得（`invalidateQueries`）時に、`existingSet.paramValues` に保持されている未保存値がデフォルト値に上書きされないこと。

#### 3) スナップショット保存時のサーバーメタデータ復元検証 (`frontend/src/pages/GeneratePage/hooks/__tests__/useSnapshotActions.test.ts`)
- ローカルストレージにキャッシュが存在しない場合（別端末シミュレーション）、`promptMetadataApi.get(t)` を呼び出してサーバーDBからパラメータを復元しスナップショットが保存されること。

#### 4) 履歴プレビューモーダルの検証 (`frontend/src/components/__tests__/HistoryModalPreview.test.tsx`)
- スナップショット未保存の画像であっても、URLの `t` パラメータからサーバーメタデータまたはキャッシュを取得し、`<Info />` ボタンが表示されること。
- パラメータ表示パネルで「Aspect Ratio」「Sampler」「Scheduler」「Steps」「CFG」「Seed」「Prompt」が表示されること。

---

## 3. 手動 E2E 検証シナリオ

### シナリオ 1: アスペクト比変更とオートセーブ競合の遮断
1. 生成画面を開き、アスペクト比を `16:9` に変更する。
2. 1秒待機してオートセーブを発火させる（または即座に生成ボタンを押す）。
3. 生成された画像が横長（16:9）になっていること、および画面上のアスペクト比選択が `9:16` に巻き戻らないことを確認する。

### シナリオ 2: 端末間同期と履歴プレビューの検証
1. PCのブラウザで画像を1枚生成する（例: Aspect Ratio `16:9`, Steps `40`, Sampler `euler_ancestral`）。
2. 別端末（またはシークレットウィンドウ）で comfy-create-helper2 の生成画面を開く。
3. 履歴一覧に上記画像が表示されていることを確認し、クリックしてプレビューモーダルを開く。
4. `<Info />` アイコンをクリックし、別端末であっても「Aspect Ratio: 16:9」「Sampler: euler_ancestral」「Steps: 40」などのパラメータが完全に表示されることを確認する。

### シナリオ 3: 別端末からの安全なスナップショット保存
1. 上記シナリオ2の別端末（シークレットウィンドウ）上で、UIのスライダー設定をあえて別のアスペクト比（例: `2:3`）に変更しておく。
2. プレビュー中の画像に対して「スナップショット保存」を実行する。
3. 保存されたスナップショットの詳細を開き、UI設定値（2:3）ではなく、実際の生成値（16:9）で正しく保存されていることを確認する。
