---
id: REQ-309-test-plan
title: 初回 JavaScript 読み込み量削減のテスト計画（2026-10-27 再設計）
tags: [frontend, performance, verification, v1, integration, e2e, red-team]
related_paths:
  - docs/backlog/pbi/active/REQ-309.md
  - docs/design/REQ-309.md
  - .agents/verification.json
  - frontend/playwright.config.ts
  - frontend/playwright.prod.config.ts
---

# REQ-309 テスト計画

## Risk and Profile

- リスク分類: **high**（配布物・エントリ構造・検証基盤 `playwright*.ts` の変更。設計書「リスク分類」参照）。
- 検証プロファイル: **V1 Baseline**。最終 candidate を凍結後、独立 tester が Gate 1 → Gate 2（フィルタなしのフル discovery）→ Gate 3 を fresh 実行する。executor のローカル確認・focused unit・過去の cache だけでは PASS としない。V2 opt-in は未承認で採用しない。
- 設計中・カード作成中の時点でテストは未実施。本書の結果欄は空である。

## Collection and Metadata

- Vitest（1.6）: すべての新規/追加ケースのタイトルは `[REQ-309/AC-n] <case-id>`。case 冒頭で `({ task }) => { Object.assign(task.meta, { acIds: ['REQ-309/AC-n'], layer: '<tier>', caseId: '<case-id>' }) }` を設定する（既存の REQ-402 テストと同方式）。複数 AC を担うケースは `acIds` に全 ID を宣言し、タイトルは最初の AC を使う。コメントだけのタグは無効。
- Playwright: 同じタイトル規約 + `testInfo.annotations.push({ type: 'ac', description: 'REQ-309/AC-n' }, { type: 'layer', description: '<tier>' }, { type: 'caseId', description: '<case-id>' })`。
- case-id はパラメータ展開後も一意（`it.each`/ループは `${route}`・`${viewport}` を case-id に含める）。
- 収集契約: 承認済み選択 S ⊆ 収集 C。S の全件 PASS。empty collection・重複・未知 AC・収集エラー・skip・deselect・`only`/`fixme` を不備とする。必須 AC の skip は不可。
- `frontend/e2e/prod/` は既定 `playwright.config.ts`（`testDir: ./e2e`）から `testIgnore: ['**/prod/**']` で除外し、専用 `playwright.prod.config.ts` で収集する。T0 で既定構成の `--list` 件数を保存し（`docs/logs/REQ-309/pw-default-list-before.txt`）、全カード完了後の件数と一致させる。`playwright.prod.config.ts --list` の件数は本書の P 系ケース数と一致させる。
- テスト名・ディレクトリにチケット番号を含めない（`verify_test_naming.py --strict`）。新規テストファイルは責務名で作る: `LazyBoundary.test.tsx`（新規コンポーネントと同居）、`e2e/prod/*.spec.ts`（本番バンドル専用、別構成のため既存 `e2e/` と分離）。それ以外はすべて既存ファイルを拡張する。

## Environment

- Windows 11、Node（`frontend/package.json` に従う）、Chromium（Playwright 1.64.1 同梱）、Vite 5.4.21。GPU・ComfyUI・backend プロセスは不要（Zero-GPU）。API は Playwright `page.route`、WebSocket は `routeWebSocket` で severed。
- 本番バンドル系は `npm.cmd --prefix frontend run build -- --outDir <dir> --emptyOutDir` で出した dist を、圧縮なしの Node 静的サーバ（`e2e/prod/support/serveDist.mjs`）で配信する。毎テスト新規 `browser.newContext()`（空 cache）、Service Worker 登録なし、拡張機能なし（headless Chromium）。実行前後の環境メタデータ（Chromium バージョン、OS、Node、サーバ実装ハッシュ、viewport、実行時刻）を結果 JSON に保存する。
- 成果物（ビルドログ、manifest、計測 JSON、チャンク報告）は `docs/logs/REQ-309/`（git ignore 済み）に保存する。
- **凍結 candidate と再記録**: T0 が凍結した基準（`docs/logs/REQ-309/baseline/`）は変更しない。最終検証の tester は最終 candidate からビルドし直し、ソース manifest・dist の sha256・計測を再記録する。ソース manifest の差分が本 PBI の所有ファイル以外を含む場合は設計書 R1 の統制基準（所有 3 ファイルだけ原本に戻して再ビルド・再計測）に切り替える。

