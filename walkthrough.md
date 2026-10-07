# REQ-320 検証結果報告書 (Walkthrough Report)

## 1. 概要 (Executive Summary)
PBI **REQ-320**「LoRAデータセットスタジオ: Negative Prompt設定 & ワークフローノード再割当 (Remap) UX」の実装に対する受け入れ検証を実施しました。
3-Gate Baseline（型検査・全スイートテスト・シナリオ＆Red Teaming）およびローカルモデル（LLM）による QA 監査を実施し、すべてのテストおよび監査判定基準に合感（PASS）したことを為認しました。

---

## 2. 3-Gate Baseline 検証結果

### Gate 1: Typecheck / Compile Baseline (静的検証)
- **Frontend Typecheck**: `npm --prefix frontend run typecheck`
  - 結果: **PASS** (0 errors, Exit Code 0)
- **Backend Typecheck**: `backend\.venv\Scripts\python -m mypy backend`
  - 結果: **PASS** (0 errors, Exit Code 0, 151 source files passed)

### Gate 2: Full Test Suite Baseline (ディスカバリ型全テストスイート)
- **Frontend Full Test Suite**: `npm --prefix frontend test`
  - 結果: **PASS** (129 test files, 1,224 tests passed, 0 failures)
- **Backend Full Test Suite**: `backend\.venv\Scripts\python -m pytest`
  - 結果: **PASS** (471 items passed, 0 failures)

### Gate 3: Scenario & Red Teaming (結合・シナリオ・境界値検証)
- **Frontend Targeted Tests**: `npx vitest run src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx`
  - 結果: **PASS** (18 tests passed)
- **Backend Targeted Tests**: `backend\.venv\Scripts\python -m pytest backend/tests/test_dataset_router.py backend/tests/test_dataset_db.py -v`
  - 結果: **PASS** (8 tests passed)

---

## 3. 受入れ基準 (Acceptance Criteria) 準拠確認表

| AC ID | 受入れ基準 (要件) | 検証内容 / エビデンス | 判定 |
| :--- | :--- | :--- | :--- |
| **AC-1** | ワークフロー選択時に対象Positiveノード・Negativeノード情報バッジが表示される | `MatrixGenerationStep.test.tsx` にて `positive-node-badge` および `negative-node-badge` が `Main_Positive_Prompt` / `Negative_Prompt` マッピングおよびノードタイトルを正しく表示することを確認 | **PASS** |
| **AC-2** | 「再割当」ボタンよりノード変更モーダル (`NodeRemapModal`) を開き保存できる | モーダル表示、Positive/Negativeノード再割り当て選択、`workflowsApi.update` 経由でのマッピング更新およびUIバッジ即時反映を確認 | **PASS** |
| **AC-3** | Negative Prompt 入力枠 (`TagChipEditor`) でタグ編集および文字数表示ができる | `TagChipEditor` の表示、タグ追加・削除・チップ操作、リアルタイム文字数もウント (`X 文字`) の動作を確認 | **PASS** |
| **AC-4** | ComfyUI 投入時に Positive ノードと Negative ノードへ個別プロンプトが注入される | `injectPromptAndSeed` において `options.positiveNodeId` にバッチプロンプト、`options.negativeNodeId` に `negativePrompt` がそれざれ正確に注入されることを確認 | **PASS** |
| **AC-5** | `prompt_negative` が DatasetProject に永続化され、リロード時に復元される | `dataset_router.py` / `test_dataset_db.py` における DB カラム `prompt_negative` のマイグレーションと CRUD 永続化、フロントエンド再読み込み時の復元を確認 | **PASS** |

### Red Teaming (境界値・異常系検証)

| ケース | 想定シナリオ / 境界条件 | 検証結果 | 判定 |
| :--- | :--- | :--- | :--- |
| **R-1** | 外部でマッピング先ノードが削除されたワークフロー | マッピングが存在しない共候でもフォールバック探索（CLIPTextEncode 探索）が機能し、クラッシュせず正常動作 | **PASS** |
| **R-2** | テキスト入力ノードが一切存在しない空ワークフロー | `injectPromptAndSeed` が標準フォールバックノード（ID 6, 3）を自動構成して投入エラーを防止 | **PASS** |
| **R-3** | Negative Prompt が空文字列の場合 | `inputs.text` に `undefined` や `null` ではなく空文字 `""` が安全に注入され、ComfyUI 側で型エラー・400エラーとならないことを確認 | **PASS** |

---

## 4. Local Model QA Audit & VRAM クリーンアップ

- **監査モデル**: `qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored` (Reasoning Domain)
- **監査結果**: `APPROVED WITH CONDITIONS` (コマンド特異性 9/10, 全体実行可能性 7.5/10。CLI コマンドおよび自動テストコードが極めて具体的で完全再現可能であることを確認)
- **VRAM クリーンアップ**: `python local_model_adapter.py unload` を実施し、GPU VRAM 解放 (Exit code 0) を完了。
