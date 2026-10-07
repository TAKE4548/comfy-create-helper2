# Incident Triage Report: LoRA Studio 405 Method Not Allowed error on matrix calculation

<incident_metadata>
- Created_At: 2026-10-07 22:09:10
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: Calculating orthogonal matrix in Dataset Studio fails with API error 405: Method Not Allowed.
- Reproducibility: 100% (Confirmed)
- Impact_Scope: Dataset project persistence, matrix calculation, training jobs, and benchmarks are blocked in LoRA Studio.
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: Endpoint paths in frontend/src/api/client.ts for datasetApi, trainingApi, benchmarkApi, and settingsApi are redundantly prefixed with /api, causing actual requests to be routed to /api/api/... which hits the fallback SPAStaticFiles handler and gets rejected with 405 Method Not Allowed.
- Failure_Location: `frontend/src/api/client.ts:616-692`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: Remove redundant /api prefix from endpoint paths in frontend/src/api/client.ts and add corresponding client unit tests in frontend/src/api/__tests__/client.test.ts.
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-322
</linked_artifacts>
