# Incident Triage Report: セリフ一括生成のVLM非JSON応答による生成失敗

<incident_metadata>
- Created_At: 2026-09-29 22:25:47
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 2026-09-29 22:11 JST に POST /api/speech/scene-draft がHTTP 500。バックエンドは /v1/chat/completions 200 後に Invalid VLM response: malformed JSON を記録。ユーザー画面では参照抽出の初段階でエラーに見える。LM Studioは後処理の POST /v1/models/unload をUnexpected endpoint or methodと記録。
- Reproducibility: 22:09と22:11の実運用ログに同型のJSONDecodeError。合成16x16白画像を用い、実DBのVLMモデル設定・同じsystem prompt生成・同じuser message・max_tokens=512で1回の制御再現。LM Studio 200、finish_reason=stop、content長478文字、先頭はMarkdown見出しの画像説明、completion_tokens=246、reasoning_tokens=0で、既存パーサーが同じJSONDecodeErrorを起こした。対象モデルのloaded_instancesは試験前後とも0。
- Impact_Scope: VLMがHTTP 200でも非JSONの説明文を返した場合、セリフ一括生成が結果を返せずHTTP 500。参照抽出自体の失敗は確認されない。別途アンロード誤APIがHTTP 200で成功扱いされVRAM未解放の可能性。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: SSoTはVLMにセリフ群を含むJSON生成を要求する一方、実装のchat payloadはsystemにJSON指示を入れた直後にuserへ「この画像の内容を日本語で簡潔に説明してください。」と別のタスクを依頼する。構造化JSON形式も指定せず、応答contentを無条件でjson.loadsする。制御再現ではモデルがuser指示に従いMarkdownの画像説明を通常終了(stop)で返し、JSONDecodeErrorを起こした。元の22:11応答本文は残っていないため当該回の具体的な文章は未確定だが、ログの例外・入力構築・再現結果は同じ失敗経路を支持する。これはJSON出力という既存SSoTからの実装逸脱（Type A）。別途、SSoT自体がLM Studioアンロードを未対応の/v1/models/unload空JSONで指定し、現行公式仕様の/api/v1/models/unloadとinstance_idに合わない点はType Bの独立問題。
- Failure_Location: `backend/app/services/speech_draft_service.py:20-45; backend/app/services/speech_scene_service.py:485-490,603-608,719-723; backend/app/routers/speech_scene.py:36-54; docs/backlog/pbi/archive/REQ-291.md:30-42; docs/design/REQ-291.md:196-213; logs/app.jsonl:28870-28874`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: VLMへのsystem/user指示を同じJSON生成タスクに揃え、LM Studioがサポートする構造化出力指定とfinish_reason/content検証を設計・テストする。非JSON時は応答内容を漏らさない診断情報で原因を区別する。元の22:11返答内容は保存されていないため原文の確定は不可。別件Type BとしてアンロードAPI契約をSSoTから改訂し、instance_idと実際のロード状態を検証する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-296
- PBI_Status: done (archived 2026-09-30)
- PBI_Scope: VLM非JSON応答による生成失敗（Type A）とLM Studioアンロード契約の欠落（Type B）を一体で扱う。
</linked_artifacts>
