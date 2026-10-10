# REQ-334 最終QA証拠

更新日: 2026-10-11 (Asia/Tokyo)。検証対象は復旧済みPBIの102 AC。最終マトリクスは [REQ-334-acceptance.md](REQ-334-acceptance.md)、画面操作ログは [REQ-334-browser-evidence.md](REQ-334-browser-evidence.md)、実行名とassertionの索引は [REQ-334-test-assertions.md](REQ-334-test-assertions.md)。

## Gate 1 — 静的検査

| 対象 | コマンド／証拠 | 結果 |
|---|---|---|
| Backend | `mypy backend`。`.tmp/req334-qa/gate1-mypy.log` | PASS: 177 source files、errors 0、exit 0。既存annotation noteは型エラーではない。 |
| Frontend | `npm run typecheck` (`frontend/`)。`.tmp/req334-qa/frontend-typecheck-r15.log` | PASS: `tsc -b --noEmit`、exit 0。 |

## Gate 2 — 全件テストとbuild

| 対象 | コマンド／証拠 | 結果 |
|---|---|---|
| Backend | `backend/.venv/Scripts/python.exe -m pytest`、隔離fresh DBをアプリ初期化手順（metadata/create、migrations、seed）で用意。`.tmp/req334-qa/gate2-pytest-r3-elevated.log`、DB `.tmp/req334-qa/full-tests-r3.db` | PASS: 656 passed、0 failed、3 warnings、126.68s。 |
| Frontend | `npx vitest run --reporter=json --outputFile=../.tmp/req334-qa/frontend-vitest-r15.json` (`frontend/`、全件・filterなし)。`.tmp/req334-qa/frontend-vitest-r15.log` とJSON | PASS: 521/521 suites、1697/1697 tests、failed 0、pending 0、`success=true`。R15は実行プロセスで完了を確認。 |
| Production build | `npm run build`。`.tmp/req334-qa/frontend-build-r15.log` | PASS: Vite build完了。生成bundleがminify後500kBを超える警告は記録。 |

R15はsandboxでの試行がWindows socket `EPERM` で起動できず、同一の全件コマンドを承認済みelevated実行で再実行してPASSした。R13のtimeoutはR14で再現せず、R14で見つかったworkflow testの同期問題は製品コードを変えずtest側の状態反映waitを追加して解決した。R15 JSONは全件の成功を示す。旧r2の10件失敗、r13の一過性timeout、r14の再現した同期不足を消さず、それぞれ最終再実行で解決した履歴として扱う。

## Gate 3 — Acceptance Criteriaとシナリオ

`REQ-334-acceptance.md` はPBIのAC-01〜102を102行で照合し、PASS 102 / FAIL 0 / INCONCLUSIVE 0。各行に具体的assertion、ブラウザー測定またはAPI証拠と境界を記録する。全テストsuite成功を画面外観の代替証拠にはしていない。寸法、色、余白、tap targetなどは実ブラウザーのrendered/computed値で評価した。

主要なfailure/boundary scenarioの実行例:

- 選択削除・bulk queue操作の確認をキャンセルし、状態とAPI呼び出しが変化しないこと。TagSet/LoRA delete、queue clear、running job、workflow import preview解除を個別assertionで確認。
- Studioの生成失敗・既存REJECTED・再訪、LoRA範囲境界0/2、無効なworkflow import、設定未取得/timeout、Manager未接続・ログ取得失敗をAPI/UIテストで確認。
- 本番React/FastAPIを隔離DBで起動して、選択とfilter、設定保存再読込、TagSet subset画像のクロップ保存、Historyの3条件filter、History album dragによる永続順を実画面・HTTPで確認。
- Mobile Safe Areaの20/34pxは、production JSと複製CSSの `env(safe-area-inset-bottom)` 値のみ置換したprivate fixtureで6画面を測定。0px時の本番UI測定とCSS値simulationを記録し、実ノッチ端末の検証とは主張しない。
- Previewでは200% zoom/panとFit復帰、A/B compare、Escape二段動作を確認。`document.fullscreenElement` だけからネイティブ全画面成立とは判定していない。

ブラウザー環境は実React/FastAPI、専用browser.db。ComfyUI/LLM upstreamはfake、Managerは未接続。したがって生成プレビュー、token limit fixture、サービス成功系mockを実GPU・実LLM・稼働Managerの証明に使っていない。Managerログ取得は実環境でFailed to fetchとなり、成功時の折り畳み挙動はcomponent mockで検証した。この境界はACマトリクスにも明記した。

## 独立ローカルQA監査

指定コマンド `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py qa-audit docs/design/REQ-334-test-plan.md` を実行。全文出力は `.tmp/req334-qa/local-qa-audit-final.log`。ComfyUI active job判定のため151秒待機後、`qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored` (9.0B, Q6_K)をロードして監査が完了、exit 0。traceはログに記録されている。

監査の実際の判定は **条件付き合格 (Conditional Pass)**。指摘はテスト計画の明確化提案で、抽象的な期待値をJSON差分/API件数などの数値にする、証拠画像のファイル名/hash、console出力、Tab focus順、Browser timeoutを明示するという内容。現時点の実行/AC evidenceの不合格指摘ではないが、無条件の `COMPLIANT` ではない。独立監査の指摘を記録し、PASSと読み替えない。全文と構造化要約は [REQ-334-audit.md](REQ-334-audit.md) に記録。

## VRAM cleanup

監査終了直後に同じadapterの `unload` を実行。`.tmp/req334-qa/local-qa-unload-final.log`: exit 0、`All models unloaded from LM Studio. VRAM freed.` を確認。`nvidia-smi --query-gpu=index,memory.used,memory.total --format=csv,noheader,nounits` はコマンド未導入でexit 1。adapter上の監査modelはunload済みだが、GPU全体の使用量ゼロ／VRAM 100%解放は独立計測できていない。他プロセスのGPU処理は停止していない。

<execution_evidence>

- Gate 1 backend: `.tmp/req334-qa/gate1-mypy.log` — 177 source files / no issues / exit 0.
- Gate 1 frontend: `.tmp/req334-qa/frontend-typecheck-r15.log` — `tsc -b --noEmit` / exit 0.
- Gate 2 backend: `.tmp/req334-qa/gate2-pytest-r3-elevated.log` — 656 passed / 0 failed / 3 warnings.
- Gate 2 frontend: `.tmp/req334-qa/frontend-vitest-r15.json` — 521 suites / 1697 passed / 0 failed / 0 pending.
- Build: `.tmp/req334-qa/frontend-build-r15.log` — success; large chunk warning retained.
- Gate 3: `docs/design/REQ-334-acceptance.md` (102/102 AC), `docs/design/REQ-334-browser-evidence.md`, `docs/design/REQ-334-test-assertions.md`.
- QA audit: `.tmp/req334-qa/local-qa-audit-final.log` — Conditional Pass, improvement findings; not COMPLIANT.
- Immediate unload: `.tmp/req334-qa/local-qa-unload-final.log` — exit 0, adapter reports all models unloaded.
- GPU-wide memory check: `nvidia-smi` unavailable; total VRAM zero is unverified.

</execution_evidence>
