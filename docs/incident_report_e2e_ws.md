# Incident Triage Report: Gate 3 E2E generateMobileGallery.spec.ts が /api/ws 未遮断により実バックエンドのスナップショットを受信して失敗する

<incident_metadata>
- Created_At: 2026-10-25 19:33:26
- Investigation_Status: PBI_REGISTERED
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: scripts/run_e2e.py (Gate 3) で frontend/e2e/generateMobileGallery.spec.ts の [REQ-372/AC-3][AC-4][AC-5][AC-7] が FAIL（4 failed / 4 passed）。AC-3: mobile-image-sheet-content 内の img[alt=プレビュー画像] が存在しない。AC-4/AC-5: 同 img の click が 20s タイムアウト。AC-7: 空状態文言 'No history images found for this session.' が表示されず『他セッションの履歴（185件）があります』が表示される。失敗時スナップショットには System OFFLINE、Queue 3、全サムネイルに『サムネイル再試行』が出ており、スタブではない実データが描画されていた。
- Reproducibility: 100%（バックエンド :8000 稼働中、2026-10-25）。run_e2e.py e2e/generateMobileGallery.spec.ts で再現。対照実験として spec のスクラッチ複製の stubApi() に page.routeWebSocket((url) => url.pathname === '/api/ws', () => {}) の1行のみ追加して同一環境で実行すると 8 passed。
- Impact_Scope: Gate 3 の結果が実行環境（ローカルバックエンド稼働有無と実DBの内容）に依存し非決定的になる。プロダクトコードの挙動は正常。frontend/e2e 配下の他 spec も routeWebSocket を使用しておらず、同種の環境依存リスクを持つ（未検証）。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: spec の stubApi() は page.route で HTTP の /api/* のみをスタブし、WebSocket /api/ws を遮断していない（page.route は WebSocket を捕捉しない）。systemWsService.ts が window.location.origin の /api/ws に接続し、vite.config.ts の proxy '/api'（target http://127.0.0.1:8000, ws: true）経由で稼働中の実バックエンドに接続、実生成スナップショットがスタブの /generation/state 応答を上書きする。結果、AC-3/4/5 では実画像URLが読み込めず MobileImageSheet の hasError 分岐でエラー表示となり img が描画されず、AC-7 では実データの他セッション履歴により otherSessionCount>0 の分岐が選ばれる。SPEC_TEST_ARCHITECTURE.md:22 はネットワークI/O（WebSocket含む）境界でのモックを定めており、テスト実装がこれを満たしていない。副次的に、SPEC には Gate 3 における WS 隔離の明示規定がなく、run_e2e.py も :8000 稼働を検査しない（Type B 要素）。
- Failure_Location: `frontend/e2e/generateMobileGallery.spec.ts:83 (stubApi); frontend/src/store/services/systemWsService.ts:26; frontend/vite.config.ts:78-84; frontend/src/pages/GeneratePage/components/MobileImageSheet.tsx:258; frontend/src/pages/GeneratePage/sections/GenerationGallerySection.tsx:409; docs/specs/SPEC_TEST_ARCHITECTURE.md:22`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1) generateMobileGallery.spec.ts の stubApi() に page.routeWebSocket で /api/ws を遮断（必要に応じて決定論的スナップショットを送信）する処理を追加する。2) 任意: frontend/e2e 共通ヘルパーに HTTP+WS の一括スタブを集約し他 spec にも適用する。3) 任意: run_e2e.py に :8000 稼働時の警告または検出を追加する。4) 任意: SPEC_TEST_ARCHITECTURE.md の Gate 3 節に実バックエンド非依存（WS 含む）を MUST として明記する。検証: バックエンド稼働中・停止中の両条件で run_e2e.py 全体を実行し PASS を確認する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-395
</linked_artifacts>
