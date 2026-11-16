---
id: REQ-432-test-plan
title: "REQ-432 VRAMガード 自セッション残留判別 テスト計画書"
status: draft
related_paths:
  - backend/tests/governance/test_vram_guard.py
  - backend/tests/integration/legacy/test_comfy_generation_bridge.py
  - backend/tests/integration/legacy/test_generation_service.py
  - backend/tests/integration/legacy/test_generation_api.py
  - frontend/src/pages/GeneratePage/__tests__/vramGuardIntegration.test.ts
  - frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx
  - frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx
  - frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx
---

# REQ-432: VRAMガード 自セッション残留判別 テスト計画書

## 1. リスク評価と検証プロファイル

- **リスク分類**: `high`
  - 根拠: 生成 worker の上流投入ゲート（全生成経路に影響）の判定式変更、公開 WS メッセージ `SYSTEM_STATS` の `vram_safe` の意味改訂とフィールド追加（公開契約）、モジュール共有シングルトン `resource_monitor` の挙動変更、`main.py` の lifespan 結線変更、外部 I/O（ComfyUI `/system_stats`、PDH）の追加。
- **検証プロファイル**: **V1 Baseline（既定）**。V2 opt-in は採用しない（承認済み低リスクプロファイルが存在せず、high リスクのため）。
  - **Gate 1（静的・単体）**: `backend\.venv\Scripts\python.exe -m mypy backend` / `backend\.venv\Scripts\python.exe -m pytest backend/tests/unit` / `backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/**/__tests__` / `backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py` / `npm.cmd --prefix frontend run typecheck` / `backend\.venv\Scripts\python.exe scripts/verify_openapi_sync.py` / `backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict`
  - **Gate 2（フルスイート探索、ファイルフィルタなし）**: `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`
  - **Gate 3（シナリオ・境界・Red Team）**: `backend\.venv\Scripts\python.exe scripts/run_e2e.py`（全 spec）、本書 §5 の Red Team の独立実行、§6 の実機シナリオ R-1〜R-4。
- `verify_openapi_sync.py` は REST 非変更の確認として実行し、差分が出ないことを期待値とする。

## 2. 実行ティア

| Tier | 内容 | 対象ファイル |
|---|---|---|
| `unit` | `evaluate_vram_guard`・`parse_comfy_system_stats`・`sum_adapter_dedicated_usage` の例示テストと PBT（Hypothesis） | `backend/tests/governance/test_vram_guard.py` |
| `integration` | `ComfyGenerationBridge.system_stats` + `httpx.MockTransport`、`ResourceMonitorService.sample_guard_status`/`_collect`/`_run` + 実 bridge（MockTransport）+ ホスト I/O 境界、`WindowsGpuMonitor.collect` + `_read_counter_items` 境界、`GenerationService` worker + probe + `MemoryRepository` + `FakeBridge`、FE `useGenerateAction` + store、Layout + store | `test_vram_guard.py`、`backend/tests/integration/legacy/test_comfy_generation_bridge.py`、`backend/tests/integration/legacy/test_generation_service.py`、`frontend/src/pages/GeneratePage/__tests__/vramGuardIntegration.test.ts`、`DesktopLayout.test.tsx`、`MobileLayout.test.tsx` |
| `e2e` | 新規 Playwright spec は追加しない。待機表示の文言・値は jsdom で検証でき、実寸レイアウトは変更しないため。既存 E2E 全件を Gate 3 で回帰確認する | `frontend/e2e/*`（既存） |
| `scenario` | 連続生成（残留あり）で保留しないこと、外部占有で保留して回復後に 1 回だけ投入すること、ComfyUI 停止時のフォールバック（統合テスト内 scenario 節）、実機 R-1〜R-4（Gate 3） | `test_generation_service.py`、`test_vram_guard.py`、`docs/logs/REQ-432/`（実機証跡） |

自動テストは CPU/RAM のみで実行する（GPU・実 ComfyUI に接続しない）。実機シナリオは Gate 3 の手動証跡とし、GPU 負荷を伴う。

## 3. 環境・収集設計

