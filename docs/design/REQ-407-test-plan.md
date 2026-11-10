# REQ-407 実行可能テスト計画 (Executable Test Plan)

## 1. 概要と検証方針 (Verification Principles)

### 1.1 文書変更の検証方針
本 PBI は文書改修（chore・document）であり、プロダクションコードやテストコードの変更は伴わない（AC-7）。
doc-reviewer による受入検証は、以下の 6 大検証観点および実コマンド試行に基づいて客観的証拠（Evidence）を収集して判定する：
1. **意味的一致 (Meaning)**: 手順書の指示に従って実行した際に、追加の暗黙知識なしで Gate 3 E2E が成立すること（AC-1）。
2. **非矛盾性 (Contradictions)**: `.agents/context.md`、`docs/specs/SPEC_TEST_ARCHITECTURE.md` §6、`README.md` の 3 文書間で、正式コマンド・前提条件・失敗事象の記述が完全に整合していること（AC-4）。
3. **適用範囲・網羅性 (Applicability & Scope)**: 現行の全アクティブ文書において `npx playwright test` が言及されている箇所がすべて AC-2/AC-3 の要件を満たしていること（AC-5）。
4. **参照整合性 (References)**: 文書内の相対リンク、ファイルパス、ポート番号、コマンド名が実環境と一致していること。
5. **受入基準 (AC) 照合**: AC-1 〜 AC-7 の全受入基準に対する Given-When-Then の充足。
6. **実コマンド試行 (Agent Trials)**: エージェントおよび人間の視点で実際に CLI コマンドを実行し、手順書通りの挙動を示すことを確認。

---

## 2. 受入基準 (AC) 対照テストマトリクス

| AC ID | 検証観点 | 検証内容 | 検証方法 / コマンド | 合格基準 (Pass Criteria) |
|---|---|---|---|---|
| **AC-1** | 手順書実行の自律成立 | dev server 未起動環境で手順書（`.agents/context.md`）の正式コマンドを実行 | ポート 5173 閉塞状態で `backend\.venv\Scripts\python scripts/run_e2e.py e2e/stickyHeader.spec.ts` を実行 | 接続拒否エラー 0 件、テスト実行完了、exit 0、実行後にサーバープロセスが完全終了 |
| **AC-2** | 正式コマンド明記 | 正式な Gate 3 が `scripts/run_e2e.py` であることが明記されているか | 3 文書の目視・テキスト照合 | 正式コマンドとして `scripts/run_e2e.py`（または `backend\.venv\Scripts\python scripts/run_e2e.py`）が明記され、直接実行は前提が必要と明記 |
| **AC-3** | 直接実行の前提併記 | `npx playwright test` の直接実行コマンドに前提条件が併記されているか | 3 文書の目視・テキスト照合 | 「dev server 5173 の事前起動が必須」「未起動時は接続拒否で失敗」が同一箇所に明記 |
| **AC-4** | 3文書間の非矛盾 | 対象 3 文書相互間で記述内容が一致しているか | 3 文書の Gate 3 セクションの並列比較 | 正式コマンド、前提条件、ポート番号（5173）、失敗理由に矛盾が一切ないこと |
| **AC-5** | 現行文書の全件網羅 | 現行文書全域で `npx playwright test` がすべて AC-2/AC-3 を満たすか | `git grep -n "npx playwright test" -- "*.md" ":!docs/logs/**" ":!docs/backlog/task/archive/**" ":!docs/backlog/pbi/archive/**" ":!docs/design/REQ-[0-9]*"` | 見つかったすべての現行文書の記述が AC-2 および AC-3 を満たしていること |
| **AC-6** | 検証対象・件数維持 | Gate 3 のテスト収集件数・対象が変わっていないか | `cd frontend; npx playwright test --list` | 340 tests in 8 files（着手前と完全一致）、本番専用 prod は既定対象外のまま維持 |
| **AC-7** | 変更範囲の限定 | 変更が文書および PBI・設計記録のみに限定されているか | `git diff --stat` | コードファイル（`*.py`, `*.ts`, `*.tsx`）、Playwright 設定、`verification.json` の変更が 0 件 |

---

## 3. 詳細検証手順 (Verification Steps)

### 3.1 AC-1: 手順書どおりの E2E 自律成立確認 (実コマンド試行)
- **目的**: dev server が起動していない状態で手順書の指示に従って実行し、E2E が自律的に完了することを実証する。
- **手順**:
  1. ポート 5173 が開いていないことを確認:
     ```bash
     backend\.venv\Scripts\python -c "import socket; s = socket.socket(); print('OPEN' if s.connect_ex(('127.0.0.1', 5173)) == 0 else 'CLOSED'); s.close()"
     ```
     期待出力: `CLOSED`
  2. 手順書の正式コマンドで局所 E2E を実行:
     ```bash
     backend\.venv\Scripts\python scripts/run_e2e.py e2e/stickyHeader.spec.ts
     ```
  3. 実行結果およびログを確認:
     - dev server が自動起動し、Playwright が実行されること
     - `net::ERR_CONNECTION_REFUSED` による失敗が 0 件であること
     - 2 passed、exit code 0 であること
  4. 終了後にポート 5173 が自動停止していることを再確認:
     期待出力: `CLOSED`