## Placement Plan（既存ファイルの拡張）

| 略称 | ファイル | 備考 |
|---|---|---|
| ROUTE | `frontend/src/__tests__/App.routing.test.tsx` | 既存（REQ-381/AC-12）。route 配線・離脱保護・例外境界 |
| PERSIST | `frontend/src/__tests__/App.persistence.test.tsx` | 既存。IndexedDB 復元 |
| LAZY | `frontend/src/components/common/__tests__/LazyBoundary.test.tsx` | 新規（新規コンポーネント `LazyBoundary.tsx` と同居） |
| GEN | `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | 既存 |
| OVL | `frontend/src/pages/GeneratePage/sections/__tests__/GenerateModalsOverlay.test.tsx` | 既存 |
| P-MEAS | `frontend/e2e/prod/initialJsTransfer.spec.ts` | 新規（T0）。前/後の計測 |
| P-CMP | `frontend/e2e/prod/initialJsCompare.spec.ts` | 新規（T5）。前後比較の判定 |
| P-BUILD | `frontend/e2e/prod/buildGuard.spec.ts` | 新規（T5）。警告・config・初期依存グラフ |
| P-ROUTE | `frontend/e2e/prod/routes.spec.ts` | 新規（T5）。全 route・離脱保護 |
| P-GEN | `frontend/e2e/prod/generate.spec.ts` | 新規（T5）。Generate・モーダル・viewport |
| P-FAIL | `frontend/e2e/prod/failure.spec.ts` | 新規（T5）。chunk 失敗・遅延・再デプロイ |

## AC Traceability Matrix

| AC | tier | ファイル / case-id | 検証内容（独立した期待） |
|---|---|---|---|
| AC-1 | e2e | P-MEAS / `measure-initial-js-baseline-<vp>`（T0）, `measure-initial-js-candidate-<vp>`（T5） | 凍結基準と最終 candidate を同一条件で計測。判定点・内訳 URL・byte を JSON 保存 |
| AC-1 | e2e | P-CMP / `compare-before-after-<vp>` | 5 回中央値で after < before（判定点合計と静穏後合計の両方）。環境メタデータの同一性を先に assert |
| AC-1 | scenario | P-BUILD / `initial-graph-excludes-lazy-boundaries` | `vite build --manifest` の manifest から、entry と `/` の Generate 動的 entry の静的閉包に、他 5 route のページと 14 モーダルの動的 entry chunk が含まれない |
| AC-1 | integration | ROUTE / `initial-route-loads-only-generate`, `direct-entry-<route>`（6 route） | `/` 描画で Generate の module factory のみ実行され、他 5 route は 0 回。各 route 直接入場でその route のみ |
| AC-1 | integration | GEN / `closed-modals-not-loaded`、OVL / `closed-overlay-modals-not-loaded` | 初期描画（全モーダル閉）で GeneratePage 本体の 10 モーダル（GEN）と overlay の 4 モーダル（OVL）の module evaluation が 0 回 |
| AC-2 | scenario | P-BUILD / `build-log-has-no-large-chunk-warning` | 実ビルドログ全文に "larger than 500 kB" が無く、`built in` がある |
| AC-2 | scenario | P-BUILD / `config-has-no-suppression` | `vite.config.ts`・`package.json` の sha256 が凍結基準と一致。`chunkSizeWarningLimit`・`onwarn`・`logLevel`・`manualChunks` が config に無い |
| AC-2 | scenario | P-BUILD / `all-js-chunks-below-limit` | dist の全 `.js` が 500,000 bytes 以下（Vite は文字数基準で警告するため bytes ≥ 文字数。保守側） |
| AC-3 | e2e | P-GEN / `prompt-edit-keeps-value-desktop`, `prompt-edit-keeps-value-mobile` | 空 cache・`/` でプロンプト入力欄（`support/promptInput.ts`。desktop `#prompt-positive`、mobile `#prompt-mobile-positive`）を編集し値が保持される（1280x800 / 375x667）。保持の検証は `switchPromptToTextMode` で textarea に切替えて入力し、モーダル開閉・viewport 切替後に値が残ることで行う（Chips Mode の未確定入力はローカル state のため保持の対象にしない） |
| AC-3 | integration | GEN / `lazy-modal-open-close-keeps-prompt` | プロンプト入力後に遅延モーダルを開閉しても入力値が保持される |
| AC-3 | integration | ROUTE / `initial-route-shows-fallback-then-content` | Generate chunk 取得中は `role=status` fallback、解決後に画面。AppShell のナビは常に表示 |
| AC-4 | integration | GEN / `selected-checkpoint-submitted-after-lazy-load` | 実 GeneratePage で checkpoint を選択して生成。API 境界に渡る workflow が選択値を持つ |
| AC-4 | e2e | P-GEN / `checkpoint-select-and-generate` | 本番バンドルで checkpoint 選択 → Generate Batch → `POST /api/generation/batches` の body が選択値を含む |
| AC-5 | integration | ROUTE / `history-route-lazy-visible`, `direct-entry-history` | 初期画面から History へ遷移して表示。`/history` 直接入場 |
| AC-5 | e2e | P-ROUTE / `history-items-browsable` | 本番バンドルで一覧と項目を閲覧できる |
| AC-6 | integration | ROUTE / `settings-route-lazy-visible`, `direct-entry-settings` | Settings へ遷移して表示。`/settings` 直接入場 |
| AC-6 | e2e | P-ROUTE / `settings-items-browsable` | 本番バンドルで設定項目を閲覧できる |
| AC-5/6 の遷移機構を共有する全 route 維持（Requirement 2） | integration/e2e | ROUTE / `route-preserved-<generate\|studio\|loras\|tags\|history\|settings>`、P-ROUTE / `route-operable-<route>` | 6 route すべてで遅延読込後に表示・基本操作（Generate: 入力、Studio: 画面表示、LoRAs/Tags: 一覧と検索入力、History: 一覧、Settings: タブ/セクション表示）が可能。AC-5 の代表だけを全 route 維持の証拠にしない。タグは AC-5（Settings 固有のみ AC-6） |
| Requirement 2（cache 復元維持） | integration | PERSIST / 既存 `updates, persists, and restores eligible queries...`（無変更で PASS）+ `restore-completes-while-lazy-chunk-pending`（タグ AC-5） | 遅延 route でも IndexedDB 復元・除外 key・mutation 非保存が従来どおり |
| Requirement 2（例外境界維持） | integration | ROUTE / 既存 `rethrows route render failures to an outer React error boundary`（無変更で PASS）+ `chunk-load-failure-<route>` | 描画例外と chunk 取得失敗の両方が外側境界へ到達 |
| Requirement 2（離脱保護維持） | integration/e2e | ROUTE / `leave-guard-*`、P-ROUTE / `leave-guard-lazy-*`（下記 RT-3） | 遅延 route でも離脱保護が従来契約どおり |

