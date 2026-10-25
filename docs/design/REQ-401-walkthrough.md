# REQ-401 検証ウォークスルー報告書 (Verification Walkthrough)

- 作成: tester-reviewer (dev-verify) / coordinator
- PBI: docs/backlog/pbi/active/REQ-401.md
- 詳細設計書: docs/design/REQ-401.md
- テスト計画書: docs/design/REQ-401-test-plan.md
- 検証プロファイル: V1 Baseline (Sequential 3-Gate Discovery)
- 判定: PASS

---

## 1. 変更概要と目的

上流ComfyUIの停止・再起動等により、prompt_id が確定したアクティブジョブ（status IN ('queued', 'submitting', 'running')）が上流のキューおよび履歴から消失した場合に、ジョブが 
unning/queued のまま残留し、取消や解除ができなくなる不具合（REQ-335再発）を根本改修した。

### 改修内容
1. GenerationService._reconcile_locked:
   上流queue（running/pending）に不在かつhistory照会でもレコードが存在しない場合、job.status in {'queued', 'running'} のジョブを status='unconfirmed' へ確実に遷移（submitting状態は投入過渡期として保護）。
2. GenerationService.cancel_queued & _cancel_single:
   上流queue照会エラー時およびqueue不在時にDB上の job.status を unconfirmed に更新。
3. GenerationService._cancel_global & _cancel_normal:
   上流queueから消失したアクティブジョブを一括取消対象として補足し、DB statusを unconfirmed へ遷移させるとともに CancelOperation.items に outcome='unconfirmed' として含める。
4. SSoT仕様書同期:
   SPEC_COMMON.md および SPEC_GENERATE.md に、上流消失時および取消未確認時の unconfirmed 遷移契約を追記。

---

## 2. Acceptance Criteria 検証マトリクス

| AC ID | 検証内容 | 検証テストケース | 結果 |
|---|---|---|---|
| AC-1 | prompt_id確定ジョブが上流queue/historyから消失した場合、reconcile実行により status='unconfirmed' へ遷移し、normal_group_id が閉じること | 	est_req401_ac1_reconcile_upstream_lost_job_transitions_to_unconfirmed_and_closes_normal_group<br>	est_req401_ac1_integration_reconcile_upstream_lost_job_releases_normal_group | PASS |
| AC-2 | prompt_id確定ジョブの上流queue不在/不通時、単件取消（_cancel_single, cancel_queued）で outcome='unconfirmed' かつ DB status='unconfirmed' となること | 	est_req401_ac2_single_and_queued_cancel_when_upstream_lost_transitions_to_unconfirmed<br>	est_req401_ac2_single_cancel_updates_db_status_to_unconfirmed | PASS |
| AC-3 | 一括取消時、上流queue不在のジョブが items に outcome='unconfirmed' として含まれ、DB status='unconfirmed' へ更新されること | 	est_req401_ac3_bulk_cancel_normal_with_stale_running_job_transitions_to_unconfirmed<br>	est_req401_ac3_bulk_cancel_global_with_upstream_lost_jobs_transitions_to_unconfirmed<br>	est_req401_ac3_integration_bulk_cancel_transitions_upstream_lost_jobs_to_unconfirmed | PASS |
| AC-4 | unconfirmedへ遷移したジョブが POST /api/generation/release で正常に status='released' へ遷移し、キューから解消されること | 	est_req401_ac4_unconfirmed_transitioned_job_can_be_released<br>	est_req401_ac4_integration_released_unconfirmed_job_is_cleared | PASS |
| AC-5 | SPEC_COMMON.md および SPEC_GENERATE.md に unconfirmed 遷移契約を明記すること | docs/specs/SPEC_COMMON.md<br>docs/specs/SPEC_GENERATE.md | PASS |

---

## 3. 3-Gate 検証結果 (Baseline V1)

### Gate 1: 静的型検査・Unit テスト・UI 不変条件
- scripts/verify_ui_invariants.py: **PASS** (0 violations across 550 files)
- python -m mypy backend: **PASS** (Success: no issues found in 175 source files)
- 
pm --prefix frontend run typecheck: **PASS** (exit 0)
- pytest backend/tests/unit: **PASS** (39 passed in 0.42s)

### Gate 2: Full Suite ディスカバリ検証
- scripts/run_full_suite.py: **PASS** (exit 0)
  - Frontend vitest: **247 files / 2609 tests PASSED**
  - Backend pytest: **786 tests PASSED**

### Gate 3: シナリオ・E2E 検証
- scripts/run_e2e.py: **PASS** (Playwright E2E suite)

### エンコーディング検査
- 全変更ファイル（Python, Markdown）: UTF-8 without BOM, LF line endings 確認済み
