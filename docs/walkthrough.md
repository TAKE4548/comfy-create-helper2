# REQ-345 検証 walkthrough

## 対象と判定基準

再読込時にBEが保持する最新200候補のうち、FEの表示済み・除外済みidentityとの差分だけを照会し、原画が存在する未表示画像を履歴へ追加する変更を検証する。ACの正本は `docs/design/REQ-345-test-plan.md`。この文書は実行証跡を追記していく。

## 受入基準と検証対応

| AC | 確認内容 | 検証証跡 | 状態 |
|---|---|---|---|
| AC-1 | サムネイルcache成功と原画missing判定を分離 | `e2e_req345_trial_availability.test.tsx` | 自動テストPASS |
| AC-2 | missing後の表示・選択・原画再要求を抑止 | T1/T3/T4/T5対象テスト群 | 自動テストPASS |
| AC-3 | reload残存差分でpresentだけ追加しmissing/unknownを除外 | `e2e_req345_residual_history.test.tsx`; `test_residual_history.py` | 自動テストPASS |
| AC-4 | 通信/API異常をmissing扱いせず、明示retryだけ許可 | `e2e_req345_trial_availability.test.tsx`; controller tests | 自動テストPASS |
| AC-5 | 履歴除外でmetadata/cache/保存データを削除しない | backend full suite + REQ-345 API tests | 自動テストPASS、実環境の保持値未採取 |
| AC-6 | Snapshotを原画確認・履歴差分から隔離 | `e2e_req345_residual_history.test.tsx` | 自動テストPASS |
| AC-7 | identity重複、URL、順序、選択を維持 | `e2e_req345_residual_history.test.tsx` | 自動テストPASS |
| AC-8 | 復元後1回の差分同期、full GET/全件置換ゼロ | T11 residual tests + T13 integration test | 自動テストPASS |
| AC-9 | 差分失敗、session分類、遅延応答の安全性 | T11 residual tests + T13 integration test | 自動テストPASS |

## 必須の負荷境界

- BE候補窓は最新200画像。known/examinedを存在確認より前に除外し、1ページ最大10件、同時probe最大2件。
- FEは1論理同期最大20ページ/200検査identity。上限到達や継続候補なしを `partial` で止め、無限 `has_more` を回避。
- 200件を超える無条件のフル履歴転送・全表示原画probeを行わない。既存200件は保持し、空き枠に差分を追加。

## 実行証跡

<execution_evidence>

### Gate 1: Typecheck / Compile

- `frontend`: `npm run typecheck` — exit 0 (`tsc -b --noEmit`)
- `backend`: `backend/.venv/Scripts/python.exe -m mypy backend` — exit 0、192 source files / no issues
- `git -c core.fsmonitor=false diff --check` — exit 0。通常の `git diff --check` は fsmonitor IPC error で起動せず、fsmonitorを無効化した同一検査を実施。
- API contract: `python C:/Users/audih/.gemini/antigravity/scripts/openapi_parser.py docs/openapi.yaml get-endpoint /api/generation/history/residual post` — exit 0。schemaにknown/examined最大1000、items/rejected最大10、present-only items、has_more、422/503を確認。
- Production frontend build: `cd frontend; npm run build` — exit 0、Vite produced `dist/index.html` and JS/CSS assets. The JS chunk exceeds 500 kB and Vite emitted its standard chunk-size advisory. Backend `settings.frontend_dist_path` resolves to `frontend/dist` when the configured path is absent.

### Gate 2: Full Test Suites

- `frontend`: `npm test -- --run` — exit 0、220 files passed / 2017 tests passed。
- `backend`: `backend/.venv/Scripts/python.exe -m pytest` — exit 0、729 passed / 3 warnings / 112.92 s。

### Gate 3: REQ-345 integration and failure scenarios

