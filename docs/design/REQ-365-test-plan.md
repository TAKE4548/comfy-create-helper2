---
id: REQ-365-test-plan
title: REQ-365 テスト計画書
status: design-review-pending
tags: [settings, mobile, responsive, test-plan, REQ-365]
related_paths:
  - docs/design/REQ-365.md
  - docs/backlog/pbi/active/REQ-365.md
---

# REQ-365 テスト計画書

## 1. 方針

- 配置規約（SPEC-TESTING v2.1 / REQ-356）: 既存の隣接`__tests__/`を拡張する。**テストファイル名にチケット番号を含めない**。各テストケース名に `[REQ-365/AC-n]` を付与する。
- 新規テストファイルはコンポーネント名で命名: `ParamTypeMasterManagerModal.test.tsx`, `ParamTypeMasterModal.test.tsx`, `VramGuardSection.test.tsx`, `e2e/settingsResponsive.spec.ts`。
- 全テストCPU/RAMのみ（Zero-GPU）。
- ケースフィルタ形式: `npx vitest run <path> -t "REQ-365/AC-1"`。
- jsdomは実レイアウトを計算しないため、44px実測・1280/768px境界のcomputed-styleはTier3(Playwright)のみで確認し、jsdomではクラス/属性契約を検証する。

## 2. AC トレーサビリティ

| AC | 検証内容 | Tier | 拡張する既存/新規テストファイル（frontend/src/ 起点） | Task |
|---|---|---|---|---|
| AC-1 | workflowsタブのGridクラス（`xl:grid-cols-2`, 左=WF+Base/右=Mapping, `order-*`によるWF→Mapping→Base）、`SettingsResponsive.css`の契約文字列、E2Eで1280px時の2カラム実測・空隙なし | 2, 3 | `pages/SettingsPage/__tests__/SettingsPage.test.tsx` / `frontend/e2e/settingsResponsive.spec.ts` | T3, T15 |
| AC-2 | 短縮ラベル「① モデル」〜「⑤ システム」表示、`overflow-x-auto snap-x snap-mandatory`、各`tab`に`min-h-11`、E2Eでモバイル375pxの操作要素`boundingBox>=44px` | 2, 3 | `pages/SettingsPage/components/__tests__/SettingsTabBar.test.tsx` / `e2e/settingsResponsive.spec.ts` | T1, T3, T13, T15 |
| AC-3 | MappingMaster行が`settings-mobile-card`、Target Node要素に`settings-mobile-card__target-node`、編集ボタン`aria-label`に`対象ノード`情報を含む、`+N classes`/`+N stages`バッジ、BaseModelチェックポイント表の`data-cell`属性、thead非表示CSS | 2, 3 | `pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx`, `.../BaseModelSection.test.tsx` / `e2e` | T3, T6, T7, T15 |
| AC-4 | 「カスタム型マスタ」ボタンで`dialog`が開く（常時展開バーが存在しない）、list→フォームの排他遷移（同時に`dialog`は1つ）、Escape/backdrop/閉じる | 2 | `components/__tests__/ParamTypeMasterManagerModal.test.tsx`, `pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | T4, T5, T6 |
| AC-5 | 種別セレクタ切替で本文textareaとTemperature/Max Tokensが連動（群をまたぐ切替で値が変わる）、`promptParamGroupFor`全域性(PBT)、`dialogue`/`translation`グループ回帰なし | 1(PBT), 2 | `pages/SettingsPage/components/__tests__/llmSettingsGroups.test.ts`, `.../LlmSettingsSection.test.tsx` | T8, T9 |
| AC-6 | プリセット選択→テスト入力→「テスト実行」→`speechTonePresetsApi.rewrite`が選択プリセットの`prompt`で呼ばれ、結果が出力領域に表示。入力変更/再実行時に古い応答は破棄 | 2 | `pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx` | T10 |
| AC-7 | 各サービス行の「ログ ▼」で直下に`region`が展開、`systemManagerApi.logs(service,…)`が当該サービスで呼ばれる、再押下で閉じる、Manager停止時は無効、ログ失敗表示 | 2 | `pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | T11 |
| AC-8 | スライダー`change`で（保存前に）閾値線の`left`%・閾値タグ文言が即時更新、`updateVram`は保存ボタン押下までは未呼出、接近=黄/未満=赤 | 2 | `pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx` | T12 |
| AC-9 | 全Settingsモーダル（ParamTypeMasterManagerModal / ParamTypeMasterModal / BaseModelSection各モーダル / MappingMasterEditModal / StageManagerModal / SpeechTonePresetModal / MappingMasterDeleteModal / WorkflowDeleteConfirmDialog / WorkflowManageModal / WorkflowNodePicker）が共通`Modal`(`.modal-backdrop`, `rounded-t-2xl`, `data-testid=modal-sheet-handle`の実ハンドル1つ, `max-h-[85dvh]`)で描画。WorkflowDiffReplaceModal は元から共通Modalで高さ指定なし（既定高さ）。E2Eで375px時にモーダル下端がviewport下端に接し、1280pxでは中央配置。E2E: `frontend/e2e/settingsResponsive.spec.ts` （ファイル全体で24テスト、うちAC-9は17件。`SHEET_TARGETS` と `EXTRA_SHEET_TARGETS` の各ダイアログを375px/1280pxで検証）。Escapeによる閉じる操作の検証は本PBIの対象外（別PBI D-1） | 2, 3 | `components/common/__tests__/Modal.test.tsx`, `components/__tests__/ParamTypeMasterModal.test.tsx`, `.../BaseModelSection.test.tsx` / `e2e` | T2, T4, T5, T7, T15, T18, T20〜T22, T24〜T30 |
| AC-10 | タブ切替で`prompt-surgeon-settings-active-tab`が更新、VRAM上限変更で`prompt-surgeon-vram-guard-limit`が更新、再マウントで復元、`localStorage`例外でもクラッシュしない | 2 | `pages/SettingsPage/hooks/__tests__/useSettingsTab.test.tsx`, `.../VramGuardSection.test.tsx` | T1, T12 |

