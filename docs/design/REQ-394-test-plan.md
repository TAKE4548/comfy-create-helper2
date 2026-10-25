# REQ-394 テスト計画

- 設計: `docs/design/REQ-394.md`（Seam Map は §6、予算は §3）
- 命名: 新規テスト名に `[REQ-394/AC-n]` を含める（pytest は parametrize id、vitest は `it` 名）。`-k "REQ-394/AC-3"` / `-t "REQ-394/AC-1"` で選択できる。ticket ID を含む新テストファイルは作らない（既存ファイルを拡張する）。
- 実行場所: リポジトリルート。`PYTHONDONTWRITEBYTECODE=1`。GPU 不使用（CPU/RAM のみ）。
- 本 PBI はテスト基盤の変更であり、受入の主証拠は「既存テストが全件 PASS し、件数が宣言どおりで、予算内」であること。新規テストは FE 2 件・BE 3 件のみ。

## 1. AC 対応表

| AC | ケース（runner ID） | Tier | Card |
| --- | --- | --- | --- |
| AC-1 | `frontend/src/test/utils/queryHelpers.test.ts` > `queryHelpers (AC-6)` > `[REQ-394/AC-1] node-environment files run without a DOM` | unit | T4 |
| AC-1 | `frontend/src/test/utils/storeHelpers.test.ts` > `storeHelpers (AC-6)` > `[REQ-394/AC-1] files without a docblock keep the jsdom default` | unit | T4 |
| AC-1 | `cd frontend; npm test` が 247 ファイル / 2609 テスト全 PASS、wall が予算内、Duration 内訳が `docs/logs/REQ-394/final-fe-*.txt` に残る | scenario | T4, T5, T6, T8 |
| AC-1 | 既存の遅いテスト 4 ファイルが件数・結果不変（T5 の前後比較） | integration | T5 |
| AC-2 | `pytest --collect-only -q` のノードID集合が baseline（`be-collect-baseline-ids.txt`、774 件）+ 新規 3 件と一致 | scenario | T1, T8 |
| AC-2 | `backend\.venv\Scripts\python -m pytest -n auto` が 777 件全 PASS、wall が予算内 | scenario | T1〜T3, T8 |
| AC-3 | `backend/tests/governance/test_pytest_collection.py::test_root_pytest_ini_declares_testpaths_for_backend_and_tests[[REQ-394/AC-3]-testpaths-declared]` | unit | T1 |
| AC-3 | 同ファイル `::test_collection_without_args_skips_db_docs_frontend_dirs[[REQ-394/AC-3]-with-testpaths]`（成功）と `[[REQ-394/AC-3]-control-without-testpaths]`（対照: 衝突で失敗） | integration | T1 |
| AC-3 | ルートでの実収集: ノードIDがすべて `backend/tests/` か `tests/` で始まり、pytest 内計時がパス指定の 1.25 倍以内 | scenario | T8 |
| AC-4 | `backend/tests/integration/legacy/test_ws.py` の既存 WS 6 件（`test_ws_receives_system_stats`、`test_ws_stats_types`、`test_ws_gpu_fallback_when_smi_unavailable`、`test_ws_multiple_clients`、`test_ws_windows_gpu_monitor_metrics`、`test_ws_windows_gpu_monitor_exception_handling`）。アサーション不変、`_receive_until` に経過 2.0s 未満の恒久ガードを追加 | integration | T2 |
| AC-4 | `backend/tests/governance/test_vram_guard.py::TestVramGuardAPI::test_ws_broadcast_includes_vram_fields`（同上） | integration | T2 |
| AC-4 | 上記 7 件が各 1.5s 未満（`--durations=0` で確認） | scenario | T2, T8 |
| AC-5 | doc-verify: SPEC_TEST_ARCHITECTURE.md に再計測値・性能予算・環境選択方針が規範として記載（意味・矛盾・適用範囲・参照・AC シナリオ） | doc | T9 |

AC-2 の「意図しない増減なし」は、収集件数（BE 774 → 777、FE 2607 → 2609）が宣言した新規ケースだけで説明できることを意味する。減少・未宣言の増加・skip/xfail の発生は FAIL。

## 2. 統合・E2E フロー

- IG1（FE 全体）: 3 回連続で `cd frontend; npm test`。各回で 247 ファイル / 2609 テスト PASS、skipped 0。FE の Duration 行をそのまま保存する。
- IG2（FE 同値性）: baseline のテスト一覧（`fe-baseline-test-ids.txt`、2607 件）と適用後の一覧を比較し、欠落 0・失敗 0、増分は上記カナリア 2 件のみ。
- IG3（BE 全体）: ルートで `pytest -n auto` を 3 回連続。777 件 PASS、skip/xfail 0。
- IG4（BE 収集）: ルートで `--collect-only -q` を 2 回、`backend/tests tests` 指定を 2 回。ノードID集合の差分は空であること（ルートとパス指定が同じ集合）。
- IG5（Gate 3）: `backend\.venv\Scripts\python scripts/run_e2e.py`。本 PBI は E2E に影響しないが、V1 で必須。

## 3. リスク評価とフルスイート・フォールバック

