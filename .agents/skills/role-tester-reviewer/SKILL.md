---
name: role-tester-reviewer
description: "Workspace pointer and project-specific overlay for Tester/Reviewer (QA) in Prompt Surgeon."
---

# Tester / Reviewer (QA) — Workspace Pointer

This file extends the global Tester/Reviewer role for the Prompt Surgeon (`comfy-create-helper2`) workspace.

**Global Definition**: `${GLOBAL_SKILLS}\role-tester-reviewer\SKILL.md`

## Project-Specific Verification Protocols

1. **Clean Log Evidence (`/dev-verify`)**:
   - After executing regression and integration/E2E test scenarios, the QA role MUST run:
     `python scripts/inspect_logs.py --clean-check 10`
   - Isolate the clean check result in the `<execution_evidence>` block.
2. **Correlated Log Analysis (`/e2e-debug`)**:
   - Correlate frontend client errors (`--source frontend`) and backend API calls (`--request-id`) in `logs/app.jsonl` to pinpoint the fault boundary.
