---
id: REQ-412-test-plan
title: "REQ-412 テスト計画: ヘッダーリソースモニタからのComfyUIメモリ解放"
status: draft
related_paths:
  - docs/design/REQ-412.md
  - docs/backlog/pbi/active/REQ-412.md
---

# REQ-412 実行可能テスト計画

## 1. リスク評価と検証プロファイル

- **適用プロファイル**: V1 Baseline（`.agents/verification.json`、`schema_version: 1`）。V2 opt-in は採用しない。
- **変更リスク分類**: `high`。理由: (1) 全ページ共通のヘッダーに副作用のある外部操作（Manager 経由の ComfyUI `/free`）を追加する、(2) Settings の既存実装を共有フックへ移し、同一タブ内のモジュール共有ロック（共有状態）を導入する、(3) REQ-346 の既存アサーション（role）を変更する。公開 API・スキーマ・依存関係の変更はない。
- **フルスイート・フォールバック**: 本 PBI は high のため Gate 2 フルスイート（`scripts/run_full_suite.py`）と Gate 3 E2E 全件（`scripts/run_e2e.py`）を常に新規実行する。以下のいずれか（OR）が起きた場合は、記録済みの局所結果を採用せず全件を再実行し、原因を報告する。
  - 収集数の不一致、空の収集、`[REQ-412/AC-n]` ケースの skip/only/xfail、想定外のスキップ
  - D3 で所有していないテストファイルの失敗（`unifiedHeaderIntegration.test.tsx`、`PageHeader.test.tsx`、`DesktopLayout.test.tsx`、`MobileLayout.test.tsx`、`useManagerStatus.test.ts`、`systemManager.test.ts` 等）
  - 共有フィクスチャ（`frontend/src/test/utils/`、`frontend/e2e/fixtures/`）や D7 の禁止ファイルへの変更
  - モック境界違反（業務ロジック・`systemManagerApi` 内部・`deriveFreeMemoryGuard` の差し替え）や循環的アサーション
  - フレーキー（同一候補で結果が変わる）
  - 影響範囲が未確認、または環境（Node、Playwright ブラウザ、ポート 5173 の空き）が不明

## 2. 環境・収集設計

- **ランタイム**: Node（`frontend/package.json` の vitest `^1.6.0`、fast-check `^3.18.0`、@playwright/test）、Windows、`backend\.venv` の Python（ラッパースクリプト用）。GPU 不要（CPU/RAM のみ）。実 Manager・実 ComfyUI は使わない。
- **収集**: Vitest は `vite.config.ts` の既定（jsdom、`src/test/setup.ts`）。Playwright は `frontend/playwright.config.ts`（`testDir: ./e2e`、`prod/` 除外、`baseURL http://localhost:5173`）。
- **ケース ID 規約**: テスト名先頭の `[REQ-412/AC-n]`（リポジトリ規約 REQ-356/AC-9。`scripts/verify_test_naming.py --strict` で検査）。複数 AC にまたがるケースはタグを列挙する（例 `[REQ-412/AC-3][REQ-412/AC-4]`）。`it.each` は展開後の名前にもタグが残る形にする。
- **新規テストファイル**: `frontend/src/hooks/__tests__/useComfyFreeMemory.test.ts` のみ（新モジュールに対応するコロケーションテスト。チケット番号を含まない）。その他は既存ファイルを拡張する。
- **凍結候補**: Gate 1〜3 はレビュー済みの最終候補（同一ツリー）で新規実行し、候補が変わった場合は再記録する。成果物（Playwright の trace 等）は `frontend/test-results/`、`frontend/playwright-report/` に限る。

## 3. ケース一覧（Tier・AC 対応・配置）

### Tier 1: unit / PBT（`frontend/src/hooks/__tests__/useComfyFreeMemory.test.ts`、T1）

