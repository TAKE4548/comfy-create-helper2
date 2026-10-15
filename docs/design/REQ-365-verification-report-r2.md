---
id: REQ-365-verification-report-r2
title: REQ-365 コード範囲 最終状態 再検証レポート (delta, walkthrough r2)
status: verified-with-findings
tags: [settings, mobile, responsive, verification, REQ-365]
related_paths:
  - docs/design/REQ-365-verification-report.md
  - docs/backlog/pbi/active/REQ-365.md
  - docs/design/REQ-365.md
  - docs/design/REQ-365-test-plan.md
---

# REQ-365 再検証レポート r2（コード範囲: T1〜T15, T18, T19, T20）

検証者: tester-reviewer (dev-verify) / 日付: 2026-10-15 / 対象: 作業ツリー（未コミット）最終状態。
初回レポート（`REQ-365-verification-report.md`）は未変更。T16/T17（ドキュメント）は対象外で、ドキュメントACの判定は含まない。

## 1. 総合判定

**CONDITIONAL PASS**（AC-1〜AC-10 は最終状態で実測証跡付きで充足。ただし新規指摘 D-5（レガシーモーダルの375px表示崩れ）を coordinator がトリアージするまで無条件PASSとしない。D-1/D-2 はユーザー決定により別PBI送りで本判定から除外）

- Gate 1 / 2 / 3 すべて成功。API/DB契約変更なし。
- T20 の二重ハンドル是正は実ブラウザで確認（共通Modal 375pxで可視ハンドル1本、疑似要素 `::before` は `none`）。
- 依頼の確認事項「レガシー MappingMasterEditModal / StageManagerModal が開き、中央配置で使えるか」は **部分的に不合格**。原因は今回の index.css 変更ではなく `SettingsResponsive.css`（T3由来、初回レポート時点で既に存在）。D-5 参照。

## 2. 初回レポート以降の差分の特定（ファイルmtimeとgit diffによる）

| 項目 | 状態 |
|---|---|
| Modal.tsx（`data-radius-exempt`, `data-sheet-max-height`/`--modal-sheet-max-height`）、HeaderKebabMenu.tsx（T18/T19）、Modal.test.tsx | mtime 19:22〜19:46。初回レポート(20:06)より前。初回で実測済みの内容 |
| `frontend/src/index.css` | mtime 20:12 = 初回より後。変更箇所: 16px 例外ルール、`data-sheet-max-height` による max-height 上書き、疑似ハンドル `::before` を `:not([data-radius-exempt])` に限定（T20）。T18分は初回に反映済みだった可能性が高いが、T20行は確実に新規 |
| `frontend/e2e/settingsResponsive.spec.ts` | mtime 20:14 = 初回より後。T20: `modal-sheet-handle` が `toHaveCount(1)`、`::before` content が `none`/`normal` の検証を追加 |
| `docs/design/REQ-365-test-plan.md` | mtime 18:54（初回の監査より前）。変更なし |

厳密な「T18のどの行がいつ」は git が未コミットのため mtime による推定。最終状態を全面再検証したため判定には影響しない。

## 3. 実行エビデンス (execution_evidence)

### Gate 1 静的検証（`C:\Users\audih\ws\comfy-create-helper2`）

| コマンド | 結果 |
|---|---|
| `cd frontend; npm run typecheck`（`tsc -b --noEmit`） | 出力にエラーなし、0 errors |
| `backend\.venv\Scripts\python scripts/verify_ui_invariants.py` | `SUCCESS: UI invariant check passed (0 violations across 528 files).` |
| `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict` | exit 0 / File path violations 0 / Test naming violations 0 / `SUCCESS: 0 violations` |

D-4 再現: `verify_test_naming.py` が `docs/design/REQ-356-test-mapping.md` を自動更新（`[Mapping Baseline Updated]`）。REQ-365の変更ではなく報告のみ。

### Gate 2 フルテスト（絞り込みなし）

