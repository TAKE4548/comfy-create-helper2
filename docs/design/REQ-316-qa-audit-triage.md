# REQ-316 QA test-plan audit triage

## Execution

- Target: `docs/design/REQ-316-test-plan.md`
- Command: `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py --timeout 300 --unload-after qa-audit docs/design/REQ-316-test-plan.md`
- Captured exec session: `29042`; process exit code: `0`.
- Full stdout and terminal exit marker: [execution log](REQ-316-qa-audit-execution.log).
- Model: `qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored`.
- Cleanup: adapter reported `All models unloaded from LM Studio. VRAM freed.` before exit.

## Audit verdict and triage

The model report returned **REQUIRES MODIFICATION BEFORE EXECUTION**. It raised six findings and proposed additional anti-agent rules. The report is retained verbatim in the execution log; this triage does not reinterpret its verdict as PASS.

1. **AC references:** The test plan referenced numbered ACs whose definitions are in the PBI. The test plan now links the PBI acceptance criteria as the SSoT and makes that mapping explicit. Resolved as a document clarity issue.
2. **“Brain testing” and proposed anti-escape protocol:** The audit suggested banning internal reasoning, hashing every evidence file, requiring two validators, and taking full-viewport screenshots. These are not measurable REQ-316 product acceptance criteria and add unapproved process scope. The existing plan already requires observable evidence, marks unavailable real-ComfyUI E2E INCONCLUSIVE, and disallows mocks as a substitute. No such protocol was added.
3. **INT metric wording:** INT-1 now defines exact per-field string comparison and dynamic count equality; INT-3 specifies the displayed name/value order and JSON values that must be preserved. E2E instructions now require recording the actual viewport and observable overflow/content results without making a fixed viewport a product requirement. Resolved as a test-plan clarity issue.
4. **Browser/device version matrix:** The plan uses the existing QA browser tool and records the viewport used. A minimum browser/version matrix is not specified by the approved requirement or repository test setup, so it was not invented.
5. **PowerShell/runtime setup:** At initial triage the frontend command returned to the workspace root; subsequent clarification changed the test plan to enter `backend/`, set `PYTHONPATH=.` and use `\.venv\Scripts\python.exe` for the local pytest/mypy commands. The audit itself did not execute application tests. Root reported backend and frontend full-suite checks separately.
6. **“Planned” test paths:** The planned-path disclaimer was stale after implementation. It now states that the listed tests were added and requires actual command exit evidence; missing/unrun paths cannot count as PASS.

## Gate state

Actionable test-plan clarity findings were corrected. At this initial triage checkpoint the original model verdict remained `REQUIRES MODIFICATION`; no model-issued PASS was inferred. Root's separate full test/build and browser evidence is recorded in the task walkthrough. Live OS clipboard behavior is INCONCLUSIVE because the browser tool returned an empty readback; unit tests cover clipboard success/rejection. At that checkpoint real ComfyUI generation E2E had not run. Do not close REQ-316 or claim all acceptance criteria verified solely from this audit.


## Follow-up after initial triage

- The backend command block was corrected to run from `backend/` with its configured virtualenv; this is a further clarification after the first audit report.
- Root completed the browser check for a 2,364-grapheme prompt and scrolled to `REQ316_LONG_END_20261004` ([evidence](REQ-316-walkthrough.md), [screenshot](../../logs/REQ-316-ui-long-end.png)). AC-3 is now marked PASS for this browser scenario.
- The original model verdict above remains unchanged. Re-audit will be considered after the live ComfyUI verification window closes; until then no model-issued PASS is claimed.


## Second audit (no further rerun planned)

- Reran the documented `qa-audit` against the updated test plan with `--timeout 300 --unload-after` (session `21831`, exit 0). The raw output is preserved in [rerun log](REQ-316-qa-audit-rerun.log); adapter confirmed all models unloaded and VRAM freed. The report still recommends modification (Overall Grade B-, `REQUIRES MODIFICATION`-equivalent) and asks for SHA-256/EXIF manifests, per-scenario evidence files, and further process controls.
- The useful ambiguity findings were addressed in the plan: exact JS string equality/no normalization and DOM `textContent`, a visible unique end marker in the viewport, stdout/stderr + test summary + exit code, and a 900-second process timeout policy. Repository `.agents/context.md` specifies the backend venv path, so that path is a repository contract rather than an invented runtime assumption.
- Model-only demands for per-INT hashes, EXIF/browser-version manifests, and extra anti-agent protocols are not approved product acceptance requirements. They are not implemented. Per parent instruction, no third audit will be run solely to pursue those process recommendations. Preserve both model verdicts as-is; neither is a PASS.
- Subsequent live QA found Windows HEAD responses as `application/octet-stream` despite an image being served. T16 repairs generic MIME reporting from the actual file (4 local tests PASS); T17 bypasses stale HTTP cache. The final browser confirmed `image/webp` in the same browser after reload. T18 corrected individual accordion state after bulk open/close; local 6 tests/typecheck and both browser directions passed. Final frontend suite: 106 files/1063 tests; backend: 413 tests, mypy 71 files/0 errors; build exit 0. These implementation checks do not change either audit verdict; no additional audit was run.

## Current verification note

The user reported completing the manual clipboard check and explicitly accepted the additional process recommendations raised by the audits. AC-24 is manually confirmed; the earlier empty CUA virtual clipboard readback remains a historical tool limitation, not evidence of application failure. Do not infer OS-byte comparison or a separate seed-copy check. Preserve both original audit verdicts; user acceptance allows Phase 4 closure without changing them.
