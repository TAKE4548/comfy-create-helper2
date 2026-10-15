# Governance Pointer

This file is a pointer to the AntiGravity global governance rules.

**Global Constitution**: `${GLOBAL_GOVERNANCE}\GEMINI.md`

All agents operating in this workspace MUST read and comply with the rules defined in the above document.

## Project-Specific Overrides

See `SKILL.md` in the workspace root for project-specific conventions that extend (but never override) the global rules.

### UI/UX ガバナンス・Task Card サージカル注入規約 (REQ-366)
1. **Architect によるアーキタイプ分類**:
   - `Archetype 1: Modals & Overlays`
   - `Archetype 2: Tabs / Chips / Grids`
   - `Archetype 3: Forms & Controls`
   - `Archetype 4: Shell & Page Layout`
2. **Frontend タスク生成時 (AC-3 サージカル注入)**:
   - `subsystem: frontend` または UI/CSS 対象タスクの `<constraints>` に該当プリセット制約のみをピンポイント注入。
3. **Backend 単体タスク生成時 (AC-5 コンテキスト汚染ゼロ)**:
   - `subsystem: backend` のタスクには UI 制約を含めない。
