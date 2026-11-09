# Test Plan: REQ-248

## 1. Test Architecture & Overview

本テスト計画は、PBI `REQ-248`（OpenAPI JSONへの一本化とopenapi-typescriptによるFE型生成・同期チェック）に対する統合・受入・境界・異常系（Red Team）検証方針を定義する。

FastAPI スキーマ静的出力、`openapi-typescript` による FE 型生成、FE 手書き型の移行、Contract Drift（乖離）検知チェック、および YAML 廃止に伴う契約テストの JSON 一本化を網羅的に検証する。

---

## 2. Test Placement Plan [W-DD-PLACE]

ガバナンス規約（`SPEC-TESTING v2.1` / `[W-DD-PLACE]`）に従い、チケット番号（`req\d+` や `REQ-\d+`）を含むテストファイルの新設は厳禁である。既存の配置規約に従い、コロケーションまたはレイヤー別の既存テストファイルを拡張する。

| 対象コンポーネント / AC | 配置ファイル | レイヤー / 種別 | 説明 |
|---|---|---|---|
| **AC-1, AC-4 (BE)** | `backend/tests/unit/test_export_openapi.py` | Unit | `scripts/export_openapi.py` の副作用なし出力、再現性、および `--check` 差分検出を検証 |
| **AC-5** | `backend/tests/governance/test_openapi_contract.py` | Governance / Integration | `docs/openapi.yaml` 依存を全廃し、`backend/openapi.json` を正本とする契約一致検証 |
| **AC-2, AC-3, AC-4 (FE)** | `frontend/src/api/__tests__/client.test.ts` | Integration / Unit | `openapi-typescript` 生成型と手書き互換型、クライアント通信・照合・エラー処理の整合性検証 |
| **AC-4 (System)** | `backend/tests/unit/test_export_openapi.py` | System Integration | `scripts/verify_openapi_sync.py` による BE/FE 統合同期検査の正常系・異常系検証 |

すべてのテストケースには、テストランナーおよびレポートで追跡可能な形式で `[REQ-248/AC-n]` プレフィックスを付与する。

---

## 3. Execution Tiers & Case Hierarchy

### Tier 1: Static Typecheck & Unit Logic (高速即時検出 / Zero-GPU)
- **FE Typecheck**: `cd frontend && npm run typecheck`
  - 対象: `frontend/src/api/schema.ts`, `frontend/src/api/types.ts`, `frontend/src/api/domains/generation.ts`
  - 判定: 型エラー 0 件。
- **BE Typecheck**: `mypy backend`
  - 対象: `backend/app/main.py`, `backend/tests/governance/test_openapi_contract.py`
  - 判定: 型エラー 0 件。
- **BE Unit Tests**: `backend\.venv\Scripts\python -m pytest backend/tests/unit/test_export_openapi.py`
  - Case `test_req248_ac1_export_openapi_no_side_effects`:
    - Given: FastAPI アプリケーション定義
    - When: `scripts/export_openapi.py` を実行
    - Then: lifespan, DB初期化, worker, 外部サービス起動の副作用が一切なく `backend/openapi.json` が生成されること。
  - Case `test_req248_ac1_export_openapi_idempotent`:
    - Given: 生成された `backend/openapi.json`
    - When: 同一条件で再実行
    - Then: バイト単位で完全一致（不要な差分ゼロ）すること。
  - Case `test_req248_ac4_export_openapi_check_drift_detection`:
    - Given: 実装スキーマと保存 JSON に乖離がある状態（テンポラリファイル等でテスト）
    - When: `python scripts/export_openapi.py --check` を実行
    - Then: 非ゼロ（exit 1）で終了し、管理対象ファイルを書き換えないこと。一致時は exit 0。
- **FE Unit Tests**: `cd frontend && npx vitest run src/api/__tests__/client.test.ts`
  - Case `[REQ-248/AC-2] openapi-typescript generates reproducible schema types`:
    - `openapi-typescript` により生成された `schema.ts` の `components['schemas']` が存在し型定義が完全であること。
  - Case `[REQ-248/AC-3] frontend API types align with generated schema`:
    - `types.ts` および `domains/generation.ts` の型が生成スキーマを参照し、手書き型との互換性が保たれていること。
  - Case `[REQ-248/AC-4] openapi-typescript check detects schema drift`:
    - `npm run openapi:check` が同期時に exit 0、ファイル不整合時に非ゼロ終了すること。

