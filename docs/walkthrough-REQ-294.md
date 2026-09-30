# REQ-294 検証ウォークスルー（2026-09-29 再検証）

判定: **Gate 1 PASS、Gate 2 PASS、Gate 3 未検証。PBIはユーザー判断によりOKとしてクローズ**。実ブラウザー確認はユーザー担当であり未実施のため、Gate 3や3-Gate全体をPASSとは記録しない。2026-09-29、ユーザーが未実施分を承知のうえでOKクローズを指示し、PBIとT1〜T16をアーカイブした。

`docs/walkthrough.md` は別 PBI の成果物として保持し、本記録を REQ-294 専用パスに置く（dev-verify の既定パスからの逸脱）。

## 再検証の実行証拠

<execution_evidence>

| Gate | コマンド・対象 | 結果 |
|---|---|---|
| 1 | リポジトリルートで `mypy backend` | exit 0、131 source files、0 issues。REQ-295 の型修復を含む現ワークツリーで再実行 |
| 1 | `frontend` で `npm run typecheck` | exit 0、`tsc -b --noEmit` 成功 |
| 2 | `backend` で `.\.venv\Scripts\python -m pytest` | exit 0、356 passed、1 warning（Starlette/httpx の deprecation） |
| 2 | `frontend` で `npm test` | exit 0、92 test files、876 tests passed |
| 3 | REQ-294 対象の API・service・Hook・Modal・stream テスト | 上記全 suite に含まれ、失敗なし。T16 個別確認は 38/38 成功 |
| 3 | E2E-01〜06、P-07/08 の実ブラウザー操作・遅延イベント観測 | **未実施**。ユーザー担当のため、結果を PASS と推定しない |
| QA | `local_model_adapter.py qa-audit docs/design/REQ-294-test-plan.md` | exit 0。Critical 3件、Medium 3件の計画書指摘を取得 |
| GPU | 監査終了直後の `local_model_adapter.py unload` | exit 0、`All models unloaded from LM Studio. VRAM freed.` |

</execution_evidence>

## 再検証の受入基準マトリクス

| AC | 現時点の判定 | 証拠と残る確認 |
|---|---|---|
| AC-1 進捗可視化 | 自動テスト成功、実機未確認 | NDJSON の参照抽出→VLM推論→スタイル割当→VRAM解放イベントと Hook/Modal の状態遷移は全 suite に含まれる。E2E-01 と P-08 の画面表示時刻・逐次到着はユーザー確認待ち |
| AC-2 エラー可視化 | 自動テスト成功、実機未確認 | 接続拒否・400・タイムアウト等の処理は全 suite に含まれる。LM Studio 停止時の画面・再試行は E2E-02 待ち |
| AC-3 系統A 高中低 | 自動テスト成功、実機未確認 | 3 tier と異なる snapshot ID、画面キャプションの対象テストは成功。実データでのサムネイル表示は E2E-03 待ち |
| AC-4 系統B Top-3・切替 | 自動テスト成功、実機未確認 | override ID と参照切替の対象テストは成功。実操作は E2E-04 待ち |
| AC-5 選択分のみ反映 | 自動テスト成功、実機未確認 | 選択適用・全解除の対象テストは成功。PC/モバイルでのキャンバス反映は E2E-03 待ち |
| AC-6 モバイル Onboarding | 自動テスト成功、実機未確認 | 入力値と preset 作成の対象テストは成功。375px の実操作は E2E-05 待ち |
| AC-7 モバイル自動タブ | 自動テスト成功、実機未確認 | Hook の preview 遷移テストは成功。375px の実操作は E2E-06 待ち |
| AC-8 3-Gate | Gate 3 未検証。PBIクローズはユーザー受容 | Gate 1・2 は PASS。Gate 3 の実ブラウザーシナリオは未実施。ユーザーの明示指示でPBIをOKとしてクローズ |

## QA 監査指摘の処理状況

監査はテスト計画に Critical 3件（PowerShell と Linux を混同したコマンド例、Gate 1 合格条件の古い101エラー記述、即時表示の定量閾値不足）と Medium 3件（API 応答スキーマ例、相槌定数の参照先、State 1-Error の状態定義）を指摘した。これらはテスト計画の明確さへの指摘で、実装欠陥の実測ではない。2026-09-29にコマンド例をPowerShellへ統一し、REQ-295後のGate結果を反映、次の描画フレーム基準、NDJSONイベントschema、`FILLER_PATTERNS`、Error表示契約をテスト計画へ追記した。文書更新後のQA監査は未実施。実ブラウザーの検証はユーザー担当。

## クローズ時の扱い

実ブラウザー確認 E2E-01〜06 と P-07/08、およびテスト計画更新後のQA監査は未実施として残す。Gate 3 のPASSとは扱わない。ユーザーの明示指示により、これらを未検証のまま受容してPBIをOKクローズした。

混在ワークツリーの REQ-292/293/295 変更は保持した。REQ-294のPBIとタスクカードはアーカイブ済み。別PBIの変更が混在するため、このクローズではステージングやコミットを行っていない。

---

