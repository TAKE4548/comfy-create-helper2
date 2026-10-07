# REQ-322 検証完了レポート (Walkthrough Report)

## 1. 概要 (Overview)
- **対象 PBI**: [REQ-322](docs/backlog/pbi/active/REQ-322.md)
- **タイトル**: Fix LoRA Studio API path double prefix (405 Method Not Allowed)
- **種別**: バグ改修 (Type A)
- **判定結果**: **PASS**

---

## 2. 受入基準 (Acceptance Criteria) 検証結果

| AC 番号 | 受入基準 (AC) の内容 | 検証結果 | 検証エビデンス |
| :--- | :--- | :--- | :--- |
| **AC-1** | rontend/src/api/client.ts 内の settingsApi, datasetApi, 	rainingApi, enchmarkApi の全エンドポイント定義から余計な /api プレフィックスが除去され、他 API と同様の相対パス（例: /dataset/projects）に統一されていること。 | **PASS** | rontend/src/api/client.ts の全21エンドポイント定義（settingsApi 2件, datasetApi 9件, 	rainingApi 5件, enchmarkApi 2件）を精査し、すべて先頭の余分な /api が削除され /settings/..., /dataset/..., /training/..., /benchmark/... に統一されていることを確認。 |
| **AC-2** | rontend/src/api/__tests__/client.test.ts に settingsApi, datasetApi, 	rainingApi, enchmarkApi の各 API 呼び出し先 URL（/api/...）が正しくフォーマットされることを検証するユニットテストが追加され、全件 PASS すること。 | **PASS** | rontend/src/api/__tests__/client.test.ts に各クライアントの全メソッドを網羅するテストスイートおよび URL 形式・リクエストボディ検証を追加。30件のテストが 100% PASS（itest run src/api/__tests__/client.test.ts で 30/30 通過）。 |
| **AC-3** | rontend の型チェック (
pm run typecheck) および全ユニットテスト (
pm test) がエラーなくパスすること。 | **PASS** | 
pm run typecheck で型エラー 0 件 (Exit Code 0)、
pm test（ディスカバリ全件実行）で 129 テストファイル / 1232 テストケースが全件 PASS (0 failures) を確認。 |

---

## 3. 自動 3-Gate Baseline 検証ログ

### Gate 1: 静的型検査 (Static Typecheck)
- **実行コマンド**: 
pm run typecheck (	sc -b --noEmit)
- **ディレクトリ**: rontend/
- **結果**: **PASS (0 errors, Exit Code 0)**
`	ext
> frontend@0.0.0 typecheck
> tsc -b --noEmit
`

### Gate 2: 全体テストスイート (Full Discovery Test Suite)
- **実行コマンド**: 
pm test (itest run)
- **ディレクトリ**: rontend/
- **結果**: **PASS (0 failures, 129 test files passed, 1232 tests passed, Exit Code 0)**
`	ext
 Test Files  129 passed (129)
      Tests  1232 passed (1232)
   Start at  22:52:35
   Duration  28.30s
`
*(参考: バックエンド側回帰テスト pytest も 471 passed, 0 failures で完全な無影響を確認)*

### Gate 3: シナリオ & Red Teaming (Acceptance & Boundary Verification)
- **対象テストスイート**: 
  - 
px vitest run src/api/__tests__/client.test.ts (30 tests passed)
  - 
px vitest run src/test/e2e_req319_lora_studio.test.tsx (1 test passed)
- **検証シナリオ**:
  - **シナリオ 1 (settingsApi)**: getVram (/api/settings/vram), updateVram (PUT /api/settings/vram) のリクエスト URL・ヘッダー・ボディのフォーマット整合性を検証。
  - **シナリオ 2 (datasetApi)**: getProjects, getProject, createProject, updateProject, deleteProject, getOutfitMasters, calculateMatrix, updateItem, exportDataset の全 9 メソッドの URL パス検証。特に障害報告対象であった直交マトリクス再計算 (POST /api/dataset/projects/1/matrix) が正確な URL に送信されることを確認。
  - **シナリオ 3 (	rainingApi)**: createJob, getJob, startJob, stopJob, getJobStatus の全 5 メソッドの URL パスおよび POST メソッド整合性を検証。
  - **シナリオ 4 (enchmarkApi)**: generatePrompts, evaluate の URL パスおよび JSON ペイロード送信を検証。
  - **シナリオ 5 (E2Eパイプライン)**: e2e_req319_lora_studio.test.tsx の Step 1〜4 ライフサイクルがパスすることを確認。
- **Red Teaming (異常系・境界値) 検証**:
  - **Red Team 1 (二重プレフィックス防止・405 エラー再発抑止)**: 全 4 API グループの全テスト呼び出しにおいて url.not.toMatch(/^\/api\/api\//) アサーションを実施し、二重プレフィックスの完全排除を検証。
  - **Red Team 2 (HTTP エラー時のフォールバック例外送出)**: datasetApi.getProject(999) (404 Not Found) および 	rainingApi.getJob(999) (500 Server Error) において、例外が黙殺されず適切な API error <status>: <details> として reject されることを確認。
  - **Red Team 3 (クエリパラメータ境界値・URL エンコード)**: datasetApi.getOutfitMasters(undefined) で余分な ? が付与されず /api/dataset/outfits となること、および特殊文字を含む 'casual wear & sports' を渡した場合に正確に encodeURIComponent 処理され /api/dataset/outfits?category=casual%20wear%20%26%20sports となることを確認。

---

## 4. ローカルモデル QA 監査 (Local Model QA Audit)
- **実行コマンド**: python \local_model_adapter.py qa-audit docs/design/REQ-322-test-plan.md
- **モデル**: qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored (Domain: reasoning)
- **監査所見と対応状況**:
  - **監査指摘 1 (Red Team 1 の機械的自動検証)**: URL キャプチャによる !/\/api\/api\//.test(url) 検証の自動化推奨 -> client.test.ts 内で mockFetch.mock.calls 全件に対して expect(url).not.toMatch(/^\/api\/api\//) アサーションを自動適用済み。
  - **監査指摘 2 (Red Team 2 の例外型・メッセージの厳格化)**: 期待されるエラー送出の明示的テスト推奨 -> datasetApi (404) および 	rainingApi (500) に対して 
ejects.toThrow('API error ...') テストケースを追加・合格確認済み。
  - **総合結果**: **COMPLIANT**

---

## 5. GPU VRAM リソース解放確認
- **実行コマンド**: python \local_model_adapter.py unload
- **実行結果**: Exit Code 0, All models unloaded from LM Studio. VRAM freed. を確認。
