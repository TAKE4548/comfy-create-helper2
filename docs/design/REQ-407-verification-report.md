# REQ-407 独立文書受入検証報告書 (Document Verification Report)

- **PBI ID**: REQ-407
- **PBI タイトル**: Gate 3 の E2E 実行手順を、手順書どおりに実行して成立するよう直す
- **検証ロール**: doc-reviewer
- **適用スキル**: doc-verify
- **検証日時**: 2026-11-11
- **検証環境**: Windows 11 / PowerShell / Python 3.12 (`backend\.venv`) / Node.js
- **総合判定**: **PASS (合格)**
- **Audit Cache Outcome**: none（ローカルモデル監査キャッシュの利用なし）

---

## 1. 被検証候補の識別情報 (Candidate Identity)

- **Git HEAD Commit**: `ed7049a0d94eafee7d435f7577bdebecdfafeedf`
- **被検証ファイル SHA-256**:
  - `.agents/context.md`: `e8744638a96cbf50abea3a30a7c6757221ba4c88ff2a8f68a7dd0f596abfe0cf`
  - `docs/specs/SPEC_TEST_ARCHITECTURE.md`: `bf9b49796b02220e41f0ba1f9e3bc63333499b1ff99d8111f6879314040095b9`
  - `README.md`: `ad088731df59c44fb4d3a8dd6cf17859ce87236b3e3a44d8f9022511bf708fdb`

---

## 2. 受入基準 (AC) 照合結果マトリクス

| AC ID | 判定 | 要求内容 | 検証結果・具体的エビデンス |
|---|---|---|---|
| **AC-1** | **PASS** | 手順書どおりに実行すると E2E が成立する | ポート 5173 が CLOSED のクリーン環境で `.agents/context.md` 記載の正式コマンド `backend\.venv\Scripts\python scripts/run_e2e.py e2e/stickyHeader.spec.ts` を実行。dev server が自律起動し、接続拒否エラー 0 件でテストが実行完了（2 passed / 2.3s, exit 0）、実行後にポート 5173 が自律的にクリーンアップ（CLOSED）されたことを実測確認。 |
| **AC-2** | **PASS** | 正式な Gate 3 の実行方法が分かる | 3 文書（`.agents/context.md`, `SPEC_TEST_ARCHITECTURE.md` §6, `README.md`）すべてにおいて、正式な Gate 3 コマンドが `scripts/run_e2e.py`（または `backend\.venv\Scripts\python scripts/run_e2e.py`）であることが明記され、直接実行は正式な Gate 3 ではないこと（非推奨・前提要）が明瞭に区別されていることを確認。 |
| **AC-3** | **PASS** | 直接実行する場合の前提が併記される | 3 文書のすべての `npx playwright test` 記載箇所において、「Vite dev server（ポート 5173）の事前起動が必須であること」および「未起動時は接続拒否（`net::ERR_CONNECTION_REFUSED`）で失敗すること」が同一行・同一セクションに併記されていることを確認。 |
| **AC-4** | **PASS** | 手順を載せた文書の記述が互いに矛盾しない | 3 文書間で Gate 3 の実行手順（スクリプト名 `scripts/run_e2e.py`、dev server ポート `5173`、未起動時の失敗事象 `net::ERR_CONNECTION_REFUSED`、サーバーの自律起動・自動終了ライフサイクル）の記述が完全に一致しており、矛盾が 0 件であることを確認。 |
| **AC-5** | **PASS** | 他の箇所に同じ誤記が残らない | 現行アクティブ文書全域を対象とした grep 検索 `git grep -n "npx playwright test" -- "*.md" ":!docs/logs/**" ":!docs/backlog/task/archive/**" ":!docs/backlog/pbi/archive/**" ":!docs/design/REQ-[0-9]*"` を実行。ヒットした箇所（改修対象 3 文書および PBI 正本）の全てにおいて AC-2/AC-3 の要件が完全に満たされ、孤立した直接実行の誤記がリポジトリ内に存在しないことを確認。 |
| **AC-6** | **PASS** | Gate 3 の検証対象と収集件数が変わらない | `cd frontend; npx playwright test --list` を実行し、着手前と同じ `Total: 340 tests in 8 files` が収集されることを確認。`frontend/playwright.config.ts` の `testIgnore: ['**/prod/**']` が維持され、本番バンドル専用 E2E（`playwright.prod.config.ts`）が既定 Gate 3 の対象外のままであることを確認。 |
| **AC-7** | **PASS** | 変更が文書に限られる | `git diff --stat` および `git status --porcelain` により確認。変更されたファイルは対象 3 文書（`.agents/context.md`, `SPEC_TEST_ARCHITECTURE.md`, `README.md`）および本 PBI の管理記録（`REQ-407.md`, 設計書, テスト計画, タスクカード）のみであり、プロダクションコード、テストコード、`scripts/run_e2e.py`、`playwright.config.ts`、`verification.json` への変更は 0 件であることを確認。 |

