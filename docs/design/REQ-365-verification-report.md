---
id: REQ-365-verification-report
title: REQ-365 コード範囲 受け入れ検証レポート (walkthrough)
status: verified-with-findings
tags: [settings, mobile, responsive, verification, REQ-365]
related_paths:
  - docs/backlog/pbi/active/REQ-365.md
  - docs/design/REQ-365.md
  - docs/design/REQ-365-test-plan.md
---

# REQ-365 検証レポート（コード範囲: T1〜T15, T18, T19）

検証者: tester-reviewer (dev-verify) / 日付: 2026-10-15 / 対象: 作業ツリー（未コミット）
T16/T17（ドキュメントカード）は別担当のため対象外。コード側のACを検証した結果であり、ドキュメントACの判定は含まない。

## 1. 総合判定

**CONDITIONAL PASS**（AC-1〜AC-10 は全て実測証跡付きで充足。ただし下記 D-1 を coordinator がトリアージするまで無条件PASSとはしない）

- Gate 1 / Gate 2 / Gate 3 はすべて成功。API/DB契約の変更なしを `git diff` で確認。
- 重大な新規回帰は検出されず。実ブラウザ検証で、共通 Modal の **Escape キーが、ダイアログ内にフォーカスがある場合に閉じない**既存不具合（D-1）を確認。REQ-365 のテストはこれを検出できていない（偽の安心）。
- ローカルモデル監査は実行成功。生の指摘は NG（テスト計画の記述粒度への助言）で、§7 に原文要約を保存。

## 2. 実行エビデンス (execution_evidence)

### Gate 1 静的検証

| コマンド | 結果 |
|---|---|
| `cd frontend; npm run typecheck`（= `tsc -b --noEmit`） | exit 0, 0 errors |
| `backend\.venv\Scripts\python scripts/verify_ui_invariants.py` | `SUCCESS: UI invariant check passed (0 violations across 528 files).` |
| `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict` | exit 0, File path violations 0 / Test naming violations 0（PBI-linked 412 件） |
| `python ${GLOBAL_HELPERS}\workflow_validator.py test-hygiene REQ-365` | `[PASS] No ticket-named test files found.` / `Validation successful.`（既存ファイルの `TEST_NAME_AC_TAG_MISSING` は WARN のみで REQ-365 追加分ではない） |

### Gate 2 フルテスト（絞り込みなし）

`cd frontend; npx vitest run --reporter=dot`（全体）

```
Test Files  234 passed (234)
     Tests  2261 passed (2261)
```
exit 0。`-t "REQ-365"` では 16 ファイル / 80 テスト合格（AC別件数: AC-1:2, AC-2:13, AC-3:7, AC-4:9, AC-5:12, AC-6:7, AC-7:6, AC-8:4, AC-9:14, AC-10:6）。

### 契約不変（API/DB）

- `git diff --name-only` の `frontend/src/api/**`, `backend/**`, `docs/system/**`, openapi 該当: `backend/tests/integration/legacy/test_comfy_generation_bridge.py` のみ（依頼書記載の既存無関係変更。REQ-365 の変更ではない）。`git status` でも backend 非テストコード・API クライアント・openapi の変更/新規なし。**API/DB契約は不変**。
- `LS_KEYS.VRAM_GUARD_LIMIT = 'prompt-surgeon-vram-guard-limit'` のみ追加（`utils/localStorageKeys.ts`）。

### Gate 3 Playwright

`cd frontend; npx playwright test e2e/settingsResponsive.spec.ts`（dev server 5173 は起動済み、HTTP 200 確認。私は起動していない）

| 実行 | 結果 |
|---|---|
| 通常 run 1 / 2 / 3 | 各 9/9 passed (6.9s / 6.7s / 7.0s) |
| `--repeat-each=5`（45件） | 45 passed (33.7s) |
| `--workers=1` | 9 passed (11.0s) |

計 63 実行でフレークなし（過去報告の AC-1 一過性失敗は再現せず。再発可能性の完全否定はできない: 限界参照）。

