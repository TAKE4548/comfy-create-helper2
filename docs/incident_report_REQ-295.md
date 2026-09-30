# Incident Triage Report: Backend mypy 101件の型不整合でGate 1失敗

<incident_metadata>
- Created_At: 2026-09-29 14:39:48
- Investigation_Status: REMEDIATION_COMPLETED
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: ルートで mypy backend を実行すると exit 1、131 source files 中19ファイル101 errors。REQ-294 Gate 1が通らない。
- Reproducibility: 2026-09-29にルートから再実行し100%再現
- Impact_Scope: backendの型検査Gate 1が停止。migrations/steps.pyに50件、LLM呼出し関連に連鎖エラー。現在のspeech_scene変更ファイルはエラー一覧に含まれない。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: 既存SSoTで要求される mypy backend エラー0件に対し、実装内の型宣言と利用が不整合。代表例はmigrations/steps.pyの組込関数anyを型として用いた注釈（50件のvalid-type/attr-defined）、llm_request.pyのNoneデフォルトとstr/dict注釈の齟齬（呼出元にも連鎖）、migrate_from_v1.pyのintにint|None代入、画像・SQLAlchemy・Starlette型の齟齬。19ファイルはHEAD比で変更されていない。
- Failure_Location: `backend/app/migrations/steps.py:10; backend/app/services/llm_request.py:29; backend/scripts/migrate_from_v1.py:47; backend/app/main.py:153`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 19ファイル101件を原因群ごとに原子的タスクへ分割し、実行時のNone処理・戻り値・外部API契約を確認しながら正しい型へ合わせる。無根拠のignoreで隠さず、既存機能の局所テストと mypy backend 0 errorsを受入条件にする。既存REQ-293報告は docs/incident_report_REQ-293.md に退避済み。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Remediation Result

- Final `mypy backend`: exit 0, 0 errors, 131 source files checked.
- Full backend pytest: 356 passed. One Starlette/httpx deprecation warning remains from the installed test client dependency.
- Diff check reported one trailing blank line in `backend/app/schemas/speech.py:71`, an unrelated concurrent REQ-294 file; it was left untouched.

## 5. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-295
- PBI_Status: done
- Design: docs/design/REQ-295.md
- Test_Plan: docs/design/REQ-295-test-plan.md
</linked_artifacts>