| Case ID | テスト名（先頭タグ） | AC | 内容 |
|---|---|---|---|
| P-GUARD-01 | `[REQ-412/AC-5] guard property: enabled iff Manager available, LISTEN, idle 0/0 and no operation` | AC-5 | fast-check で `available`、`status`（null 含む）、`comfy.status`、`execution_state`（4 値＋undefined）、`queue_running`/`queue_pending`（null・0・正数）、`action_in_progress`、`localOperation` を生成し、enabled ⇔ 全条件成立、disabled ⇒ `reason !== ''`、enabled ⇒ `reason === ''` を検証。期待値は条件式を独立に書き下して比較する（実装の再呼出しで期待値を作らない） |
| U-HOOK-05 | `[REQ-412/AC-5] guard reasons follow the existing priority order` | AC-5 | 未接続・`action_in_progress`・ローカルロック・停止・executing・queued・unknown の 7 例で理由文言が D4 の文言と一致 |
| U-HOOK-03 | `[REQ-412/AC-3] run sends one request while the shared lock is held and ignores re-entry` | AC-3 | `fetch` を保留させ `run()` を 2 回呼ぶ。POST は 1 回、`pending === true`、`tryBeginManagerOperation('x')` が false。解決後にロック解放 |
| U-HOOK-04 | `[REQ-412/AC-4] accepted response sets the acceptance message without completion wording` | AC-4 | 200 `{status:'ok',action:'free-memory',outcome:'accepted'}` → `feedback.kind === 'accepted'`、文言一致、`/完了|解放しました/` を含まない、`onAccepted` が 1 回 |
| U-HOOK-06 | `[REQ-412/AC-6] fault injection maps transport failures to unconfirmed or failed` | AC-6 | `it.each` で 504、`TimeoutError`、`TypeError`、JSON 不正 → `unconfirmed`（文言が `要求結果未確認` で始まる）。409/503 + `request_sent:false` → `failed`（`解放要求に失敗しました: <error>`）。200 `outcome` 欠落 → `failed`。いずれも POST 1 回で再送なし、finally の status 再取得が行われる |
| I-HOOK-01 | `[REQ-412/AC-3] keeps the lock until two fresh status GETs complete (real useManagerStatus)` | AC-3 | 実 `useManagerStatus` と `fetch` 切断。POST 受付後も 2 回の status GET が終わるまで `pending` が true（REQ-380/AC-2 と同じ手順） |

### Tier 2: integration（コンポーネント＋実フック、`fetch` 切断）

`frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx`（T1）:

| Case ID | テスト名 | AC | 内容 |
|---|---|---|---|
| I-SCC-01 | `[REQ-412/AC-3] Settings free-memory uses the shared lock so a concurrent header request is not sent` | AC-3 | Settings で送信中（POST 保留）に `tryBeginManagerOperation(FREE_MEMORY_OPERATION_KEY)` が false、Settings の全操作ボタンが disabled |
| I-SCC-02 | `[REQ-412/AC-5] Settings controls and free-memory are disabled while another tab-local operation holds the lock` | AC-5 | `tryBeginManagerOperation('comfy:start')` を事前取得 → 「ComfyUIのメモリ解放」disabled、理由「別のサービス操作中です。」。解放後 enabled |
| I-SCC-03 | `[REQ-412/AC-6] Settings shows the unconfirmed message prefixed with 要求結果未確認` | AC-6 | 504 → 表示文言が `要求結果未確認:` で始まる |
| 既存保全 | REQ-380/AC-2（2 件＋each 3 件）、REQ-365/AC-7、REQ-381/AC-11 ほか全件 | — | 無変更で PASS（保全シナリオ） |

`frontend/src/components/common/header/__tests__/ResourceHoverMonitor.test.tsx`（T2。`useManagerStatus` は既存先例どおり制御データ源、POST は `fetch` 切断で実 `systemManagerApi` を通す）:

