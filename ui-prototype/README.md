# Prompt Surgeon — isolated Generate UI prototype

This branch adds an independent Vite entry point that mounts the actual production React components and CSS. **The baseline remains unchanged.** All new files live under `ui-prototype/`.

## Running

From the repository root:

```bash
cd frontend && npm install
cd ../ui-prototype && npm install
npm run dev
```

Open http://localhost:5391/ .

## Safety and fidelity

- Browser `fetch` is sandboxed **before** the production App module is imported.
- HTTP writes are rejected (403), unknown API reads fail explicitly (404), WebSockets do not connect, and XHR calls are disabled. No API proxy is configured.
- A sample workflow, four mappings, and two prompt presets are provided; unsupported API endpoints will display error/empty states. **This is an initial offline, read-only baseline and not yet a populated, fully interactive Generate page.**
- Static module imports and stylesheet font imports can still request external resources (such as Google Fonts); the protection applies to application network transports, not all browser resource requests.
- The React markup and CSS come from current `frontend/src`, avoiding a hand-built HTML approximation.
- Do not use for backend behavior verification. Backend calls, image generation and saving are intentionally disabled.

## Remaining milestones

1. Validate the fixture shapes in a running browser and add image-history fixtures.
2. Model deterministic idle / generating / error states (current snapshot is disconnected and empty).
3. Add a baseline/proposal switch, keeping all proposal code within `ui-prototype/`.
4. Run a real-browser visual comparison at 375, 768, 1024 and 1440px and document deviations.

**No claim of build or browser verification has been made.**

## Latest fixture coverage

The sample workflow contains Positive / Negative text mappings and Steps / CFG parameters. Two sample preset records are returned for `/api/workflow-presets` (including workflow-filtered queries). These fixtures are representative inspection data, not copies of any real user content.

No real-browser rendering or production-equivalent interaction verification has yet been completed. Avoid interpreting empty galleries and disconnected connection indicators as UI regressions: these are known fixture limitations.

## Automated browser verification

A branch-scoped GitHub Actions workflow in `.github/workflows/ui-prototype-check.yml` builds the prototype, runs Chromium Playwright checks at 1440px, 768px and 375px, and uploads screenshot/test artifacts (retained 14 days). CI triggers on updates to `prototype/ui-review` affecting the prototype, frontend, or workflow, and can be manually dispatched if GitHub exposes it.

Run locally using `cd ui-prototype && npx playwright install chromium && npm run test:e2e` after installing both frontend and prototype dependencies. The checks are intentionally assertions, not proof of pixel-level parity with a real deployment.

**CI status has not been verified through an Actions run yet.** Inspect the Actions tab and the uploaded `ui-prototype-playwright-results` artifact; fix any reported setup or fixture issues before using screenshots for design decisions.

## Locate the latest CI artifacts without copying a run URL

After each run (including failed runs), the workflow publishes a commit status named `ui-prototype/artifact`. Its description includes `run=<id> artifact=<id>`, and its target URL opens the run artifact (or run page if no artifact was uploaded). The run's job summary also lists these IDs.

For ChatGPT/GitHub connector use: find the newest commit on `prototype/ui-review`, then read its combined commit statuses and locate `ui-prototype/artifact`. Use the artifact ID to request the archive directly. The status is created after upload, so it describes the completed run. Older commit statuses remain accessible for comparison. GitHub Actions artifact retention remains 14 days.

This is **on-demand discovery**, not a background watcher. If the workflow fails before publishing the status (e.g. permission error), use the GitHub Actions run UI instead. Status publishing requires the workflow's `statuses: write` and `actions: read` permissions.