## 3. 統合/E2Eフロー

1. **IF-1 タブ永続化往復**: `MemoryRouter('/settings')`→タブ「④」選択→`localStorage[active-tab]==='translation'`→アンマウント→再マウントで④が選択。
2. **IF-2 ParamTypeMaster排他遷移**: 「カスタム型マスタ」→一覧モーダル→「新規」→一覧が閉じフォームのみ`dialog`→キャンセル→一覧へ復帰。`getAllByRole('dialog')`が常に1件。
3. **IF-3 統合エディタ**: promptタブ→種別「干渉タグ診断」→本文編集→種別「Scene Generator」へ切替→本文/パラメータ切替→戻ると**編集中draftが保持**される（未保存draft非破壊: SPEC_SETTINGS §3-1）。
4. **IF-4 口調テスト**: 一覧から選択→入力→実行→結果表示。
5. **IF-5 VRAM draft連動**: スライダー操作→線位置/タグ/色が同期→保存→`updateVram`1回。保存失敗→draft維持＋「未保存」。
6. **E2E-1 (Playwright, Tier3)**: `/settings`を`page.route('**/api/**')`でスタブし、viewport幅 375/767/768/1279/1280 でレイアウト実測（下記境界表）。dev serverが無ければ **INCONCLUSIVE**。

## 4. 境界値・Red Teamケース

### 4.1 Viewport境界（E2E-1、PBT併用）

| 幅 | 期待 |
|---|---|
| 767px | タブバー横スクロール＋短縮ラベル、MappingMasterはカード表示、モーダルはボトムシート、操作要素>=44px |
| 768px | カード→通常行、タブは`md:grid-cols-5`長ラベル、モーダルは中央配置、下部nav用余白`md:pb-5` |
| 1279px | 1カラム（WF→Mapping→Base）、2カラム化していない |
| 1280px | `xl`2カラム（左: WF+Base、右: Mapping）、左右カードの上端が揃い、左カード間に空隙がない |
| 1024/1023px | SPEC_COMMON 規定のnav境界とSettings余白が矛盾しない（`md:pb-5`） |

fast-check: `fc.integer({min:320,max:2560})` に対し、分類関数（テスト用ヘルパ）が `<768 mobile / 768..1279 single / >=1280 dual` の排他全域であること（CSS文字列のメディアクエリ境界値が767/768/1279/1280のみ）をassert。

### 4.2 Red Team / 異常系

