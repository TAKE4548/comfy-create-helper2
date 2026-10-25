# REQ-387 テスト計画

- 設計: `docs/design/REQ-387.md`（Seam Map は §5、性能閾値は §6）
- 命名: Python のテスト関数名を `test_req387_acN_<内容>` とし、docstring の1行目を `[REQ-387/AC-n] <説明>` で始める（`scripts/verify_test_naming.py` の規約）。選択は `-k req387`。ticket ID を含む新テストファイルは作らない（既存ファイルを拡張する）。
- 実行場所: リポジトリルート。環境変数 `PYTHONDONTWRITEBYTECODE=1`。
- GPU不使用（CPU/RAMのみ）。

## 1. AC 対応表

| AC | テスト（既存ファイルを拡張） | Tier | Card |
| --- | --- | --- | --- |
| AC-1 | `backend/tests/integration/legacy/test_generation_repository.py`: `test_req387_ac1_snapshot_window_contains_active_group_recent_batches_and_released_top10`、`test_req387_ac1_snapshot_cache_hit_skips_job_rows_and_every_write_invalidates`、`test_req387_ac1_get_job_and_find_job_by_prompt_read_out_of_window_rows` | 2 | T2 |
| AC-1（Rework 1） | 同ファイル: `test_req387_ac1_snapshot_with_empty_normal_group_id_has_no_group_condition`（RT1、未設定/空の 2 パラメータ）、`test_req387_ac1_released_ranking_survives_invalid_release_json_and_falls_back_to_job_id_desc`（RT3）。`backend/tests/integration/legacy/test_generation_api.py`: `test_req387_ac1_state_is_typed_503_when_key_read_fails_with_warm_snapshot_cache`（RT6）。既存 `test_generation_state_read_failure_returns_typed_503_without_partial_state` は障害注入を `generation_jobs` + `app_settings` に更新（名前は不変。Gate 2 で判定） | 2 | T7 |
| AC-8 | 同ファイル: `test_req387_ac8_window_progress_matches_full_snapshot`（Hypothesis PBT）、`test_req387_ac8_snapshot_time_budget_with_1000_terminal_jobs` | 2 | T2 |
| AC-2 | `backend/tests/integration/legacy/test_generation_service.py`: `test_req387_ac2_preview_frame_reads_snapshot_once_and_advances_revision`。`test_generation_integration.py`: `test_req387_ac2_preview_frames_do_not_reload_generation_jobs`（SQLAlchemy cursor event で `generation_jobs` SELECT 数を数える） | 2 | T3 / T5 |
| AC-3 | `test_generation_integration.py`: `test_req387_ac3_event_loop_lag_and_preview_latency_with_1000_terminal_jobs` | 3 scenario | T5 |
| AC-4 | `test_generation_service.py`: `test_req387_ac4_cancel_and_release_for_out_of_window_jobs_keep_results`（already_terminal / not_cancelled / already_released / job not found の維持）。`test_generation_integration.py`: `test_req387_ac4_cancel_returns_within_budget_while_previews_stream` | 2 / 3 | T3 / T5 |
| AC-4（Rework 1） | `backend/tests/integration/legacy/test_generation_api.py`: `test_req387_ac4_out_of_window_terminal_job_keeps_preview_and_availability_results`（RT5。窓外の終端 job の `/preview` と `/images/.../availability`、存在しない ID は 404） | 2 | T7 |
| AC-5 | 文書検証（doc-verify）: SPEC_GENERATE 追記の意味・矛盾・適用範囲・参照・AC シナリオ確認 | doc | T1 |
| AC-5（Rework 1） | 文書検証（doc-verify の再実行）: m1（保証範囲の限定）・m2（キーの両成分）・m5（補足文の字下げと空 group）・503 契約 1 文の確認。HEAD 由来の既存文言の不変（`git diff --numstat` の削除 0） | doc | T6 |
| AC-6 | `test_generation_service.py`: `test_req387_ac6_reconcile_failure_logs_once_then_backoff_and_recovery`（caplog。上流は FakeBridge の queue 例外で切断を表現。時計は既存 clock 注入を使う） | 2 | T3 |
| AC-6（Rework 1） | 同ファイル: `test_req387_ac6_five_consecutive_connect_errors_log_one_warning_and_one_recovery`（RT7。`httpx.ConnectError` を 5 回以上連続 → 成功。exc_info 付き WARNING 1 件・回復 INFO 1 件） | 2 | T8 |
| AC-7 | `backend/tests/unit/test_config.py`: `test_req387_ac7_sqlite_file_engine_uses_wal_and_busy_timeout`、`test_req387_ac7_httpx_logger_is_warning_after_setup_logging` | 1 | T4 |

## 2. 統合フロー

- IG1: 終端job 1000件 + 現在 normal group（3件 running/queued）+ Studio batch（完了済み2件）+ released 12件（2 session）を投入し、`snapshot()` が窓の定義どおりの集合を返すこと、`StateSnapshot` の往復検証が成立すること。
- IG2: 同状態で `GenerationService` を起動し、bridge の `on_preview` へ30フレーム投入する間、`/api/generation/state`、`/api/generation/preview/{job_id}`、`/api/generation/upstream-queue` を並行で呼んで、ループ遅延と応答時間が閾値内であること。
- IG3: IG2 の最中に `POST /api/generation/cancel`（単件・一括 normal）を呼び、2秒以内に従来の結果種別で返ること。