| Case ID | テスト名 | AC | 内容 |
|---|---|---|---|
| U-HDR-01 | `[REQ-412/AC-1] hover card shows the ComfyUI free-memory button as its last section and stays open when the pointer moves onto it` | AC-1 | mouseEnter → カード内に名前「ComfyUI メモリ解放」のボタン。カードに role 属性がなく、直下の `[role="group"][aria-label="リソース詳細"]` の `lastElementChild` が `resource-free-memory`。`mouseOut(monitor, {relatedTarget: button})` 後もカードが残る |
| U-HDR-02 | `[REQ-412/AC-2] mobile overlay shows the free-memory button as its last section and a tap sends the request` | AC-2 | pill click → オーバーレイ内にボタン、最終子要素。click で POST 1 回、オーバーレイは閉じない |
| U-HDR-03 | `[REQ-412/AC-3] the header button is disabled with a busy indicator until the response and status refresh finish` | AC-3 | POST 保留中 `disabled`・`aria-busy="true"`、連打で POST 1 回 |
| U-HDR-04 | `[REQ-412/AC-4] acceptance feedback is shown in the panel and survives closing and reopening the card` | AC-4 | 受付文言が `role=status` に出る。mouseLeave → 再 mouseEnter で同文言が残る |
| U-HDR-05 | `[REQ-412/AC-5] the header button is disabled with the reason for each non-idle state` | AC-5 | `it.each`: Manager 未接続、executing、queued、停止（非 LISTEN）、`action_in_progress`、ローカルロック → disabled、`resource-free-memory-reason` に D4 の理由 |
| U-HDR-06 | `[REQ-412/AC-6] transport failures show 要求結果未確認 or the failure reason in the panel` | AC-6 | 504 → `要求結果未確認`。409 + `request_sent:false` → `解放要求に失敗しました:` |
| U-HDR-07 | `[REQ-412/AC-7] panels keep the header + 6px top and viewport-capped scroll with the new section` | AC-7 | `stubGeometryWithHeader({vw:1280, vh:360, headerBottom:118})` で top `124px`、`maxHeight` 228px、`overflow-y-auto`。モバイルでも同様 |
| 既存保全 | REQ-346/AC-1〜6、REQ-363/AC-6、RT-1 ほか | — | role アサーション 1 件（L244）のみ group ラッパー確認へ置き換え、他は無変更で PASS |

### Tier 3: e2e（実ブラウザ。T2）

`frontend/e2e/headerHoverCard.spec.ts`（Settings 画面。既存 `stubApi` の後に 8899 用ルートを登録し、後勝ちで Manager を切断。CORS ヘッダー `Access-Control-Allow-Origin: *`、`-Headers: Content-Type`、`-Methods: GET,POST,OPTIONS` を付け、OPTIONS は 204）:

| Case ID | テスト名 | AC | 内容 |
|---|---|---|---|
| E-HOV-01 | `[REQ-412/AC-1] the real pointer moves from the monitor through the bridge to the free-memory button and it is pressable @{w}x{h}` | AC-1 | 640x800/768x1024/1024x768/1280x800。実マウス移動でボタン中心へ、カード可視、`elementFromPoint` がボタン内、`click({trial:true})` 成功 |
| E-HOV-02 | `[REQ-412/AC-3][REQ-412/AC-4] idle request is sent once, the button is busy until confirmation, and acceptance wording is shown @1280x800` | AC-3, AC-4 | POST 応答を 800ms 遅延。押下直後 disabled、ダブルクリックでも POST 1 回。受付文言表示、`/完了|解放しました/` なし |
| E-HOV-03 | `[REQ-412/AC-5] executing, queued and unreachable Manager disable the button with a reason @1280x800` | AC-5 | status を executing/queued に、または 8899 を `route.abort()` → disabled と理由。POST 0 回 |
| E-HOV-04 | `[REQ-412/AC-6] HTTP 504 and a dropped connection show 要求結果未確認 without resending @1280x800` | AC-6 | POST を 504 と `abort('failed')` → `要求結果未確認`。POST 各 1 回 |
| E-HOV-05 | `[REQ-412/AC-7] on a short viewport the card scrolls internally and the free-memory button is reachable at header + 6px @1024x{H}` | AC-7 | 既存 REQ-346/AC-3 と同じ短高さ手順。上端＝ヘッダー下端＋6±1px、スクロール後ボタンが画面内でヒット可能 |
| RT-1 | `[REQ-412/AC-1] leaving the card from the disabled button closes the card @1280x800` | AC-1 (Red Team) | Manager 未接続で disabled のボタン上から外へ移動 → カードが閉じる（リスク R1） |
| RT-2 | `[REQ-412/AC-3] a header request while Settings is already sending is not sent twice @1280x800` | AC-3 (Red Team) | Settings system 欄の「ComfyUIのメモリ解放」を押して POST 保留中にヘッダーのボタンが disabled、POST 合計 1 回 |
| 既存保全 | `[REQ-346/AC-5]` の role アサーション（L165）を group ラッパー確認へ置き換え、他 REQ-346 は無変更で PASS | — | — |

