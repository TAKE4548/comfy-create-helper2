# Incident Triage Report: Generation snapshot の全件同期読込がイベントループを占有しBE全体の応答が遅延する

<incident_metadata>
- Created_At: 2026-10-25 01:46:57
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 生成画面のバイパススイッチ、生成キュー取消、履歴プレビュー取得、履歴/各管理画面の画像・サムネ取得など全体的に応答が遅い。BEサーバ端末上のlocalhostアクセスでも重い。logs/app.jsonl.2026-10-24 の実測: 軽量マスタAPIでも最大値が異常（/api/stage-masters max 32.5s, /api/base-models 19.6s, /api/tag-sets 32.5s, /api/loras 35.3s, /api/workflow-presets p95 2.3s max 200.7s, /api/comfy/view p50 2.7s max 12.7s, /api/generation/state p50 0.79s max 19.4s, POST /api/generation/cancel p50 53s max 277s）。処理内容に関係なく全エンドポイントが同時に遅延しており、単一asyncioイベントループの停止（スレッド/I/O以前の待ち）を示す。
- Reproducibility: 再現可（計測）。本番DBの読取専用コピー（scratchpad）で GenerationRepository.snapshot() を5回実行: 1回あたり352-405ms（generation_jobs 874行、うち終端845行。全列合計約24MB、うち metadata_json が約23.7MB。graph_json は終端時にNULL化され約65KB）。pydantic再検証 +16-54ms。生成snapshot JSONは約917KB。一方、非終端jobだけの抽出クエリは約4.7ms。
- Impact_Scope: バックエンド全体（単一uvicornプロセスのイベントループ共有）: 生成画面（bypass切替・preset保存/5秒poll・cancel・preview）、履歴画面（preview/thumbnail/view）、各管理画面のマスタ取得、共有WebSocket（/api/ws）配信。generation_jobsは削除・保持上限がなく、生成するほど単調に悪化する。副次: ComfyUI停止中も2.5秒毎にreconcileが失敗しWARNING+stack traceを出力（10/24で約2.1万件）、httpx INFOが約2.9万件/日、ログは日次50-138MB。SQLiteはjournal_mode=delete（WAL未使用）。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: [主因] GenerationService が全生成ジョブ（終端済みを含む全履歴）の同期DB読込をイベントループ上で高頻度に実行している。(1) GenerationRepository.snapshot() は generation_jobs を条件なしで全件 .all() し（各行約27KBの metadata_json を含む）、各行で prompt 抜粋のため metadata_json と内部の凍結recordを2段 json.loads する同期処理（約370ms/回）。(2) GenerationService._snapshot() がこれを呼び、pydantic で2回検証する。_snapshot()/snapshot() の呼出箇所は generation_service.py 内に43箇所あり、async def の中で to_thread を介さず直接呼ばれるため、その間イベントループは全リクエスト・WebSocket・静的画像配信を処理できない。(3) 呼出頻度: _run_worker は0.2秒周期でロック取得し、pending(queued)ジョブがあるかVRAM待機中は毎周期 _snapshot()（=ループの大半を占有）、2.5秒毎の _reconcile_locked は開始時と終了時に計2回+publishで更に1回。on_preview はプレビューフレーム1枚ごとに _snapshot() → _advance_wire_revision() 内 _snapshot() → _publish_snapshot() 内 _snapshot() の計3回（約1.1s/フレーム）を asyncio.Lock 保持下で実行し、さらに約917KBの全状態JSONを全WSクライアントへ送信する。(4) HTTP経路でも GET /api/generation/state、GET /api/generation/preview/{job_id}（プレビュー1枚取得ごと）、GET /api/generation/images/{job_id}/availability が service.snapshot() で全件を読む。(5) cancel 系は同じ asyncio.Lock を待つため、worker/on_preview のロック保持が連続すると数十秒〜数分待たされる（実測 max 277s）。画像/サムネ endpoint 自体は asyncio.to_thread で適切にオフロードされており、遅延はループ占有の巻き添え。[仕様] SPEC_GENERATE.md:197 は「snapshotは全状態を一体で扱う」と規定するのみで、snapshotに含める job の範囲（終端jobの保持窓/件数上限）、generation_jobs の保持期間、イベントループを同期I/Oでブロックしない非機能制約、プレビュー頻度に対する配信/再計算の上限が未定義。実装は現行SSoTの文言に従ったまま、履歴の増加で破綻している。[副因] SQLite WAL/busy_timeout 未設定、ComfyUI 停止時の reconcile 失敗ログ（exc_info付き、2.5秒毎）とhttpx INFOによるログ肥大、RequestLoggingMiddleware が BaseHTTPMiddleware（全レスポンスを経由）である点は寄与要因だが、主因ほどの影響は未計測。
- Failure_Location: `backend/app/services/generation_repository.py:289-317 (snapshot: 全件 .all()); backend/app/services/generation_service.py:587-610 (_run_worker 0.2s周期・ロック内同期snapshot), :544-555 (on_preview: フレーム毎 snapshot x3), :1222-1292 (_reconcile_locked: snapshot x2), :1348-1433 (_snapshot/_advance_wire_revision/_publish_snapshot); backend/app/routers/generation.py:132-136, :228-237, :247-251 (HTTP経路の全件snapshot); backend/app/database.py:6-10 (WAL/busy_timeout 未設定); docs/specs/SPEC_GENERATE.md:197 (snapshot範囲・非機能制約の未定義)`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: SSoT改訂（Type B）とそれに沿う実装是正。(1) SPEC_GENERATE に、Generation snapshot の対象を「非終端job + 直近N件（または直近T時間）の終端job」に限定する規定、generation_jobs の保持/アーカイブ方針、同期DB I/Oでイベントループをブロックしない非機能制約、プレビュー時の再計算/配信上限を追記する。(2) repository.snapshot をアクティブ集合+有界な終端窓のクエリに変更し、snapshot 経路で metadata_json の全件読込・全件解析を行わない（抜粋の事前算出/キャッシュ、load_only/defer）。status/accepted_at に索引を付ける。(3) GenerationService 内にメモリ上の状態キャッシュを持ち、transition時のみ更新・revision判定を行い、on_preview はプレビューrevisionの更新とWS通知だけにして DB 再読込を行わない（フレーム間引き/最小間隔を設ける）。_run_worker は pending/VRAM待機時に毎周期 DB を読まない。(4) 残る同期DB呼出は asyncio.to_thread へ移し、asyncio.Lock 保持時間を短縮して cancel 経路が長時間待たないようにする。GET /preview/{job_id} は job_id→prompt_id の軽量参照に変更。(5) 副次: SQLite を WAL + busy_timeout に設定、ComfyUI不通時の reconcile 失敗ログをバックオフ/状態変化時のみに抑制、httpx ロガーを WARNING に下げる。検証: snapshot所要時間・WSペイロードサイズの回帰テスト、生成中の軽量API p95 計測、cancel 応答時間計測。
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: UNREGISTERED
</linked_artifacts>