`cd frontend; npx vitest run --reporter=dot` → exit 0
```
Test Files  234 passed (234)
     Tests  2261 passed (2261)
```
初回と同数（T20の変更はE2Eとindex.cssが中心で、単体件数の増減なし）。

### 契約不変（API/DB）

`git diff --name-only` で `frontend/src/api/**`, `backend/**`, `docs/system/**`, openapi 該当は `backend/tests/integration/legacy/test_comfy_generation_bridge.py` のみ（依頼書記載の既存無関係変更）。`git status` の未追跡にも backend 非テスト、`frontend/src/api`、openapi の新規なし。API/DB契約は不変。

### Gate 3 Playwright

`cd frontend; npx playwright test e2e/settingsResponsive.spec.ts` ×3（dev server 5173 は既に起動済み・HTTP 200。私は起動していない）

| run | 結果 |
|---|---|
| 1 | 9 passed (7.4s) |
| 2 | 9 passed (7.0s) |
| 3 | 9 passed (6.8s) |

### 実ブラウザ追加実測（スクラッチ `scratchpad/spot.cjs`, `legacy.cjs`、リポジトリ非保存）

API は E2E と同じスタブ。

共通 Modal（T18/T20 の最終状態）:

| 条件 | 実測 |
|---|---|
| 375×667 ベースモデルマスタ管理 | dialog 1件、y=460〜667（下端=vh）、上端角丸 16px/16px、下端 0px、`modal-sheet-handle` 総数1・可視1、dialog `::before` content=`none`、max-height 566.95px（=85%×667）、閉じるボタンで閉じる |
| 375×667 カスタム型マスタ（共通Modal） | 同様に角丸16px・ハンドル可視1・`::before`=none・max-height 566.95px |
| 1280×900 ベースモデル / カスタム型マスタ | 中央配置（左右の中心ずれ0、縦ずれ12px/0px）、角丸 16px 四隅、ハンドル要素は存在1だが不可視（0）、`::before`=none |

ヘッダーケバブ（/tags, 375px）: ヒット領域 44×44（x323,y8）、可視内側 28×28（x331,y16）。初回の所見（44×44 / 28×28）と**同一**。1280px は 28×28（従来表示）。

レガシー独自backdrop（`fixed inset-0 ... role=dialog` を持つ MappingMasterEditModal / StageManagerModal、Settings 内）:

| 条件 | 実測 |
|---|---|
| 1280×900 | 開く・閉じる動作する。パネルは中央（StageManager: 672×256 を x304,y314。EditModal 768×810 を x256,y37）。backdrop は高さ 884（`SettingsResponsive.css` L42〜の既存ルール）で下端 16px が覆われないが、HEAD でも同ルールが全幅に適用されるため同じ |
| 375×667 ステージ管理 | 開く・閉じる動作する。パネル 343×310 は y128 で見える。backdrop 高さ 567（85%）で画面下端 100px が未被覆、パネル中心は画面中心より約50px上 |
| 375×667 Add Master（編集モーダル） | 開く・閉じる動作する。パネル 343×600 が **y=-17**（上端が画面外に17px）、backdrop 567px。同様に 375×812 で y=-20、390×844 で y=-21。閉じるボタンは y=0〜-4（中心は hit-test で到達可、上端がわずかに画面外）。画面下端付近（x187,y=vh-20）の `elementFromPoint` は背面ページの下部ナビ `A "Tags"` で、モーダル外 |

## 4. AC 検証マトリクス（最終状態）

