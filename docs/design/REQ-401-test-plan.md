# REQ-401 テスト計画

- PBI: `docs/backlog/pbi/active/REQ-401.md`
- 設計: `docs/design/REQ-401.md`（Seam Map は §6、タスク分解は §10）
- 命名: 新規テスト名および docstring に `[REQ-401/AC-n]` を付与する（pytest は `-k "REQ-401"` で抽出可能）。チケット番号入りの新規テストファイルは作成せず、既存のテストスイート（`test_generation_service.py`, `test_generation_integration.py`, `test_generation_api.py`）を拡張する。
- 実行場所: リポジトリルート。`PYTHONDONTWRITEBYTECODE=1`。GPU 不使用（CPU/RAM のみ）。

## 1. AC 対応表

| AC | ケース（runner ID） | Tier | Card | 確認方法 |
| --- | --- | --- | --- | --- |
| AC-1 | `backend/tests/integration/legacy/test_generation_service.py::test_req401_ac1_reconcile_upstream_lost_job_transitions_to_unconfirmed_and_closes_normal_group` | unit | T1 | queue 不在かつ history 空のジョブが reconcile で unconfirmed に遷移し、後続通常生成で normal_group_id が新設されることを検証 |
| AC-1 | `backend/tests/integration/legacy/test_generation_integration.py::test_req401_ac1_integration_reconcile_upstream_lost_job_releases_normal_group` | integration | T1 | 実 SQLite DB を用いた API 統合環境で、ComfyUI 消失ジョブが reconcile により unconfirmed となり normal_group が閉じることを検証 |
| AC-2 | `backend/tests/integration/legacy/test_generation_service.py::test_req401_ac2_single_and_queued_cancel_when_upstream_lost_transitions_to_unconfirmed` | unit | T1 | `cancel_queued` および `_cancel_single` 実行時に outcome='unconfirmed' とともに DB status が unconfirmed に遷移することを検証 |
| AC-2 | `backend/tests/integration/legacy/test_generation_api.py::test_req401_ac2_single_cancel_updates_db_status_to_unconfirmed` | integration | T1 | `/api/generation/jobs/{id}/cancel` API 経由で上流不在ジョブを取り消した際、202 outcome='unconfirmed' となり DB snapshot 上も 'unconfirmed' であることを検証 |
| AC-3 | `backend/tests/integration/legacy/test_generation_service.py::test_req401_ac3_bulk_cancel_includes_upstream_lost_active_jobs_as_unconfirmed` | unit | T2 | `_cancel_global` および `_cancel_normal` で、上流キューに不在の prompt_id 保持 active ジョブが outcome='unconfirmed' として items に含まれ DB status が unconfirmed になることを検証 |
| AC-3 | `backend/tests/integration/legacy/test_generation_integration.py::test_req401_ac3_integration_bulk_cancel_transitions_upstream_lost_jobs_to_unconfirmed` | integration | T2 | 実 SQLite DB 環境で `/api/generation/cancel` 一括取消実行時、202 返却と items への unconfirmed 含有、DB 状態更新を検証 |
| AC-4 | `backend/tests/integration/legacy/test_generation_service.py::test_req401_ac4_unconfirmed_transitioned_job_can_be_released` | unit | T1, T2 | AC-1〜3 で unconfirmed に遷移したジョブに対し `release_unconfirmed` を実行すると status='released' に遷移しアクティブから消去されることを検証 |
| AC-5 | `docs/specs/SPEC_COMMON.md`, `docs/specs/SPEC_GENERATE.md` への仕様明文化 | doc | T3 | doc-verify による意味・整合性・参照・トレーサビリティの検証 |

## 2. Seam Map

1. **Integrated (実コード実行)**:
   - `GenerationService`: 全ライフサイクルメソッド（`_reconcile_locked`, `cancel_operation`, `_cancel_single`, `_cancel_global`, `_cancel_normal`, `cancel_queued`, `release_unconfirmed`）。
   - `GenerationRepository`: 実トランザクション、CAS（Compare-and-Swap）による状態遷移、履歴レコード更新。
   - `FastAPI app / client`: ルーター経由のリクエスト・レスポンス検証。
2. **Severed (外部 I/O 遮断)**:
   - `LiveBridgePort`: `FakeBridge` で queue / history / delete / interrupt を制御。実 ComfyUI プロセスや実ネットワーク通信は完全遮断。
   - 時刻 (`clock`): 固定 ISO 文字列による再現性の担保。
   - GPU / モデル実行: 一切使用しない（Zero-GPU）。
3. **Mock Level**:
   - `GenerationService` や `GenerationRepository` の内部ロジックへの monkey-patch は禁止。
   - `FakeBridge` の戻り値設定（queue 空リスト、history 空辞書、例外送出など）を通じて上流状態をシミュレートする。
