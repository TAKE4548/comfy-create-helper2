---
id: REQ-365-verification-report-r3
title: REQ-365 コード範囲 最終受け入れ検証レポート (r3 / 最終状態)
status: verification-complete
tags: [REQ-365, verification, tester-reviewer, dev-verify]
related_paths:
  - docs/design/REQ-365-test-plan.md
  - docs/design/REQ-365-verification-report.md
  - docs/design/REQ-365-verification-report-r2.md
---

# REQ-365 コード範囲 最終受け入れ検証レポート (r3)

検証者: tester-reviewer (dev-verify) / 対象: REQ-365 のコード範囲の最終状態 (T21, T22, T25-T30, T24 を含む)
レポート r1/r2 は変更していない。リポジトリのソースは読み取り専用で扱った。ブラウザ確認用スクリプトはスクラッチパッドのみで実行した。

## 総合判定

**不合格 (FAIL / 要小修正 1 件)。AC-1〜AC-8, AC-10 は PASS。AC-9 は 1 件の欠陥 (D-R3-1) により、依頼されたバックドロップ確認項目を満たさない。**

3-Gate の機械ゲートはすべて緑である。しかし実ブラウザ確認 (375px) で、BaseModelSection の 3 ダイアログ (モデルマスタ管理 / モデル作成・編集 / マッピング追加) のバックドロップが viewport 全体を覆っていない。上端 24px が覆われず、背景が操作可能になる。この点は「バックドロップが viewport 全体を覆い、背景がクリック不可」という最終確認項目に該当するため、PASS にはしない。

## 1. ゲート結果 (実行コマンドと結果)

<execution_evidence>

| Gate | コマンド (cwd) | 結果 |
|---|---|---|
| 1 型検査 | `npm run typecheck` (frontend) = `tsc -b --noEmit` | PASS (exit 0、エラー 0) |
| 2 全件テスト | `npx vitest run --reporter=dot` (frontend、引数なし全件) | PASS: Test Files 237 passed (237), Tests 2288 passed (2288), exit 0, 98.0s |
| UI 不変条件 (RT-12) | `backend\.venv\Scripts\python scripts/verify_ui_invariants.py` | PASS: 0 violations across 531 files |
| テスト命名 | `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict` | PASS: ファイル名違反 0 / 命名違反 0 (PBI 紐付けケース 444) |
| 契約不変 | `git status` / `git diff --name-only` を `frontend/src/api`, `backend`, `docs/system`, openapi に対して実行 | REQ-365 の変更なし (後述) |
| Gate 3 E2E ×3 | `npx playwright test e2e/settingsResponsive.spec.ts --reporter=line` ×3 (dev server 5173 は起動済み、HTTP 200。こちらで起動していない) | 3 回とも 24 passed (17.8s / 15.6s / 15.8s) |
| Gate 3 E2E 反復 | `npx playwright test e2e/settingsResponsive.spec.ts --repeat-each=3 --reporter=line` | 72 passed (51.2s)。AC-1 の計測競合は再発なし |

契約不変の詳細:
- `frontend/src/api/**`: `git status` / `git diff` ともに変更ゼロ。
- `docs/system/openapi.yaml` ほか openapi: 変更ゼロ。
- `backend/**`: 変更は `backend/tests/integration/legacy/test_comfy_generation_bridge.py` の 1 行 (`from pathlib import Path` の追加、テストファイルのみ) だけ。本ターン開始時点の git status に既に存在した無関係の変更で、非テストの backend 変更はゼロ。
- 副作用の注記: `verify_test_naming.py` は `docs/design/REQ-356-test-mapping.md` を自動更新する ("[Mapping Baseline Updated]")。このファイルは開始時点で既に変更済みだった。私は意図的に編集していない。コーディネーターはコミット時に当該差分を意識されたい。

</execution_evidence>

## 2. ローカルモデル QA 監査

テスト計画書 `docs/design/REQ-365-test-plan.md` の mtime が r2 レポート (20:24) より新しい (21:29) ため、Skill に従い今回は再実行した。

- コマンド: `python <GLOBAL_HELPERS>\local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-365-test-plan.md` (exit 0, モデル `qwen/qwen3.5-9b`)
- 生の判定: 「不合格 (Fail)」。出力全文はスクラッチパッド `audit-r3.txt`。
- 指摘 (助言として保存。トリアージはコーディネーターに委ねる):
  1. AC-9 のテストマッピングを具体的なケース名で列挙すること。
  2. AC-1〜AC-3, AC-9 の検証 viewport を数値リストにすること。
  3. サーバー未起動時の INCONCLUSIVE 条件を定義すること。
  4. OS 依存コマンドを避けること。
  5. 「空隙なし」「中央配置」を数値アサーションにすること。
  6. RT-4 のスキーマ違反時の挙動定義、E2E 関数名の列挙 (推奨)。