## 統合フロー（integration / e2e）

1. **本番 `/` 起動**: 新規 context → `/` → プロンプト入力欄（`promptChipInput`）編集可能 → 入力 → checkpoint 選択 → Generate。ネットワーク記録で、判定点までに他 5 route・閉じたモーダルの chunk が取得されていない。
2. **全 route 巡回**: `/` → `/studio` → `/loras` → `/tags` → `/history` → `/settings` → `/`。各 route の chunk は訪問時に初めて取得され（2 回目以降は再取得なし）、戻った Generate は描画され（`GlobalErrorBoundary` の見出し `システムエラーが発生しました` が 0 件）、往復後は巡回前に切替えた**テキストモード（store 保持）の textarea** が editable で新規入力 `tour-after` を保持できる（再度の `switchPromptToTextMode` は呼ばない＝chip に戻るため。挙動は baseline dist と同一）。**route 往復を跨いだプロンプト値の保持は要求しない**: baseline dist でも `/`→`/studio`→戻りで値は空に戻る既存挙動であり、PBI の要件は既存挙動の維持のため、本検証の対象外（別 PBI 候補）。往復後の初期値は assert せず記録のみ。非空虚性の担保として、巡回前の入力経路検証・往復後の入力成功・chunk 取得 6 件以上を確認する。`pageerror`・`console.error`・未処理 rejection が 0 件。
3. **直接入場**: SPA fallback 経由で 6 route を直接開く（絶対 URL の chunk が解決する）。
4. **Generate モーダル巡回**: 対象 14 種（履歴プレビュー、ジョブ管理、スナップショット保存、プリセット競合、一括編集、プリセット管理、シーン生成、Rescan、Upload、ワークフロー管理、翻訳、バイパス、パラメータ同期、タグセット保存）のうち、本番 E2E の必須は寿命モードを網羅する 6 種（ジョブ管理=latch、翻訳=latch、プリセット管理・バイパス・パラメータ同期・タグセット保存=while-open）。各 1 回「開く（初回 chunk 取得）→ 内容確認 → 閉じる → 再度開く」で、再 open 時の再取得が無い。残り 8 種は stub 条件で trigger に到達できる範囲で追加し、到達不能なものは T5 完了報告に理由を列挙する。8 種の開閉は型検査（loader の export 名・props）、`closed-*-not-loaded`、共通ホストの契約テストで間接的に担保するのみで、**各個の本番での開閉を全件実証したとは主張しない**（Residual Risk 参照）。
5. **離脱保護**: Settings で dirty を作る → 他 route へ移動 → 確認モーダル → キャンセル（draft 維持）/ 破棄して移動（遷移先の chunk が取得され表示）。
6. **cache 復元**: IndexedDB に persisted client を持つ状態で reload し、遅延 route でも復元が完了する。

