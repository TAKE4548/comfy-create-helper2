# REQ-335 実行可能テスト計画

- 設計書: `docs/design/REQ-335.md`（Seam Map は §7、状態/API は §6、起動時回復は §6.8）。改訂2: Q4 の起動時回復ケースを追加。
- 方針: 既存のコロケーション/レイヤ別テストファイルを拡張する。チケットID冠の新規テストファイルは作らない [W-DD-PLACE]。
  ケース名/docstring に `[REQ-335/AC-n]` を付け、BE は `@getattr(pytest.mark, "REQ-335")` / `@getattr(pytest.mark, "AC-n")` マークを併用（既存 REQ-386 慣例）、FE は `it('[REQ-335/AC-n] ...')`。
- すべて CPU/RAM のみ（Zero-GPU）。ComfyUI実機は不要。

## 1. AC トレーサビリティ

| AC | 検証内容 | 主なケース（§3） | 層 |
|---|---|---|---|
| AC-1 | prompt_id=null/unconfirmed を待機と区別して表示、待機件数・進捗に矛盾なし（再起動後に孤立した送信待ちも unconfirmed になる §6.8） | B-AC1-1..6, I-AC1-1, F-AC1-1..5, F-AC1-PBT | BE(状態保持/起動時回復)+FE(投影/UI) |
| AC-2 | 単件/一括取消で already_terminal にせず、確認範囲と未確認を明示 | B-AC2-1..7, F-AC2-1..3 | BE+FE |
| AC-3 | 解除確定→BE再起動後も待機復活せず、上流取消確認と区別した解除記録が残る | B-AC3-1..7, I-AC3-1..2, F-AC3-1..3 | BE(永続/API/再起動)+FE |
| AC-4 | 未確認が存在しても新規生成が完了、二重投入・無関係取消なし | B-AC4-1..6, B-AC1-3, B-AC1-7, I-AC4-1, F-AC4-1 | BE+FE+結合 |
| AC-5 | 後から識別情報判明時の扱い（解除前=照合、解除後=注記のみ） | B-AC5-1..5, F-AC5-1 | BE |

## 2. テスト配置計画（既存ファイル拡張）[W-DD-PLACE]

| 層 | 拡張する既存ファイル | 担当Card |
|---|---|---|
| BE migration | `backend/tests/integration/legacy/test_generation_jobs_migration.py` | T1 |
| BE schema | `backend/tests/integration/legacy/test_generation_schema.py` | T1 |
| BE repository(実SQLite + PBT) | `backend/tests/integration/legacy/test_generation_repository.py` | T1 |
| BE service | `backend/tests/integration/legacy/test_generation_service.py` | T2, T3 |
| BE API(FakeBridge) | `backend/tests/integration/legacy/test_generation_api.py` | T3 |
| BE 結合/再起動(実bridge+実repo+MockTransport) | `backend/tests/integration/legacy/test_generation_integration.py` | T3 |
| FE API契約 | `frontend/src/api/domains/__tests__/generation.test.ts` | T4 |
| FE selectors(+fast-check) | `frontend/src/utils/__tests__/generationSelectors.test.ts` | T4 |
| FE store | `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts`, `frontend/src/store/__tests__/slices/connectionSlice.test.ts`, `frontend/src/pages/GeneratePage/__tests__/generationQueueSync.test.ts` | T5 |
| FE UI | `frontend/src/components/__tests__/JobManagementModal.test.tsx`, `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx` | T6 |

E2E(Tier3): 追加しない。理由: 追加UIは jsdom で検証可能（モーダル内リスト/確認/チップ）で、sticky/実スクロール/DnD を伴わない。UI不変条件は `scripts/verify_ui_invariants.py` と Gate3 既存スイートの回帰で担保する。

## 3. テストケース一覧

Tier 1: 静的/契約・高速単体、Tier 2: 実SQLite/実サービス統合（外部I/Oのみ遮断）。

### 3.1 バックエンド