- 私の所見: 1, 2, 5 は現在の E2E (`frontend/e2e/settingsResponsive.spec.ts`) が既に数値で検証している (中央配置 ±2px、底面 ±1px、24 ケース)。モデル出力には計画書に存在しない "AC-13" への言及があり、一部は誤認 (幻覚) の可能性がある。したがってこれらは計画書の文書化上の助言であり、コードの欠陥を示すものではないと判断する。ただし、判定を覆すものではなく、計画書の表現はコーディネーターが扱う。
- VRAM 解放: `local_model_adapter.py unload` exit 0、"LM Studio reports no models loaded."。これは LM Studio にロード済みモデルが無いことの確認であり、GPU メモリが全て空いたことの証明ではない。

## 3. 実ブラウザ確認 (スクラッチパッド Playwright、リポジトリ編集なし)

API は `page.route` でスタブ。375x667 (ボトムシート期待) と 1280x900 (中央配置期待) で各ダイアログを開いて測定した。

測定項目: 下端が viewport 下端に接する (±1px) / 上側角 R 16px / 可視ハンドルがちょうど 1 / max-height ≤ 85% / `::before` 旧ハンドルなし / `.modal-backdrop` が (0,0,375,667) を覆う / 背景クリック不可 (y=6 の elementFromPoint がバックドロップ内) / 横クリップなし / pageerror なし。

| ダイアログ | 375px 結果 | 1280px 結果 |
|---|---|---|
| ParamTypeMaster 一覧 | OK | OK (中央、ハンドル非表示) |
| ParamTypeMaster フォーム | OK | OK |
| BaseModel マスタ管理 | **FAIL: バックドロップ y=24, 高さ643。背景クリック可能** (他項目は OK) | 形状 OK / バックドロップに同一の 24px ずれあり (margin-top:24px, 高さ 876) |
| BaseModel 作成・編集 | **FAIL: 同上** | 同上 |
| BaseModel マッピング追加 | **FAIL: 同上** | 同上 |
| MappingMasterEdit | OK | OK |
| StageManager | OK | OK |
| SpeechTonePreset | OK | OK |
| MappingMasterDelete | OK | OK |
| WorkflowManage 名前変更 / コピー | OK / OK | OK / OK |
| WorkflowDeleteConfirm | OK | OK |
| WorkflowNodePicker (MappingMasterEdit 内で入れ子) | 下記参照 | OK、形状は中央 (x=16,y=193.5,幅1248,高さ537) |
| GeneratePage `/` の WorkflowManageModal (名前変更) | OK: 下端 667、R 16px、ハンドル 1、バックドロップ (0,0,375,667)、背景ブロック済み | OK: 中央、バックドロップ (0,0,1280,900) |

注: GeneratePage のルートは `/generate` ではなく `/` (index)。`ワークフロー設定` メニュー → `名前を変更` で到達した。

### 3.1 入れ子の WorkflowNodePicker (375px)

