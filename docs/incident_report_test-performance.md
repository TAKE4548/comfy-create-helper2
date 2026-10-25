# Incident Triage Report: テストスイート実行時間の劣化（FE vitest 134秒 / BE pytest 並列40秒・逐次119秒）

<incident_metadata>
- Created_At: 2026-10-25 16:00:23
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: SPEC_TEST_ARCHITECTURE.md の実績値（FE全体 ~38秒、BE並列 ~30秒、BE逐次 ~89秒）に対し、2026-10-25 の実測は FE npx vitest run 134〜136秒（247ファイル/2607テスト全PASS）、BE pytest -n auto 40.0秒（リポジトリ直下から実行）、BE逐次 118.9秒（774テスト全PASS）。
- Reproducibility: 再現性あり。FE標準実行2回で134.2秒/135.9秒。FE maxForks=6 で111.3秒。BE -n auto は直下実行40.0秒、パス指定(backend/tests tests)31.7秒。BE収集のみ: 直下9.57秒、パス指定1.66秒、--ignore=db で4.89秒。計測時のCPU負荷15%、空きメモリ約9GB（Antigravity・LM Studio・ブラウザ常駐）。
- Impact_Scope: Gate 2（FE全体・BE並列）および Gate 1 の FE 単体実行の所要時間。テスト結果の正否には影響なし（全PASS）。FEが最大の要因で、BEは副次的。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: [FE・主要因] vitest 1.6.1 の pool:'forks'（既定 isolate:true、既定 maxForks=論理CPU-1=15）で全247ファイルに jsdom 環境を一律適用しているため、ファイル単位の初期化コストが支配的。Duration 内訳の累計: environment 1041秒、collect 367秒、prepare 151秒、setup 150秒に対し tests 193秒（約9割がテスト本体以外）。15プロセス並列で物理10コアを超過し、jsdom初期化が1ファイル平均約4.2秒に膨張（maxForks=6 では約1.1秒/ファイル、wall 111秒）。DOM不要の可能性がある .test.ts 95ファイルも jsdom で実行（@vitest-environment 指定は0件）。個別に遅いテスト: residualHistoryRestore 5.26秒、queryCachePersister 4.06秒/2.05秒、apiCacheStorage 2.03秒 等。なお基準コミット 1cc9196 時点で231ファイル→現在247ファイル（+7%）で、ファイル増だけでは3.5倍化を説明できず、38秒の実績値が計測された条件は未確認（ベースラインの再計測は未実施）。 [BE-1] ResourceMonitorService.INTERVAL=2.5秒の監視ループが lifespan 開始直後に1回送信後 asyncio.sleep(2.5) するため、TestClient で接続して SYSTEM_STATS を待つ WS 系テスト（test_ws.py 6件、test_vram_guard の1件）が各約2.8秒、計約20秒（逐次）。 [BE-2] ルート pytest.ini に testpaths が無く、リポジトリ直下から実行すると db/（キャッシュ画像約13,600ファイル）、docs、frontend 等を走査し収集が約8秒増加。-n auto では各ワーカーで発生し 40.0秒 vs 31.7秒。 [BE-3] 個別の重いテスト: FuguMT 実モデルのトークナイザ読込 4.91秒、ディスクキャッシュ間引きで実ファイル4,001件作成 4.42秒、Hypothesis 再帰JSONプロパティテスト 4.36秒、起動リカバリ 2.50秒。 [BE-4] app.main の import に約2.2秒（resource_monitor 単体 0.41秒、nltk 0.25秒）で、並列時は各ワーカーで発生。
- Failure_Location: `frontend/vite.config.ts:66-68 (environment:'jsdom', pool:'forks'); backend/app/services/resource_monitor.py:307,390 (INTERVAL=2.5, asyncio.sleep); pytest.ini:6 (testpaths未定義); backend/tests/integration/legacy/test_ws.py:17-45; backend/tests/integration/legacy/test_comfy_proxy.py:328-344; backend/tests/integration/legacy/test_fugumt_service.py:194-203; tests/unit/test_server_status.py:230-241; docs/specs/SPEC_TEST_ARCHITECTURE.md:56,122`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: (1) FE: DOM不要の .test.ts を node 環境へ移す（environmentMatchGlobs または各ファイルの @vitest-environment）。maxForks を物理コア数以下に制限、または pool:'threads' / isolate の見直しを計測比較（isolate:false は状態リーク検証とセットで判断）。上位の遅いテストのタイマー・IndexedDB 待ちを確認。 (2) BE: WSテストで ResourceMonitorService.INTERVAL を小さくする、または接続時に即時送信するフィクスチャを用意。ルート pytest.ini に testpaths = backend/tests tests を追加。FuguMT 実モデルテストと4,001ファイル作成テストにマーカーを付けて Gate 2 から分離、または件数閾値を monkeypatch。Hypothesis の max_examples を明示。 (3) SPEC: SPEC_TEST_ARCHITECTURE.md の実績時間を再計測値に更新し、性能予算（時間上限・ワーカー数・環境選択方針）を規範として定義する（現状は実績値の記述のみで制約がないため Type_B）。
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-394
</linked_artifacts>