## Red Team 境界・異常系

| ID | tier | ケース | 期待 | ファイル / case-id |
|---|---|---|---|---|
| RT-1 | integration, e2e | route chunk の取得失敗（module factory reject / `page.route` abort・404）を 6 route それぞれで | 外側 `GlobalErrorBoundary` の「ページを再読み込み」が出て空白画面にならない。nav 以外の背景で壊れた state が残らない。unblock 後に reload で復帰。IndexedDB の persisted cache は残る | ROUTE / `chunk-load-failure-<route>`、P-FAIL / `route-chunk-abort-<route>` |
| RT-2 | integration, e2e | 読込中の遷移: History の chunk 取得中に LoRAs へ遷移、同じリンクの連打 | 最終的に最後に選んだ画面だけが表示され、遅れて History が上書きしない。同一 module の factory は 1 回 | ROUTE / `navigate-during-lazy-load`、P-FAIL / `navigate-while-chunk-delayed` |
| RT-3 | integration, e2e | **lazy route と離脱保護**: (a) Settings 上で dirty → History（未取得）へ遷移 → 確認モーダル表示、History の chunk は **取得されない**、(b) キャンセル → Settings 維持・draft 維持、(c) 破棄して移動 → History chunk 取得後に表示、(d) `inFlight` 中は破棄ボタン無効、(e) 戻る（POP）でもブロック、(f) dirty 中の `beforeunload` が preventDefault、(g) 同一 Settings 内の tab/hash/query 変更は許可、(h) Settings 直接入場後も chunk の取得完了後に離脱保護が有効、(i) Settings chunk の取得中に他 route へ移動しても（登録前なので）ブロックされない | 従来契約（`SPEC_SETTINGS.md`）どおり | ROUTE / `leave-guard-blocks-before-lazy-fetch`、`leave-guard-cancel-keeps-draft`、`leave-guard-discard-then-lazy-load`、`leave-guard-inflight-disables-discard`、`leave-guard-pop`、`leave-guard-beforeunload`、`leave-guard-same-settings-allowed`、`leave-guard-direct-entry`、`leave-guard-not-armed-while-chunk-pending`。P-ROUTE / `leave-guard-lazy-cancel`、`leave-guard-lazy-discard` |
| RT-4 | integration, e2e | モーダル chunk 取得失敗（代表: GEN は `JobManagement`(latch)、OVL は `Bypass`(while-open)・`Translation`(latch)。E2E は `JobManagement`・`Bypass` を abort） | 局所 `role=alert`（「閉じる」「ページを再読み込み」）。**Generate 本体・入力済みプロンプトは維持**（`GlobalErrorBoundary` に落ちない）。「閉じる」で消え、再 open で再度局所エラー（無限 spinner にならない） | LAZY / `load-failure-local-alert`、`non-chunk-error-propagates`、GEN / `modal-load-failure-keeps-prompt`、OVL / `overlay-load-failure-local-alert`、P-FAIL / `modal-chunk-abort-<modal>` |
| RT-5 | integration | 読込中にモーダルを閉じる、連続 open/close、二重クリック | fallback は開いている間だけ。閉じた後に遅れて表示されない。module factory 1 回、重複 mount・重複送信なし | LAZY / `close-while-loading`、`rapid-toggle`、GEN / `modal-open-close-while-loading`、OVL / `overlay-close-while-loading`（latch 型は読込中に UI から閉じる経路が無いため LAZY の `rerender` 版が担保。GEN は静的 overlay の × で閉じられる while-open の `PresetManagerPanel` で検証。OVL は T4 カード側で別途確認する） |
| RT-6 | integration (PBT) | `LazyModalHost` の状態列: open/close/resolve/reject/re-open を fast-check で生成 | latch は一度 mount したら unmount されない、while-open は閉じたら unmount、fallback は open 中のみ、reject 後も親は健全。fast-check の seed/path を失敗ログに出す | LAZY / `host-state-machine-properties` |
| RT-7 | e2e | 再デプロイ相当: `/` を開いた後に配信 dist を別ビルドへ差し替え、旧ハッシュの route chunk を要求 | 404 が `GlobalErrorBoundary` に到達し、reload で新 dist が表示される。自動 reload ループなし（reload 回数 ≤ ユーザー操作回数） | P-FAIL / `stale-chunk-after-redeploy` |
| RT-8 | e2e | viewport 767px ↔ 768px の切替（Desktop/Mobile レイアウト）+ モーダル開閉 | 必要なレイアウトが表示され、プロンプト値が保持される。overlay 内の遅延モーダルが孤児にならない | P-GEN / `viewport-switch-keeps-prompt-and-modals` |
| RT-9 | integration | latch モーダルの初回オープン前の副作用が不要であること（`JobManagementModal` の `clearReservation` ほか）と、初回オープン後の state 寿命が従来と同一 | 閉じて再 open でも従来どおり初期化される（`AddSnapshotToAlbumModal` の選択初期化、`JobManagementModal` の確認状態クリア） | GEN / `latch-modal-state-lifetime-preserved` |
| RT-10 | e2e | 空 cache と温 cache の区別、`modulepreload` 先読み | 計測は新規 context の空 cache のみ。DOM の `link[rel=modulepreload]` と JS 要求一覧に、他 route / 閉モーダルの chunk が含まれない | P-MEAS / `measure-*`（内訳に含む）、P-BUILD / `initial-graph-excludes-lazy-boundaries` |
| RT-11 | integration | 遅延 route で `SettingsDraftBoundary` が `Suspense` の外側にあること | Settings chunk 取得前後で blocker 配線が同一（RT-3 (i)(h) で検証） | ROUTE |
| RT-12 | scenario | 警告抑止の混入検出 | `git diff` が `vite.config.ts`・`package.json` で空、config に抑止語なし（AC-2 のケースと同一コマンド） | P-BUILD / `config-has-no-suppression` |