| AC | 判定 | 証跡 |
|---|---|---|
| AC-1 | PASS | `SettingsPage.test.tsx` [AC-1] 2件。E2E 1280px 2カラム（x一致・空隙<=24px）/1279px 1カラム。再実行3回全合格 |
| AC-2 | PASS | `SettingsTabBar.test.tsx`、E2E 767/768/375px（tablist、grid、全操作要素>=44px、下部余白）。ケバブ 375px 44×44 を再実測。3回合格 |
| AC-3 | PASS | E2E 375px カード grid、`__target-node` none、actions 右端16px以内、thead 0。単体（`settings-mobile-card`、`+N`、aria-label） |
| AC-4 | PASS（D-1 は別PBI） | 単体9件 + 実ブラウザで dialog 1件・list→form 排他（初回実測。最終状態でも共通Modalが開閉）。D-1（Escape）は決定どおり対象外 |
| AC-5 | PASS（限界あり） | `LlmSettingsSection.test.tsx` 12件、`llmSettingsGroups.test.ts`。モデルは共通の読み取り表示（設計T-3承認済み逸脱＝D-3） |
| AC-6 | PASS | `SpeechToneSection.test.tsx` 7件（フルスイート合格に含まれる） |
| AC-7 | PASS（jsdomのみ） | `ServiceConnectionCard.test.tsx` 6件。ログ展開のE2Eは未実施 |
| AC-8 | PASS | 単体4件 + 初回の実ブラウザ実測。今回フルスイート再合格 |
| AC-9 | PASS | E2E 375px: 下端==vh、角丸16px、ハンドル可視かつ `toHaveCount(1)`、`::before` none、max-height<=85%vh。768px 中央配置。実ブラウザ再実測で共通Modal（BaseModel / カスタム型マスタ）375px: 角丸16px/ハンドル1本/max-height 85%、1280px: 中央・角丸16px・ハンドル不可視。※レガシー独自モーダルは AC-9 の「管理系モーダルは共通Modal（ボトムシート）」対象外だが、D-5 参照 |
| AC-10 | PASS | `useSettingsTab.test.tsx`、`VramGuardSection.test.tsx`。タブ/VRAM の LS 同期は初回実測。再マウント復元の実ブラウザは D-2 参照（別PBI） |

## 5. Red Team / 境界

| 観点 | 判定 | 根拠 |
|---|---|---|
| 二重ハンドル（T20の失敗シナリオ: 疑似要素とDOMの2本表示） | PASS | 375px 共通Modal で `::before` content=`none` かつ可視ハンドル1（`modal-sheet-handle` 総数1）。E2E で `toHaveCount(1)` を自動検証 |
| 共通Modal判別セレクタが他モーダルを巻き込む副作用 | FINDING→D-5 | index.css の新ルールはレガシー backdrop には**当たらない**（`.modal-backdrop > [role=dialog]` に限定。レガシーは `::before`=none で従来どおり）。ただしレガシーは `SettingsResponsive.css` のルールの影響を受けている |
| 767/768/1279/1280px 境界 | PASS | E2E 4境界合格（3回） |
| 不正 LS 値・RT-1〜RT-13 | PASS（初回結果を踏襲、フルスイート再合格） | 初回 §4。今回コード変更が入ったのは index.css / E2E のみで再度変動なし |
| T20 計画の「旧ダイアログ ::before ハンドルの維持」E2E | 未実施 | T20 カードは「導線が開けない場合は追加しない」としていたが、現行 E2E に追加されていない（`::before` はレガシーには元々適用外＝none であり、「維持」の前提自体が現行セレクタ構造と合わない）。手動実測でレガシー `::before`=none を確認 |

## 6. 欠陥・指摘事項