| ID | AC | ファイル / ケース名(`test_...` もしくは `it`) | 検証 |
|---|---|---|---|
| B-AC1-1 | AC-1 | service: `test_unconfirmed_job_keeps_failure_reason_and_is_not_queued_in_snapshot` | prompt_id=null で unconfirmed、snapshot に status=unconfirmed と failure.reason、worker は再POSTしない |
| B-AC1-2 | AC-1 | service: `test_startup_recovery_converts_orphaned_queued_and_submitting_without_prompt_id_to_unconfirmed` | `accept_batch`/`transition` でシードした queued と submitting(prompt_id=null)（`_pending` 空の新 service）→ `start()` 後に両方 unconfirmed、`failure.outcome=="unconfirmed"` と reason が §6.8 の2種（未送信/送信中断）に一致、prompt_id は null、`finished_at` あり。数サイクル待っても `bridge.submissions==[]` |
| B-AC1-3 | AC-1,4 | service: `test_startup_recovery_touches_only_orphaned_submissions_exhaustive` | status{queued,submitting,running,succeeded,failed,cancelled,unconfirmed,released} × prompt_id{None,"p"} × 現プロセス`_pending`在否 の全32通りをパラメタライズ。変換されるのは (queued\|submitting)∧prompt_id=None∧非pending のみ。他は dict 完全一致で不変（unconfirmed の既存 reason も不変） |
| B-AC1-4 | AC-1 | service: `test_startup_recovery_is_idempotent_and_does_not_churn_revision` | start→stop→start を繰り返し、2回目以降 revision 不変・publish 追加なし・transition 追加なし。ワーカー稼働中の二重 `start()` も no-op |
| B-AC1-5 | AC-1 | service: `test_startup_recovery_runs_without_upstream_even_when_comfyui_is_down` | `bridge.queue_error` 設定下でも `start()` が例外なく回復を完了。回復経路で bridge の submit/delete/interrupt/clear/history 呼出ゼロ（初回 reconcile の `queue()` 失敗は従来どおり警告で継続） |
| B-AC1-6 | AC-1 | service: `test_startup_recovery_failure_is_nonfatal_and_retried_by_worker` | repository 境界の障害注入（MemoryRepository の `transition` を1回だけ例外にするテスト用サブクラス）。`start()` は例外を投げず、障害解消後にワーカー周期で孤立行が収束。途中1件だけ失敗する部分成功→再実行でも二重変換なし |
| B-AC1-7 | AC-4 | service: `test_same_process_restart_keeps_genuinely_pending_jobs_and_submits_once` | 送信待ち(VRAM guard でブロック)の queued を `accept` → `stop()` → `start()`。当該ジョブは unconfirmed にならず queued のまま、ブロック解除後に submit がちょうど1回。`start()` 前に `accept` したジョブも同様 |
| B-AC2-1 | AC-2 | service: `test_single_cancel_of_unconfirmed_without_prompt_id_is_unconfirmed_not_already_terminal` | outcome=unconfirmed、status不変、bridge の delete/interrupt/clear 呼出ゼロ |
| B-AC2-2 | AC-2 | service: `test_single_cancel_of_unconfirmed_with_pending_prompt_follows_confirmed_cancel_flow` | prompt_id あり・上流pending → 削除ACK+不在+history interrupted で cancelled |
| B-AC2-3 | AC-2 | service: `test_single_cancel_of_unconfirmed_absent_from_queue_stays_unconfirmed` | 不在・history無し → unconfirmed のまま |
| B-AC2-4 | AC-2 | service: `test_cancel_queued_and_cancel_unsubmitted_never_report_already_terminal_for_unconfirmed` | `only_queued` / `only_unsubmitted` 両ガード |
| B-AC2-5 | AC-2 | service: `test_bulk_cancel_reports_leftover_unconfirmed_items_per_scope` | mode=queued/all × scope=all/normal。normal範囲は Studio の unconfirmed を報告・操作しない。items に unconfirmed、既存の cancelled/skipped を壊さない |
| B-AC2-7 | AC-2 | service: `test_cancel_of_startup_recovered_unconfirmed_reports_unconfirmed_without_upstream_calls` | 起動時回復で生まれた unconfirmed(prompt_id=null) への単件取消 → `outcome=unconfirmed`、bridge の delete/interrupt/clear 呼出ゼロ |
| B-AC2-6 | AC-2 | api: `test_cancel_endpoints_return_202_when_unconfirmed_items_remain` | HTTP 202、ボディに outcome=unconfirmed |
| B-AC3-1 | AC-3 | migration: `test_step_032_adds_release_json_idempotently_and_preserves_rows` | 登録1回、2回適用可、既存行保持、027→032 の順で新規DBが model と一致 |
| B-AC3-2 | AC-3 | schema: `test_release_contract_and_job_status_released` | JobStatus に released、ReleaseRequest 検証（空/重複/51件/非文字列）、JobView.release 既定None、extra=forbid |
| B-AC3-3 | AC-3 | repository: `test_release_unconfirmed_is_compare_and_set_and_idempotent` | unconfirmed→released、release_json 内容、failure保持、revision +1、二回目はNone/不変、非unconfirmedは不変 |
| B-AC3-4 | AC-3 | repository: `test_released_is_terminal_and_survives_prune_with_independent_cap` | `_RELEASED_LIMIT` をmonkeypatch(定数のみ)して3件で古い順削除、通常terminal pruneの対象外 |
| B-AC3-5 | AC-3 | service: `test_release_makes_no_upstream_calls_and_publishes_once` | 解除で bridge の submit/delete/interrupt/clear/history/queue(prompt_id=null時)呼出ゼロ、publish 1回、結果 outcome=released, upstream_check=skipped_no_identity |
| B-AC3-6 | AC-3 | service: `test_release_only_affects_unconfirmed_and_reports_each_item` | queued/running/succeeded/cancelled は not_released で不変、未知IDは rejected、解除済みは already_released、混在1リクエスト |
| B-AC3-7 | AC-3 | api: `test_release_endpoint_contract_validation_and_typed_503` | 200/422/503(ErrorEnvelope outcome=unconfirmed)、OpenAPIにパスとスキーマが存在 |
| B-AC4-1 | AC-4 | repository: `test_unconfirmed_does_not_hold_normal_group_open` | queued/submitting/running がある間は同group、全員 unconfirmed/terminal なら次受付で新group |
| B-AC4-2 | AC-4 | service: `test_new_generation_completes_while_unconfirmed_exists_without_resubmission` | unconfirmed 存在下で新規受付→worker が新ジョブのみ1回submit、unconfirmed は再POSTされない |
| B-AC4-3 | AC-4 | service: `test_cancel_or_release_of_unconfirmed_never_touches_unrelated_jobs` | 単件取消/解除の前後で他ジョブ(queued/running)の status・bridge 呼出が不変 |
| B-AC4-4 | AC-4 | service: `test_new_generation_after_startup_recovery_opens_new_group_and_submits_once` | 全員孤立→回復後、新規 accept は新 `normal_group_id`、worker が新ジョブのみ submit(1回)。回復済み行は再POSTされない |
| B-AC4-5 | AC-4 | service: `test_request_replay_after_startup_recovery_does_not_requeue_or_resubmit` | 回復後に同一 request_id を再送 → 既存 job_ids を返し `bridge.submissions` 不変、status は unconfirmed のまま |
| B-AC4-6 | AC-4 | service: `test_startup_recovery_does_not_touch_jobs_with_prompt_id_or_other_scope_cancel_paths` | prompt_id を持つ queued/submitting/running は回復で不変（reconcile の責務）。scope=studio の孤立行も回復されるが、scope=normal の一括取消は studio の unconfirmed を報告・操作しない |
| B-AC5-1 | AC-5 | service: `test_reconcile_adopts_upstream_state_for_unconfirmed_with_prompt_id` | queue running→running、pending→queued、history success→succeeded、error→failed |
| B-AC5-2 | AC-5 | service: `test_reconcile_unconfirmed_without_conclusion_is_noop_without_revision_churn` | 2.5s周期の reconcile を複数回→revision不変、publishなし |
| B-AC5-3 | AC-5 | service: `test_event_for_unconfirmed_with_prompt_id_resumes_running` | execution_start → running。prompt_id=null は event で更新されない |
| B-AC5-4 | AC-5 | service: `test_release_with_prompt_id_checks_upstream_and_refuses_when_active` | 照合で running/pending/終端 → not_released(状態更新)、不在 → released(upstream_check=not_found)、queue失敗 → released(unavailable) |
| B-AC5-5 | AC-5 | service: `test_late_binding_after_release_annotates_identity_without_changing_status` | 解除後の `_retry_prompt_bindings` 成功 → status=released のまま prompt_id と release.late_prompt_id、再POSTなし |
| B-PBT-1 | AC-3,4,5 | repository(Hypothesis): `test_property_release_and_transitions_preserve_non_unconfirmed_rows` | 任意の遷移列＋任意の job_ids で: 非unconfirmed行は不変、released は不変/冪等、releasedは group を開かない、revision は単調非減少 |

