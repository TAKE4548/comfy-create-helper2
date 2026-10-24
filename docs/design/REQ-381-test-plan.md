---
id: REQ-381-test-plan
title: モバイルSettings検証計画
status: draft
tags: [settings, mobile, test-plan]
related_paths:
  - docs/design/REQ-381.md
  - frontend/e2e/settingsResponsive.spec.ts
  - .agents/verification.json
---

# REQ-381 テスト計画

## 検証方針

既存colocated/layerテストを拡張し、新moduleのhook/popoverのみ内容名の新testを追加する。チケット番号をファイル名へ付けない。全ACケース名に`[REQ-381/AC-n]`を付ける。APIはHTTP transportのみMSW/Playwright routeで切り、実component/hook/API clientを通す。内部queueやbusiness handlerをmockしてPASSを作らない。

jsdomは保存順序・状態・listener cleanupを検証する。viewport、重なり、scroll、popoverクリップ、pointer gesture、sheet/keyboardは既存`frontend/e2e/settingsResponsive.spec.ts`の実Chromiumで確認する。CI/3-Gate結果と実機soft keyboard確認は別証拠で記録する。

## AC Matrix / Placement

| AC | 主な既存test拡張先 | シナリオ/期待結果 |
|---|---|---|
| 1 | `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` / E2E | 5分類・全設定inventory、URL/hash/保存tab、値を切替後も保持 |
| 2 | E2E `settingsResponsive.spec.ts` | 375×812/320×568/767×900、全5tab、長いname/error、横overflowゼロ・カードgap12px・情報非削除 |
| 3 | `components/__tests__/MappingMasterSection.test.tsx` / E2E | mobileはAdd Master直接＋管理menu、desktopは既存直接操作、rect非重複 |
| 4 | `components/__tests__/MappingMasterSection.modals.test.tsx` / E2E | stage/param masterを実buttonから開く、menu閉→既存共通Modal、Escape/focus、list→form→list |
| 5 | `components/__tests__/BubbleDetectionSection.test.tsx`、`TranslationSettingsSection.test.tsx`、`VramGuardSection.test.tsx` / E2E | 詳細説明だけmobile inline infoへ移動、警告/未保存は常時、全文一致 |
| 6 | new `components/__tests__/SettingInfoPopover.test.tsx` / E2E | 再tap/outside/Escape/祖先scroll/resize/tab切替で閉、portal・上下左右端・長文内部scroll、1つだけ開く |
| 7 | `LlmSettingsSection.test.tsx`、`BubbleDetectionSection.test.tsx`、`VramGuardSection.test.tsx`、`TranslationSettingsSection.test.tsx`、`ThumbnailSettingsSection.test.tsx`、`WorkflowConnectionSection.test.tsx` / E2E | 確定前0要求、blur/Enter/release1要求、重複0、同key max1 in flight、最新確定値、422/503/timeout後draft/未保存保持・手動retryのみ |
| 8 | `LlmSettingsSection.test.tsx`、`TranslationSettingsSection.test.tsx`、`workflowMappingIntegration.test.tsx`、`SpeechToneSection.test.tsx` / E2E | prompt/provider認証/workflow/toneはclick Saveまで送らない。provider選択だけではcredential formを部分確定しない |
| 9 | `SettingsPage.test.tsx` / new `hooks/__tests__/useSettingsSwipe.test.tsx` / E2E | dx48/比率1.5境界、縦12px先行、1本/多点、端、range/input/overlay/横scroll/pointercancelを保護、直接tab/keyboard残存 |
| 10 | `SpeechToneSection.test.tsx` / E2E | create/edit両方で左Cancel/右Save、44px、85dvh、本文のみscroll、短いviewport/keyboard縮小時footer可視 |
| 11 | `ServiceConnectionCard.test.tsx` / E2E | **REQ-380到着後のみ** 実memory button＋lamp/log同時表示、375px/長label/生成中disabled、重複なし、hit44px。fixtureだけの架空buttonは不可 |
| 12 | 上記既存test / E2E | 768/1024/1280pxでdesktop Save・配置維持、767↔768 resizeでdraft/要求保持、router戻る/進む/旧キー維持 |

`components/...`は`frontend/src/pages/SettingsPage/components/`配下。新hook `useSettingsCommit` は `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` にsequence/PBTを配置する。新integration testが必要な場合は `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` をT4が所有し、既存MSW server/query helpersを再利用する。既存API module mockの旧ケースは回帰参照であり新ACの統合証拠に代用しない。

## Settings離脱保護 / T0追加

installed react-router7.17.0の実createMemoryRouter/RouterProvider/useBlockerで検証する。新 `frontend/src/pages/SettingsPage/context/__tests__/SettingsDraftContext.test.tsx` と `components/__tests__/SettingsDraftBoundary.test.tsx`、`frontend/src/__tests__/App.routing.test.tsx` を内容名で追加。既存App.persistence/App.generationIntegrationを回帰実行する。

- [REQ-381/AC-7] dirty/invalid/failed/queued/inFlightをOR集約、blur直後登録、同key別instance、ack中再編集、StrictMode/unmount cleanup。flagsだけをregistryに保持。
- [REQ-381/AC-8] 実prompt/credential/workflow/tone draftでPUSH/REPLACE/POPを阻止、Cancel後に元値/未保存error維持、Leaveは最新targetへ一度だけ。clean・同Settings hash/queryは不発。modified click/新tabは元draftを消さない。
- [REQ-381/AC-7] 保存遅延中Leave disabled、success/failure/timeout後も自動遷移なし。queued-onlyの明示Leaveは未送信分を停止。送信済みremote rollbackを捏造しない。確認中追加navigation/連打/767↔768resizeを試験。
- [REQ-381/AC-12] 6route/AppShell/active NavLink/hash/back-forward、QueryClient/persist/store startup、root render errorが既存GlobalErrorBoundaryへ到達すること。全画面でblockerが働く副作用はFAIL。
- 実browserは既存settingsResponsive.spec.tsで375px/768pxの取消/Leave/戻る/blur race/native reload beforeunloadを確認。browser確認文言/モバイルOS killはアプリ独自保証にしない。

