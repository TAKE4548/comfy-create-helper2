# REQ-081-FIX: Smart Node Mapping - Test Plan (AUDITED VERSION)

## 0. General Rules & Environment Validation
**Rule:** Before executing any test, the agent MUST verify the environment. If validation fails, STOP and report `ENV_ERROR`.
**Anti-Hallucination Constraint:** Do not output any reasoning, thoughts, or explanations before providing the final result. Output ONLY the verification status and exit code.

**Validation Command:**
Run this first to confirm context:
```bash
python -c "import os; cwd = os.getcwd(); exit(0) if cwd.endswith('backend') else (print(f'ENV_ERROR: Current dir is {cwd}, must be backend'), exit(1))"
```

**Pre-Flight File Check:**
```bash
python -c "import os; f='backend/test_manual_verification.py'; assert os.path.exists(f), 'ENV_ERROR: Missing test file'"
```

## 1. Automated Tests
- **Execute Command:**
  `python -c "import subprocess; r=subprocess.run(['python', '-m', 'pytest', 'tests/test_workflow_scanner.py::TestWorkflowScanner', '-v', '--tb=short'], cwd='backend', capture_output=True, text=True, timeout=10); print(r.stdout); print(r.stderr); assert r.returncode == 0, 'Tests failed!'"`
- **Expected Outcome:** The command runs to completion without raising AssertionError (exit code 0).
- **Failure Condition:** Command exits with non-zero code, times out, or fails assertion checks.

## 2. Manual Verification Checkpoints

### Verification Execution (Non-Ambiguous Assertions)
Run the following Python one-liner in the workspace root. This command executes the test script, normalizes line endings, and strictly compares the stdout to prevent AI output fabrication.

```bash
python -c "import subprocess; r=subprocess.run(['python', 'test_manual_verification.py'], cwd='backend', capture_output=True, text=True, timeout=10); assert r.returncode == 0, 'Return code non-zero'; expected = 'M01_PASS\nM02_PASS\nALL_MANUAL_TESTS_PASS\n'; actual = r.stdout.replace('\r\n', '\n'); assert actual == expected, f'Output mismatch: {repr(actual)}'; print('TEST_VERIFICATION_OK')"
```

#### Expected Outcome
The command outputs:
```text
TEST_VERIFICATION_OK
```
and exits with code 0.

#### Failure Condition
Any AssertionError, exit code != 0, or timeout.