### 3.2 結合・再起動（実 bridge + 実 repository + MockTransport）

| ID | AC | ファイル / ケース名 | 検証 |
|---|---|---|---|
| I-AC3-1 | AC-3 | integration: `test_released_unconfirmed_survives_backend_restart_without_resubmission` | `LocalUpstream.prompt_error` でPOST例外→unconfirmed→`POST /release`→同一 `tmp_path` で `_integration_app` を再生成(再起動)→ state に released が残り、`_pending` 空・`prompt_calls` 件数不変・待機/running に復活しない。release_json が取得可能 |
| I-AC1-1 | AC-1 | integration: `test_restart_converts_orphaned_submissions_to_unconfirmed_and_never_resubmits` | `_integration_app` で作った service を `start()` する前に `service.repository` へ queued と submitting（prompt_id=null）をシード → lifespan 開始 → `GET /api/generation/state` で両方 `unconfirmed`・待機/running に出ない・`upstream.prompt_calls` 空。同じ `tmp_path` で再起動を繰り返しても状態・件数不変（冪等）、ComfyUI停止(`prompt_error`)でも同じ |
| I-AC3-2 | AC-3 | integration: `test_recovered_unconfirmed_can_be_released_and_stays_released_after_restart` | I-AC1-1 の回復行を `POST /api/generation/release`（`upstream_check=skipped_no_identity`）→ 再起動 → `released` のまま待機へ復活せず、release 記録あり、`prompt_calls` 不変 |
| I-AC4-1 | AC-4 | integration: `test_new_generation_completes_after_comfy_outage_with_unconfirmed_present` | 停止中に unconfirmed → 上流復旧(prompt_error解除)→新規受付が succeeded まで完走、unconfirmed は未送信のまま・二重投入なし。`prompt_calls` は新規分のみ増加 |

