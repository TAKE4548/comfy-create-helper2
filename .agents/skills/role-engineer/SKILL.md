---
name: role-engineer
description: "Workspace pointer and project-specific overlay for Engineer in Prompt Surgeon."
---

# Engineer — Workspace Pointer

This file extends the global Engineer role for the Prompt Surgeon (`comfy-create-helper2`) workspace.

**Global Definition**: `${GLOBAL_SKILLS}\role-engineer\SKILL.md`

## Project-Specific Implementation Protocols

1. **Exception Tracing (`/dev-task` Phase 2)**:
   - When a test fails or an endpoint returns HTTP 422/500, run:
     `python scripts/inspect_logs.py --errors --tail 5`
   - Review exact stack traces from `logs/app.jsonl` to debug DB constraints or validation errors.
2. **Task Pre-Completion Check (`/dev-task` Phase 3)**:
   - Before completing the task, run `python scripts/inspect_logs.py --clean-check 5` to ensure no unexpected warnings or errors occurred during execution.
