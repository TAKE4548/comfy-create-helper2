---
id: REQ-334-test-plan
title: REQ-334 全20項目・102AC 検証計画
status: proposed
tags: [REQ-334, unit, integration, e2e, boundary]
related_paths:
  - docs/backlog/pbi/archive/REQ-334.md
  - docs/design/REQ-334.md
  - docs/design/REQ-334-ac-coverage.md
  - docs/design/REQ-334-contracts.md
---

# REQ-334 全範囲検証計画

対象は復元済み PBI の AC-01〜AC-102、4フェーズ20項目すべて。AC 対応の単一情報源は `REQ-334-ac-coverage.md`。設計はユーザー承認済みで、実装・局所検証・実画面確認の証拠を作成中。phase単位で実装完了と証拠を記録し、未完了phaseを含む全体を完了扱いしない。

## Gate 1: Typecheck（全対象サブシステム）

各 Task Card が所有する既存テストを拡張し、振る舞いを確認する。スタイルclass名のassertだけで合格にしない。frontend cwd (`C:/Users/audih/ws/comfy-create-helper2/frontend`) で `npm run typecheck` と `npm test` を実施する。対象ファイルの局所テストはカードに記載する実在コマンドで実行する。backend変更カードは `backend\.venv\Scripts\python -m pytest <対象テスト>` と `mypy backend` を適用する。契約/APIを追加する場合は契約テストとOpenAPI整合を追加する。

| Phase | 単体・型検査の重点 | 対象AC |
|---|---|---|
| 1 | shared tokens/modal/layout、split状態、queue状態遷移、selection集合、shortcut、save state | AC-01〜AC-41 |
| 2 | tablet/card/list selection、clipboard/drag、image layout/zoom/compare | AC-01〜AC-28, AC-50〜AC-56, AC-82〜AC-85 |
| 3 | mobile controls、numeric step increments、LoRA editor/asset tray、TagSet parsing | AC-02, AC-29〜AC-41, AC-57〜AC-70 |
| 4 | Studio stage/evaluation, album persistence, settings history, import/export, playground, prompt preview/dictionary, service response states | AC-42〜AC-49, AC-71〜AC-81, AC-86〜AC-102 |

## Gate 2: 全件テスト

frontend: `npx vitest run`、backend: `python -m pytest`。ファイル指定・除外なし、失敗0が必要。局所テストを全件テストの代わりにしない。

## Gate 3a: Integration / Browser

| ID | Given / When | Then | AC |
|---|---|---|---|
| INT-01 | keyboard shortcut・全route・各viewportで navigation を操作 | route/stateを保ち、重複navを表示しない | AC-01〜AC-10 |
| INT-02 | 全件選択→絞込み→bulk LoRA/TagSet/History操作 | DOM表示数でなく全ID集合へ作用し、選択中drag等の禁止境界を保つ | AC-11〜AC-15, AC-57〜AC-65 |
| INT-03 | Generate prompt編集→split resize/maximize→生成→保存 | draft維持、ratio永続化、操作可能領域を確保、保存対象を誤認しない | AC-16〜AC-28, AC-33〜AC-37 |
| INT-04 | queue確認後に件数・job状態が変化、取消を予約/解除/確定 | 3秒内のqueued jobのみ一度取消し、開始済み/Studioを保護、実結果を表示 | AC-33〜AC-41 |
| INT-05 | mobile/tablet各画面で画像・進捗・操作を利用 | responsive layoutで必須操作と状態表示へ到達可能 | AC-01〜AC-02, AC-29〜AC-31, AC-50〜AC-56 |
| INT-06 | LoRA数値、asset tray、TagSet編集を行う | 0.05刻み、metadata/selection/parserの契約どおり状態を保持 | AC-32, AC-57〜AC-70, AC-67 |
| INT-07 | Studio itemを生成→選別→caption→学習→評価 | 新規のみAPPROVED、既存REJECTED維持、4段階と学習後評価を個別表示 | AC-42〜AC-49 |
| INT-08 | Album quick-addから選択・一覧・詳細を往復 | 新規/重複/失敗を区別し選択と永続状態を維持 | AC-71〜AC-81, AC-86 |
| INT-09 | Compareで2画像、Zoom、設定5tab/history、workflow import/export | 操作対象/比率/戻る進むを維持し、import失敗時に既存値を壊さない | AC-82〜AC-90 |
| INT-10 | Playground、dialogue/detection preview、translation dictionary | 未保存/失敗/境界値を明示し、確定・保存経路を区別 | AC-91〜AC-97 |
| INT-11 | manager/service状態取得、操作、長い/空ログ | 7秒取得/120秒操作、timeout未確認で再送なし、port 8899導線 | AC-98〜AC-102 |

