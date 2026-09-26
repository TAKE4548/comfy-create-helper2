# Local Context Overrides

This file defines repository-specific variables used by the AntiGravity agent system.

## Variables
- **PROJECT_ROOT**: `C:\Users\audih\ws\comfy-create-helper2`
- **GLOBAL_ROOT**: `<USER_HOME>\.gemini\antigravity`
- **GLOBAL_SCRIPTS**: `${GLOBAL_ROOT}\scripts`
- **GLOBAL_SKILLS**: `${GLOBAL_ROOT}\skills`
- **GLOBAL_WORKFLOWS**: `${GLOBAL_ROOT}\global_workflows`
- **GLOBAL_GOVERNANCE**: `${GLOBAL_ROOT}\governance`

## Subsystems & Verification Commands
### Frontend (`frontend/`)
- Typecheck: `cd frontend; npm run typecheck`
- Unit Test (TDD): `cd frontend; npx vitest run <file>`
- Full Test Suite: `cd frontend; npm test`

### Backend (`backend/`)
- Typecheck: `mypy backend`
- Unit Test (TDD): `backend\.venv\Scripts\python -m pytest <file>`
- Full Test Suite: `backend\.venv\Scripts\python -m pytest`