| ID | 重大度 | 内容 | 場所 | 状態 |
|---|---|---|---|---|
| D-1 | Major（既存） | 共通Modal の Escape が、フォーカスがダイアログ内にあると閉じない | `Modal.tsx` onKeyDown | **別PBI送り（ユーザー決定）。本判定の対象外。** 修正せず再掲のみ |
| D-2 | Minor（既存） | `/settings`（hashなし）で保存済みタブに復元されず `#workflows` | `useSettingsTab.ts` | **別PBI送り（ユーザー決定）。対象外** |
| D-3 | Info | AC-5 モデルは共通の読み取り表示（承認済みトレードオフ） | `LlmSettingsSection.tsx` | 承認済み |
| D-4 | Info | `verify_test_naming.py --strict` が REQ-356 マッピングを自動書換え | `docs/design/REQ-356-test-mapping.md` | 報告のみ |
| **D-5（新規）** | **Major（REQ-365起因、ただしAC-1〜10の文言上はスコープ外）** | 375px（<768px）で、Settings内のレガシー独自backdropモーダル（MappingMasterEditModal, StageManagerModal）に `.req314-settings [role='dialog'] { max-height: min(85dvh, …) }`（T3で追加）が適用され、`fixed inset-0` の backdrop 自体が画面高さの85%に縮む。結果: (1) backdrop が下端約15%（667pxで100px）を覆わず、背面の下部ナビ(Tags)がモーダル表示中に操作可能（モーダル隔離の破れ）、(2) 中央揃えが崩れ、編集モーダル(高さ600px)のパネル上端が画面外へ17〜21px欠け、閉じるボタンも画面上端を最大4px超過（中心は押下可能）。開閉・入力自体は動作。HEAD は同ルールが全幅 `calc(100dvh-…-1rem)` で backdrop 高の差が16px程度だったため、モバイル85%化で悪化。今回の `index.css` 変更が原因ではない（レガシーは index.css の新ルールの対象外であることを確認） | `frontend/src/pages/SettingsPage/SettingsResponsive.css` L189-191（モバイル85dvh上書き。カード T3 の方針どおりの実装だが、レガシー overlay の `role=dialog` が backdrop 自身である点が未考慮） | 要トリアージ。対処案: ルールを `.modal-backdrop > [role='dialog']` 等、共通Modalのシート要素に限定する、または T8/T9 でレガシー2モーダルを共通Modalへ移行する |

## 7. ローカルモデル QA 監査

本 delta では**再実行していない**。理由: Skill の監査対象は `docs/design/REQ-365-test-plan.md` で、そのファイルの mtime は 18:54（初回監査より前）で変更されておらず、入力が同一のため新たな推論は意味を持たない。初回の監査結果（FINDINGS_PRESENT、助言的、モデルunload確認済み `lms ps` 空）は初回レポート §7 をそのまま有効とする。LM Studio モデルのロード・解放は今回操作していない。

## 8. 限界・未実施

- 本番ビルド（`vite build`/preview）での実ブラウザ検証は未実施。
- 共通Modalを使う Settings 外のページ（約11ファイル）の実ブラウザ実測は未実施。
- AC-7 のログ展開、AC-6 口調テスト、AC-5 種別切替は実ブラウザ未実施（jsdomのみ）。
- 再マウント時のタブ復元は D-2 により実ブラウザ検証対象外。
- T18/T20 の index.css 行ごとの変更時刻は mtime による推定（未コミット）。
- フレーク: 本 delta 3 run で 0 件。過去の一過性失敗の根本原因は未特定。
- `implementation_plan.md` の REQ-366 由来上書き、REQ-364 PBI は無関係として未評価。
- 実施していないこと: commit / archive / カードやPBIの編集。

## 9. 構造化ペイロード

```json
{
  "pbi_id": "REQ-365",
  "verdict": "CONDITIONAL_PASS",
  "gate_results": {
    "gate_1_typecheck": "PASS (npm run typecheck 0 errors; verify_ui_invariants 0 violations/528 files; verify_test_naming --strict 0 violations)",
    "gate_2_full_test_suite": "PASS (vitest run: 234 files / 2261 tests, 0 failures)",
    "gate_3_scenarios": "PASS for AC-1..AC-10 (playwright 9/9 x3; real-browser common Modal 375/1280: single handle, 16px radius, max-height 85%; kebab 44x44/28x28 unchanged); D-5 pending triage"
  },
  "qa_audit_result": "NOT_RERUN (test-plan unchanged since first audit at 18:54; first report FINDINGS_PRESENT advisory stands)",
  "audit_findings": [],
  "walkthrough_path": "docs/design/REQ-365-verification-report-r2.md",
  "failure_details": "D-5: SettingsResponsive.css mobile 85dvh [role=dialog] rule shrinks legacy fixed-inset-0 backdrops (MappingMasterEditModal/StageManagerModal) at <768px: bottom 15% uncovered, panel clipped 17-21px above viewport. D-1/D-2 out of scope (separate PBIs)."
}
```
