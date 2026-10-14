# Test Plan: REQ-363

## 1. Test Architecture & Governance Conventions
- **No Ticket-Named Files [MUST [W-DD-PLACE]]**: All tests are integrated into existing layer/colocated test suites.
- **Traceability Tagging**: Every test case MUST use the `[REQ-363/AC-n]` naming prefix.
- **Zero-GPU Principle**: All automated tests run strictly on CPU/RAM with mocked backend transport.

## 2. Test Placement Plan [MUST [W-DD-PLACE]]
| AC ID | Target Subsystem | Target Test File | Test Case Name & Filter |
| :--- | :--- | :--- | :--- |
| **AC-1** | Prompt Tabs | `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | `it('[REQ-363/AC-1] renders prompt tabs with shrink-0 and whitespace-nowrap preventing overlap')` |
| **AC-2** | Action Bar | `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | `it('[REQ-363/AC-2] keeps mobile action bar visible when tapping checkboxes or radio buttons')` |
| **AC-3** | Scroll End | `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | `it('[REQ-363/AC-3] applies bottom padding ensuring last tag chips scroll clear of action bar')` |
| **AC-4** | Preset Manager | `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | `it('[REQ-363/AC-4] renders preset manager as bottom sheet with 75dvh max-height and fixed action dock')` |
| **AC-5** | Main Preview | `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | `it('[REQ-363/AC-5] defaults to compact preview (105px) and supports manual toggle without forcing expansion on job start')` |
| **AC-6** | Resource Monitor | `frontend/src/components/common/header/__tests__/ResourceHoverMonitor.test.tsx` | `it('[REQ-363/AC-6] displays dropdown card with proportional VRAM and RAM gauges anchored below pill')` |
| **AC-7** | Param Panel | `frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx` | `it('[REQ-363/AC-7] renders parameter steppers and selects in compact 1-row layout on mobile')` |
| **AC-8** | Add Asset Modal | `frontend/src/pages/GeneratePage/components/__tests__/AddAssetModal.test.tsx` | `it('[REQ-363/AC-8] applies tightened padding (p-3.5) on mobile viewport')` |
| **AC-9** | Static Typecheck | CI / Pre-commit | `npm run typecheck` (0 errors) |
| **AC-10** | Full Suite | Vitest runner | `npm test` (0 failures across all suites) |

## 3. Test Tier Mapping
- **Tier 1 (Static & Typecheck)**: `npm run typecheck` verifying 0 TypeScript errors across frontend.
- **Tier 2 (Component Unit & Integration)**:
  - `npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx -t "REQ-363"`
  - `npx vitest run src/pages/GeneratePage/__tests__/GeneratePage.test.tsx -t "REQ-363"`
  - `npx vitest run src/components/common/header/__tests__/ResourceHoverMonitor.test.tsx -t "REQ-363"`
  - `npx vitest run src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx -t "REQ-363"`
  - `npx vitest run src/pages/GeneratePage/components/__tests__/AddAssetModal.test.tsx -t "REQ-363"`
- **Tier 3 (E2E / Browser Verification)**:
  - Mobile viewport (360x640) rendering validation for smooth horizontal scrolling, bottom sheet height, and touch targets.

## 4. Red Team & Anomaly Boundary Scenarios
1. **Focus State Race Condition (Red Team - AC-2)**:
   - Rapidly tap a checkbox, then an input, then blur, then tap another checkbox. Verify action bar state transitions cleanly between hidden (when in input) and visible (when outside or on checkbox).
2. **Rapid Toggle Storm (Red Team - AC-5)**:
   - Rapidly tap the compact preview area 10 times in succession. Verify the state does not deadlock or desynchronize with isGenerating.
3. **Extreme Label Length (Red Team - AC-7)**:
   - Render a custom parameter with an excessively long label (VeryLongSamplerParameterConfigurationStepRateValue). Verify the row does not horizontally overflow or push the stepper out of viewport.
4. **Preset List Overflow (Red Team - AC-4)**:
   - Render 30 presets in PresetManagerPanel. Verify the bottom dock remains pinned at the bottom of the 75dvh sheet, and scrolling only occurs inside the list container.
5. **Checkbox Event Bubbling (Red Team - AC-2)**:
   - Tap a checkbox nested inside a label or wrapper div. Verify event bubbling does not trigger container-level focusin/blur that hides the action bar.
6. **Modal Stacking & Dropdown Dismissal (Red Team - AC-6)**:
   - Open Resource Monitor dropdown (z-40), then open full-screen preview or preset modal (z-50). Verify modal overlay cleanly obscures or dismisses the dropdown without clipping or z-index leakage.
7. **Desktop Non-Regression Baseline (Red Team - AC-1, AC-7)**:
   - Render page at 1280px / 1920px desktop viewport. Verify desktop grid, header, and parameter layout remain completely unaffected by mobile classes.
8. **Keyboard Accessibility & ARIA Toggle (Red Team - AC-5)**:
   - Focus compact preview using Tab and press Space/Enter. Verify preview expands/collapses and aria-expanded updates synchronously.
