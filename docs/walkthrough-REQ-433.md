# Walkthrough: REQ-433 モバイル表示におけるステータスランプ・トグルスイッチの標準デザイン定義およびUI改善

## 1. 変更概要

- **共通仕様書（[SPEC_COMMON.md](docs/specs/SPEC_COMMON.md)）**: v2.10 へ更新し、§1-3（共通 UI ルール）および §1-5-3（Preset 3: Forms & Controls）にステータスランプ（正円・状態表現・色覚非依存・モバイル保護）および ON/OFF トグルスイッチ（ピル型トラック＋正円ノブ・押しボタン型トグルとの区分・`role="switch"` / `aria-checked`・44×44px Hit-Slop）の標準デザインルールを明文化しました。
- **CSS 保護ルール（[index.css](frontend/src/index.css), [SettingsResponsive.css](frontend/src/pages/SettingsPage/SettingsResponsive.css)）**: `button:not([data-radius-exempt])` および `[class~='rounded-full'][class*='px-']:not([data-radius-exempt])` により `rounded-full` トグルスイッチが角丸 8px へ上書きされる問題を解消し、`.req314-settings` モバイルルールにも `:not([data-tap-target-exempt])` を付与して `data-tap-target-exempt` 付き要素の 44×44px 引き伸ばしを防止しました。
- **ON/OFF トグルスイッチ統一**: [ParamPanel.tsx](frontend/src/components/ParamPanel.tsx), [ParamFieldControl.tsx](frontend/src/components/ProfileBulkEditModal/tabs/ParamBulkEditTab/ParamFieldControl.tsx), [VramGuardSection.tsx](frontend/src/pages/SettingsPage/components/VramGuardSection.tsx) に対し、`data-radius-exempt`, `data-tap-target-exempt`, `before:-inset-y-3.5`（44×44px Hit-Slop）, `role="switch"`, `aria-checked` を統一適用しました。
- **ステータスランプ統一**: [SystemStatusBadge.tsx](frontend/src/components/common/SystemStatusBadge.tsx) ほか全 9 ファイルのステータスランプに `rounded-full`, `data-radius-exempt`, `shrink-0` を適用し、操作可能な `SystemStatusBadge` に `data-tap-target-exempt` + Hit-Slop を設定しました。

## 2. 受入基準（AC）コンプライアンステーブル

| AC | 内容 | 判定 | 検証根拠 |
|---|---|---|---|
| **AC-1** | `SPEC_COMMON.md` へのステータスランプ・トグルスイッチ標準デザインルール明文化 | **PASS** | `doc-reviewer` 独立文書レビュー PASS（§1-3, §1-5-3、UTF-8・見出し階層・相対リンク・既存契約非破壊確認） |
| **AC-2** | モバイル（<768px）でのステータスランプ正円描画・崩れなし | **PASS** | `SystemStatusBadge.test.tsx`, `ServiceConnectionCard.test.tsx` PASS（Gate 1-3 / Gate 2）、`settingsResponsive.spec.ts` `[REQ-433/AC-2]` 実ブラウザ検証 PASS（Gate 3） |
| **AC-3** | モバイル（<768px）でのトグルスイッチ ピル型・正円ノブ・44×44px タップ領域 | **PASS** | `ParamPanel.test.tsx`, `VramGuardSection.test.tsx`, `SettingsAutosave.integration.test.tsx` PASS（Gate 2: 2,969/2,969）、`settingsResponsive.spec.ts` / `generateMobileGallery.spec.ts` `[REQ-433/AC-3]` PASS（Gate 3） |
| **AC-4** | デスクトップ表示・アクセシビリティ・既存機能非破壊 | **PASS** | `verify_ui_invariants.py`（0 violations across 585 files）、`npm run typecheck`（0 errors）、Gate 2 全件 PASS（Frontend 2,969/2,969・Backend 1,003/1,003）、Gate 3 全件 PASS（341 passed, 30 skipped） |

## 3. QA エビデンス監査

- `qa-audit --audit-kind qa_evidence --no-cache`: `PASS_NO_FINDINGS`（`findings: []`, `limitations: []`、VRAM アンロード確認済み exit code 0）