### 私が追加した実ブラウザ実測（スクラッチ、リポジトリ非保存）

- 44px: 375×667 で 5タブ全てを走査（button/select/input/textarea/tab/summary/label、checkbox は包含label）。44px未満 0 件、`documentElement.scrollWidth==375`、スクロール内包されない右はみ出し要素 0。
- ヘッダーケバブ（/tags, /history。Settings は PageHeader の右クラスタ自体を表示しない既存仕様のため対象外）:
  - 375px: ヒット領域 44×44（x323–367, y8–52）、可視ボックス 28×28（x331–359）。左隣 ResourceHoverMonitor の右端 x=323 と**接するが重ならない**（重なり 0px）。PageHeader ルート高さ 117/119px（ネットレイアウト寄与は 44−16=28px で従来と同じ）。
  - 767px: ヒット領域 y=0〜44（ビューポート上端に接するが欠けない）、768/1279/1280px: 28×28 の従来表示、PageHeader高さ 50px、重なりなし。
- スクリーンショット（375/1280）で崩れなし目視確認。
- モーダル（実測）: ベースモデルマスタ管理 375px → 下端寄せ y=444〜667（vh=667）、上端角丸 16px / 下端 0px、ハンドル可視。1280px → 中央配置、角丸 16px 四隅、ハンドル不可視。
- モーダル排他: 「カスタム型マスタ」開いた状態で `role=dialog` は1件。ステージ管理を開いた状態では backdrop が背面ボタンを遮り（「カスタム型マスタ」クリック不可）`dialog` 1件のまま＝多重/ネストなし。
- localStorage: タブ 5種クリックごとに hash と `prompt-surgeon-settings-active-tab` が一致更新（375/1280 とも）。VRAMスライダー 2/7.5/9/14 で線 left=16.67/62.5/75/100%、タグ「閾値: N GB」、`prompt-surgeon-vram-guard-limit` が即時追従（保存ボタン前）。`details-expanded-v2` に `{"prompt":true,"dialogue":false}` を仕込みモーダル開閉後も値が**完全に同一**（キー増加なし）。
- RT-1: `vram-guard-limit` に `abc / NaN / -5 / 999 / "" / 日本語` を仕込み → 全て既定 4.0（線 33.33%、タグ「閾値: 4.0 GB」）、NaN描画なし。
- 無効 `active-tab`(`zzz`)/無効hash(`#bogus`) → `#workflows` へ正規化（RT-3 回帰なし）。

## 3. AC 検証マトリクス