### 3.2 AC-2 & AC-3: 正式コマンドの明記と直接実行時の前提併記確認
- **目的**: 対象 3 文書において、正式コマンドと直接実行時の前提条件（ポート 5173 事前起動、未起動時の失敗事象）が同一箇所に明瞭に併記されていることを確認する。
- **手順**:
  1. `.agents/context.md`:
     - `Playwright E2E Suite (正式)` として `backend\.venv\Scripts\python scripts/run_e2e.py` が記載されていること。
     - `直接実行 (非推奨・前提要)` として `cd frontend; npx playwright test` が記載され、Vite dev server `http://localhost:5173` の事前起動必須と未起動時の接続拒否失敗が併記されていること。
  2. `docs/specs/SPEC_TEST_ARCHITECTURE.md` §6:
     - 実行ゲート表の Gate 3 推奨コマンドが `backend\.venv\Scripts\python scripts/run_e2e.py` であること。
     - 脚注 ※1 および局所実行の例において、直接実行時の前提（ポート 5173 事前起動）と未起動時の失敗理由が明記されていること。
  3. `README.md`:
     - 「正式な実行方法」として `backend\.venv\Scripts\python scripts/run_e2e.py` が明記されていること。
     - 「直接実行する場合（非推奨・前提条件）」として、事前起動必須と接続拒否失敗が同一セクションに明記されていること。

### 3.3 AC-4: 3文書間の非矛盾照合
- **目的**: 3 文書の記述を比較し、用語・ポート番号・コマンド形式に齟齬がないことを確認する。
- **照合観点**:
  - 正式スクリプト名: いずれも `scripts/run_e2e.py`
  - 前提ポート: いずれも `5173`（`http://localhost:5173`）
  - 失敗理由: いずれも接続拒否（`net::ERR_CONNECTION_REFUSED`）
  - サーバーの自律起動・終了挙動の記述の一致

### 3.4 AC-5: 現行文書の全件網羅検索 (Grep Check)
- **目的**: 変更後のリポジトリ全域を検索し、AC-2/AC-3 を満たさない `npx playwright test` の単独記述が残存していないことを確認する。
- **実行コマンド**:
  ```bash
  git grep -n "npx playwright test" -- "*.md" ":!docs/logs/**" ":!docs/backlog/task/archive/**" ":!docs/backlog/pbi/archive/**" ":!docs/design/REQ-[0-9]*"
  ```
- **合否判定**:
  ヒットしたすべての箇所（対象 3 文書および本 PBI の設計・タスクカード）において、AC-2 および AC-3 が完全に満たされていること。

### 3.5 AC-6: Gate 3 検証対象・収集件数の不変確認
- **目的**: 文書改修によりテスト収集設定や対象が意図せず変更されていないことを確認する。
- **手順**:
  1. テスト一覧の収集コマンドを実行:
     ```bash
     cd frontend; npx playwright test --list
     ```
  2. 出力の最終行を確認:
     - 期待値: `Total: 340 tests in 8 files`
  3. 本番バンドル専用 E2E の除外確認:
     - `frontend/playwright.config.ts` の `testIgnore: ['**/prod/**']` が維持されていること。

### 3.6 AC-7: 変更範囲の限定確認 (Git Diff Audit)
- **目的**: 変更が文書および PBI・設計記録のみに限定されていることを確認する。
- **手順**:
  ```bash
  git diff --stat origin/main...HEAD
  # または作業ツリー差分
  git status --porcelain
  ```
- **合否判定**:
  変更されたファイルが以下の区分のみであること:
  - `.agents/context.md`
  - `docs/specs/SPEC_TEST_ARCHITECTURE.md`
  - `README.md`
  - `docs/backlog/pbi/active/REQ-407.md`
  - `docs/design/REQ-407*`
  - `docs/backlog/task/active/REQ-407*`
  プロダクションコード（`backend/`, `frontend/src/`）、テストコード（`tests/`, `e2e/`）、スクリプト（`scripts/`）、設定ファイル（`playwright.config.ts`, `verification.json`）の変更が 0 件であること。

---

## 4. シナリオ検証 & Red Teaming (正常系・異常系・保全性)

### シナリオ RT-1 (異常系 / 課題の再現検証): dev server 未起動時の直接実行失敗
- **Given**: ポート 5173 が閉塞（dev server 未起動）の状態。
- **When**: `cd frontend; npx playwright test e2e/headerMenuRoutes.spec.ts` を直接実行する。
- **Then**: テストが `page.goto('/')` で `net::ERR_CONNECTION_REFUSED` により失敗すること。手順書に記載した「未起動時は接続拒否で失敗する」という説明が事実と一致していることを裏付ける。

### シナリオ RT-2 (正常系 / 前提充足時の直接実行): dev server 起動済み環境での直接実行
- **Given**: 別ターミナルで `cd frontend; npm run dev -- --port 5173` が起動しており、ポート 5173 が接続可能である状態。
- **When**: `cd frontend; npx playwright test e2e/stickyHeader.spec.ts` を実行する。
- **Then**: テストが正常に PASS すること。手順書に記載した「ポート 5173 が事前起動済みであれば直接実行も成立する」という説明が事実と一致していることを裏付ける。

### シナリオ RT-3 (境界・異常系 / ポート競合ガード): ポート使用中の `run_e2e.py` 二重起動防止
- **Given**: ポート 5173 が既に開いている状態（他プロセスまたは手動 dev server が稼働中）。
- **When**: `backend\.venv\Scripts\python scripts/run_e2e.py` を実行する。
- **Then**: `port 5173 is already in use; stop the other server first` と標準エラーに出力され、exit code 1 で安全に終了すること。既存プロセスを破壊しないこと。

### シナリオ RT-4 (保全性検証): Gate 1 および Gate 2 への非干渉確認
- **Given**: 本 PBI の文書変更候補。
- **When**: Gate 1 静的型チェック（`mypy backend`, `npm run typecheck`）および規約チェック（`verify_test_naming.py`）を実行する。
- **Then**: 全て PASS すること。テスト命名規約やコード型定義に一切の悪影響を与えていないことを確認する。