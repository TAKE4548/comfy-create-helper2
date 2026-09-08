---
name: role-incident-analyst
description: "Workspace pointer and project-specific overlay for Incident Analyst in Prompt Surgeon."
---

# Incident Analyst — Workspace Pointer

This file extends the global Incident Analyst role for the Prompt Surgeon (`comfy-create-helper2`) workspace.

**Global Definition**: `${GLOBAL_SKILLS}\role-incident-analyst\SKILL.md`

## Project-Specific Investigation Protocols

1. **Active Log Inspection**:
   - In Step 1 (Intake) and Step 2 (Deep Dive Analysis), the agent MUST run:
     `python scripts/inspect_logs.py --summary`
     `python scripts/inspect_logs.py --errors --tail 10`
   - Concluding analysis without inspecting `logs/app.jsonl` is PROHIBITED.
2. **Citation Requirement**:
   - Cite timestamps, request IDs, and stack traces from `logs/app.jsonl` in the `<incident_report>`.