- `frontend`: `npx vitest run src/services/__tests__/trialImageAvailability.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.req345.test.tsx src/test/e2e_req345_trial_availability.test.tsx src/test/e2e_req345_residual_history.test.tsx src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req345.test.tsx` — serial rerun exit 0、6 files / 32 tests passed。
- relevant failure coverage: thumbnail-only failure/API-unknown retention and explicit retry; residual API/error and missing/unknown identity non-addition assertions; 20-page cap followed by a baseline-known response. The paging boundary failed once when a focused Vitest process overlapped the full-suite Vitest process (`checking` remained at assertion timeout), then the isolated case passed, and the whole focused suite passed when run serially. This concurrency-sensitive observation is retained as a risk.
- `backend/tests/test_residual_history.py` ran in the full backend suite (7 tests passed); full suite also includes generation API and Comfy proxy failure tests.
- No live browser/ComfyUI restart plus Network capture was performed in this verification turn. That real-server check specified by the test plan, including before/after metadata/Snapshot captures, remains unverified.
- Follow-up inspection of `tools/server-manager/logs/backend.log` found a live request sequence at 2026-10-12 04:59:28–04:59:31: `GET /api/comfy/history` returned 200 (the backend then queried ComfyUI `/history?max_items=200`), followed by `POST /api/generation/history/residual` returning 200. This confirms residual sync ran, but also proves an unnecessary bounded full-history fetch occurred before it. The focus/visibility handler could run while persisted Query restoration left residual status at `waiting`; REQ-345-T18 now suppresses history refresh during `waiting`/`checking` while retaining queue refresh and terminal-state focus refresh. Its regression test passed (7/7) and typecheck passed. A post-fix live server-log confirmation is still pending.
- After REQ-345-T18, the user reloaded again. The backend log records one frontend full-history request, `GET /api/comfy/history`, at 05:03:50.566. A later `GET http://localhost:8188/history?max_items=200` at 05:03:53.126 is the expected bounded backend candidate enumeration for the successful residual POST at 05:03:53.660; another such upstream request at 05:03:56.519 is paired with a residual POST at 05:03:56.605. REQ-345-T19 now records whether a nonempty baseline was observed and suppresses full-history focus refresh for that document, including after the residual sync reaches a terminal state. Its typecheck and focused hook suite passed (8/8). Middleware logs contain no client/tab identifier or request body, so a new post-T19 live reload log is required before marking the no-frontend-full-history-GET scenario PASS.
- Post-T19 live reload evidence (2026-10-12): a full-history GET appears at 05:08:55.253, followed by successful residual syncs at 05:08:57.934 and 05:09:00.942. After the user's later explicit reload, a residual sync returned 200 at 05:23:47.692 and no newer `GET /api/comfy/history` appears in the log. The latest explicit reload therefore used residual sync without a new full-history request; the earlier 05:08:55 request remains in the aggregate log. The manager log has no tab/request correlation ID. This is real-server request evidence only; it does not include before/after metadata or Snapshot value captures.

### Local model QA audit and unload

- `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py --help` — exit 0; CLI supports explicit `--context-length`, `--timeout`, and `--unload-after`; it exposes no output-token-limit option.
- `python ...\local_model_adapter.py --model qwen/qwen3.5-9b --context-length 32768 --timeout 600 --unload-after qa-audit docs/design/REQ-345-test-plan.md` — exit 0, qwen/qwen3.5-9b Q6_K, reasoning effort none. The audit report verdict was FAIL (critical ambiguities detected): narrative test plan lacks sufficiently binary assertions, and it called the T# references undefined absent cross-document mapping/checksum. Findings are preserved for coordinator triage; this reviewer did not alter implementation/design.
- `python ...\local_model_adapter.py unload` — exit 0; LM Studio reported no models loaded. This confirms model unload, not that all GPU memory is free.

</execution_evidence>

## ローカルモデル監査と受入判断

qa-audit は FAIL (critical ambiguities detected)。指摘はテスト計画の判定条件の機械判定可能性と、未定義の `T#` 参照。2026-10-12、ユーザーは指摘を許容してクローズする判断をしたため、これらを未修正の許容事項として記録する。3-Gate自動検証はPASS。最新の明示リロードは残存差分同期のみで成功し、全件取得なし。実環境でのComfyUI再起動やmetadata/Snapshotのbefore/after値取得は未実施。

## クローズ

REQ-345とT1〜T19をdoneとしてアーカイブした。Gitの通常実行では `git status` がwork treeエラーとなり、絶対パスを指定した `git -C` はPermission deniedとなった。権限付き実行では同じ作業フォルダのstatusが成功したため、原因はサンドボックスのアクセス制限と判断した。リポジトリ設定を変更せず、権限付きGit操作でREQ-345の変更をコミットする。