- **ランタイム**: `backend\.venv`（Python 3.12、pytest、pytest-asyncio、hypothesis>=6.100.0、httpx、respx は既存）。`frontend/node_modules`（vitest、@testing-library/react）。新規依存は追加しない。
- **隔離**: conftest の autouse `mock_external_services`（`respx.mock`）が lifespan 由来の `/system_stats` 呼び出しを遮断する。provider は例外を受けて `None` → ホストフォールバックとなるため、既存 REQ-260/REQ-394 テストの期待値（`vram_safe` 等）は変わらない。新規テストの ComfyUI 応答は `httpx.MockTransport` で与える。
- **プラットフォーム**: `WindowsGpuMonitor` の統合ケース（AC3-I-1）は `sys.platform == "win32"` 前提。検証環境は Windows 11 であり、Windows 上での skip は「想定外 skip」として不合格扱いにする。非 Windows 環境では skip が想定どおりである旨を記録する。
- **収集パターン**: BE は `-k "REQ-432 and AC-n"`。各テストに marker `@getattr(pytest.mark, "REQ-432")` と `@getattr(pytest.mark, "AC-n")` を付け、docstring 先頭に `[REQ-432/AC-n]` を書く。複数 AC にまたがるケースは該当 marker を全て付ける。FE は `-t "REQ-432/AC-n"`（`it('[REQ-432/AC-n] ...')`）。コメントだけのタグ付けは無効とする。
- **収集要件**: 選択集合 S は §4 の全ケース ID。S ⊆ 収集 C、S の全件 PASS、空収集・重複 ID・未知 AC タグ・未承認 skip/xfail は不合格とする。
- **凍結候補**: Gate 2/3 は最終レビュー済み候補（コミット SHA または tree hash）で新規に実行し、記録に候補識別子を残す。

## 4. AC トレーサビリティ・テストケースマトリクス

### AC-1: 自セッション残留のみを理由に無期限待機しない

| ID | Tier | ファイル | ケース（関数名 / docstring 先頭） |
|---|---|---|---|
| AC1-U-1 | unit (PBT) | `backend/tests/governance/test_vram_guard.py` | `test_guard_free_treats_own_torch_reserve_as_reclaimable` / `[REQ-432/AC-1]` 不変条件: `0 <= guard_free <= T`、R の増加で guard_free は減らない、`R=Rf=0` なら `guard_free == F` |
| AC1-U-2 | unit | 同上 | `test_measured_post_generation_residual_is_not_held` / `[REQ-432/AC-1]` 計測 B 点（T=16GiB, F=6.76GiB, R=7.216GiB, Rf=0.2GiB, min=6.0）→ `safe=True`, `source="comfyui"` |
| AC1-I-1 | integration | 同上 | `test_sample_guard_status_excludes_own_residual_with_bridge` / `[REQ-432/AC-1]` 実 bridge（MockTransport が B 点を返す）+ ホスト空き 5.3 → `vram_safe=True`、`vram_free_gb=5.3`（物理値は維持）、`vram_guard_free_gb>=6.0` |
| AC1-I-2 | integration | `backend/tests/integration/legacy/test_generation_service.py` | `test_own_residual_only_does_not_hold_dispatch` / `[REQ-432/AC-1]` probe が `{host 5.3, guard 13.5, min 6.0}` → 1 秒以内に `bridge.submissions` が 1 件 |
| AC1-S-1 | scenario | 同上 | `test_consecutive_generations_with_resident_model_never_wait` / `[REQ-432/AC-1]` job1 完了後に probe が残留状態を返し、job2 が保留されず投入される（`_vram_wait_started` に残らない） |
| AC1-G3 | scenario（実機） | Gate 3 R-1 | §6 R-1 |

### AC-2: 他プロセス占有は保留し、理由を区別する

