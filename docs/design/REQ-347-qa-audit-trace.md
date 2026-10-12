# REQ-347 QA 監査 raw trace

## 実行条件

```text
Action: qa-audit
Target: docs/design/REQ-347-test-plan.md
LOCAL_AUDIT_MODEL_KEY: qwen/qwen3.5-9b
LOCAL_AUDIT_REASONING_EFFORT: none
--context-length: 32768
Process exit: 0
```

## raw verdict

```text
Verdict: FAIL (Critical Ambiguities & Non-Executable Metrics)
Risk Level: HIGH
```

## raw findings

1. **The “Brain Test” Escape Hatch (Critical):** The plan prohibits brain tests but acceptance requires subjective visual inspection and live DOM/DevTools values. BR-1-P/V/S needs computed overflow and scroll-padding values; IT-S6/7/8 and BR-11 require timing observations of async save/refetch races. The report says external browser tooling is required and Gate 3 must be INCONCLUSIVE when tools are unavailable.
2. **Non-Ambiguous Metrics Failure:** UT-C1 does not supply an executable mock setup for rectangle values. BR-2 does not quantify “viewport entry.” IT-S6 does not define exact DOM semantics or timeout for “old success display/preview removal no.” E2E-G1/G2/G3 require rendered DOM observations.
3. **Circular Logic & Design Gate Confusion:** Test plan mixes design decisions (V2 Prompt/Steps variants, computed roles, nodeA/nodeB) with acceptance tests, risking confusion between expected input data and behavior.
4. **Missing Execution Context:** The plan references specific mocks/test files without setup signatures or code, making it unclear how to construct the real QueryClient/UI/API-boundary tests.

## raw rejection / mandatory remediation points

- Define required browser tooling explicitly (example given: Playwright page navigation and selector evaluation).
- Convert observational checks to code assertions (example: exact computed `scrollPaddingTop` value).
- Specify exact deferred API input/output and state transitions for IT-S6/7/8 and BR-11.
- Separate fixture data from design prose; define exact values/payloads for IT-P1, IT-V2, etc.
- Provide exact mock dependencies/signatures rather than requiring an implementer to invent them.

## final raw conclusion

```text
Status: REJECTED
Reason: Browser visual checks and asynchronous state checks are not mechanically specified enough to prevent subjective or inferred PASS.
Next Step: Rewrite around executable assertions and a named browser tool/runtime.
```

## cleanup evidence

Immediately after inference, `local_model_adapter.py unload` exited 0 and reported no loaded models. `lms ps --json` exited 0 with `[]`. This establishes only that LM Studio had no loaded models; it does not establish that GPU memory was entirely free.