追加scenario command（workspace root）:
```powershell
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/__tests__/App.routing.test.tsx --testNamePattern '\[REQ-381/AC-'
```

## Normal / Failure / Preservation

- 正常: workflow header/menu→prompt model/numeric→dialogue Bubble/tone→translation credentials/debounce→system VRAM/thumbnail/longpress。全tabで値を読戻し、keyboard/direct tabも確認。
- 失敗: PUT 422/503、接続reject/timeout、遅延A送信中B編集/確定、古いrefetch、key別並行、同じ値への連続blur/Enter、localStorage SecurityError、明示保存provider/keyの一部PUT失敗。最新draftと持続error、false successなし、自動再送なし。
- 境界: 空/NaN/Infinity/指数/負値/各range端、pointer dx/dy境界、多点touch、pointercancel、tab両端、長文popover、視覚viewport縮小、service長label/log展開。
- 維持: desktop数値Save、長文promptとcredential明示Save、workflow import preview/明示apply、Modal focus/Escape、既存workflow独立scroll、hash/history、UI6不変条件、他画面共通部品。
- PBT: fast-checkによりfinite/invalid numeric候補とstage/commit/ack/fail列を生成し「invalidは送信されない」「keyごとのin-flight<=1」「新revisionを旧ackで上書きしない」「失敗後手動retryまで0送信」を検証。gesture dx/dyは範囲と境界を生成しvertical-first/interactiveが常に不発であること。

## Commands

以下はworkspace rootからPowerShellで実行する。環境は`PYTHONDONTWRITEBYTECODE=1`。個別cardのtypecheck/TDDは中間確認であり最終baselineの代わりではない。

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
npm.cmd --prefix frontend run typecheck
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/pages/SettingsPage --testNamePattern '\[REQ-381/AC-'
backend\.venv\Scripts\python.exe scripts/run_e2e.py e2e/settingsResponsive.spec.ts --grep '\[REQ-381/AC-'
```

E2E wrapperは実sourceを確認済み。5173未使用を確認してViteを起動、Playwrightへ後続argvを渡し、終了時は自分のserver treeを停止する。他serverを停止して空けない。外部ComfyUI/LLM/GPU inferenceを実行せず、network routeでsandboxする。実機keyboardはAndroid/iOSのブラウザ種類・viewport・結果を記録し、desktop height縮小を実soft keyboardのPASSと同一視しない。

## Final Required Commands / Gate Order

`.agents/verification.json`の固定行をそのまま使用する。coordinatorは承認ScopeManifestの`required_commands`へ下記7行＋AC scenario行を登録する（実行argvはshell stringに分割し直さない）。

```json
[
  {"gate":1,"command_argv":["backend\\.venv\\Scripts\\python.exe","-m","mypy","backend"]},
  {"gate":1,"command_argv":["backend\\.venv\\Scripts\\python.exe","-m","pytest","backend/tests/unit"]},
  {"gate":1,"command_argv":["backend\\.venv\\Scripts\\python.exe","scripts/run_in_dir.py","frontend","npm.cmd","exec","--","vitest","run","src/utils","src/components/**/__tests__"]},
  {"gate":1,"command_argv":["backend\\.venv\\Scripts\\python.exe","scripts/verify_ui_invariants.py"]},
  {"gate":1,"command_argv":["npm.cmd","--prefix","frontend","run","typecheck"]},
  {"gate":2,"command_argv":["backend\\.venv\\Scripts\\python.exe","scripts/run_full_suite.py"]},
  {"gate":3,"command_argv":["backend\\.venv\\Scripts\\python.exe","scripts/run_e2e.py"]},
  {"gate":3,"command_argv":["backend\\.venv\\Scripts\\python.exe","scripts/run_in_dir.py","frontend","npm.cmd","exec","--","vitest","run","src/pages/SettingsPage","--testNamePattern","\\[REQ-381/AC-"]},
  {"gate":3,"command_argv":["backend\\.venv\\Scripts\\python.exe","scripts/run_e2e.py","e2e/settingsResponsive.spec.ts","--grep","\\[REQ-381/AC-"]},
  {"gate":3,"command_argv":["backend\\.venv\\Scripts\\python.exe","scripts/run_in_dir.py","frontend","npm.cmd","exec","--","vitest","run","src/__tests__/App.routing.test.tsx","--testNamePattern","\\[REQ-381/AC-"]}
]
```

独立tester-reviewerは実装/全tracked edits凍結後にGate1→Gate2(full discovery)→Gate3を新規実行し、各argvのRecordV1とAC表をignored evidenceへ出力する。QA local auditとunloadは別途必要。文書はdoc-reviewerが意味・適用範囲・参照・正常/失敗/維持を独立確認する。どちらか一方だけのPASSでclosureしない。

## Pending Evidence

本段階は計画でありテスト未実行。BA監査/人手設計承認/REQ-380到着/コードおよび文書独立QA/実機keyboard/最終Gate記録はpending。AC-11欠落のまま全AC PASSを宣言しない。最終reportには実行したcommand、exit、case数、version、未確認範囲を残す。