| AC | 判定 | 証跡 |
|---|---|---|
| AC-1 | PASS | `SettingsPage.test.tsx` [AC-1] 2件（xl 2カラム・左WF+Base/右Mapping、order WF→Mapping→Base）。E2E `[AC-1] 1280px: dual pane`（base.x==wf.x、mapping.x>wf.x、wf-base 空隙<=24px、上端差<=2px）、`1279px: single column order`（x一致・y昇順）。63実行全合格 |
| AC-2 | PASS | `SettingsTabBar.test.tsx`（短縮ラベル、aria-label は長名維持）、E2E 767px tablist（overflow-x/scroll-snap x mandatory、先頭「① モデル」末尾「⑤ システム」）、768px grid+長ラベル+`md:pb-5`(20px)、375px 全操作要素>=44px、下部余白>=54px。私の5タブ全走査で44px未満0件、ケバブ 44×44 |
| AC-3 | PASS | E2E 375px: カード `display:grid`、`__target-node` が `display:none`、actions が右端16px以内、可視thead 0。単体: `settings-mobile-card`、`+N classes`/`+N stages`、編集ボタン aria-label「{name} のマッピング設定を編集（対象ノード: {param_name} / {classes}）」（200字名でも全文保持）。BaseModel `data-cell=actions` |
| AC-4 | PASS（D-1 付記） | 単体 9件: ボタンで `dialog` 展開、常時展開バー消滅、list→form→list で常に dialog 1件。実測: 開いて dialog 1件、新規型作成ボタン表示。**Escape: D-1 参照** |
| AC-5 | PASS（限界あり） | 承認方針どおり param群横断（audit_* ⇄ scene_generate*）で検証: `LlmSettingsSection.test.tsx` 12件（種別切替で本文・Temp/MaxTokens 連動、未保存draft保持、保存ペイロード不変）、`llmSettingsGroups.test.ts`（全域性PBT）。**モデルは全プロンプト共通の読み取り表示**（設計 T-3 の意図的逸脱。種別専用モデルはAPI/DB契約変更を要するため）。PBI原文の「モデルが種別専用値に切替」は充足していない点を明記 |
| AC-6 | PASS | `SpeechToneSection.test.tsx` 7件: 選択プリセットの prompt で rewrite 呼出、出力表示、古い応答破棄、API拒否で alert、連打で単一リクエスト、空入力で無効化 |
| AC-7 | PASS（実ブラウザ制約付き） | `ServiceConnectionCard.test.tsx` 6件: 行直下 region 展開・当該サービスで logs 呼出・再押下で閉じる・失敗/504表示・10万字ログの `max-h-64 overflow-auto`。実ブラウザでは Manager 停止スタブ時「ログ ▼」が disabled になることのみ確認（ログ展開自体はE2E未実施＝jsdomのみ） |
| AC-8 | PASS | 単体4件 + 実ブラウザ実測（上記: スライダー操作で保存前に線%・タグ・LS 即時更新）。total/free=null で NaN なし、0〜100%クランプ |
| AC-9 | PASS | `Modal.test.tsx` [AC-9] 5件、各モーダル単体、E2E 375px: ダイアログ下端==vh(±1)、角丸 16px、ハンドル可視、max-height<=85%vh。768px: 中央配置・下端非接触。BaseModel も実測で同挙動 |
| AC-10 | PASS | `useSettingsTab.test.tsx`、`VramGuardSection.test.tsx`（書込・再マウント復元・setItem例外耐性・PBT・キーリテラル）。実測: タブ/VRAMの LS 即時同期。※再マウント復元の実ブラウザ検証は D-2 参照 |

## 4. Red Team / 境界（RT-1〜RT-13）

| ID | 判定 | 根拠 |
|---|---|---|
| RT-1 | PASS | 実測 6種不正値 → 既定4.0。PBT 合格 |
| RT-2 | PASS | `survives localStorage.setItem throwing` 合格、ThumbnailSettings も例外時クラッシュなし |
| RT-3 | PASS | 無効hash/無効LS → `#workflows`（実測）。REQ-291/314 既存テスト合格 |
| RT-4 | PASS（単体は間接） | 実測でモーダル開閉後も `details-expanded-v2` が完全同一。コード上、書込は SettingsPage.tsx のみで未変更。専用の `Object.keys` アサート単体テストは無い（実測で補完） |
| RT-5 | PASS | 実測: stage管理表示中は背面ボタン不可・dialog 1件。単体: list→form 排他 |
| RT-6 | PASS | 空入力無効化、連打、stale破棄、alert（単体） |
| RT-7 | PASS | 504表示・再試行・巨大ログ有界領域（単体）。Manager停止で disabled（実測） |
| RT-8 | PASS | null/NaN/クランプ（単体＋実測） |
| RT-9 | PASS | E2E＋私の全5タブ走査（checkbox含む）で 44px 未満 0 件 |
| RT-10 | PASS | `+N classes/+N stages` 単体 |
| RT-11 | PASS | 200字名で aria-label/title 全文保持・truncate（ParamTypeMasterManager, MappingMaster）。375px で右はみ出し0 |
| RT-12 | PASS | `verify_ui_invariants.py` 0違反 |
| RT-13 | PASS | フルスイート 2261 件合格 |

境界 767/768/1279/1280px: E2E 4境界すべて合格（767: 横スクロールタブ・カード、768: grid長ラベル・中央モーダル・`md:pb-5`、1279: 1カラム、1280: 2カラム）。SPEC_COMMON（ボトムナビは768px未満のみ）と `md:pb-5` は整合（私が git diff で SPEC_COMMON 変更を確認）。

