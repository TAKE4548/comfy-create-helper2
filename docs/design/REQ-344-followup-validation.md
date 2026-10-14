# REQ-344 追補検証記録

## Attempt Evidence

| Phase | Run | Source SHA-256 | Started | Finished | Exit | Result | Wall | Stop reason | Log |
|---|---:|---|---|---|---:|---|---:|---|---|
| diagnostic | 1 | `BC257031008CAEB2E3038BC087F25ED80B701901BF4002FBCAB86B69E29E2778` | 2026-10-13 00:20:52 Asia/Tokyo (Vitest start) | 2026-10-13 00:21:00 Asia/Tokyo (recorded immediately after completion) | 1 | FAIL | 7.2s | Setup/collection failed with EPERM resolving `frontend/src/test/setup.ts`; gate stopped here | [diagnostic log](REQ-344-followup-diagnostic.log) |

Run command was the Task Card focused diagnostic, with `VITE_REQ344_QUERY_DIAGNOSTICS=1`; the `finally` block removed the environment variable after the command. No tests were collected. The existing default case timeout and forks pool were unchanged.

## Diagnostic Evidence

- Vitest reported `EPERM: operation not permitted, realpath 'C:\Users\audih\ws\comfy-create-helper2\frontend\src\test\setup.ts'` before collection.
- Query diagnostic output, query key/snapshot, observer count, query function, API mock reference, case outcomes, and warning count were not observed. No inference about the query warning or its runtime cause can be made from this run.
- The three consumer source locations and individual observer ownership were not checked in this run.
- This matches the separately classified setup/realpath collection environment failure. The raw exception and resolved path are preserved in the linked log.

## Target Result

| Phase | Run | Result | Exit | Tests | Skip | Note |
|---|---:|---|---:|---|---|---|
| target file | 1 | NOT-RUN | — | — | — | Diagnostic gate failed on setup `realpath` EPERM. No retry. |

No target-file result exists for this follow-up. Prior 13/13 evidence and the earlier manually stopped T2 run are not results of this batch.

## Acceptance Table

| Suite run | Result | Exit | Overall result | Target classification | EPERM / other failure |
|---:|---|---:|---|---|---|
| 1 | NOT-RUN | — | — | Not reached | Diagnostic collection blocked by setup realpath EPERM |
| 2 | NOT-RUN | — | — | Not reached | Batch gate not reached |
| 3 | NOT-RUN | — | — | Not reached | Batch gate not reached |
| 4 | NOT-RUN | — | — | Not reached | Batch gate not reached |
| 5 | NOT-RUN | — | — | Not reached | Batch gate not reached |

Acceptance batch was not started because the diagnostic gate failed. There is no suite-results JSON because no acceptance run occurred.

## Next Decision

Stop this verification batch. Do not run the target file or acceptance suite and do not retry. Return the raw setup/realpath EPERM evidence for read-only environment investigation and parent review. The query diagnostic remains unobserved; this run neither confirms nor refutes the `getComfyModels` mock hypothesis. T4 is not authorized by these results.

## Read-only Environment Investigation

After the failed Vitest collection, the file was confirmed to exist as a regular file: PowerShell `Get-Item` reports no link target, and `Resolve-Path frontend/src/test/setup.ts` succeeds. A read-only Node probe using Node.js v18.16.1 then reproduced `EPERM` from `fs.realpathSync.native` for `.`, `src`, `src/test`, and `src/test/setup.ts`; `statSync` succeeded for all four paths and `readFileSync` read the setup file (39 bytes). This shows the failure is not isolated to Vite or this setup file in the current Node process. It does not identify the host policy or filesystem cause. No permissions, ACLs, cache, or configuration were changed, and no tests were rerun.