| ID | ケース | 期待 |
|---|---|---|
| RT-1 | `localStorage`に不正値（`"abc"`, `"NaN"`, `"-5"`, `"999"`, `""`, 非ASCII）を`vram-guard-limit`に仕込む | `readStoredVramLimit`は2.0〜14.0にclampまたは既定4.0。PBT |
| RT-2 | `localStorage.setItem`が例外（quota） | 画面はクラッシュせず操作継続、VRAM保存APIは影響を受けない |
| RT-3 | `active-tab`に不正値/他タブ名のhash併存 | 有効hash優先、不正はworkflowsへ`replace`（既存仕様の回帰） |
| RT-4 | `prompt-surgeon-settings-details-expanded-v2` 既存値`{prompt:true,dialogue:false}`、欠落キー、不正JSON、配列 | スキーマ`{prompt,dialogue}`のまま復元/書込。ParamType/BaseModelモーダル開閉でキーが**増えない**（`Object.keys===['prompt','dialogue']`） |
| RT-5 | モーダル二重オープン連打（ParamType「カスタム型マスタ」と「ステージ管理」） | 同時に開く`dialog`は1つ（排他） |
| RT-5b | RT-5の唯一の例外: MappingMasterEditModal 内で WorkflowNodePicker を開く（共通Modalのネスト） | 同時に開く`dialog`は外側+内側の2つまで。外側は`closeOnEsc={!isNodePickerOpen}`でEscを無視し、Escは内側（WorkflowNodePicker）のみを閉じる。Escape閉じ操作そのものの検証は本PBI対象外（別PBI D-1） |
| RT-6 | 口調テスト: 空入力、連打、応答順序逆転、API拒否 | 実行ボタン無効化、最新結果のみ表示、エラー`role=alert` |
| RT-7 | ログ取得: Manager停止/504/空ログ/巨大ログ(10万字) | メッセージ表示、`pre`は`max-h`＋`overflow-auto`、UI固まらない |
| RT-8 | VRAM: `total=null`/`free=null`/min=max境界(2.0,14.0)/total<min | 線は0〜100%にclamp、NaN描画なし |
| RT-9 | 44px: `button`/`select`/`input`/`checkbox label`/`︙`メニュー項目 | E2Eで`boundingBox.height>=44 && width>=44`（アイコンボタンは`before:-inset-2`ヒットスロップで有効領域確保） |
| RT-10 | MappingMasterに`expected_class_types`が0/1/10件、`variants`が0/1/20件 | `+N classes`/`+N stages`表記が正、バッジが折返しで欠落しない |
| RT-11 | 長い名前（200字）/英単語連続のRole名 | `min-w-0 truncate`で横スクロール発生なし、**`aria-label`は全文保持**（重要情報非省略） |
| RT-12 | UI不変条件: グローバル`font-size`底上げ、生`100vh`、中央モーダルの混入 | `backend\.venv\Scripts\python scripts/verify_ui_invariants.py` が0終了 |
| RT-13 | `SettingsPage`が`dialogue`/`translation`/`workflows`の既存統合テスト（SpeechTone CRUD、ワークフロー対応付け、辞書）を壊さない | `src/pages/SettingsPage`全体のvitestがグリーン |

## 5. 契約不変の検証（API/DB）

- 各Task完了時の差分に `frontend/src/api/**`, `backend/**`, `docs/system/openapi.yaml` が含まれないこと（`git diff --name-only` で確認）。
- 既存の`getVram`/`updateVram`/`rewrite`/`logs`/`llmPromptsApi` 呼び出しの引数形状は既存テストのアサーション（`toHaveBeenCalledWith`）で維持される。
- `prompt-surgeon-settings-details-expanded-v2` のスキーマ維持はRT-4で固定。

## 6. 検証コマンド（プロジェクトコンテキストの3-Gate）

Gate 1:
- `backend\.venv\Scripts\python scripts/verify_ui_invariants.py`
- `cd frontend; npm run typecheck`
- `cd frontend; npx vitest run src/utils src/components/**/__tests__`（PowerShellではglob展開に注意し、`npx vitest run src/components` も併用）
- `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict`

Gate 2:
- `cd frontend; npm test`（全件）
- 局所: `cd frontend; npx vitest run src/pages/SettingsPage`

Gate 3:
- `cd frontend; npx playwright test e2e/settingsResponsive.spec.ts`（dev server 5173 起動前提。未起動なら実行不能として INCONCLUSIVE を記録）

Backend変更はないため backend pytest/mypy は受け入れ対象外（リグレッション確認のみ任意）。

## 7. 受け入れマトリクス（dev-verify用ひな形）

| AC | 自動テスト | E2E | 手動/証跡 | 判定 |
|---|---|---|---|---|
| AC-1〜AC-10 | 上表のケース名フィルタ | E2E-1 | dev-verifyが実行ログを添付 | 未実施 |