## 5. 既知リスクの個別確認

| リスク | 結果 |
|---|---|
| ケバブ -8px 負マージンの重なり/高さ増 | 重なり 0px（隣接のみ）、ネット寄与 28px で高さ増なし、767px 上端 y=0 でも欠けなし。実害なし |
| デスクトップ共通 Modal 角丸 12→16px | 承認済み副作用。共通 Modal 利用 11 ファイルに波及（`data-radius-exempt` により `index.css` の 12px 一律補正から除外）。フルスイート・UI不変条件は合格。他ページの個別画面実測は未実施（限界参照）。レガシー独自backdropモーダル（MappingMasterEditModal, StageManagerModal）は 12px のまま |
| T6 カード記載と実体 | カードは `MappingMasterSection.test.tsx:60` の旧label更新を指示するが、同テストは `SettingsComponents` の `SortableMasterRow`（レガシー行コンポーネント、aria-label `${role} を編集`）を対象としており `MappingMasterSection.tsx` の新labelとは別物。未変更で合格するのは正しい。AC-3の新label検証は `MappingMasterSection.modals.test.tsx` に追加済み |
| `sheetMaxHeightClass` 単一 `max-h-[...]` 形式限定 | `parseSheetMaxHeightValue` は `^\s*max-h-\[([^\]\s]+)\]\s*$` のみ解釈（`_`→空白）。複数クラス・他形式は既定 `calc(100dvh - env(safe-area-inset-top))`。仕様書(SPEC_COMMON)に制約が明記済み。実測: 85dvh 反映（375px で max-height 566.95px = 85%×667）。Modal.tsx:113付近 |

## 6. 欠陥・指摘事項

| ID | 重大度 | 内容 | 場所 | 状態 |
|---|---|---|---|---|
| D-1 | Major（既存不具合・REQ-365のテストが検出不能） | 実ブラウザ（Chromium, 1280px）で `Escape` キーがダイアログを閉じない（フォーカスがダイアログ内のとき）。`カスタム型マスタ管理` を開く→フォーカスはダイアログ内の BUTTON→`keyboard.press('Escape')` 後も dialog 1件。`window` に直接 keydown を dispatch すると閉じる。原因: ダイアログの React `onKeyDown` が Escape で `stopPropagation()` するため、`window` の keydown リスナーに届かない。HEAD の Modal.tsx でも同一コード（REQ-365 の変更行ではない）。REQ-365 のテスト（Modal.test.tsx:61, ParamTypeMasterManagerModal 等）は `fireEvent.keyDown(window, ...)` で検証しているため偽陽性。テスト計画 AC-4「Escape/backdrop/閉じる」と不整合。閉じるボタンは動作 | `frontend/src/components/common/Modal.tsx` 約 L143-152（onKeyDown）/ L98-123（window handler） | 要トリアージ（本PBI内で修正するか別PBI化するか） |
| D-2 | Minor（既存・dev専用の疑い） | `/settings`（ハッシュなし）を開くと LS に保存済みタブ（例 translation）ではなく `#workflows` に戻る。dev の `StrictMode`（`main.tsx`）で `initialized` ref により effect 二重実行時に else 分岐へ入るためと推定（コード読解による推定。本番ビルドでの確認は未実施）。`useSettingsTab.ts` は REQ-365 で未変更（REQ-314由来） | `frontend/src/pages/SettingsPage/hooks/useSettingsTab.ts` L40-58 | 参考情報（AC-10の「同期・永続化」自体は満たす） |
| D-3 | Info | AC-5: モデルは種別専用ではなく共通の読み取り表示（設計T-3、承認済み方針の範囲） | `LlmSettingsSection.tsx` 約 L722-726 | 承認済みトレードオフ |
| D-4 | Info | 作業ツリー外要因: `verify_test_naming.py --strict` が `docs/design/REQ-356-test-mapping.md` を自動書換え（+127/-8 行）。REQ-365 の変更ではない。修正せず報告のみ | `docs/design/REQ-356-test-mapping.md` | 報告のみ |