### 3.3 フロントエンド

| ID | AC | ファイル / ケース名 | 検証 |
|---|---|---|---|
| F-AC1-1 | AC-1 | generation.test: `it('[REQ-335/AC-1] decodes released status and optional release record, rejecting unknown statuses')` | デコーダ契約（released 受理、未知値拒否） |
| F-AC1-2 | AC-1 | generationSelectors.test: `it('[REQ-335/AC-1] excludes unconfirmed and released from normal N, F and wait counts')` | N/F/待機件数、`selectUnconfirmedJobs` は group 非依存、session filter 対応、旧テスト「unconfirmed blockers を数える」を改訂 |
| F-AC1-3 | AC-1 | jobQueueSlice.test: `it('[REQ-335/AC-1] projectQueue does not place unconfirmed jobs in queuePending and exposes upstream items of unconfirmed prompts')` | 待機配列から除外、seen 規則 |
| F-AC1-4 | AC-1 | connectionSlice.test: `it('[REQ-335/AC-1] unconfirmed-only snapshot yields isGenerating=false and no active prompt')` | 生成中/currentPromptId、activeBatch の終了判定 |
| F-AC1-5 | AC-1 | JobManagementModal.test + GenerationProgress.test: `it('[REQ-335/AC-1] shows 状態未確認 section separately from 待機中 and never labels it 待機中')` | 表示ラベル、件数、進捗が「完了」表示になり未確認チップ併記 |
| F-AC1-PBT | AC-1,4 | generationSelectors.test(fast-check): `it('[REQ-335/AC-1] property: progress invariants hold for arbitrary status multisets')` | 0≤fraction≤1、F≤N、unconfirmed/released は F・待機に不寄与、N=0 は idle |
| F-AC2-1 | AC-2 | generation.test/jobQueueSlice.test: `it('[REQ-335/AC-2] cancelJob propagates unconfirmed outcome without treating it as success')` | store が結果を握りつぶさない |
| F-AC2-2 | AC-2 | JobManagementModal.test: `it('[REQ-335/AC-2] single cancel of an unconfirmed row shows the unconfirmed message and keeps the row')` | 行維持、メッセージ |
| F-AC2-3 | AC-2 | JobManagementModal.test: `it('[REQ-335/AC-2] bulk result with unconfirmed leftovers keeps the modal open with confirmed/unconfirmed counts')` | 既存「部分成功」表示の拡張（確認済み n・未確認 m） |
| F-AC3-1 | AC-3 | generation.test: `it('[REQ-335/AC-3] releaseJobs posts explicit job_ids and decodes ReleaseOperation')` | リクエスト/レスポンス契約 |
| F-AC3-2 | AC-3 | jobQueueSlice.test: `it('[REQ-335/AC-3] releaseUnconfirmed sends only given ids then refetches state')` | 明示IDのみ、fetchQueue 実行 |
| F-AC3-3 | AC-3 | JobManagementModal.test: `it('[REQ-335/AC-3] release requires confirmation that states it is not an upstream cancellation and reports per-item outcome')` | 2段階確認、文言、結果（解除n件/解除できなかったm件）、解除済みセクション |
| F-AC4-1 | AC-4 | connectionSlice.test / generationQueueSync.test: `it('[REQ-335/AC-4] new generation proceeds while an unconfirmed record exists and unconfirmed is not cancelled by queued clear')` | FE統合（実store＋偽BE）で unconfirmed を巻き込まない |
| F-AC5-1 | AC-5 | jobQueueSlice.test: `it('[REQ-335/AC-5] unconfirmed that gains a prompt_id and becomes running moves from the unconfirmed list to the running queue')` | snapshot更新でリストが移動 |