| ID | Tier | ファイル | ケース |
|---|---|---|---|
| AC2-U-1 | unit | `test_vram_guard.py` | `test_external_occupancy_is_held_with_external_reason` / `[REQ-432/AC-2]` F=2.0, R=0.3, Rf=0.1, min=6 → `safe=False`, `hold_reason="external"` |
| AC2-U-2 | unit | 同上 | `test_host_fallback_hold_is_unattributed` / `[REQ-432/AC-2]` comfy=None, host 3.0 → `hold_reason="unattributed"`, `source="host"` |
| AC2-U-3 | unit (PBT) | 同上 | `test_hold_reason_invariants` / `[REQ-432/AC-2]` `hold_reason is None ⇔ safe`、理由 ∈ {external, unattributed}、ガード無効なら常に safe、境界 `guard_free == min` は safe |
| AC2-U-4 | unit | 同上 | `test_parse_comfy_system_stats_rejects_invalid_payloads` / `[REQ-432/AC-2]` 負値・NaN・Infinity・bool・devices 空・`Rf>R`・`F>T`・`T<=0`・非 dict → `None`（パラメータ展開 ID を固定: `[neg]`,`[nan]`,`[inf]`,`[bool]`,`[empty]`,`[rf_gt_r]`,`[f_gt_t]`,`[t_zero]`,`[not_dict]`） |
| AC2-I-1 | integration | 同上 | `test_system_stats_broadcast_carries_hold_reason_and_recovery` / `[REQ-432/AC-2]` `_run` が `vram_hold_reason="external"`、`vram_safe=False` を配信し、回復時に `VRAM_RECOVERED` を 1 回配信する |
| AC2-I-2 | integration | `test_comfy_generation_bridge.py` | `test_system_stats_faults_return_none_without_touching_health` / `[REQ-432/AC-2]` 503、`httpx.ReadTimeout`、`httpx.ConnectError`、非 JSON、JSON 配列 → `None`、`get_upstream_state()` が呼び出し前と同値（パラメータ ID: `[503]`,`[timeout]`,`[connect]`,`[non_json]`,`[array]`） |
| AC2-I-3 | integration | `test_generation_service.py` | `test_external_hold_logs_reason_and_remains_cancellable` / `[REQ-432/AC-2]` probe=external → submissions 0、clock を 10 秒進めると警告ログに `reason=external` が出る、`cancel` で `cancelled` になり上流へ POST しない |
| AC2-FE-1 | integration | `frontend/src/pages/GeneratePage/__tests__/vramGuardIntegration.test.ts` | `[REQ-432/AC-2] external hold exposes reason and guard free value in wait status` |
| AC2-FE-2 | integration | 同上 | `[REQ-432/AC-2] unattributed hold uses distinct warning toast text` |
| AC2-FE-3 | integration | `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx` | `[REQ-432/AC-2] status bar distinguishes external and unattributed wait reasons` |
| AC2-FE-4 | integration | `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | `[REQ-432/AC-2] vram wait banner distinguishes unattributed reason and keeps legacy label otherwise` |
| AC2-FE-5 | unit | `frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx` | `[REQ-432/AC-2] fallback threshold for empty or invalid stored value equals backend default 6.0 GB`（T6。SPEC 整合の是正: 空・非数値の保存値で `readStoredVramLimit` が 6 を返す。既存 L208 の期待値 4 も 6 に調整） |
| AC2-G3 | scenario（実機） | Gate 3 R-2 | §6 R-2 |

### AC-3: primary LUID のアダプタのみを使用量に含める

| ID | Tier | ファイル | ケース |
|---|---|---|---|
| AC3-U-1 | unit (PBT) | `test_vram_guard.py` | `test_adapter_usage_counts_only_primary_luid` / `[REQ-432/AC-3]` 任意の LUID 集合と値で、一致がある限り結果 = 一致インスタンス合計、非一致は加算されない |
| AC3-U-2 | unit | 同上 | `test_measured_two_adapter_instances_use_primary_only` / `[REQ-432/AC-3]` primary 10734MiB + 別 LUID 4000MiB → primary のみ |
| AC3-U-3 | unit | 同上 | `test_adapter_usage_falls_back_to_total_when_primary_unresolved` / `[REQ-432/AC-3]` LUID 未解決・一致 0 件 → 全合算（0 にならない）（パラメータ ID: `[unresolved]`,`[no_match]`） |
| AC3-U-4 | unit | 同上 | `test_adapter_usage_fallback_logs_debug_only_on_first_occurrence` / `[REQ-432/AC-3]` 未解決・一致 0 件で 3 回呼んでも debug レコードは 1 件、戻り値は全合算のまま。理由を切り替えても増えない（共通フラグ）（パラメータ ID: `[unresolved]`,`[no_match]`。T5） |
| AC3-U-5 | unit | 同上 | `test_adapter_usage_primary_match_does_not_log_fallback` / `[REQ-432/AC-3]` 一致経路では debug レコード 0 件でフラグも消費しない（直後の未解決呼び出しで 1 件）（T5） |
| AC3-I-1 | integration | 同上 | `test_windows_collect_reports_primary_adapter_usage` / `[REQ-432/AC-3]` `_read_counter_items` 境界のみ切断し `collect()` の `vram_used_gb` が primary のみ（win32） |
| AC3-G3 | scenario（実機） | Gate 3 R-3 | §6 R-3 |

### AC-4: 判定直前の値で判断する

| ID | Tier | ファイル | ケース |
|---|---|---|---|
| AC4-I-1 | integration | `test_vram_guard.py` | `test_sample_guard_status_ignores_stale_cache` / `[REQ-432/AC-4]` `_last_vram_free_gb=1.0`（古い値）でも新規ホスト値 12.0 で `vram_safe=True`、2 回呼ぶとホスト I/O と provider がそれぞれ 2 回呼ばれる |
| AC4-I-2 | integration | 同上 | `test_comfy_stats_timeout_falls_back_to_fresh_host_value` / `[REQ-432/AC-4]` provider が 1.0 秒を超える → ホスト値で判定、`source="host"` |
| AC4-I-3 | integration | `test_generation_service.py` | `test_dispatch_uses_probe_value_at_decision_time` / `[REQ-432/AC-4]` 同期 `vram_status` は保留値を返し、probe は安全値を返す → 投入される（probe 優先） |
| AC4-I-4 | integration | 同上 | `test_held_job_rechecks_fresh_probe_at_bounded_interval` / `[REQ-432/AC-4]` recheck=0.3 秒で保留中の probe 呼び出し間隔が 0.3 秒以上、probe が安全に変わると次の再評価で 1 回だけ投入 |
| AC4-I-5 | integration | 同上 | `test_probe_failure_does_not_block_dispatch` / `[REQ-432/AC-4]` probe が例外 → 従来どおり判定不能で保留しない |
| AC4-G3 | scenario（実機） | Gate 3 R-4 | §6 R-4 |

手戻りカード（T5/T6）の Red 条件: AC3-U-4/U-5 は実装前に debug レコード件数の AssertionError、AC2-FE-5 は `expected 4 to be 6` で失敗すること（収集・型・属性エラーは Red と認めない）。Gate 1〜3 は T5/T6 を含む最終候補で新規に再実行する（T1〜T4 時点の記録は流用しない）。

既存回帰（変更せず PASS 必須）: `test_vram_guard.py` の REQ-260 AC-1〜AC-5・REQ-394 AC-4、`test_generation_service.py` の `test_vram_wait_*` と REQ-335 AC-4、FE `vramGuardIntegration.test.ts` の既存 6 件、`MobileLayout.test.tsx` の `[REQ-371/AC-5]`。

lifespan 結線の回帰（T7）: `backend/tests/integration/legacy/test_generation_api.py` の既存 13 件（REQ-335/REQ-387/REQ-401 タグ付きを含む）を全件 PASS 必須とする。新規 AC ケースは追加しない。Red は T2 後の現状で 13 件全てがセットアップ時の `AttributeError`（`FakeMonitor.configure_comfy_stats` 欠落。修正途中では `FakeBridge.system_stats` 欠落）による ERROR となること。テストダブル `FakeMonitor`/`FakeBridge` は本番の C3/C5 シグネチャに合わせる（Seam Map の Severed 側の差し替えであり、内部ロジックのパッチではない）。`test_committed_work_continues_after_request_without_browser_connection` は `vram_recheck_seconds=1.0` に合わせて待機上限だけを 3.0 秒に広げ、`--count 5` の逐次反復で安定性を確認する。Gate 2 は T5〜T7 を含む最終候補で新規に実行する。

## 5. Red Team 境界値・異常系シナリオ（Gate 3）

| ID | 攻撃・異常 | 期待 |
|---|---|---|
| RT-1 | `/system_stats` が `torch_vram_total` を総量超過で返す | `parse` で `None`（`F>T` または clamp）。guard_free が T を超えない |
| RT-2 | `torch_vram_free > torch_vram_total` | `None` → ホストフォールバック、理由 `unattributed` |
| RT-3 | JSON に `NaN`/`Infinity`（Python json は受理する） | `None`。非有限値を判定に使わない |
| RT-4 | ComfyUI 停止中（接続拒否）に生成投入 | ホスト値で判定。残留ゼロなら投入され、上流ヘルス表示は bridge の WS/HTTP 既存規則のみで変わる |
| RT-5 | `/system_stats` が 5 秒応答しない | 1.0 秒で打ち切る。worker のロック保持は約 1 秒以内、キャンセルは完了する |
| RT-6 | 閾値ちょうど（guard_free == min） | 保留しない（REQ-260 境界と同一） |
| RT-7 | ガード無効化中に外部占有 | 保留しない。`vram_hold_reason=null` |
| RT-8 | primary LUID の大文字表記・`phys_1` 追加 | 小文字化して一致し、同一 LUID の phys は合算する |
| RT-9 | 保留中に設定で閾値を下げる | 次の再評価（1 秒以内）で投入され、重複投入しない |
| RT-10 | 保留中のジョブを複数同時投入 | 先頭ジョブだけが probe を呼び、再評価間隔を守る。回復後は順序どおり 1 回ずつ投入する |
| RT-11 | 旧 Backend 形式の `SYSTEM_STATS`（追加フィールドなし）を FE が受信 | 既存文言・`vram_free_gb` 表示で動作する（後方互換） |

保存（preservation）確認: `SYSTEM_STATS` の周期 2.5 秒、`VRAM_RECOVERED` の形式、`GET/PUT /api/settings/vram` の応答、手動メモリ解放の挙動に変化がないこと。

## 6. 実機シナリオ（Gate 3、証跡は `docs/logs/REQ-432/` に保存）

前提: Windows 11 / RX 9070 XT / ComfyUI（WSL2）/ `vram_min_free_gb=6.0` / ガード有効。

- **R-1（AC-1）**: SDXL を 2 件連続で投入する。2 件目の `queued → submitting` が 2 秒以内に起き、Backend ログに VRAM 待機警告が出ないこと。投入時点の `SYSTEM_STATS` の `vram_free_gb`（物理、5GB 前後を想定）と `vram_guard_free_gb` を記録する。
- **R-2（AC-2、Q1 確認）**: Windows ネイティブの他プロセス（LM Studio でモデルを 8GB 以上ロード等）で占有してから投入する。保留されること、`vram_hold_reason="external"`、ComfyUI の `vram_free` が占有分だけ減っていることを記録する。占有を解放すると 1 回だけ投入されること。**ComfyUI の `vram_free` が占有を反映しなかった場合は不合格とし、設計に差し戻す（設計書 §10.3 Q1）。**
- **R-3（AC-3）**: PDH の primary アダプタの `Dedicated Usage` と `SYSTEM_STATS.vram_used_gb` が一致すること（2 枚目アダプタは計測対象外）。
- **R-4（AC-4）**: 外部占有で保留中に占有を解放し、解放から投入までの時間を記録する。ComfyUI 基準では 2 秒以内を期待する。ホストフォールバック（ComfyUI 停止）の場合は PDH の反映遅延（約 12 秒）+ 1 秒以内であることを記録する。

## 7. Mandatory Full-Suite Fallback 条件

以下のいずれか（OR）に該当する場合、V2 は適用不可とし、Gate 2 フルスイートを新規に実行する（本 PBI は high のため常時適用）。

- high リスクスコープ（公開 WS 契約、worker ゲート、共有シングルトン、lifespan 結線）への変更。
- 収集差異（S ⊄ C）、空収集、想定外 skip（Windows 上の AC3-I-1 skip を含む）、xfail 追加。
- モック水準違反（§7 Seam Map に反する内部パッチ）、意味的欠陥、カバレッジ欠落。
- 既存 VRAM・生成テストの flaky（0.2 秒ポーリングや再評価間隔に依存するテストの不安定化）。
- 未検証の影響（Settings、ヘッダー、`useSystemStats` の `vram_safe` 消費箇所、lifespan に差し込むテストダブル。T7 の grep 一覧外のダブルが見つかった場合を含む）。
- リスク・環境の不明点（実機 R-2 未実施を含む）。low に丸めない。