`frontend/e2e/headerMenuOverlay.spec.ts`（ハーネス。既存 `ACTIONS` の pill は `last: '[data-testid="mobile-resource-overlay"] > :last-child'` のため、新セクションが末尾到達マトリクス（375/639 と短高さ 360、高さ 280、幅 320）の対象になる）:

| Case ID | テスト名 | AC | 内容 |
|---|---|---|---|
| E-OVL-01 | `[REQ-412/AC-2] tapping the VRAM pill shows the free-memory button and a tap sends one request @{w}x667` | AC-2 | 375/639。8899 をスタブ（idle）。ボタン可視・タップで POST 1 回、オーバーレイは開いたまま |
| E-OVL-02 | `[REQ-412/AC-7] the free-memory section is the last item of the mobile overlay and is reachable on a 360px-high viewport` | AC-7 | 375x360。上端＝ヘッダー下端＋6±1px、`resource-free-memory` が last-child、スクロール後に実クリック可能 |

### Scenario（Gate 3 シナリオ・Red Team 総括）

| Case | 種別 | 確認 |
|---|---|---|
| S-1 正常 | normal | デスクトップ: ホバー → ボタン押下 → 受付文言 → status 再取得完了後に再び enabled |
| S-2 失敗 | failure | 504 / 切断 / 409 拒否 / 受付応答不正で、文言と POST 回数（再送なし） |
| S-3 保全 | preservation | Settings system 欄の REQ-380 振る舞い（文言・2 回再取得・`settings-vram` 無効化）と REQ-346 のヘッダー展開契約が不変 |
| S-4 境界 | boundary | 639/640px 境界でパネルが切り替わり、それぞれにボタンがある。高さ 280/360 で末尾到達 |

## 4. 検証コマンド

### Gate 1（静的・高速）
- `npm.cmd --prefix frontend run typecheck`
- `backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py`
- `backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict`
- `backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/**/__tests__`
- `backend\.venv\Scripts\python.exe -m mypy backend`、`backend\.venv\Scripts\python.exe -m pytest backend/tests/unit`（verification.json の固定コマンド。本 PBI は Backend 無変更）

### 局所 TDD（Engineer 用。Baseline PASS の根拠にはしない）
- T1: `cd frontend; npx vitest run src/hooks/__tests__/useComfyFreeMemory.test.ts src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx`
- T1（AC 絞り込み）: `cd frontend; npx vitest run src/hooks/__tests__/useComfyFreeMemory.test.ts src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx -t "REQ-412"`
- T2: `cd frontend; npx vitest run src/components/common/header/__tests__/ResourceHoverMonitor.test.tsx src/components/common/__tests__/unifiedHeaderIntegration.test.tsx src/components/common/__tests__/PageHeader.test.tsx`
- T2（E2E 局所）: `backend\.venv\Scripts\python.exe scripts/run_e2e.py e2e/headerHoverCard.spec.ts e2e/headerMenuOverlay.spec.ts`

### Gate 2（フルスイート、必須）
- `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`

### Gate 3（E2E 全件・シナリオ、必須）
- `backend\.venv\Scripts\python.exe scripts/run_e2e.py`
- 期待値: 全件 PASS。`-g "REQ-412"` で E-HOV-01〜05、RT-1、RT-2、E-OVL-01〜02 が展開後の全 ID で収集・実行されていること（選択集合 ⊆ 収集集合、除外なし）。