---

## 3. doc-verify 観点別詳細チェック結果

### 3.1 意味的一致 (Meaning)
- **判定**: **適合 (PASS)**
- **詳細**: 開発者およびエージェントが、事前知識や追加の暗黙前提なしに手順書記載の Gate 3 正式コマンドを実行した場合、自動的に dev server が立ち上がり E2E が完結する。手順書の記述意図と実環境の挙動が完全に一致している。

### 3.2 非矛盾性 (Contradictions)
- **判定**: **適合 (PASS)**
- **詳細**:
  - 正式スクリプト名: 3 文書とも `scripts/run_e2e.py` で統一。
  - 前提ポート: 3 文書とも `5173`（`http://localhost:5173`）で統一。
  - 失敗エラー名: 3 文書とも接続拒否（`net::ERR_CONNECTION_REFUSED`）で統一。
  - 直接実行の扱い: 3 文書とも「非推奨」「前提条件が必要」「正式な Gate 3 ではない」旨で統一。

### 3.3 適用範囲・網羅性 (Applicability & Scope)
- **判定**: **適合 (PASS)**
- **エビデンス**:
  ```bash
  $ git grep -n "npx playwright test" -- "*.md" ":!docs/logs/**" ":!docs/backlog/task/archive/**" ":!docs/backlog/pbi/archive/**" ":!docs/design/REQ-[0-9]*"
  .agents/context.md:30:- 直接実行 (非推奨・前提要): `cd frontend; npx playwright test`（前提: Vite dev server `http://localhost:5173` の事前起動が必須。未起動時は接続拒否 `net::ERR_CONNECTION_REFUSED` で失敗する）
  README.md:117:`npx playwright test` を直接実行する場合は、**事前に Vite dev server（ポート 5173: `cd frontend && npm run dev`）が起動していること**が必須前提となります。dev server が未起動の状態で直接実行すると、接続拒否（`net::ERR_CONNECTION_REFUSED`）によりテストが失敗します。
  README.md:121:npx playwright test
  docs/backlog/pbi/active/REQ-407.md:17:- **Surface**: ...
  docs/backlog/pbi/active/REQ-407.md:19:- **課題の整理（事実）**: ...
  docs/backlog/pbi/active/REQ-407.md:45:  - Given 手順書が `npx playwright test` を直接実行するコマンドを載せている...
  docs/backlog/pbi/active/REQ-407.md:54:  - When 現行の文書...
  docs/specs/SPEC_TEST_ARCHITECTURE.md:130:※1: `scripts/run_e2e.py` は Vite dev server（ポート 5173）を自律起動・終了する正式な Gate 3 ラッパーである。`npx playwright test` を直接実行することは正式な Gate 3 ではなく、前提として dev server（`http://localhost:5173`）が事前に起動されている必要がある。dev server 未起動の状態で直接実行した場合、接続拒否（`net::ERR_CONNECTION_REFUSED`）によりテストが失敗する。
  docs/specs/SPEC_TEST_ARCHITECTURE.md:138:- E2E 局所実行（直接実行・dev server 5173 起動前提）: `cd frontend; npx playwright test <spec_path>`
  ```
  すべての言及箇所が適切に是正・管理されていることを確認。

### 3.4 参照整合性 (References)
- **判定**: **適合 (PASS)**
- **詳細**: 相対パス `scripts/run_e2e.py`、Windows 実行パス `backend\.venv\Scripts\python`、ポート番号 `5173`、spec パス例 `e2e/stickyHeader.spec.ts` がリポジトリ構造と完全に合致している。

### 3.5 不変条件・維持契約 (Invariants)
- **判定**: **適合 (PASS)**
- **詳細**:
  - `scripts/run_e2e.py` の実装: 差分 0 行
  - `frontend/playwright.config.ts`: 差分 0 行
  - `frontend/playwright.prod.config.ts`: 差分 0 行
  - `.agents/verification.json`: 差分 0 行
  - テスト収集件数: 340 tests in 8 files（変動なし）

---

## 4. シナリオ検証 & Red Teaming (正常系・異常系・保全性)

### シナリオ RT-1 (異常系 / 課題の再現検証): dev server 未起動時の直接実行失敗
- **前提**: ポート 5173 が未起動（CLOSED）の状態。
- **実行コマンド**: `cd frontend; npx playwright test e2e/headerMenuRoutes.spec.ts`
- **結果**: 25 件すべてのテストが `Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/` により即座に失敗（exit code 1）。
- **判定**: **PASS**（手順書に記載した「未起動時は接続拒否で失敗する」という警告が客観的事実と一致することを証明）。

### シナリオ RT-2 (正常系 / 前提充足時の直接実行): インラインスタブまたは起動環境での直接実行
- **前提**: dev server 不要で動作するテスト（`page.route` によるインラインスタブ仕様）または dev server 起動環境。
- **実行コマンド**: `cd frontend; npx playwright test e2e/stickyHeader.spec.ts`
- **結果**: 2 passed (1.0s, exit code 0)。
- **判定**: **PASS**（適切な前提条件が満たされていれば直接実行も成立することを確認）。

### シナリオ RT-3 (境界・異常系 / ポート競合ガード): ポート使用中の `run_e2e.py` 二重起動防止
- **前提**: ポート 5173 を別ソケットで占有（OPEN）した状態。
- **実行コマンド**: `backend\.venv\Scripts\python scripts/run_e2e.py`
- **実測出力**:
  - `STDERR: port 5173 is already in use; stop the other server first`
  - `EXITCODE: 1`
- **判定**: **PASS**（既存プロセスを破壊せず安全にエラー終了するガード機能が正常に作動）。

### シナリオ RT-4 (保全性検証): Gate 1 静的検証への非干渉確認
- **実行コマンド & 結果**:
  1. `backend\.venv\Scripts\python scripts/verify_test_naming.py` -> 規約準拠確認（違反 0 件、exit 0）
  2. `cd frontend; npm run typecheck` -> TypeScript 型検査合格（exit 0）
  3. `backend\.venv\Scripts\mypy backend` -> `Success: no issues found in 183 source files`（exit 0）
- **判定**: **PASS**（文書変更が型定義や規約チェックに一切干渉していないことを確認）。

---

## 5. 検証環境・確認プロセスにおける制約事項 (Limitations)

1. **OS 差異について**: 本検証は Windows 環境下で実施したため、`backend\.venv\Scripts\python` コマンドの実動を確認した。Linux/macOS 環境においては、仮想環境を有効化した上で `python scripts/run_e2e.py` を実行する形式が設計書および README に記載されており、記法として妥当であることを確認している。
2. **E2E 実行件数の選定について**: Gate 3 の自律成立性確認（AC-1）においては、高速かつ確実に検証可能な局所 E2E（`stickyHeader.spec.ts`）を実行した。Gate 3 全体（340 件）の収集件数・対象テストファイル（8 ファイル）については Playwright CLI の `--list` オプションにより全量検証を実施し、不変条件を保証している。
3. **被検証リポジトリの保全**: 検証作業中に実行した命名規約チェックツールの副生成ファイル（`docs/design/REQ-356-test-mapping.md`）は即座に revert し、レビュー対象外の変更が残存しないことを確認済みである。

---

## 6. 独立検証結論 (Final QA Verdict)

**判定: PASS (合格)**

PBI REQ-407 で定義された全ての受入基準（AC-1 〜 AC-7）が完全に充足され、文書間の矛盾、誤記の残存、およびコード・設定ファイルへの意図しない変更が一切存在しないことを確認した。
本改修により、開発者およびエージェントが事前知識なしに Gate 3 を実行して自律的に成立する環境が文書上確立されたと認定する。