Browser evidence: 390×844, 767×800, 768×800, 1023×800, 1024×800, 1440×900, plus 200% zoom and narrow height. Record route, viewport, setup, operation, expected/actual, screenshot, AC and mock-vs-live label. Do not report mocked service/backend as live verification. Accessibility includes keyboard-only operation, focus-visible, dialog focus containment/restore and reduced-motion.

## Gate 3b: Boundary / Failure

| ID | Boundary | Expected | AC |
|---|---|---|---|
| EDGE-01 | breakpoints immediately below/at/above each boundary, rotation, safe-area, keyboard | no duplicated navigation, clipped primary action or lost draft | AC-01〜AC-10, AC-29〜AC-31 |
| EDGE-02 | empty/full/filtered/partially loaded selection, stale IDs, duplicate bulk action | stable full ID set, idempotent result and explicit partial failures | AC-11〜AC-15, AC-57〜AC-70, AC-71〜AC-81 |
| EDGE-03 | split ratio missing/corrupt/NaN/Infinity/zero, storage denied, minimum pane | safe default/clamp, no crash, maximize recovery remains reachable | AC-16〜AC-28 |
| EDGE-04 | queued job changes state at 0/2999/3000ms, duplicate click, request rejection | one reservation/cancel at most, only queued jobs canceled; terminal truth from backend | AC-33〜AC-41 |
| EDGE-05 | numeric min/max/step and malformed/missing metadata | accepted values align required steps (including LoRA 0.05), invalid values rejected safely | AC-32, AC-57〜AC-70 |
| EDGE-06 | Studio retry, existing REJECTED record, caption/evaluation failure | existing decision preserved, stage and post-training evaluation never conflated | AC-42〜AC-49 |
| EDGE-07 | import partial/invalid file, export failure, browser storage unavailable | no partial overwrite; error is visible and retry does not duplicate | AC-87〜AC-92 |
| EDGE-08 | prompt empty/large/Unicode, preview timeout, dictionary duplicate/invalid entry | no unsafe execution; stale response cannot overwrite current draft | AC-91〜AC-97 |
| EDGE-09 | manager unavailable, null/busy, action timeout/504, empty/error/long log | unknown != stopped; outcome unconfirmed; no automatic action replay; safe text display | AC-98〜AC-102 |

## Evidence, Audit, and Closure

最終証拠は[全102AC受入表](REQ-334-acceptance.md)、[直接assertion一覧](REQ-334-test-assertions.md)、[実画面観測](REQ-334-browser-evidence.md)、[walkthrough](../../walkthrough.md)を参照。R15 frontendは521 suites/1697 tests全件成功・型errors0、backendは656 tests成功・mypy177 files/errors0。147物理カードのDAGは循環なし。Safe AreaのCSS値シミュレーション、mock upstreamとManager未接続の範囲を明示し、実GPU実行成功へ読み替えない。

Record each AC as PASS/FAIL/INCONCLUSIVE with test command or browser procedure and evidence path. BA audit is separately tracked; an inconclusive audit is not a product pass. Audit source note: `REQ-334-audit.md`. GPU cleanup evidence and OpenAPI extraction limitations remain disclosed there. Phase completion requires its mapped AC evidence and applicable gates; full PBI closure requires every AC-01〜102 PASS and required human QA acceptance. Audit limitations cannot be converted into passing product evidence.
