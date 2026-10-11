# REQ-343 検証ウォークスルー

## 総合判定: **PASS (既知の flaky 1 件はユーザー承認のうえ REQ-344 へ切り出し)**

REQ-343 の実装範囲に起因する不具合は検出されていません。Full Suite で `GeneratePage.test.tsx` が実行ごとに不安定に失敗しますが、REQ-343 を含まない `b9433b7` でも同様に再現したため(下記)、既存の flaky と判断し、ユーザー承認のうえ別PBI **REQ-344** に切り出しました。

## 実行コマンドと結果

| Gate | コマンド | 結果 |
| :--- | :--- | :--- |
| 1 Frontend | `cd frontend; npm run typecheck` | PASS (0 errors) |
| 1 Backend | `mypy backend` | PASS (0 issues) |
| 2 Backend | `pytest` (全件) | PASS (718 passed) |
| 2 Backend (REQ-343) | `pytest backend/tests/test_req343_workflow_variant_scan.py` | PASS (3 passed / Red Team 1 追加後) |
| 2 Frontend (REQ-343) | `vitest run WorkflowModalMultiStage.test.tsx useMasterMappingRows.test.ts` | PASS (16 passed) |
| 2 Frontend (全件) | `npm test` x3 | 1〜2 件 / 1908 が `GeneratePage.test.tsx` で不安定に失敗 (下記) |

### Gate 2 失敗の切り分け (flaky 判定の根拠)
- REQ-343 の変更を含まない最新コミット `b9433b7` を別 worktree で `vitest run` x3 実行:
  - 1回目: 201 ファイル全件 PASS
  - 2回目: `GeneratePage.test.tsx` が `Test timed out in 5000ms` で失敗
  - 3回目: 全件 PASS
- REQ-343 なしでも同一ファイルが同一症状で不安定に失敗するため、REQ-343 起因ではなく既存の flaky と判定。
- 単独実行では 13/13 PASS。
- 注: `GeneratePage.tsx` は改修した `RescanModal` / `UploadWorkflowModal` を import しているため依存ゼロではないが、baseline 再現により影響は否定的。恒久対応は REQ-344 で実施。

## AC 準拠表

| AC | 内容 | 検証根拠 | 判定 |
| :--- | :--- | :--- | :--- |
| AC-1 | Role×有効ステージの複数ノードマッピング | `useMasterMappingRows.test.ts` / `WorkflowModalMultiStage.test.tsx` PASS (Main/Rough 別スロットで保存)。ブラウザ手動 E2E は未実施 | PASS (ユニット水準) |
| AC-2 | 不要組み合わせの未設定化・保存時除外 | クリアボタン/「未設定」選択で保存時に除外されることをモーダルテストで確認。ブラウザ手動 E2E は未実施 | PASS (ユニット水準) |
| AC-3 | 設定画面のバリアント配線保存と重複 master_id 許容 | `WorkflowConnectionSection.config.test.ts` PASS | PASS |
| AC-4 | `/api/workflows/scan` のバリアント検出 | `test_req343_workflow_variant_scan.py` PASS (`variant_id`/`stage_id`/`stage_key`、CRUD/copy/rollback で保持) | PASS |

## Red Teaming

| シナリオ | 結果 |
| :--- | :--- |
| 異常系1: 全スロット未設定で保存 | UploadWorkflowModal / RescanModal で全スロットをクリアして保存すると `mappings: []` で成功 (既存テストで確認済み)。Backend も `PUT/POST` に空 mappings を送って 200/201 かつ空で永続化されることを `test_workflow_update_with_empty_mappings` で追加検証。PASS |
| 異常系2: `{}` / 壊れたノード JSON を `/api/workflows/scan` に POST | 4 パターンすべて HTTP 200、`matched: []` + `warnings`。PASS |
| 異常系3: variant_id 無しのレガシー JSON | `validateConfig` テスト PASS |

## ローカルモデル QA 監査 (qa-audit)
- 指摘はテスト計画文書の定量性(期待値の数値化・HTTP コード明記等)に関するもので、実装の欠陥ではない。受入基準に対して軽微と判断。
- GPU クリーンアップ: `local_model_adapter.py unload` exit 0、VRAM 解放確認済み。

## 残課題
- REQ-344: `GeneratePage.test.tsx` の全体実行時 flaky 解消 (P3)。
- ブラウザ E2E (AC-1/AC-2 の目視確認) は未実施。