### Tier 2: Integration Test Suite (状態遷移・API契約・DB統合 / Zero-GPU)
- **Governance Contract Tests**: `backend\.venv\Scripts\python -m pytest backend/tests/governance/test_openapi_contract.py`
  - Case `test_req248_ac5_unified_json_contract_without_yaml`:
    - Given: `docs/openapi.yaml` が削除された状態
    - When: 全契約テストを実行
    - Then: `backend/openapi.json` が唯一の正本として参照され、YAML 参照が一切残らず全アサーションが PASS すること。
- **FE API Client Integration**: `cd frontend && npm test`
  - Case `[REQ-248/AC-3] client request, response, cancellation, and error flows preserve contract`:
    - 正常系・失敗・応答不明（unconfirmed）照合・再送防止・キャンセルフローにおいて、型エラーなく既存のランタイム挙動が維持されること。
- **System Sync Integration**:
  - Case `test_req248_ac4_integrated_verify_sync_script`:
    - `python scripts/verify_openapi_sync.py` を実行し、BE/FE の両方が正常な場合は exit 0、いずれかに差分がある場合は exit 1 を返しファイルを一切書き換えないこと。

### Tier 3: E2E & Red Team Scenarios (境界・異常系 / Zero-GPU)
- **Red Team 1 (BE スキーマ不整合の強制注入)**:
  - 保存済み `backend/openapi.json` の一部フィールドを意図的に削除したテンポラリ状態で `python scripts/export_openapi.py --check` を実行。exit code 1 が返り、ファイルが自動更新されないことを確認。
- **Red Team 2 (FE 型不整合の強制注入)**:
  - `frontend/src/api/schema.ts` にダミー行を追加した状態で `npm run openapi:check` を実行。`Generated types are not up-to-date!` が出力され非ゼロ終了することを確認。
- **Red Team 3 (YAML 参照の完全排除スキャン)**:
  - `git grep "docs/openapi.yaml"` を実行し、現行コード・仕様書（`docs/specs/`）に YAML 参照が残存していないことを確認（過去の完了 PBI 履歴を除く）。
- **Red Team 4 (ゼロGPU保証)**:
  - すべての単体・統合テストおよび検証スクリプトが GPU/VRAM を一切消費せず（Zero-GPU）、ComfyUI 等の別プロセスと競合しないことを確認。

---

## 4. Risk Assessment & Mandatory Full-Suite Fallback Analysis

### 4.1 リスク分類
- **分類**: `High Risk`
- **根拠**:
  1. 公開 API 契約（`backend/openapi.json`）の全面同期および正本一本化を伴う。
  2. プロジェクト共通の型定義（`frontend/src/api/types.ts` 等）のリファクタリングを含み、フロントエンド全域に影響する。
  3. 新規依存（`openapi-typescript`）および CI/Gate 1 検証経路（`scripts/verify_openapi_sync.py`）を追加する。
  4. 既存ファイル（`docs/openapi.yaml`）の廃止・削除を伴う。

### 4.2 Mandatory Full-Suite Fallback の発動条件
高リスク変更に該当するため、**V2 Opt-In は厳格に禁止**され、**V1 Baseline（デフォルト）による全件検証が必須**となる。

| 検証フェーズ | 必須実行コマンド | 合否基準 |
|---|---|---|
| **Gate 1** | `backend\.venv\Scripts\python scripts/verify_ui_invariants.py`<br>`backend\.venv\Scripts\python scripts/verify_test_naming.py --strict`<br>`backend\.venv\Scripts\python scripts/verify_openapi_sync.py`<br>`cd frontend && npm run typecheck`<br>`mypy backend` | すべて exit code 0、エラー・警告ゼロ |
| **Gate 2** | `backend\.venv\Scripts\python -m pytest`<br>`cd frontend && npm test` | ファイルフィルタなしの完全ディスカバリ実行で全件 PASS、予期せぬスキップゼロ |
| **Gate 3** | Red Team 境界系テストケース群の独立検証 | 異常系注入時に期待通り exit 1 で防御され、副作用が生じないこと |

---

## 5. Environment & Collection Design
- **実行環境**: Windows (PowerShell), Python 3.12 (venv: `backend\.venv`), Node.js v22.23.2, npm 9.7.1。
- **テストフレームワーク**: pytest 9.1 (pytest-xdist, pytest-asyncio, respx), Vitest 1.6 (MSW 2.3)。
- **コレクション整合性**: テスト実行時にコレクションエラー、空コレクション、テスト除外・deselection が発生した場合は即時 FAIL とする。