4. **PBT Decision**:
   - prompt_id 有無 × status（queued/submitting/running）× 上流在否（queue 在/不在/history空/history有）の有限状態遷移であるため、`pytest.mark.parametrize` による決定論的網羅テストを実施する。
5. **Fault Injection**:
   - 上流 ComfyUI クラッシュシミュレーション（queue 空かつ history 空）。
   - 上流通信タイムアウト（`queue_error = httpx.ConnectTimeout(...)`）。
   - 履歴照会障害（`history_error = RuntimeError(...)`）。

## 3. 統合・E2E フロー

- **IG1 (Reconcile 消失復旧フロー)**: prompt_id 確定ジョブ作成 → 上流 queue/history を空に設定 → reconcile 実行 → status='unconfirmed' 遷移確認 → 新規通常バッチ投入 → 新しい `normal_group_id` が払い出されることを確認。
- **IG2 (単件・一括取消フロー)**: 上流 queue/history 消失状態のジョブに対し単件取消・一括取消を実行 → 202 outcome='unconfirmed' 返却 → DB status='unconfirmed' 確認 → `POST /api/generation/release` 実行 → status='released' 遷移確認。
- **IG3 (保全フロー)**: 正常に上流 queue に存在するジョブの通常取消（outcome='cancelled', status='cancelled'）および実行完了（history 有りでの status='succeeded' 遷移）が回帰なく動作することを確認。

## 4. リスク評価とフルスイート・フォールバック

- **リスク分類**: **high**。ジョブのライフサイクル、状態機械（State Machine）、通常生成グループ（normal_group_id）の開閉契約、および取消 API の中核ロジックに触れるため、不変条件違反時の影響が大きい。
- **検証プロファイル**: **V1 Baseline (Default)**。V2 opt-in は承認されておらず、かつ上記 High-Risk 領域に該当するため V2 は適用不可。
- **フルスイート・フォールバック・トリガー**:
  - 本件は high-risk scope に該当するため、Gate 2 はフィルタ無しの完全テストスイート（`scripts/run_full_suite.py`）を実行する。
  - テスト収集件数の不一致、予期せぬ skip、flaky テストの発生時は即座に調査へ差し戻す。
  - `backend/app/services/generation_service.py` 以外の意図しない製品コード変更が検出された場合は直ちに中止する。

## 5. Red Team / 境界テスト

| ID | 観点 | 手順 | 期待動作 |
| --- | --- | --- | --- |
| RT1 | 誤検知防止 (一時的不通) | `bridge.history` が `ConnectError` 等の例外を送出するよう注入 | ジョブを `unconfirmed` に誤遷移させず、`running`/`queued` のまま維持して保守的に `continue` すること |
| RT2 | 誤検知防止 (上流正常完了) | `bridge.history` に正常完了レコードが存在する状態 | `unconfirmed` ではなく `succeeded` に正常遷移すること |
| RT3 | 待機取消ガード | `cancel_queued`（only_unsubmitted=True 相当）の対象ジョブが上流不在の場合 | `outcome="unconfirmed"` を返すと同時に DB が `unconfirmed` に遷移し、ゾンビ化しないこと |
| RT4 | 一括取消での境界スコープ | `scope=normal` 一括取消時に、別スコープ（`high_priority` や `interruption`）の上流不在ジョブを巻き込まないこと | 指定スコープ内の上流不在ジョブのみが `unconfirmed` となること |
| RT5 | 冪等性・CAS 保全 | `unconfirmed` に遷移した同一ジョブに対し、再度一括取消や reconcile を実行 | 多重遷移エラーを起こさず、安全にスキップまたは unconfirmed レポートに含められること |

## 6. 環境と収集設計

- **実行環境**: Windows 11, `backend\.venv\Scripts\python.exe` (Python 3.11+), SQLite (WAL モード)。GPU 不使用。
- **テスト配置**:
  - 単体・サービステスト: `backend/tests/integration/legacy/test_generation_service.py`
  - API・統合テスト: `backend/tests/integration/legacy/test_generation_integration.py`, `backend/tests/integration/legacy/test_generation_api.py`
  - 仕様ドキュメント: `docs/specs/SPEC_COMMON.md`, `docs/specs/SPEC_GENERATE.md`
- **実行コマンド**:
  - TDD 局所実行 (T1): `backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_generation_service.py -k "REQ-401"`
  - TDD 局所実行 (T2): `backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_generation_integration.py -k "REQ-401"`
  - Gate 1:
    - `backend\.venv\Scripts\python scripts/verify_ui_invariants.py`
    - `backend\.venv\Scripts\mypy backend`
    - `backend\.venv\Scripts\python -m pytest backend/tests/unit`
    - `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict`
  - Gate 2 (Full Discovery):
    - `backend\.venv\Scripts\python scripts/run_full_suite.py`
    - `cd frontend; npm test`
  - Gate 3:
    - `backend\.venv\Scripts\python scripts/run_e2e.py`
