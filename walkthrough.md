# REQ-356 検証ウォークスルー報告書

## 総合判定: **FAIL (Gate 2 Test Hygiene & AC-1/AC-15 未達)**

> [!CAUTION]
> **Honest Reporting Principle ([G-01] / [G-02]) に基づく判定**:
> Backend の再構成（unit/, integration/, governance/、SAVEPOINT インターセプター、
espx 遮断、	mp_path 隔離）および Frontend の基盤ヘルパー（storeHelpers, queryHelpers, 
etworkGuard）、Playwright E2E（stickyHeader.spec.ts）は高品質に実装され、テスト自体は全件 PASS（Backend 604件 / Frontend 2182件）しています。
> しかしながら、**Frontend 内に 44 件の旧チケット名テストファイル（
eq334*.test.ts, e2e_req*.test.tsx 等）が未移行のまま残存**しており、workflow_validator.py test-hygiene および scripts/verify_test_naming.py --strict が exit code 1 で失敗するため、受入基準 **AC-1**, **AC-3**, **AC-9**, **AC-10**, **AC-15** が未達（FAIL）と判定されます。

---

## 1. Automated Baseline 3-Gate 検証結果

### Gate 1: 静的型チェック & 高速単体テスト (Typecheck & Fast Unit Baseline)
- **結果**: **PASS (0 errors, 0 failures)**
- **実行ログ要約**:
  - 
pm run typecheck (	sc -b --noEmit in rontend): **PASS (0 errors)**
  - mypy backend: **PASS (Success: no issues found in 173 source files)**
  - Backend Unit + Governance (pytest backend/tests/unit backend/tests/governance -q): **51 passed, 1 warning in 5.80s**
  - Frontend Unit (
px vitest run src/utils src/components/**/__tests__ src/hooks/**/__tests__): **24 test files passed, 318 passed in 13.03s**

### Gate 2: フルテストスイート Baseline (Full Discovery Suite & Test Hygiene)
- **結果**: **FAIL (機能テストは全件PASSだが、Test Hygiene / 命名規約チェックがFAIL)**
- **実行ログ要約**:
  - Backend Full Suite (pytest backend/tests -q): **604 passed, 12 subtests passed in 77.46s** (並列実行 pytest -n auto では **24.39s**)
  - Frontend Full Suite (
pm test): **231 test files passed, 2182 passed in 113.44s**
  - **Test Hygiene Linter (workflow_validator.py test-hygiene REQ-356)**:
    - **FAIL (Exit code 1)**: 44件の TEST_ACCRETION_VIOLATION を検出。
    - 検出例: rontend/src/api/__tests__/req334PreviewApis.test.ts, rontend/src/test/e2e_req207.test.ts 等
  - **Strict Test Naming Validator (scripts/verify_test_naming.py --strict)**:
    - **FAIL (Exit code 1)**: 133件の違反（ファイル名規約違反 AC-1: 44件、テストケース命名規約違反 AC-15: 89件）

### Gate 3: シナリオ・E2E＆Red Teaming (PBI Acceptance & Boundary Verification)
- **結果**: **PASS (シナリオ検証・境界テストは成功)**
- **実行ログ要約**:
  - Playwright E2E (
px playwright test e2e/stickyHeader.spec.ts):
    - Desktop (1280x800): **PASS**
    - Mobile (375x667): **PASS**
    - 実行時間: 1.2s (2 passed)
  - Red Team 1 (外部通信漏洩検出 / Network Breach Injection): **PASS**
    - rontend/src/test/utils/networkGuard.test.ts にて、未許可 WebSocket/Fetch が即時例外を送出することを検証済み。
    - Backend conftest.py の mock_external_services (
espx) により未許可外部通信が遮断されることを実証。
  - Red Team 2 (DB 永続化汚染検出 / DB Mutation Bleed): **PASS**
    - sqlite:///:memory: + SAVEPOINT Commit Interceptor により、コミット操作後もセッション単位で完全ロールバックされ、本番DB汚染ゼロを実証。
  - Red Team 3 (jsdom 擬似スクロール禁止ガード): **PASS**
    - rontend/src 配下の全テストコードを静的走査し、ireEvent.scroll の使用が 0 件であることを確認。

---

## 2. 受入基準 (AC) 網羅性検証表 [MUST [G-02]]

