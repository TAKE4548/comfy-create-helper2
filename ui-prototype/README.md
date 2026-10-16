# Prompt Surgeon — UI Review Prototype

## Scope

This is an **isolated Vite entry point** on the `prototype/ui-review` branch.
It mounts the real `frontend/src/App.tsx` and `frontend/src/index.css` rather than approximating their appearance in custom HTML.

**Phase 1: baseline bootstrapping.** It is an integration-backed baseline, not yet a backend-independent data-mocked prototype. No proposal UI changes are applied. No files in `frontend/` or `backend/` were edited by this setup.

## Start

From the repository root:

```bash
cd frontend && npm install
cd ../ui-prototype && npm install
npm run dev
```

Open `http://localhost:5174/`. The default backend is `http://127.0.0.1:8000`.
To point the prototype at a different backend, set `PROTOTYPE_BACKEND_URL` (for example in `ui-prototype/.env.local`).

**Safety:** The current baseline runs the *real application behavior*. Calls to a connected backend may mutate real records and submit ComfyUI jobs. For visual inspection, use a disposable/test backend and avoid generation, deletion, save, or other write actions. The prototype currently has no read-only enforcement.

## Design fidelity

- AppShell, desktop/mobile layout, typography, icons, and Tailwind CSS come from the same source files as the production application.
- Data, API connections, browser state, and image content affect what renders.
- Compare baseline and proposals only after fixing viewport, data, state, and browser zoom.

## Next phase (not implemented yet)

1. Add isolated API / WebSocket fixtures and deterministic store initialization.
2. Provide read-only baseline states for idle, generating, error, history, and populated prompt fields.
3. Add proposal variants without editing production components.
4. Browser-check responsive sizes (375, 768, 1024, 1440) and interaction states.

The files here are an executable harness, **not** a claim that all application interactions have been reproduced or visually verified.
