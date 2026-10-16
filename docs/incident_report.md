# Incident Triage Report: ノードリマッピング実施後の孤立マッピング引き継ぎおよびスキャン自動確定による大量マッピングエラー

<incident_metadata>
- Created_At: 2026-10-16 22:44:18
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: V2マッピングマスタ構造移行後のワークフローでノードリマッピング（RescanModal）を実行・保存すると、手動設定したスロットは正常表示される一方、未割り当て・設定した覚えのないノードについて「マッピングエラー検出（紐付け先マスタが無効）」が生成画面に大量表示される。
- Reproducibility: ローカル実DB（prompt_surgeon.db）およびソース静的・動的トレースにて確定。DB内に過去のStage別マスタ統合時に取り残された孤立レコード（master_id 33〜62、全984件）が存在し、RescanModal保存時にuseMasterMappingRows.getMappings()が未知キーとしてこれらを無条件に引き継ぎ再保存すること、および未割り当てスロットへのスキャン候補自動入力が確認された。
- Impact_Scope: フロントエンド（RescanModal, useMasterMappingRows, GeneratePage, MappingErrorPanel）およびバックエンド（PUT /api/workflows/{id}, ワークフローDB永続化層）。孤立マッピング（master_id不在・role=null）を保持する全ワークフロー（DB上30ワークフロー以上、計984レコード）。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: 1. [フロントエンド引き継ぎ欠陥] useMasterMappingRows.tsのgetMappings()(482-486行)において、認識済みスロット(knownKeys)に含まれないstoredMappings.currentのレコードを無条件に保持して保存ペイロードに含めるが、master_idが現在のmapping_mastersに存在しない孤立レコード(旧マスタ33-62等)まで無差別に引き継ぐため、バックエンド側でrole解決不能(role=None)のレコードとして再保存される。 2. [スキャン候補の無断確定保存] initFromScan()(393-395行)およびbuildRows()において未割り当てスロットにscanDefaultsが自動代入され、getMappings()(491行)がnode_id非空を条件に保存対象とするため、ユーザーが明示的に採用していない候補が大量に新規保存される。 3. [バックエンド整合性バリデーション欠如] workflows.pyのupdate_workflow(151-161行)が受け取ったmappingsのmaster_id実在性およびvariant_id整合性を検証せずに全件DELETE&INSERTしている。 4. [DB孤立レコード残存] REQ-336/step_029移行時にSQLiteのPRAGMA foreign_keys無効状態とUPDATE対象限定により、旧マスタ統合・削除時のcascade未発火レコード(984件)が残存していた。
- Failure_Location: `frontend/src/hooks/useMasterMappingRows.ts:393-395, 482-486, 491-498; backend/app/routers/workflows.py:92, 151-161; backend/app/migrations/steps.py:759-766`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. [フロントエンド] useMasterMappingRows.tsのgetMappings()において、有効なmapping_mastersおよびmapping_variantsに実在しない孤立レコードを除外(サニタイズ)し、保存ペイロードに含めない。また未割り当てスロットへのスキャン候補は推奨表示にとどめ、ユーザーの明示操作なしにnode_idとして自動確定・保存しない。 2. [バックエンド] PUT /api/workflows/{workflow_id}において、送信されたmappingsのmaster_idおよびvariant_idが有効なマスタ/バリアントに実在するか検証し、不正な孤立レコードを拒否または自動除外する。 3. [DBマイグレーション/クリーンアップ] 移行ステップまたは修復スクリプトを追加し、mapping_mastersに存在しない無効なmaster_idを持つworkflow_mappingsの残存レコード(984件)をクリーンアップする。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-369
</linked_artifacts>
