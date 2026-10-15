# REQ-365 検証レポート r4 (最終受入: デルタ + フルベースライン)

対象: REQ-365 のコードスコープ (r3 の D-R3-1 修正後: T31 BaseModelSection.tsx / T33 MappingMasterEditModal.tsx / T32 e2e/settingsResponsive.spec.ts)
役割: tester-reviewer (dev-verify)。レビュー対象ソースは read-only、本ファイルのみ作成。r1〜r3 は保持。

## 結論

**PASS** (コードスコープ)。D-R3-1 は実ブラウザで解消を確認。全ゲート緑、AC-1〜AC-10 すべて PASS。未解決の欠陥なし。

## ゲート結果

<execution_evidence>

| ゲート | コマンド (cwd) | 結果 |
| --- | --- | --- |
| Gate 1 型検査 | `npm run typecheck` (frontend; `tsc -b --noEmit`) | exit 0、エラー 0 |
| Gate 2 全テスト | `npx vitest run` (frontend, ファイル指定なし) | 237 files / 2290 tests passed, 0 failed (104s) |
| 不変条件 | `backend\.venv\Scripts\python scripts/verify_ui_invariants.py` | 0 violations (531 files) |
| 命名 | `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict` | 0 violations |
| 変更範囲 | `git diff/status -- frontend/src/api backend openapi*` | api/openapi 変更なし。backend の差分は `tests/integration/legacy/test_comfy_generation_bridge.py` の `from pathlib import Path` 1 行のみ (テスト、REQ-365 外の既存差分) |
| Gate 3 E2E | `npx playwright test e2e/settingsResponsive.spec.ts --reporter=line` ×3 | 48 passed ×3 (32.8s / 34.6s / 35.8s)。初回 (29.1s) も 48 passed |
| Gate 3 E2E 反復 | `... --repeat-each=3 --reporter=line` | 144 passed (1.6m)、flake なし |

開発サーバー 5173 は既に起動済み (HTTP 200)。新規起動なし。
備考: `verify_test_naming.py` は実行時に `docs/design/REQ-356-test-mapping.md` を自動更新するスクリプト仕様 (ファイルは既に作業ツリーで変更済み。今回の検証での追加のソース変更はなし)。

</execution_evidence>

## D-R3-1 再検証 (実ブラウザ、scratchpad の Playwright、API はスタブ、リポジトリ編集なし)

スクリプト: scratchpad `r4spot.mjs` (r3 のスポットチェックに「全ての `.modal-backdrop` が (0,0,vw,vh) と一致」「y=6 の `elementFromPoint` がバックドロップ/ダイアログ内」を全ビューポートで強制する検査を追加)。
対象 13 ダイアログ (BaseModel 3 種を含む) × 375x667 / 1280x900 = 26 ケース。MappingMasterEdit は 40 ノードのワークフローをスタブし、入れ子の WorkflowNodePicker を実際に開いた。

| 観点 | 結果 |
| --- | --- |
| BaseModel manager / create-edit / mapping add (375) | バックドロップ = (0,0,375,667)、y=6 はバックドロップに命中、下端 667 (flush)、上角 16px、ハンドル 1/1、高さ ≤ 566.95px (85%) |
| BaseModel 3 種 (1280) | バックドロップ = (0,0,1280,900)、中央配置、ハンドル非表示、角 16px |
| 入れ子 NodePicker (375 / 1280) | 2 枚のバックドロップとも全画面一致。picker が最前面、viewport 内、下端 flush (375)、遠いノードのクリックと適用ボタンが viewport 内で到達可能 |
| その他 10 ダイアログ (回帰サンプル) | 全て OK (幾何・バックドロップとも変化なし) |
| pageerror | なし |

注: 入れ子ケース (375) はシートが 2 枚重なるため可視ハンドルが 2 (各シート 1 つ) となり、スクリプトの「単一ダイアログ前提で可視 1」判定が FAIL 表示になる。これは仕様どおり (シート毎に 1 つ) であり欠陥ではない。バックドロップ検査は合格。Esc の挙動は D-1 (既存、別 PBI) として計上しない。

## Red Teaming