## 4. 境界値テスト

- ReleaseRequest: job_ids 0件(422)、1件(OK)、50件(OK)、51件(422)、重複(422)、空文字ID(rejected)。
- release_json 欠落/不正JSON（手書きDB行）→ `_job_view` が例外にならず `release=None`（防御的に読む）。
- revision: release は +1、`already_released`/`not_released` は +0。
- normal group: unconfirmed のみ → 閉じる / queued 1件追加 → 開く / released は開かない。
- 進捗: N=0・F=0（全て unconfirmed）→ idle＋チップ。N=1,F=1。
- 起動時回復: 対象0件（空DB・全員terminal）で例外なし・revision不変。対象1件・多数（50件）で全件収束。reason は status 別に2種のみ。`finished_at` は回復時刻。

## 5. Red Team / 異常系（Gate3 baseline 対象）

| ID | シナリオ | 期待 |
|---|---|---|
| RT-1 | 解除対象に running/queued/succeeded の job_id を混在 | 非unconfirmedは `not_released`、状態・上流呼出は不変（AC-4） |
| RT-2 | 解除と reconcile の競合（解除直前に unconfirmed→running へ遷移） | CAS により `not_released`、解除されない |
| RT-3 | 解除の二重送信（同一リクエスト再送/ダブルタップ） | 2回目は `already_released`、revision +1 のみ |
| RT-4 | ComfyUI停止中（queue/history 照会が例外）で prompt_id ありの解除 | `released` + `upstream_check=unavailable`、500にならない |
| RT-5 | DB read失敗中の `POST /release` / `GET /state` | typed 503、部分適用なし、FEは前回の有効snapshotを保持 |
| RT-6 | 旧FE相当ペイロード（`release` 欠落）/未知status を FE デコーダへ | 欠落は許容(optional)、未知statusは snapshot 全体拒否＝既存の同期不能表示（R1の既知挙動を固定） |
| RT-7 | 解除済みジョブへの単件取消 | `not_cancelled`（`already_terminal` ではない）、上流呼出ゼロ |
| RT-8 | late identity が解除済みレコードの prompt_id と重複（UNIQUE） | 例外を握りつぶして状態不変、ログ警告、再POSTなし |
| RT-9 | 「全体取消(all)」で unconfirmed のみ存在し上流が空 | items に unconfirmed、モーダル維持、完了扱いにしない（SPEC_GENERATE:204） |
| RT-10 | scope=normal の一括取消時に Studio の unconfirmed が存在 | Studio の unconfirmed は報告・操作されない（保護範囲維持） |
| RT-11 | 自動再送の不在: unconfirmed 存在下で BE 再起動・reconcile 反復 | `bridge.submit` 呼出回数が増えない |
| RT-12 | XSS/長文: failure.reason や prompt_excerpt に HTML・長文字列 | Reactのエスケープで表示、レイアウト崩れなし（`break-words`） |

