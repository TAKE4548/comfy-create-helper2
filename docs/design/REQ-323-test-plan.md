# REQ-323 実行可能テスト計画 (Executable Test Plan)

## 1. 自動テスト (CLI Baseline Verification - Gate 1 & Gate 2)

- **Gate 1: 静的型検査 (Typecheck)**
  - コマンド: `npm run typecheck` (in `frontend/`)
  - 期待値: 終了コード 0、型エラー 0 件。
- **Gate 2: ユニットテスト (Unit Tests)**
  - 対象ファイルテストコマンド:
    1. `npx vitest run src/pages/DatasetStudioPage/utils/__tests__/studioDraftStorage.test.ts` (in `frontend/`)
    2. `npx vitest run src/pages/DatasetStudioPage/components/__tests__/CreateProjectModal.test.tsx` (in `frontend/`)
    3. `npx vitest run src/pages/DatasetStudioPage/hooks/__tests__/useStudioAutosave.test.ts` (in `frontend/`)
    4. `npx vitest run src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` (in `frontend/`)
  - 期待値: 全テストケースが PASS。
- **Gate 2: 全体回帰テスト (Full Test Suite)**
  - コマンド: `npx vitest run src/pages/DatasetStudioPage src/test/e2e_req319_lora_studio.test.tsx` (in `frontend/`)
  - 期待値: 既存の全テストスイートおよび新規テストが 0 件の失敗で PASS。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

- **シナリオ 1: 新規プロジェクト作成の即時永続化 (AC-1)**
  - 操作手順:
    1. Dataset Studio 画面で「＋ 新規プロジェクト」ボタンをクリックして `CreateProjectModal` を開く。
    2. プロジェクト名「Test Heroine LoRA」、キャラトリガー「heroine」、本命衣装「heroine_armor」を入力し「作成して開始」をクリック。
    3. `datasetApi.createProject` が即座に呼び出され、サーバー側で発行された ID（例: 10）が確定すること。
    4. 画面ヘッダーのアクティブプロジェクトバッジおよびストアに新プロジェクトが即座に反映されること。
- **シナリオ 2: デバウンス付きオートセーブ (AC-2)**
  - 操作手順:
    1. プロジェクト編集中に `character-trigger-input` や `physical-tag-editor` の値を変更。
    2. 変更直後（0〜500ms）は API リクエストが送信されないこと。
    3. 入力停止後 750ms 経過した時点で `datasetApi.updateProject(projectId, ...)` が自動送信され、永続化されること。
- **シナリオ 3: 入力ごとのリアルタイム sessionStorage 下書き退避 (AC-3)**
  - 操作手順:
    1. ユーザーがフォームやタグを入力するたび、デバウンス待ち時間中であっても直ちに `sessionStorage.getItem('dataset_studio_draft_' + projectId)` に最新入力値と更新タイムスタンプが JSON として保存されること。
- **シナリオ 4: 画面遷移・リロード時の自動復元 (AC-4)**
  - 操作手順:
    1. プロジェクト編集中、オートセーブ完了前（または最新入力直後）にページをアンマウント / リロードする。
    2. 再度該当プロジェクト画面を表示した際、`sessionStorage` のタイムスタンプがサーバーの `updated_at` より新しければ、直前の入力内容がフォームへ自動復元され「未保存の下書きを復元しました」と表示されること。
- **シナリオ 5: サーバー保存完了時のキャッシュクリーンアップ・同期 (AC-5)**
  - 操作手順:
    1. サーバーへのオートセーブ（または手動保存）が正常に完了した際、`sessionStorage` 内の該当プロジェクト下書きデータが同期済み（`is_synced: true` またはクリーンアップ）として更新されること。
- **シナリオ 6: 保存ステータスの UI 視覚フィードバック (AC-6)**
  - 操作手順:
    1. 編集中: ステータスが「未保存（下書き保持）」となること。
    2. 保存中: ステータスが「変更を保存中...」となること。
    3. 保存完了: ステータスが「保存完了」となること。
    4. 保存失敗: ステータスが「保存失敗（下書き保持中）」となること。

---

## 3. Red Teaming (境界値・異常系検証 - Gate 3)

- **Red Team 1: `sessionStorage` 容量超過 (QuotaExceededError) 発生時のクラッシュ防止**
  - 手順: `sessionStorage.setItem` が `QuotaExceededError` (DOMException code 22) をスローするようにモック。フォーム変更を行う。
  - 期待値: アプリケーションがクラッシュ（ホワイトアウト）せず、コンソール警告を出力した上で通常通り動作し、バックエンドオートセーブが継続すること。
- **Red Team 2: オートセーブ通信遮断・サーバーエラー時の下書き保護**
  - 手順: `datasetApi.updateProject` が 500 Internal Server Error またはネットワークエラーを返すようモック。
  - 期待値: ステータスが「保存失敗（下書き保持中）」と表示され、`sessionStorage` 内の下書きデータが絶対に削除されずに維持されること。
- **Red Team 3: プロジェクト新規作成失敗時のモーダル入力保持と再試行**
  - 手順: `datasetApi.createProject` が 400 Bad Request をスローするようにモック。「作成して開始」を押下。
  - 期待値: モーダルが閉じず、エラーメッセージが表示され、入力したプロジェクト名やトリガー名がクリアされずに保持され、修正して再試行可能であること。
- **Red Team 4: 古い下書きによる新しいサーバーデータの上書き防止 (競合防止境界値)**
  - 手順: サーバー側の `updated_at` (例: 2026-10-07T12:00:00Z) に対して、`sessionStorage` の下書きタイムスタンプが過去 (例: 2026-10-07T11:00:00Z) である状態をシミュレート。
  - 期待値: 古い下書きは自動復元されず、最新のサーバーデータが優先して表示されること。
- **Red Team 5: マルチセッション・マルチタブ競合検知と手動解消フロー (Optimistic Conflict Detection)**
  - 手順: 下書きの `base_server_updated_at` (例: "2026-10-07T10:00:00Z") に対し、サーバー側の `activeProject.updated_at` が別セッションにより "2026-10-07T11:00:00Z" へ進んでいる状態をシミュレートしてマウント。
  - 期待値:
    1. 競合が検知され (`hasConflict = true`)、サーバーへの自動オートセーブが即座に停止すること。
    2. UI 上に警告バナー `data-testid="draft-conflict-alert"` が表示され、自動上書きによるデータ破損が防止されること。
    3. `resolve-conflict-draft-btn` を押下した場合、下書きの値でサーバーに強制上書きされ、最新タイムスタンプが同期されて競合が解消すること。
    4. `resolve-conflict-server-btn` を押下した場合、下書きが破棄（`sessionStorage.removeItem`）され、サーバー側の最新値でフォームが安全にリロードされること。

---

## 4. ツール主導監査 (Tool-Driven Audit)

- **ローカルモデル監査**:
  - コマンド: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-323-test-plan.md`
  - 期待値: テスト計画の実行可能性とカバレッジの客観的確認が得られること。


