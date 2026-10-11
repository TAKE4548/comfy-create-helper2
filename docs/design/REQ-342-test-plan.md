# Test Plan: REQ-342 - Node Candidate Label Missing Title and Class Type

## 1. Test Strategy Overview
This test plan validates that node candidates displayed in dropdowns across workflow registration (`UploadWorkflowModal`), workflow remapping (`RescanModal`), and dataset studio remapping (`NodeRemapModal`) consistently render full labels:
`${id} - [${title}] (${classType})`

## 2. Test Execution Baseline
- **Subsystem**: `frontend/`
- **Unit Test Command**: `cd frontend && npx vitest run src/utils/__tests__/workflowNodeUtils.test.ts`
- **Component Test Command**: `cd frontend && npx vitest run src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx`
- **Full Test Suite**: `cd frontend && npm test`
- **Static Typecheck**: `cd frontend && npm run typecheck`

## 3. Test Cases & Scenarios

### Section 3.1: Unit Test Cases (`workflowNodeUtils.test.ts`)
- **TC-UTIL-01 (API Prompt - Standard Node)**:
  - Input: `id='10', workflowJson={'10': {class_type: 'KSampler', _meta: {title: 'Main KSampler'}}}`
  - Expected: `10 - [Main KSampler] (KSampler)`
- **TC-UTIL-02 (API Prompt - Unnamed Node / Fallback to classType)**:
  - Input: `id='11', workflowJson={'11': {class_type: 'CLIPTextEncode'}}` (no `_meta`)
  - Expected: `11 - [CLIPTextEncode] (CLIPTextEncode)` (never empty `[]`)
- **TC-UTIL-03 (API Prompt - Direct node.title fallback)**:
  - Input: `id='12', workflowJson={'12': {class_type: 'VAEDecode', title: 'Output VAE'}}`
  - Expected: `12 - [Output VAE] (VAEDecode)`
- **TC-UTIL-04 (UI Format Node)**:
  - Input: `id='15', workflowJson={nodes: [{id: 15, type: 'PrimitiveNode', title: 'Seed Value'}]}`
  - Expected: `15 - [Seed Value] (PrimitiveNode)`
- **TC-UTIL-05 (Missing Node / Fallback to Raw ID)**:
  - Input: `id='999', workflowJson={}`
  - Expected: `999`
- **TC-UTIL-06 (Null / Undefined Workflow JSON Safe Handling)**:
  - Input: `id='10', workflowJson=null`
  - Expected: `10` without exceptions

### Section 3.2: Component Integration Scenarios
- **TC-COMP-01 (RescanModal Multi-candidate Rendering)**:
  - Given a workflow with 3 KSampler nodes (10, 11, 12),
  - When RescanModal opens with candidates for `Sampler_Seed`,
  - Then all 3 candidate options display `${id} - [${title}] (KSampler)` (not role name, and none are bare numbers).
- **TC-COMP-02 (UploadWorkflowModal Unnamed Node Rendering)**:
  - Given an uploaded workflow with an unnamed node,
  - When UploadWorkflowModal renders candidate options,
  - Then options do not contain empty square brackets `[]`.
- **TC-COMP-03 (NodeRemapModal Parameter Options Consistency)**:
  - Given NodeRemapModal parameter mappings,
  - When dropdown options are listed,
  - Then options follow the unified `${id} - [${title}] (${classType})` format.

### Section 3.3: Red Team Boundary Testing (Gate 3)
- **TC-RED-01 (Numeric string vs integer ID matching)**:
  - Node ID passed as number `10` or string `'10'` safely resolves without undefined key mismatches.
- **TC-RED-02 (Malformed / Corrupt node objects)**:
  - Nodes with null fields, non-string titles, or unexpected structures do not throw unhandled exceptions.