### 5.1 起動時回復の Red Team（Q4、§6.8）

| ID | シナリオ | 期待 |
|---|---|---|
| RT-13 | 送信中の強制終了（submitting, prompt_id=null、POSTは上流到達済みの可能性） | 再起動後 unconfirmed（reason=送信中断）。自動再送なし。解除は `skipped_no_identity`。late identity は到達しない |
| RT-14 | ComfyUI停止のまま BE 起動 | 回復は上流不要で完了。reconcile 失敗は警告で継続（B-AC1-5） |
| RT-15 | `start()` を二重呼出（ワーカー稼働中）／stop→start の反復 | 回復は多重実行されず冪等（B-AC1-4） |
| RT-16 | 同一プロセス stop→start、または `start()` 前の `accept()` による正規の送信待ち | 述語の `_pending_ids` 除外で unconfirmed 化されず、送信は1回（B-AC1-7） |
| RT-17 | 回復中のDB書込失敗／途中1件のみ失敗 | `start()` は失敗せず警告、ワーカー周期で収束、二重変換なし（B-AC1-6） |
| RT-18 | prompt_id を持つ queued/submitting/running が混在 | 回復は触れない（reconcile/event の責務、B-AC1-3, B-AC4-6） |
| RT-19 | 回復直後に同一 request_id を再送 | 再キューも再POSTもしない（B-AC4-5） |
| RT-20 | 全孤立行の回復後に新規生成 | 新 group で完了。回復済み行は再送されない（B-AC4-4, I-AC4-1） |
| RT-21 | `released`／既存 unconfirmed を含むDBで起動 | reason・release 記録を上書きしない（B-AC1-3 網羅） |
| RT-22 | 回復済み unconfirmed への取消／FE表示 | `outcome=unconfirmed`・上流呼出ゼロ（B-AC2-7）、FEは状態未確認欄に表示（F-AC1-5 の対象と同一状態） |

## 6. 検証コマンド（実行順）

作業ディレクトリは WORKSPACE_ROOT (`C:\Users\audih\ws\comfy-create-helper2`)。Windows の Git Bash/PowerShell 双方で動く表記にする。

**Gate 1（静的・高速）**
```
backend\.venv\Scripts\python.exe -m mypy backend
backend\.venv\Scripts\python.exe -m pytest backend/tests/unit
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/**/__tests__
backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py
npm.cmd --prefix frontend run typecheck
backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict
```
**Gate 2（全スイート）**
```
backend\.venv\Scripts\python.exe scripts/run_full_suite.py
```
**Gate 3（E2E回帰）**
```
backend\.venv\Scripts\python.exe scripts/run_e2e.py
```
**シナリオ（require_scenario）**
```
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_generation_integration.py -k "REQ-335 and AC-1"
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_generation_integration.py -k "REQ-335 and AC-3"
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_generation_integration.py -k "REQ-335 and AC-4"
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/pages/GeneratePage/__tests__/generationQueueSync.test.ts -t "REQ-335/AC-4"
```
**AC別の絞り込み（Card用）**: BE は `-k "REQ-335 and AC-n"`、FE は `-t "REQ-335/AC-n"`。
注意: `docs` は `.agents/verification.json` の identity 入力に含まれるため、T7完了後に最終QAを実施する。

