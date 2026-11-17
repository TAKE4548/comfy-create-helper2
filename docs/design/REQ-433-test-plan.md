# REQ-433 実行可能テスト計画

- **検証プロファイル**: V1 Default Baseline（`.agents/verification.json`）
- **リスク分類**: `low`（UI スタイル・ARIA 属性・Hit-Slop 改善。インフラ/スキーマ/公開契約変更なし。V1 Default Baseline に従い全件ディスカバリを実施する）
- **フォールバック条件（Full-Suite Fallback Triggers）**: 共有フィクスチャ変更、コレクション件数不一致、予期せぬスキップ、環境差異、または未知のリスクが検出された場合は即時フルスイート再実行を行う。

---

## 1. Execution Tier & Case Hierarchy（実行階層とケース定義）

| Tier | 種別 | 目的 | 実行コマンド例 |
|---|---|---|---|
| **Tier 1 (Gate 1)** | 静的チェック・型検査・命名規約 | CSS 不変条件、TS 型整合、テスト命名規約の検証 | `backend\.venv\Scripts\python scripts/verify_ui_invariants.py`, `cd frontend; npm run typecheck`, `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict` |
| **Tier 2 (Gate 2)** | Vitest 単体・コンポーネント統合 | 属性（`data-radius-exempt`, `data-tap-target-exempt`, `role="switch"`, `aria-checked`）、状態切替、ラベル併記、既存機能非破壊の検証 | `cd frontend; npm test`（局所: `npx vitest run <file> -t "REQ-433"`） |
| **Tier 3 (Gate 3)** | Playwright 実ブラウザ E2E | jsdom では検証不能な `index.css` 適用後の実計算スタイル（`getComputedStyle`, `getBoundingClientRect`、`::before` Hit-Slop 寸法）のモバイル（375×667）・デスクトップ（1280×800）検証 | `backend\.venv\Scripts\python scripts/run_e2e.py frontend/e2e/settingsResponsive.spec.ts` / `generateMobileGallery.spec.ts` |

---

## 2. AC-to-Case Mapping & Test Placement Plan（`[W-DD-PLACE]`）

※ SPEC-TESTING v2.1 に準拠し、チケット番号を含む新規テストファイル（`*req433*` 等）は作成せず、以下の**既存コロケーションテストおよび既存 E2E ファイル**へ追記する。各テストケース名には `[REQ-433/AC-n]` プレフィックスを付与する。

| AC | Tier | 追記先テストファイル（既存） | 安定ケース名タグ（Runner ID） | 検証内容 |
|---|---|---|---|---|
| AC-1 | Doc | （`doc-verify` 管轄） | — | `SPEC_COMMON.md` への標準仕様明文化確認 |
| AC-2 | Unit | `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | `[REQ-433/AC-2] dot variant status lamp preserves data-radius-exempt and tap-target-exempt` | `variant="dot"` および内部ドットに `data-radius-exempt` / `data-tap-target-exempt` が付与され、状態テキスト/`aria-label` が維持されること |
| AC-2 | Unit | `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | `[REQ-433/AC-2] service status lamp has data-radius-exempt and state label` | 稼働中/停止中/不明ランプに `data-radius-exempt` と `role="img"` / `aria-label` が付与されること |
| AC-2 | E2E | `frontend/e2e/settingsResponsive.spec.ts` | `[REQ-433/AC-2] mobile status lamps render as true circles without square distortion` | 375×667 モバイルで `ServiceConnectionCard` ランプおよびヘッダー `SystemStatusBadge` ドットが `width === height` かつ `borderRadius >= width / 2`（正円）で描画されること |
| AC-3 | Unit | `frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx` | `[REQ-433/AC-3] boolean and sync/bypass toggle switches expose switch role and exempt attrs` | `ParamPanel` の boolean / paramSync / bypass スイッチが `role="switch"`, `aria-checked`, `data-radius-exempt`, `data-tap-target-exempt` を持ち、ノブにも `data-radius-exempt` があること |
| AC-3 | Unit | `frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx` | `[REQ-433/AC-3] VRAM guard toggle switch preserves pill track exemption and switch role` | `VramGuardSection` スイッチが `role="switch"` とトラック `data-radius-exempt` を持ち、ON/OFF 切替が動作すること |
| AC-3 | E2E | `frontend/e2e/settingsResponsive.spec.ts` & `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-433/AC-3] mobile toggle switches render as pill track with circular knob and 44x44 hit target` | 375×667 モバイルでトラックが横長ピル型（`borderRadius >= height / 2`, `width > height`）、ノブが正円、`::before` Hit-Slop またはラッパーのタップ領域が `>= 44×44px`、クリックで `aria-checked` とノブ位置が変化すること |
| AC-4 | E2E | `frontend/e2e/settingsResponsive.spec.ts` | `[REQ-433/AC-4] desktop viewports preserve toggle switch and status lamp behavior and accessibility` | 1280×800 デスクトップで標準デザイン・キーボード操作（Space/Enter）・`aria-checked`・保存挙動が維持されること |

---

## 3. Red Teaming（境界値・異常系シナリオ）[Gate 3 Baseline]

1. **モバイル極小幅（375×667）での角丸上書き耐性**:
   - `index.css` の `@media (max-width: 767px)` 下で `<button role="switch">` が `min-height: 44px` に引き伸ばされ正方形化しないこと（`height < 44` かつ `width > height`）、かつ `::before` 疑似要素の `getComputedStyle(el, '::before')` による有効タップ領域が `width >= 44px && height >= 44px` を満たすことを実ブラウザで検証する。
2. **押しボタン型トグルの非破壊境界**:
   - `TagChipEditor` のテキスト/チップ切替ボタンや `ServiceConnectionCard` の「ログ ▲/▼」ボタンが誤ってピル型化せず、既存の角丸 8px ボタンとして動作することを検証する。
3. **非活性（`disabled`）および状態不明（`undefined`）時の境界**:
   - `ParamPanel` の同期スレーブ時（`disabled`）および `ServiceConnectionCard` の Manager 未接続時（`不明`）でも正円・ピル型が崩れず、状態テキスト/`aria-label` が維持されることを検証する。

---

## 4. Environment & Collection Design

- **実行環境**: Windows ローカル環境（`backend/.venv/Scripts/python.exe`, Node.js / Vite / Vitest / Playwright Chromium）。GPU 不要（Zero-GPU CPU/RAM のみ）。
- **Gate 1 コマンド**:
  - `backend\.venv\Scripts\python scripts/verify_ui_invariants.py`
  - `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict`
  - `cd frontend; npm run typecheck`
- **Gate 2 コマンド**:
  - `cd frontend; npm test`（全件フィルタなし実行）
- **Gate 3 コマンド**:
  - `backend\.venv\Scripts\python scripts/run_e2e.py frontend/e2e/settingsResponsive.spec.ts`
  - `backend\.venv\Scripts\python scripts/run_e2e.py frontend/e2e/generateMobileGallery.spec.ts`

---

## 5. ツール主導監査 (Tool-Driven Audit)

- **コマンド**: `python C:\Users\audih\.gemini\config\skills\agent-tooling-maintenance\helpers\local_model_adapter.py --context-length 32768 qa-audit --audit-kind qa_evidence --audit-package <PKG_JSON> docs/design/REQ-433-test-plan.md`
- **アンロード**: `python C:\Users\audih\.gemini\config\skills\agent-tooling-maintenance\helpers\local_model_adapter.py unload`