## 初回診断（履歴。以下の FAIL 判定は現在の判定ではない）

判定: **FAIL**。Gate 1 と Gate 2 に失敗があり、Gate 3 に REQ-294 固有の未達がある。実ブラウザ E2E は未実行。修復後に3-Gate全体を再検証する。

既存の `docs/walkthrough.md` は REQ-292 の成果物のため保持した。本報告は `docs/walkthrough-REQ-294.md` に分けた（dev-verify の既定パスからの逸脱）。

## 実行証拠

<execution_evidence>

| Gate | 実行 | 結果 |
|---|---|---|
| 1 | `cd frontend; npm run typecheck` | exit 0、`tsc -b --noEmit` 成功 |
| 1 | リポジトリルートで `mypy backend` | exit 1、3ファイルで3件。`bubble_detector.py:1` の cv2 `import-untyped`、`resource_monitor.py:9` の psutil `import-untyped`、`scripts/migrate_images_to_webp.py` の二重モジュール検出。3ファイルは Git 追跡済みでワークツリー差分なし |
| 2 | `cd frontend; npm test` | exit 0、91ファイル・857テスト成功 |
| 2 | `cd backend; .\.venv\Scripts\python -m pytest` | exit 1、317件中316成功・1失敗。`tests/test_vram_guard.py::TestVramGuardAPI::test_get_put_vram_settings` が `sqlite3.OperationalError: no such table: app_settings`。当該テスト単独は1件成功。`test_vram_guard.py` と `settings.py` は Git 差分なし |
| 3 | 実アプリ `app.openapi()` を生成し `openapi_parser.py ... get-endpoint /api/speech/scene-draft post` | exit 0。要求の `override_similar_scene_snapshot_id` と応答の `tone_samples`、`selected_similar_scene_id`、`candidate_similar_scenes` を確認 |
| 3 | 全テスト内の REQ-294 対象テスト | backend の scene service 12件、scene router 4件、speech draft 5件、frontend の Hook 7件、Modal 4件、Onboarding 3件は成功 |

Red Team: 不正な override ID への4xx、LM Studio 400本文の伝播、通信・タイムアウト例外、参照切替後の旧応答破棄、Onboarding 保存失敗と二重送信は対象テストで確認した。一方で空の VLM `items` は成功扱いになり、再試行できるエラー画面へ移らない。

QA 監査: `local_model_adapter.py --unload-after qa-audit docs/design/REQ-294-test-plan.md` は exit 0。直後の明示 `unload` も exit 0、ログは `No models currently loaded in LM Studio`。監査はテスト計画に Critical 3件（即時表示の時間閾値、エラーモック仕様、E2E DB seed 手順）と Medium 3件（状態遷移時間、エラー分類基準、モバイルタブ検証方法）を指摘した。提案された架空の seed コマンドや mock パスは採用していない。コーディネーターのトリアージ待ち。

</execution_evidence>

## 受入基準マトリクス

| AC | 判定 | 証拠・不足 |
|---|---|---|
| AC-1 進捗可視化 | **未達** | モーダルの秒カウンターは実装済みだが、Hook の `initialProgress()` が `steps: []` を返し、その後も4段階の状態更新がない |
| AC-2 エラー可視化 | 一部確認 | LM Studio 400、通信エラー、タイムアウトの分類と再試行は対象テストで確認。実ブラウザでの LM Studio 停止シナリオは未実行 |
| AC-3 系統A高中低 | 一部確認 | backend の別スナップショット tier テストと OpenAPI は成功。計画 E2E-03 の `高: スナップ#N` 等のキャプションは UI に snapshot ID が表示されず未達 |
| AC-4 系統B Top-3・切替 | 一部確認 | override ID の API 伝播、参照 prompt/bubbles の切替、旧応答破棄はテストで確認。実ブラウザは未実行 |
| AC-5 選択分のみ反映 | 一部確認 | Modal と Hook の単体テストで選択分のみ適用。PC/375px の実操作は未実行 |
| AC-6 モバイル Onboarding | 一部確認 | 全パラメータの入力と create API payload は単体テストで確認。375px の実操作は未実行 |
| AC-7 モバイル自動タブ | 一部確認 | Hook テストで `setActiveMobileTab('preview')` を確認。375px の実操作は未実行 |
| AC-8 3-Gate | **未達** | Gate 1、Gate 2 が exit 1。Gate 3 に上記未達がある |

## 修復・再検証事項

- Hook: 参照抽出、VLM推論、スタイル割当、VRAM解放の4ステップを開始時から表示し、可能な範囲で実際の状態を更新する。
- Modal: 系統Aサムネイルに tier と snapshot ID のキャプションを表示する。`tone_samples: []` は計画 RT-FE-01 の「参照なし」を表示する。
- Service: 不正 JSON または空 `items` をエラーとして扱い、UI のエラー・再試行まで検証する。
- backend 全体の mypy 3件と全 pytest 1件を解消後、Gate 1・2 を全件再実行する。
- LM Studio・DBデータが利用可能な環境で E2E-01～06 を実ブラウザで確認する。未実行のまま Gate 3 PASS としない。