- 分類: **high**。理由: vitest の環境選択と pytest の収集範囲は検証コマンドの入力を変える（verification）。`backend/tests/governance/test_pytest_collection.py` と WS テストの時間定数は共有フィクスチャ相当。`.agents/verification.json`（T7）は検証契約。
- 検証プロファイル: **V1 Baseline**。V2 は採用しない（R-AR-5）。
- フォールバック（OR）: 高リスク範囲に該当する（常に成立）／収集件数が宣言（FE 2609、BE 777）と不一致／空収集／想定外の skip・xfail・deselect／追跡入力・argv・環境の変更（`pytest.ini` を含む）／フレイク／意味的欠陥（アサーションの削除・緩和、トリビアルなアサーション）／未検証の影響。Gate 2 は `scripts/run_full_suite.py`（フィルタ無し）で実行する。
- 未知のリスクは low にしない。

## 4. Red Team / 境界

| ID | 対象 | シナリオ | 期待 |
| --- | --- | --- | --- |
| RT1 | 状態リーク | node 化した 43 ファイルを `--sequence.shuffle` で 2 回、jsdom ファイルと混在させて実行 | 全 PASS。ハングなし |
| RT2 | isolate | `vite.config.ts` に `isolate: false` が無く `true` が明示されていること（grep） | `isolate: true` のみ |
| RT3 | 収集漏れ | 変更後に `grep -L "@vitest-environment node"` で 43 件の付与漏れを検出。逆に、付与ファイルが 43 件を超えていないこと | 欠落 0、超過 0 |
| RT4 | 件数減少の見逃し | BE ノードID差分、FE テスト一覧差分（IG2/IG4） | 欠落 0、増分は宣言分のみ |
| RT5 | カナリア有効性 | 一時的に `queryHelpers.test.ts` の docblock を外して実行 → カナリアが FAIL することを確認し、戻す（tester が作業コピー上で実施） | FAIL を観測 |
| RT6 | testpaths 形骸化 | `test_collection_skips_docs_logs_copies_with_duplicate_basenames[True/False]` が `.` 明示で動き、対照 False が衝突すること | True は成功、False は衝突 |
| RT7 | WS ガードの有効性 | 一時的に `test_ws.py` の fixture を無効化して `-k test_ws_receives_system_stats` → 経過ガードで FAIL | FAIL を観測 |
| RT8 | 予算超過 | 計測が予算外（かつ負荷 60% 以下） | FAIL 区分で報告し設計へ戻す。予算を暗黙に緩めない |
| RT9 | 無効計測 | 負荷 60% 超 | 無効扱いで再計測。PASS 根拠にしない |
| RT10 | 定数縮小の取り違え | `test_prune_disk_cache_if_needed` で本番定数が 4000/3600 のままであることを別アサーションで固定 | 変更検知 |
| RT11 | fixture 残存 | `INTERVAL` の monkeypatch がテスト後に戻ること（`ResourceMonitorService.INTERVAL == 2.5` を後続テストで確認） | 2.5 に復帰 |
| RT12 | 独立性 | tester は engineer のログを使わず、確定候補で Gate 1〜3 を新規実行 | 新規ログ |

## 5. 環境と収集設計

- ランタイム: Windows、`backend\.venv\Scripts\python`（pytest 9.1.0、xdist）、Node 22、vitest 1.6.1、jsdom 24。
- 収集パターン: BE はルート `pytest.ini` の `testpaths = backend/tests tests`。FE は `include: src/**/*.{test,spec}.{ts,tsx}`（変更なし）。
- 凍結候補の再記録: tracked inputs が変わるため（`pytest.ini`、`frontend/vite.config.ts` を含む）、最終レビュー済み候補の SHA を tester が Gate 実行前に記録する。`pytest.ini` は現行の identity に含まれない（設計 §7）。T7 が未承認の場合は、tester が `pytest.ini` のハッシュを手動で候補記録に含める。
- 計測プロトコル: 計測前後に `(Get-CimInstance Win32_Processor).LoadPercentage` を記録。3 回連続、中央値と最大を判定に使う。Duration 行は FE の標準出力から転記する。

## 6. 実行コマンド（テスト配置は既存ファイルの拡張）

| 目的 | コマンド |
| --- | --- |
| FE カナリア | `cd frontend; npx vitest run src/test/utils/queryHelpers.test.ts src/test/utils/storeHelpers.test.ts -t "REQ-394/AC-1"` |
| BE AC-3 | `backend\.venv\Scripts\python -m pytest backend/tests/governance/test_pytest_collection.py -k "REQ-394/AC-3 or duplicate_basenames"` |
| BE AC-4 | `backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_ws.py backend/tests/governance/test_vram_guard.py --durations=0` |
| Gate 1 | `backend\.venv\Scripts\python -m mypy backend`、`backend\.venv\Scripts\python -m pytest backend/tests/unit`、`cd frontend; npm run typecheck`、`backend\.venv\Scripts\python scripts/verify_ui_invariants.py` |
| Gate 2 | `backend\.venv\Scripts\python scripts/run_full_suite.py` |
| Gate 3 | `backend\.venv\Scripts\python scripts/run_e2e.py` |

