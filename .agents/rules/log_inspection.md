# Repository Rule: Mandatory Log Inspection Protocol

This rule applies to all agents operating within the Prompt Surgeon (`comfy-create-helper2`) repository.

## 1. Unified Log Mechanism
- All frontend client errors (`source: "frontend"`) and backend API logs (`source: "backend"`) are aggregated into `logs/app.jsonl`.
- Direct manual scanning of `logs/app.jsonl` using generic shell commands (`cat`, `type`, or raw bulk `view_file`) is PROHIBITED per [MUST [G-7-1]] and [MUST [G-7-6]].
- Agents MUST use the specialized CLI tool: `python scripts/inspect_logs.py`.

## 2. Mandatory Workflow Gates

### A. Bug Triage & Investigation (`/triage`)
- **First-Step Requirement**: During Step 1 (Intake) and Step 2 (Deep Dive Analysis), the agent (Incident Analyst) MUST execute:
  1. `python scripts/inspect_logs.py --summary`
  2. `python scripts/inspect_logs.py --errors --tail 10`
- **Evidence Citation**: The `<incident_report>` and triage summary MUST cite specific log timestamps, logger names, request IDs, and error stack traces discovered in `logs/app.jsonl`. Asking the user for logs before running this inspection is strictly PROHIBITED.

### B. Cross-Boundary Debugging (`/e2e-debug`)
- **Correlation Requirement**: During Step 1 (Isolation & Evidence), the agent MUST cross-reference client errors (`--source frontend`) and backend API responses (`--request-id` or `--since-minutes`) to pinpoint whether the defect originated in the React UI or the FastAPI backend.

### C. Task Implementation (`/dev-task`)
- **Failure Tracing**: If a unit test fails or an endpoint returns HTTP 422/500 during TDD, the Engineer MUST run `python scripts/inspect_logs.py --errors --tail 5` to identify root causes.
- **Task Pre-Completion**: Before marking a task complete, run `python scripts/inspect_logs.py --clean-check 5` to ensure no uncaught exceptions occurred during test runs.

### D. Verification & QA Closure (`/dev-verify`)
- **Clean Log Gate**: During Phase 2 (Integration & Local Audit), the QA role MUST execute:
  `python scripts/inspect_logs.py --clean-check 10`
- **Objective Evidence**: The output confirming 0 errors/warnings MUST be recorded in the `<execution_evidence>` block. Final closure (`/dev-verify` Phase 3) is PROHIBITED if unresolved ERROR logs occurred during the verification run.