## 7. 実行不可/保留事項

- 実ComfyUI停止→再起動の実機確認は本計画の範囲外（MockTransport+ローカルWSで再現）。再起動による `_pending` 喪失は「新 service を未起動のままDBへ直接シード」で再現する（実プロセス強制終了の実機試験は範囲外）。PBIの「残留3件の暫定解除」は別作業（Q5: デプロイ後に `/release` で実施）。
- 複数プロセスが同一DBを共有する構成（R10）と、prompt_id を持つ行が上流から消える残留（R13/Q8）は本計画の範囲外。
- ba-audit(design) はローカルLM Studioの可用性次第（実施結果は引き渡しペイロードの audit 欄に記録）。

## 8. Supplement (post-QA)

最終QA（Gate 2 FAIL）とユーザー決定を受けた追加分。既存 §1〜§7 は変更しない。設計書 §13 を参照。

### 8.1 追加ケースと配置
| ID | AC | 配置（既存ファイル拡張 / 新設） | ケース | 担当Card |
|---|---|---|---|---|
| RT-12a | AC-1 | `frontend/src/components/__tests__/JobManagementModal.test.tsx` | `it('[REQ-335/AC-1] RT-12 renders hostile HTML-like reason, set name, excerpt and ids as literal escaped text')` | T9 |
| RT-12b | AC-1 | 同上 | `it('[REQ-335/AC-1] RT-12 keeps very long unbroken reason, excerpt and ids wrapped or truncated inside width-bounded rows')` | T9 |
| RT-12c | AC-3 | 同上 | `it('[REQ-335/AC-3] RT-12 keeps the release dialog and result messages escaped and non-echoing for hostile ids and upstream messages')` | T9 |
| CG-1 | Gate 2 衛生 | `backend/tests/governance/test_pytest_collection.py`（主題名の新設。既存 governance ファイルに収集設定を扱うものが無い） | `test_root_pytest_ini_excludes_docs_logs_and_keeps_pytest_defaults` | T8 |
| CG-2 | Gate 2 衛生 | 同上 | `test_collection_skips_docs_logs_copies_with_duplicate_basenames[True/False]`（ini あり=収集成功、なし=対照として失敗を再現） | T8 |
| CG-3 | Gate 2 衛生 | 同上 | `test_docs_logs_has_no_tracked_files` | T8 |
| DOC-1 | AC-1,4 | 文書レビュー（doc-verify） | F-1/F-2 の反映確認（T10 §4） | T10 |

CG-* は AC ではなくテスト基盤の衛生ガードのため `[REQ-xxx/AC-y]` を付けない（`verify_test_naming.py` は PBI 参照のない名前を許可）。RT-12 は §5 の RT-12 行（敵対HTML・長文）の実体化。

### 8.2 RT-12 の検証範囲と限界
- 検証: 敵対文字列（`<img onerror>`・`<script>`）が要素化されないこと、リテラル文字列として表示されること、ユーザー入力表示要素の折返し/切詰めクラス契約、解除確認ダイアログが利用者文字列をエコーしないこと。
- 限界: jsdom は実レイアウトを持たず実際の溢れは測れない。実ブラウザ検証は追加しない（§2 の Tier3 方針を維持）。

### 8.3 検証コマンド（追加分）
```
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/components/__tests__/JobManagementModal.test.tsx -t "RT-12"
backend\.venv\Scripts\python.exe -m pytest backend/tests/governance/test_pytest_collection.py -p no:randomly
backend\.venv\Scripts\python.exe -m pytest --collect-only -q -p no:randomly      # 収集エラー0・docs/logs 0件・747 collected（743 + ガード4）
backend\.venv\Scripts\python.exe -m pytest -n auto                              # 747 passed
backend\.venv\Scripts\python.exe scripts/run_full_suite.py                      # 最終QA（Gate 2。argv 不変）
```
最終QAは T8〜T10 完了後の状態で Gate 1→2→3 を再実行する。収集される実テストが `docs/logs` のコピーに依存しないこと（`docs/logs` 追跡ファイル0件・除外後の件数 743 + ガード）を QA 報告に含める。