| AC ID | 受入基準 (Given-When-Then) | 検証結果・エビデンス | 判定 |
| :--- | :--- | :--- | :--- |
| **AC-1** | テストファイルのパスに 
eq[0-9]+ / REQ-[0-9]+ を含むものが 0 件 | Backend では 0 件達成 (	est_no_req_naming.py PASS)。しかし Frontend 内に 44 件の旧チケット名テストファイルが依然残存 (scripts/verify_test_naming.py) | **FAIL** |
| **AC-2** | ackend/tests 直下構成が conftest.py, unit/, integration/, governance/ のみ | 	est_backend_tests_hierarchy_and_no_req_naming PASS。直下にフラットなテストファイルは一切存在しない | **PASS** |
| **AC-3** | Frontend のテストが Unit / Pages 結合 / E2E Playwright / 共通ヘルパーに正しく配置されている | src/test/utils/ および rontend/e2e/ は新設配備されたが、src/test/ 直下に 15 件の e2e_req*.test.tsx が移行されず残存 | **FAIL** |
| **AC-4** | Backend 統合テストでコミット後の中断・失敗があっても次テスト開始時に DB が空で本番 DB が不変 | conftest.py の SAVEPOINT Commit Interceptor (
estart_savepoint) により完全ロールバックを保証 | **PASS** |
| **AC-5** | 本番 db/snapshots/ 書き込みゼロ、外部通信 (8188/1234) 遮断、未許可宛先は即時エラー | isolated_snapshot_dir (	mp_path) および 
espx.mock が全テストに自動適用 | **PASS** |
| **AC-6** | Frontend 統合テストで Zustand, React Query, WebSocket, IndexedDB, Storage 状態が持ち越されない | 
esetTestStore(), createTestQueryClient(), MockWebSocketController の共通ヘルパー配備・適用 | **PASS** |
| **AC-7** | Frontend テストで実 fetch / 実 WebSocket 通信ガード有効時に実通信 0 件 | 
etworkGuard.ts 実装、
etworkGuard.test.ts でブロック動作を検証完了 | **PASS** |
| **AC-8** | position: sticky と実スクロールが Playwright (rontend/e2e/) のみで検証され jsdom 擬似スクロール 0 件 | rontend/e2e/stickyHeader.spec.ts で Desktop/Mobile 両検証 PASS。jsdom での ireEvent.scroll 走査 0 件 | **PASS** |
| **AC-9** | grep -rn "REQ-<番号>" で再構成前の各テストが [REQ-xxx/AC-n] 形式でヒットする | 移行済みテストはヒットするが、未移行の 89 テストケースが (REQ-xxx) やチケット名なしのまま残存 | **FAIL** |
| **AC-10** | フルテストスイートが失敗 0 件、かつ対応表 (REQ-356-test-mapping.md) に欠落 0 件 | テスト実行自体は全件 PASS（Backend 604件 / Frontend 2182件）。しかし対応表上で 44 ファイルが移行未完了のまま残存 | **FAIL** |
| **AC-11** | Backend pytest tests/unit と Frontend 単体テストが DB/jsdom 重厚セットアップなしで単独成功 | Backend unit は 5.8s、Frontend unit は 13.03s で単独実行 PASS | **PASS** |
| **AC-12** | Gate 2 合計実行時間が再構成前（約113秒）より短縮され計測値が記録される | Backend は並列実行で 24.39s（旧77sから大幅短縮）。ただし Frontend 全件実行が 113.44s を要しており、未移行テストの残存により全体短縮が部分未達 | **PARTIAL** |
| **AC-13** | 重複テスト削除時に削除対象と理由が対応表に記録され、記録のない削除が 0 件 | REQ-356-test-mapping.md に削除および移行記録を明記管理 | **PASS** |
| **AC-14** | 並列実行設定で共有リソース衝突失敗が 0 件、並列と逐次で成否が完全一致 | pytest -n auto で 604 件全パス（0衝突）。逐次実行結果と完全一致 | **PASS** |
| **AC-15** | テスト名形式検証スクリプトが成功 (終了コード0) し、PBI 紐づけなしテストが明示される | scripts/verify_test_naming.py --strict 実行時、終了コード 1（133件の違反検出）で FAIL | **FAIL** |

---

## 3. ローカルモデル QA 監査 (qa-audit) 結果

- **使用モデル**: qwen/qwen3.5-9b (LM Studio 0.4.25, context-length 32768, 
easoning_effort=none)
- **実行コマンド**: python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-356-test-plan.md
- **監査結果**: ⚠️ **CRITICAL FAILURES DETECTED / UNACCEPTABLE**
- **主な指摘事項**:
  1. **変数依存・可搬性欠如**: ${GLOBAL_SCRIPTS} や OS 依存の \Scripts 等の環境依存により、実行失敗の抜け道が存在する。
  2. **クリーン状態検証の定量的アサーション不足**: DB クリーン状態やロールバックの検証において、インターセプターの信頼に依存せず、実行前後での直接的な SQL 行数カウントアサーションを明記すべきである。
  3. **事前検証 (Gate 0) の欠如**: ファイル存在確認やツール可用性の Sanity Check が不足している。
- **GPU リソース解放 (VRAM Cleanup)**:
  - python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py unload 実行完了 (Exit code 0)。
  - lms ps --json の出力が [] であることを確認（※LM Studio 経由のモデルアンロードを確認したものであり、システム全体の全 GPU メモリ解放を主張するものではありません）。

---

## 4. 残課題および推奨是正アクション (Remediation Actions)

1. **Frontend レガシーチケット名テストファイル (44件) のリネーム・集約**:
   - rontend/src/api/__tests__/req334*.test.ts
   - rontend/src/test/e2e_req*.test.tsx (15ファイル)
   - *.req334.test.tsx, *.req333.test.tsx, *.req345.test.tsx 等
   - これらを機能・モジュール別の colocated テスト (__tests__/) へ集約・リネームし、ファイル名から 
eq\d+ を完全排除する（AC-1, AC-3）。
2. **テストケース名の [REQ-xxx/AC-n] プレフィックス付与 (89件)**:
   - useGeneratePageState.test.tsx 等に残存する (REQ-159) 等の記法を [REQ-159/AC-n] フォーマットへ修正する（AC-9, AC-15）。
3. **erify_test_naming.py --strict の 0 violations 達成**:
   - 上記対応完了後、厳格モードで終了コード 0 となることを確認して再検証を実施する。

---

## 5. User Disposition & Follow-up PBI Handoff (2026-10-14)

ユーザー承認に基づき、本 PBI（REQ-356）は「テストアーキテクチャ基盤（Backend 100% 移行、SAVEPOINT/respx 多層防護、Frontend 隔離ヘルパー、Playwright E2E、Gate 1/2 高速化、SSoT 同期）の完了」をもって正常クローズとします。
残存する Frontend 44 件のレガシーテストファイル再配置および 89 件のテスト名フォーマット規約化は、新規後続 PBI（REQ-361）へ正式にハンドオフされ、設計から改めて確実に遂行されます。