## 非機能・保存則（preservation）

- 既存の Vitest フル suite（`scripts/run_full_suite.py`）が変更前と同等に PASS すること（Gate 2）。既存 REQ-381/AC-12 の 2 ケースと `App.persistence` の既存ケースは無変更で PASS。
- 既存 Playwright Gate 3（`scripts/run_e2e.py`）の収集件数が T0 の記録と一致し全 PASS（`testIgnore` による除外のみで変化しないこと）。
- UI 不変条件（`scripts/verify_ui_invariants.py`）が PASS（fallback・局所エラー UI は raw `vh` 禁止、文字 11px 未満禁止、`min-w-0` など）。
- `npm.cmd --prefix frontend run typecheck` が PASS。

## 実行コマンド（カード・最終検証で共通）

| Tier | コマンド |
|---|---|
| Gate 1 | `npm.cmd --prefix frontend run typecheck` / `backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py` / `backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict`（判定は「REQ-309 の追加・変更ファイルに新規違反なし」: 出力の `File path violations: 0` かつ `Test naming violations` が着手前（HEAD `37f16e7`）の既存 18 件から増えないこと。exit 1 は既存違反（すべて REQ-309 外）による想定内で合格条件にしない。実行で書き換わる `docs/design/REQ-356-test-mapping.md` はコーディネータが `git checkout --` で復元する（カードは触らない）） |
| Gate 2 | `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`（フィルタなし）。局所: `cd frontend; npx vitest run <path> -t "REQ-309"` |
| Gate 3 既定 | `backend\.venv\Scripts\python.exe scripts/run_e2e.py` |
| Gate 3 本 PBI | `cd frontend; npx playwright test -c playwright.prod.config.ts`（env: `PROD_DIST_DIR`、`PROD_LABEL`、`BASELINE_JSON`、`BUILD_LOG`。詳細は T5） |