## 3. Red Team / 境界

- RT1: `normal_group_id` 設定が未設定または空。条件3が無効でも例外にならず、group が NULL/空の job を誤って含めない。（Rework 1: T7 で専用テストを追加）
- RT2: 25件 batch が21番目に古い。条件4から外れても、非終端jobを含めば条件2で全件入る。全終端なら丸ごと除外され、部分的には入らない。
- RT3: released の `release_json` が不正（不正 JSON、非 JSON、非オブジェクト、`released_at: null`、欠落）。順位は job_id 降順で決まり、クエリは失敗しない。有効な `released_at` を持つ job は不正形式より常に上位。（Rework 1: T7 で追加。欠落のみだった従来を拡張）
- RT4: キャッシュ有効中に別 `GenerationRepository` インスタンスが `transition` する。revision が変わり、次の `snapshot()` は新状態を返す。
- RT5: 窓外の終端 job_id に対する `cancel_unsubmitted` / `cancel_queued` / 単件 cancel / release / `/preview` / `/images/.../availability`。従来どおり already_terminal・not_cancelled・already_released、preview_not_found（404）、availability 一覧を返す。存在しない ID は job not found / 404。（cancel/release は T3 の service テスト。`/preview` と `/images/.../availability` の HTTP 層は Rework 1 の T7 で追加）
- RT6（Rework 1 で改訂）: 状態取得の失敗（キーである `revision` / `normal_group_id` の読込失敗を含む）は、snapshot キャッシュの有無にかかわらず `/state` が型付き 503（`generation_state_unavailable`、`jobs` を含まない）。既存テストは `generation_jobs` + `app_settings` の読込不能で検証し、追加テストはキャッシュが温まった状態で `app_settings` のみ読込不能にして検証する。`generation_jobs` だけが壊れる障害がキャッシュ有効の間は隠れ得ることは許容リスク（設計 §8-3）で、そのテストは書かない。
- RT7: reconcile が `httpx.ConnectError` を5回以上連続した後に成功する。WARNING（exc_info付き）は初回1件だけで、回復 INFO が1件出る。（従来は RuntimeError・3 回で検証。Rework 1: T8 で 5 回の ConnectError を追加）
- RT8: `:memory:` engine で PRAGMA 設定が例外にならない（journal_mode は memory のままで可）。

## 4. 実行コマンド

局所（各 Card の検証）:

```text
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_generation_repository.py -k req387 -p no:cacheprovider
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_generation_service.py -k req387 -p no:cacheprovider
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_generation_integration.py -k req387 -p no:cacheprovider
backend\.venv\Scripts\python.exe -m pytest backend/tests/unit/test_config.py -k req387 -p no:cacheprovider
backend\.venv\Scripts\python.exe -m mypy backend
```

Rework 1（T7 / T8）の局所検証:

```text
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_generation_api.py -p no:cacheprovider
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_generation_api.py backend/tests/integration/legacy/test_generation_repository.py -k req387 -p no:cacheprovider
backend\.venv\Scripts\python.exe -m pytest backend/tests/integration/legacy/test_generation_service.py -k "req387 and ac6" -p no:cacheprovider
```

Rework 1（T6、文書）の局所検証: `git diff --numstat -- docs/specs/SPEC_GENERATE.md` が追加 12・削除 0、置換文言の `grep -c`、BOM/CRLF 検査（Card REQ-387-T6 の検証欄）。

## 5. required_commands（最終 3-Gate。ScopeManifestV1 用）

| gate | command_argv |
| --- | --- |
| 1 | ["backend\\.venv\\Scripts\\python.exe","-m","mypy","backend"] |
| 1 | ["backend\\.venv\\Scripts\\python.exe","-m","pytest","backend/tests/unit"] |
| 1 | ["backend\\.venv\\Scripts\\python.exe","scripts/run_in_dir.py","frontend","npm.cmd","exec","--","vitest","run","src/utils","src/components/**/__tests__"] |
| 1 | ["backend\\.venv\\Scripts\\python.exe","scripts/verify_ui_invariants.py"] |
| 1 | ["npm.cmd","--prefix","frontend","run","typecheck"] |
| 2 | ["backend\\.venv\\Scripts\\python.exe","scripts/run_full_suite.py"] |
| 3 | ["backend\\.venv\\Scripts\\python.exe","scripts/run_e2e.py"] |
| 3 scenario（Rework 1 で test_generation_api.py を追加） | ["backend\\.venv\\Scripts\\python.exe","-m","pytest","backend/tests/integration/legacy/test_generation_api.py","backend/tests/integration/legacy/test_generation_repository.py","backend/tests/integration/legacy/test_generation_service.py","backend/tests/integration/legacy/test_generation_integration.py","backend/tests/unit/test_config.py","-k","req387"] |

- 変更理由: `test_generation_api.py` に req387 テスト（RT5/RT6 の HTTP 層）を追加したため、シナリオ行に含める。引数の並びは「ファイル 5 本 → `-k` → `req387`」。シナリオ行は `.agents/verification.json` の `fixed_commands` ではなく、コーディネーターが作る ScopeManifestV1 の `required_commands` として登録する（`require_scenario: true`）。Rework 後の再検証では、この argv を使うこと。
- 旧 RT6 の既存テスト（名前に `req387` を含まない）は Gate 2（`run_full_suite.py`）で実行される。

AC-5 は文書検証（doc-verify）で判定し、上記コードゲートの PASS では閉じない。
