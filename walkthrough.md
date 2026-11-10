# REQ-407 検証完了ウォークスルー報告書 (Walkthrough Report)

## 1. 概要 (Executive Overview)
- **PBI ID**: `REQ-407`
- **タイトル**: Gate 3 の E2E 実行手順を、手順書どおりに実行して成立するよう直す
- **判定結果**: **PASS (合格)**
- **変更種別**: `document` (文書是正)
- **検証プロファイル**: V1 Baseline (`.agents/verification.json`)
- **実施者**: doc-reviewer (独立文書検証ゲート) / coordinator

本改修では、Gate 3（実ブラウザ E2E）の実行手順書において、Vite dev server（5173）の事前起動が必須であるにもかかわらず単独の `npx playwright test` が記載されていた不備を是正しました。
正式なラッパー `scripts/run_e2e.py`（dev server の自律起動・終了）を案内し、直接実行時の前提条件（ポート 5173 起動必須、未起動時の `net::ERR_CONNECTION_REFUSED` 失敗）を全文書に併記しました。
Gate 1（静的検証・型チェック）、Gate 2（フルテストスイート）、Gate 3（E2E 自律実行・シナリオ検証）の独立実行および受入基準 AC-1 〜 AC-7 の全件適合を確認しました。

---

## 2. 変更対象ファイル (Modified Files)
1. `.agents/context.md`: Gate 3 の正式コマンドおよび直接実行前提条件を明記
2. `docs/specs/SPEC_TEST_ARCHITECTURE.md`: §6 実行ゲート表・局所実行注記を是正
3. `README.md`: Gate 3 セクションに正式ラッパーおよび直接実行時の前提条件を併記

※プロダクションコード、テストコード、設定ファイル（`playwright.config.ts`, `verification.json` 等）への変更は 0 件です。

---

## 3. 受入基準 (AC) 充足状況マトリクス (Acceptance Criteria Compliance Matrix)

| AC番号 | 受入基準 (Given-When-Then) | 判定 | 検証エビデンス・テストケース |
|---|---|:---:|---|
| **AC-1** | 手順書どおりに実行すると E2E が成立する | **PASS** | ポート 5173 CLOSED のクリーン環境で `.agents/context.md` 記載の正式コマンド `backend\.venv\Scripts\python scripts/run_e2e.py e2e/stickyHeader.spec.ts` を実行。dev server が自律起動し、接続拒否 0 件でテスト完了（2 passed / 2.3s, exit 0）、実行後にポート 5173 が自動停止（CLOSED）したことを確認。 |
| **AC-2** | 正式な Gate 3 の実行方法が分かる | **PASS** | 対象 3 文書すべてにおいて、正式な Gate 3 コマンドが `scripts/run_e2e.py` であることが明記され、直接実行は正式な Gate 3 ではないこと（非推奨・前提要）が明瞭に区別されていることを確認。 |
| **AC-3** | 直接実行する場合の前提が併記される | **PASS** | 3 文書のすべての `npx playwright test` 記載箇所において、「Vite dev server（ポート 5173）の事前起動が必須」「未起動時は接続拒否 `net::ERR_CONNECTION_REFUSED` で失敗」が同一箇所に併記されていることを確認。 |
| **AC-4** | 手順を載せた文書の記述が互いに矛盾しない | **PASS** | 3 文書間でスクリプト名、ポート 5173、失敗エラー名、自律起動・終了ライフサイクルの記述が完全一致し、矛盾 0 件であることを確認。 |
| **AC-5** | 他の箇所に同じ誤記が残らない | **PASS** | `git grep -n "npx playwright test"` により現行アクティブ文書全域を検索。ヒットした全箇所（対象 3 文書および PBI 正本）で AC-2/AC-3 が満たされ、孤立した誤記が残存していないことを確認。 |
| **AC-6** | Gate 3 の検証対象と収集件数が変わらない | **PASS** | `cd frontend; npx playwright test --list` により着手前と同じ `Total: 340 tests in 8 files` が収集されることを確認。`playwright.config.ts` の `testIgnore: ['**/prod/**']` も維持。 |
| **AC-7** | 変更が文書に限られる | **PASS** | `git diff --stat` および `git status --porcelain` で確認。プロダクションコード、テストコード、`scripts/run_e2e.py`、`playwright.config.ts`、`verification.json` への変更は 0 件。 |

---

## 4. シナリオ検証 & Red Teaming (正常系・異常系・保全性)
- **RT-1 (異常系 / 課題再現)**: dev server 未起動環境で `npx playwright test e2e/headerMenuRoutes.spec.ts` を直接実行し、25 件全件が `net::ERR_CONNECTION_REFUSED at http://localhost:5173/` で失敗することを確認（手順書の警告内容の実証）。
- **RT-2 (正常系 / 前提充足)**: `npx playwright test e2e/stickyHeader.spec.ts` の直接実行が 2 passed (1.0s, exit 0) で成立することを確認。
- **RT-3 (境界・異常系 / ポート競合ガード)**: ポート 5173 使用中に `run_e2e.py` を実行すると `port 5173 is already in use; stop the other server first` が STDERR に出力され exit 1 で安全終了することを確認。
- **RT-4 (保全性)**: `verify_test_naming.py`、`npm run typecheck`、`mypy backend` の全 Gate 1 静的検証が exit 0 で合格し、非干渉を確認。
