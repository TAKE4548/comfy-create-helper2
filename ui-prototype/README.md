# Prompt Surgeon — isolated Generate UI prototype

This branch adds an independent Vite entry point that mounts the actual production React components and CSS. **The baseline remains unchanged.** All new files live under `ui-prototype/`.

## Running

From the repository root:

```bash
cd frontend && npm install
cd ../ui-prototype && npm install
npm run dev
```

Open http://localhost:5174/ .

## Safety and fidelity

- Browser `fetch` is sandboxed **before** the production App module is imported.
- HTTP writes are rejected (403), unknown API reads fail explicitly (404), WebSockets do not connect, and XHR calls are disabled. No API proxy is configured.
- Some unsupported API endpoints will display error/empty states. **This is an initial offline, read-only baseline and not yet a populated, fully interactive Generate page.**
- Static module imports and stylesheet font imports can still request external resources (such as Google Fonts); the protection applies to application network transports, not all browser resource requests.
- The React markup and CSS come from current `frontend/src`, avoiding a hand-built HTML approximation.
- Do not use for backend behavior verification. Backend calls, image generation and saving are intentionally disabled.

## Remaining milestones

1. Provide contract-correct fixtures for a selected workflow, mappings, parameters, presets and image history.
2. Model deterministic idle / generating / error states (current snapshot is disconnected and empty).
3. Add a baseline/proposal switch, keeping all proposal code within `ui-prototype/`.
4. Run a real-browser visual comparison at 375, 768, 1024 and 1440px and document deviations.

**No claim of build or browser verification has been made.**