## Full-Suite Fallback Triggers

次のいずれか（OR）でフルスイートを必ず fresh 実行する。本 PBI はそもそも high のため常時 V1 フル実行だが、トリガーは独立に記録する: 配布物・エントリ・検証基盤の変更（発火済み）／既定 Playwright の `--list` 件数が基準と不一致／`e2e/prod` の収集が 0 件または想定件数と不一致／予期しない skip／flaky（同一ケースの再実行で結果が変わる）／mock・semantic 欠陥の指摘（page 本体 stub のみで受入を主張していないか）／ソース manifest 差分が所有外ファイルを含む／非所有テストの失敗／リスクまたは環境が unknown。unknown をリスク low に丸めない。

## Residual Risk（記録事項）

- 14 モーダルのうち本番 E2E の個別実証は必須 6 種（寿命モード網羅）。残りの到達可否は T5 の完了報告に依存し、未実証分の受入可否は tester が判断する。
- 圧縮（gzip/br）・HTTP/2・CDN 配信下の転送量は本計測の対象外（実本番は `SPAStaticFiles` で圧縮なし）。AC-1 の主張は「圧縮なし配信での JS 転送量」に限る。
- 実機のモバイル回線・実 backend での操作可能時間は測らない（時間は参考値）。
- `React.lazy` の reject cache により、同一セッション内の再試行では回復しない場合がある（reload が回復手段）。
- route 往復（`/`→`/studio`→戻り）を跨いだ Generate プロンプト値の保持は既存挙動として保持されない（baseline dist で確認済み）。本 PBI はこの挙動を変更も検証もせず、スコープ外（別 PBI 候補）とする。
- 結果は PASS/FAIL ともに未取得。証拠が揃うまで AC を PASS としない。