`scripts/verify_test_naming.py` は実行時に追跡ファイル `docs/design/REQ-356-test-mapping.md` を書き換えるため、検証コマンドに含めない。

## 7. AC-5 文書検証（T9、doc-verify）

文書のみの変更であり、API 抽出・型検査・TDD は対象外。`docs/specs/SPEC_TEST_ARCHITECTURE.md` と、T9 が所有する Gate 2 時間記述 1 行ずつ（`.agents/context.md` 行 21、`README.md` 行 87）を doc-reviewer が独立に確認する。Document PASS は AC-1〜AC-4 のコード検証を代替しない。

### 7.1 検証観点

| 観点 | 確認内容 |
| --- | --- |
| 意味 | §8 の MUST / 目安の区分が曖昧でなく、予算・有効計測条件・超過時の扱い（FAIL と設計差戻し、暗黙の緩和禁止）が読み取れる。FE の環境選択方針（docblock、実行で判定、`isolate: true`、`isolate: false` 禁止）と BE の方針（ルート testpaths、待ち時間定数のみ縮小、マーカー除外禁止）が実装（T1〜T6）と一致する |
| 矛盾 | §4・§6 の実績が §8.5 と同値。§8.2 の予算と §8.5 の予算列が一致。§1 の「内部関数の独断パッチ禁止」と §8.4 の許容範囲（待ち時間定数・閾値・`poll_interval`）が衝突しない。§5.2 の設定ファイル記述が実在ファイルと一致。旧実績（`~38秒` / `~30秒` / `~89秒`）が SPEC の §8.5 の説明文以外に残らず、context.md 行 21・README 行 87 に `~30秒` が残らない。両ファイルの Gate 2 時間が SPEC §6 の Gate 2 行と同一値 |
| 適用範囲 | 予算の適用対象が Gate 2 のフルスイートで、Gate 1・Gate 3・局所実行を縛らない。再計測していない E2E・単体・局所の実績が据え置かれ、据え置きの注記がある |
| 参照 | `final-summary.md`（出典）、`frontend/vite.config.ts`、ルート `pytest.ini`、`backend/pytest.ini`、他文書から参照される SPEC の節番号（既存節の番号が不変）が実在する |
| AC シナリオ | 下記 |

### 7.2 AC-5 シナリオ

| ID | 種別 | 内容 | 期待 |
| --- | --- | --- | --- |
| D1 | 正常 | SPEC の各実績値（FE/BE の中央値・最大、Duration 内訳、逐次、収集時間、件数、負荷範囲）を `final-summary.md` の対応値と 1 つずつ照合 | 全一致。丸め以外の差なし |
| D2 | 正常 | §8.2 の予算値を人間承認値と照合し、§8.5 の実績が予算内であることを確認 | 一致、実績は予算内 |
| D3 | 正常 | §8.3 の「`// @vitest-environment node` を付与済みのファイル数」の記述が無い（件数は実績で変動するため規範にしない）ことと、方針が `vite.config.ts` の実体（`isolate: true`）と一致 | 一致 |
| D4 | 失敗 | 転記トークン `@@` の残存、仮値・空欄、`final-summary.md` に無い値の記載を検索 | 0 件 |
| D5 | 失敗 | 実績が予算超過の状態で §8.5 が緩和された予算になっていないこと（予算が人間承認値のまま） | 緩和なし |
| D6 | 境界 | 新設が末尾の §8 で、既存の節番号（§1〜§7）と見出しが不変 | 不変 |
| D7 | 維持 | §1〜§3、§5.1、§7、E2E・単体・局所の実績、Gate 1・Gate 3 行が変更前と同一（`git diff` で §8・§4・§6 Gate 2 行・§5.2・ヘッダ以外に差分がない） | 差分なし |
| D8 | 維持 | SPEC・context.md・README の文字コードが UTF-8 BOM なし・LF、T9 の変更ファイルがこの 3 つだけ | 満たす |
| D9 | 正常 | T7 は承認・実施済みのため、§8.5 の「検証候補の注」が T7 実施版の文（ルート `pytest.ini` を `root_files` で identity に含める）になっており、代替文が混入していない。`.agents/verification.json` の `root_files` に `pytest.ini` がある | 一致 |
| D10 | 正常 | `.agents/context.md` 行 21 と `README.md` 行 87 の Gate 2 時間が SPEC §6 の Gate 2 行（BE並列・FE全体の中央値）と同一値で、`予算は SPEC §8` の参照が実在する節を指す | 一致 |
| D11 | 維持 | `git diff -U0` で context.md・README の差分がそれぞれ行 21 / 行 87 の 1 行のみ（`-` 1 行・`+` 1 行）で、Gate 2 見出しの時間記述以外の文字が変わっていない。両ファイルに `~30秒` と `@@` が残らない | 満たす |

### 7.3 コマンド（実行範囲）

T9 カードの「完了条件・検証コマンド」を使う。`scripts/verify_test_naming.py` と重いスイートは実行しない。意味・矛盾・適用範囲の判断は reviewer が文書を読んで行い、`Select-String` の件数だけで PASS としない。