## 7. ローカルモデル QA 監査

- コマンド: `python ${GLOBAL_HELPERS}\local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-365-test-plan.md`（exit 0）。トレース行: `Action=qa-audit | Model=qwen/qwen3.5-9b | Params=9.0B | Quant=Q6_K`。モデルキーは環境変数 `LOCAL_AUDIT_MODEL_KEY` 未設定、アダプタ既定値 `qwen/qwen3.5-9b`（`local_model_adapter.py:73`）で一致を確認。`reasoning_effort=none` はアダプタ側で設定されるが、標準出力には context/reasoning の設定値は出力されなかった（記録できなかった点を明記）。
- 解放: `local_model_adapter.py unload` exit 0、`lms ps --json` → `[]`（ロード済みモデルなし）を確認。GPUメモリ全解放は主張しない。
- **qa_audit_result: FINDINGS_PRESENT（モデル判定 NG）** — 助言的内容。破棄せず coordinator トリアージ用に保存:
  1. (A) E2E 環境依存（dev server 未起動時 INCONCLUSIVE の扱い）が曖昧 → 本検証では dev server 起動済みで実行済み。計画書側で未起動時の扱いを FAIL(前提不足)とする提案。
  2. (B) 境界値・「空隙がない」等が目視依存になり得る → 実 E2E は `boundingBox` による数値比較（空隙<=24px、y差<=2px 等）で実装済み。
  3. (C) 「クラッシュしない」「UI固まらない」等の定性的表現 → 状態/DOM アサーションの明示化を提案。
  4. (D) Windows 固有パス（`backend\.venv\Scripts\python`）・PowerShell glob → プロジェクトコンテキストの宣言コマンドが正であり本プロジェクトでは許容（OS非依存化は任意）。
  - 監査は計画書の記述に対する助言であり、実装欠陥の指摘（重大度付き）は含まれなかった。

## 8. 限界・未実施

- 本番ビルド（`vite build`/preview）での実ブラウザ検証は未実施（D-2 は dev StrictMode 起因の推定）。
- AC-7 のログ展開、AC-6 口調テスト、AC-5 種別切替は実ブラウザ操作では未実施（API スタブ形状が複雑なため）。jsdom 単体＋コード読解のみ。AC-8 は実ブラウザで確認済み。
- 他ページの共通 Modal（11ファイル）のデスクトップ角丸16pxは、Settings 配下 Modal 以外は実測していない。
- フレーク: 63実行で 0 件だが、過去の一過性失敗の根本原因は特定できていない。
- 並列8 worker 時の負荷依存タイミング（`expect.toBeVisible` 既定待機）は観察せず。
- `implementation_plan.md` の REQ-366 由来上書きや REQ-364 PBI は無関係変更として未評価。

## 9. 構造化ペイロード

```json
{
  "pbi_id": "REQ-365",
  "verdict": "CONDITIONAL_PASS",
  "gate_results": {
    "gate_1_typecheck": "PASS (npm run typecheck exit 0; verify_ui_invariants 0 violations; verify_test_naming --strict 0 violations)",
    "gate_2_full_test_suite": "PASS (vitest run: 234 files / 2261 tests, 0 failures)",
    "gate_3_scenarios": "PASS for AC-1..AC-10 with D-1 pending triage (playwright 63/63 over 7 runs; RT-1..RT-13 verified; 767/768/1279/1280 boundaries)"
  },
  "qa_audit_result": "FINDINGS_PRESENT (model verdict NG, advisory on test-plan wording; model unloaded, lms ps empty)",
  "audit_findings": ["A: E2E env dependency wording", "B: numeric boundary assertions", "C: qualitative failure wording", "D: OS-specific commands"],
  "walkthrough_path": "docs/design/REQ-365-verification-report.md",
  "failure_details": "D-1: common Modal Escape key does not close dialog in real browser when focus is inside (pre-existing Modal.tsx onKeyDown stopPropagation; unit tests dispatch on window and miss it)"
}
```