- RT-A (旧不具合の検出力): 本スクリプトの全バックドロップ検査と e2e の同趣旨アサーションは、r3 で実際に D-R3-1 (y=24、高さ 643) を検出した方式と同じ。今回は全 26 ケースで不一致 0。
- RT-B 入れ子 Modal: 2 枚目のバックドロップも全画面で、背面ヘッダー/下層ダイアログをクリックできない。
- RT-C 境界: 375 と 1280 の両極、40 ノードの長いリストで picker のスクロールとタップ領域を確認。
- RT-D e2e ×3 と `--repeat-each=3` で再現性 (flake なし)。
- 注意: 修正前コードへ戻しての e2e 赤確認はレビュー対象が read-only のため実施していない (限界として明記)。

## AC マトリクス (最終)

| AC | 内容 | 証拠 | 判定 |
| --- | --- | --- | --- |
| AC-1 | workflows 2 カラム (1280) / 1 カラム (1279) の順序、空隙なし | SettingsPage.test.tsx、E2E (×3 / repeat ×3 緑) | PASS |
| AC-2 | 短縮ラベル、横スワイプ、操作要素 ≥44px、下部 nav 余白 | SettingsTabBar.test.tsx、E2E | PASS |
| AC-3 | MappingMaster カード化、BaseModel 表ラベル | MappingMasterSection(.modals).test.tsx、BaseModelSection.test.tsx、E2E | PASS |
| AC-4 | カスタム型マスタのダイアログ化と排他遷移 | ParamTypeMasterManagerModal.test.tsx、実ブラウザ OK (一覧/フォーム) | PASS |
| AC-5 | LLM プロンプト統合エディタ、グループ別パラメータ | llmSettingsGroups.test.ts、LlmSettingsSection.test.tsx (全緑)。モデル表示は共有の読み取り専用 (許容トレードオフ) | PASS |
| AC-6 | 口調テスト実行 | SpeechToneSection.test.tsx | PASS |
| AC-7 | サービス別ログのアコーディオン | ServiceConnectionCard.test.tsx (jsdom のみ) | PASS (jsdom 限定) |
| AC-8 | VRAM スライダーの draft 連動 | VramGuardSection.test.tsx | PASS |
| AC-9 | 全 Settings ダイアログを共通 Modal (ボトムシート) 化 | Modal.test.tsx、各モーダル単体、E2E (12 ダイアログ × 375/1280 のバックドロップ全画面 + ヘッダー遮断アサーション)、上記実ブラウザ 26 ケース全て合格 | **PASS** (D-R3-1 解消) |
| AC-10 | 永続化キー、localStorage 例外耐性 | useSettingsTab.test.tsx、VramGuardSection.test.tsx | PASS |

## 欠陥

なし。D-R3-1 は解消済み。除外 (ユーザー決定済み): D-1 (Esc、フォーカスがダイアログ内)、D-2 (useSettingsTab hash リダイレクト) は既存で別 PBI。QA 監査所見は advisory として受容済み。許容トレードオフ (AC-5 共有モデル表示、デスクトップ Modal 角 16px、GeneratePage WorkflowManageModal のボトムシート、入れ子 Modal の Tab トラップ) は計上しない。

## ローカルモデル QA 監査

今回のデルタ (JSX 構造の移動と e2e 追加のみ、新規ロジックなし) では再実行不要と判断し、実施していない。前回までの監査所見は advisory として受容済み。監査結果は主張しない。

## 制限事項

- AC-7 は jsdom のみ (実ブラウザ E2E なし)。
- 実ブラウザ検証は API スタブ使用、Chromium のみ (WebKit/Firefox、実機のソフトキーボードや safe-area は未検証)。
- 修正前コードでの e2e 赤確認は未実施 (read-only のため)。
- 入れ子 Modal の Tab トラップは範囲外 (許容)。

## ハンドオフ JSON

```json
{
  "pbi_id": "REQ-365",
  "verdict": "PASS",
  "gate_results": {
    "gate_1_typecheck": "PASS (npm run typecheck, 0 errors)",
    "gate_2_full_test_suite": "PASS (vitest 237 files / 2290 tests, 0 failures); ui_invariants 0; test_naming --strict 0",
    "gate_3_scenarios": "PASS (AC-1..10; real-browser 26 cases; e2e 48 x3 + 144 repeat-each=3)"
  },
  "qa_audit_result": "NOT_RERUN (delta only; prior findings advisory-accepted)",
  "audit_findings": [],
  "walkthrough_path": "docs/design/REQ-365-verification-report-r4.md",
  "failure_details": null
}
```