- ダイアログは 2 枚 (編集 + ピッカー)。ピッカーは x=0, y=100, 幅 375, 高さ 567 で viewport 内。中心点で最前面 (z-order OK)。
- ノード 40 件のリストは縦スクロール領域が 1 つあり、遠いノード (#35) をスクロールして選択可能。「設定フォームへ反映」ボタンも viewport 内。
- タップターゲット: 閉じる 44x44 / キャンセル 高さ44 / 反映 高さ44 / ノード行の最小高さ 52px。44px 以上を満たす (1280px ではボタン 28px だがデスクトップ想定で問題なし)。
- ハンドルは可視 2 本 (編集シートとピッカーシートが重なるため)。各ダイアログに 1 本ずつなので、重ね表示の許容トレードオフ内と判断する (計数対象外)。
- Esc: `closeOnEsc={!isNodePickerOpen}` は機能している。ピッカー内のヘッダーにフォーカスがある状態の Esc は何も閉じない (D-1、既存・別 PBI、計数しない)。フォーカスを外した状態の Esc はピッカーのみが閉じ、編集ダイアログは残った (ダイアログ 2 → 1)。意図どおり。
- 補足: ピッカーは `closeOnBackdropClick={false}` (既存設計)。

### 3.2 D-5 (クリップ) の再確認

375px の Settings から到達可能な全ダイアログ (上表) で横クリップなし、max-height 566.95px (=85%) 以内、下端は viewport 下端。旧 D-5 のクリップは再現しなかった。`SettingsResponsive.css` の `.req314-settings [role='dialog']` は `box-sizing / max-width / overflow` のみ残り、max-height / padding-bottom / `85dvh` は除去済み (`SettingsPage.test.tsx:407-409` の AC-9 アサーションで固定)。

非 Modal の残存: `SettingsComponents.tsx` の `MappingMasterModal` (本番 Settings 未使用、テスト専用)。インライン `role=alertdialog` (`ServiceConnectionCard.tsx:140`, `SpeechToneSection.tsx:367`) はオーバーレイではない。ユーザー決定どおり。

## 4. 欠陥

### D-R3-1 (Medium / AC-9 の最終確認項目に該当): BaseModelSection のモーダルでバックドロップが上端 24px ずれ、背景が操作可能

- 場所: `frontend/src/pages/SettingsPage/components/BaseModelSection.tsx:120` のラッパー `<div className="space-y-6">` の内側に、共通 `Modal` を 3 つ直接配置している (`:202` モデルマスタ管理、`:284` 作成・編集、`:342` マッピング追加)。
- 原因 (実測): Tailwind の `space-y-6` が子の 2 番目以降に `margin-top: 24px` を付与する。`.modal-backdrop` は `position: fixed; inset: 0` だが、この margin が効き、バックドロップが y=24 から始まり高さが 24px 短くなる (375x667 で (0,24,375,643)、1280x900 で高さ 876)。上端 24px はディム/ぼかしされず、ヘッダー領域の要素がクリック可能 (`elementFromPoint(187,6)` がヘッダー行の DIV を返した)。スクリーンショット `bd-basemodel-manager.png` で上端の未ディム帯を目視確認。
- 影響: 「バックドロップが viewport 全体を覆う」「背景がクリック不可」を満たさない。ParamTypeMaster など他の Modal は同一チェックで OK (親が `space-y-*` でないため)。
- 事前存在の有無: `git show HEAD:...BaseModelSection.tsx` でも `space-y-6` 内に `fixed inset-0` の自前オーバーレイがあり、同じ 24px ずれの可能性が元からあった (HEAD 側は実測していない)。REQ-365 で共通 Modal に移行した際にも解消されていない。したがって「回帰」ではなく「移行で直すべきだった残存欠陥」。
- 見逃された理由: E2E のバックドロップ確認は SpeechTonePreset の 1 ケース (`settingsResponsive.spec.ts:330`) だけで、BaseModel の 3 ダイアログは形状 (底面・R・ハンドル) のみ確認している。
- 修正案 (私は編集していない): 3 つの `Modal` をラッパーの外へ出す (フラグメントで兄弟にする) か、`Modal` の `className` で `!mt-0` を与える。併せて E2E のバックドロップ確認を全ダイアログ (最低でも BaseModel 3 件) に拡張する。

### 欠陥なしの項目

上表の上記以外のダイアログ、入れ子ピッカー、GeneratePage の WorkflowManageModal に欠陥は見つからなかった。

## 5. Red Team (RT-1..RT-13)

| RT | 判定 | 証拠 |
|---|---|---|
| RT-1 VRAM localStorage 不正値 | PASS | `VramGuardSection.test.tsx:139` PBT `readStoredVramLimit(any string)` が [2,14] に収まる (全件 vitest 緑) |
| RT-2 localStorage 例外 | PASS | `useSettingsTab.test.tsx:76`、`VramGuardSection.test.tsx` `[AC-10] survives localStorage.setItem throwing`、`SettingsTabBar`/`SettingsPage` の保存失敗表示ケース |
| RT-3 active-tab 不正値 / hash | PASS | `useSettingsTab.test.tsx:40,55` (hash 優先、不正値は workflows) |
| RT-4 details-expanded-v2 スキーマ | PASS | `SettingsPage.test.tsx:292,305` (既存値復元、配列/不正値の処理) |
| RT-5 モーダル二重オープン | PASS | `MappingMasterSection.modals.test.tsx:234`、`BaseModelSection.test.tsx:110` (常に dialog 1 つ)、E2E `toHaveCount(1)`、実ブラウザ n=1 |
| RT-6 口調テスト | PASS | `SpeechToneSection.test.tsx:205,216,237,247` (空入力で無効、古い応答破棄、拒否で alert、連打 1 回) |
| RT-7 ログ取得 | PASS | `ServiceConnectionCard.test.tsx:133,149,162` (停止時無効、504 表示、巨大ログは有界スクロール) |
| RT-8 VRAM の null/境界 | PASS | `VramGuardSection.test.tsx:84` (0-100% クランプ、NaN なし) |
| RT-9 44px | PASS | E2E `375px: interactive controls are >=44px` (3 回 + repeat 3 で緑)。ピッカー実測も 44px 以上 |
| RT-10 +N classes / +N stages | PASS | `MappingMasterSection.modals.test.tsx:186` |
| RT-11 200 字の長い名前 | PASS | `[REQ-365/AC-4] ... full 200-char name in aria-label ... (RT-11)` |
| RT-12 UI 不変条件 | PASS | `verify_ui_invariants.py` 0 violations |
| RT-13 既存統合テスト | PASS | 全件 vitest 2288 passed (`src/pages/SettingsPage` を含む) |

加えて実ブラウザで確認した異常系: 入れ子ピッカーでの Esc は編集ダイアログを閉じない / 背景クリック可否 (D-R3-1 を検出) / 40 ノードリストの遠方選択。

## 6. AC マトリクス (最終)

| AC | 内容 | 自動テスト / E2E | 実ブラウザ / 証跡 | 判定 |
|---|---|---|---|---|
| AC-1 | workflows の 2 カラム (1280) と 1 カラム (1279) の順序、空隙なし | SettingsPage.test.tsx、E2E 2 件 (×3, ×3 repeat 緑、計測競合なし) | 同左 | PASS |
| AC-2 | 短縮ラベル、横スワイプ、操作要素 ≥44px、下部 nav 余白 | SettingsTabBar.test.tsx、E2E 4 件 | 緑 | PASS |
| AC-3 | MappingMaster カード化、BaseModel 表のラベル | MappingMasterSection(.modals).test.tsx、BaseModelSection.test.tsx、E2E | 緑 | PASS |
| AC-4 | カスタム型マスタのダイアログ化と排他遷移 | ParamTypeMasterManagerModal.test.tsx、MappingMasterSection.modals.test.tsx:234 | 実ブラウザ OK (一覧/フォーム) | PASS |
| AC-5 | LLM プロンプト統合エディタ、グループ別パラメータ | llmSettingsGroups.test.ts (PBT)、LlmSettingsSection.test.tsx | 全件緑。モデル表示は共有の読み取り専用 (許容トレードオフ) | PASS |
| AC-6 | 口調テスト実行 | SpeechToneSection.test.tsx | 緑 | PASS |
| AC-7 | サービス別ログのアコーディオン | ServiceConnectionCard.test.tsx | **jsdom のみ**。実ブラウザ E2E なし (制限事項) | PASS (jsdom 限定) |
| AC-8 | VRAM スライダーの draft 連動 | VramGuardSection.test.tsx | 全件緑 | PASS |
| AC-9 | 全 Settings ダイアログを共通 Modal (ボトムシート) 化 | Modal.test.tsx、各モーダルの単体テスト、E2E 17 件 (×3, ×3 repeat 緑)、SettingsPage.test.tsx:407 | 形状: 全ダイアログ OK。**バックドロップ: BaseModel 3 ダイアログで FAIL (D-R3-1)** | **FAIL (D-R3-1)** |
| AC-10 | 永続化キー (active-tab, vram-guard-limit)、localStorage 例外耐性 | useSettingsTab.test.tsx:85、VramGuardSection.test.tsx | 緑 | PASS |

## 7. 制限事項

- AC-7 は jsdom のみ。実ブラウザでのログ展開は未検証。
- 実ブラウザ確認はスタブ API 上の Chromium のみ。実バックエンドの応答、iOS Safari の安全領域、実機のタッチ操作は未検証。
- 入れ子ピッカーの Tab トラップの積み重ねは範囲外 (ユーザー決定)。
- D-1 (フォーカスがダイアログ内にあると Esc で閉じない) と D-2 (useSettingsTab の hash リダイレクト) は既存で別 PBI (計数しない)。GeneratePage の名前変更ダイアログも D-1 により Esc で閉じなかったが同じ扱い。
- 1280px のバックドロップのずれは高さ・margin の実測 (876px, 24px) であり、スクリーンショットの目視は 375px のみ。
- QA 監査は advisory。モデルの誤認の可能性を前述した。

## 8. 戻り値 (構造化)

```json
{
  "pbi_id": "REQ-365",
  "verdict": "FAIL",
  "gate_results": {
    "gate_1_typecheck": "PASS (npm run typecheck, 0 errors)",
    "gate_2_full_test_suite": "PASS (237 files / 2288 tests, 0 failures)",
    "gate_3_scenarios": "PARTIAL: E2E 24/24 x3 and 72/72 PASS; real-browser spot check found D-R3-1 (BaseModelSection backdrop offset 24px, background clickable)"
  },
  "qa_audit_result": "FINDINGS_PRESENT (raw model verdict Fail; advisory plan-text findings; model unloaded, lms ps empty)",
  "audit_findings": ["AC-9 test mapping list", "viewport numeric list", "INCONCLUSIVE condition", "cross-platform commands", "numeric assertions"],
  "walkthrough_path": "docs/design/REQ-365-verification-report-r3.md",
  "failure_details": "D-R3-1: frontend/src/pages/SettingsPage/components/BaseModelSection.tsx:120 (space-y-6 wrapper) containing Modals at :202, :284, :342 -> .modal-backdrop gets margin-top 24px, top 24px of viewport not covered and clickable at 375px and 1280px"
}
```
