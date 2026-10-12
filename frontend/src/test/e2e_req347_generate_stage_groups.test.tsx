import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DesktopLayout } from '../pages/GeneratePage/components/DesktopLayout'
import { useGenerationStore } from '../store/useGenerationStore'
import { mappingMastersApi } from '../api/client'
import { stageMastersApi } from '../api/domains/stageMasters'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/' }),
}))
vi.mock('../api/client', () => ({
  api: { workflows: { get: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) }, bypassProfiles: { list: vi.fn().mockResolvedValue([]) } },
  bypassProfilesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  mappingMastersApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('../api/domains/workflows', () => ({ bypassProfilesApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('../api/domains/stageMasters', () => ({ stageMastersApi: { list: vi.fn().mockResolvedValue([]) } }))

const stages = [
  { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 0 },
  { id: 2, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 1 },
]
const masters = [
  { id: 7, group_id: null, base_key: 'prompt', name: 'Prompt', param_name: 'text', input_type: 'textarea', expected_class_types: null, base_title_patterns: null, sort_order: 0,
    variants: [
      { id: 71, master_id: 7, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Main_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
      { id: 72, master_id: 7, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'Rough_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
    ] },
  { id: 8, group_id: null, base_key: 'steps', name: 'Steps', param_name: 'steps', input_type: 'int', expected_class_types: null, base_title_patterns: null, sort_order: 1,
    variants: [
      { id: 81, master_id: 8, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'steps_main', extra_title_patterns: null, is_enabled: true },
      { id: 82, master_id: 8, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'steps_rough', extra_title_patterns: null, is_enabled: true },
    ] },
]
const textMappings = [
  { id: 11, master_id: 7, variant_id: 71, node_id: '1', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Main Prompt' },
  { id: 12, master_id: 7, variant_id: 72, node_id: '2', role: 'Rough_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Rough Prompt' },
]
const paramMappings = [
  { id: 21, master_id: 8, variant_id: 81, node_id: '1', role: 'steps_main', param_name: 'steps', input_type: 'int', display_name: 'Main Steps' },
  { id: 22, master_id: 8, variant_id: 82, node_id: '2', role: 'steps_rough', param_name: 'steps', input_type: 'int', display_name: 'Rough Steps' },
  { id: 23, master_id: 99, node_id: '3', role: 'Sampler_Seed', param_name: 'seed', input_type: 'int', display_name: 'Seed' },
]
const fn = () => vi.fn()

function makeState(paramValues: Record<string, string>, setParamValues: (values: Record<string, string>) => void, collapsedRole: string, setCollapsedRole: (role: string) => void, omitRough: boolean) {
  return {
    isConnected: true, isGenerating: false, progress: 0, previewImage: null, activeClientId: 'client', clientId: 'client',
    selectedWorkflowId: 1, setSelectedWorkflowId: fn(), paramValues, setParamValues, batchSize: 1, setBatchSize: fn(), seedMode: 'random', setSeedMode: fn(), seed: 123, setSeed: fn(), selectedImg: null, setSelectedImg: fn(),
    appliedAssets: {}, addAppliedAsset: fn(), toggleAppliedAsset: fn(), removeAppliedAsset: fn(), activeBatch: null, sets: [], activeSetId: 'default', removeSet: fn(), toggleSetChecked: fn(), openPresetIds: [], undo: fn(), redo: fn(), canUndo: false, canRedo: false,
    setRescanOpen: fn(), selectedMasters: {}, setSelectedMasters: fn(), openAddAssetRole: null, setOpenAddAssetRole: fn(), setIsJobModalOpen: fn(), setIsPresetManagerOpen: fn(), setWorkflowManageMode: fn(), baseModels: [], updateWorkflowBaseModelMutation: { mutate: fn() },
    workflows: [{ id: 1, name: 'Workflow', target_base_model_id: 'sdxl' }], workflow: { id: 1, name: 'Workflow', json_body: '{}', mappings: [] }, mappingMasters: masters, loras: [], paramTypeMasters: [], tagSets: [], presets: [], comfyObjectInfo: null,
    displayImages: [], sortedDisplayImages: [], isMultiSelectMode: false, selectedIds: new Set(), handleItemClick: fn(), getLongPressHandlers: () => ({}), isSelected: () => false, exitMultiSelectMode: fn(), selectAll: fn(), clearSelection: fn(),
    auditOpen: false, setAuditOpen: fn(), auditIntent: '', setAuditIntent: fn(), auditTypes: [], setAuditTypes: fn(), auditResult: null, auditStatus: 'idle', runAudit: { mutate: fn() }, dragOver: false, handleFileSelect: fn(), handleDragOver: fn(), handleDragLeave: fn(), handleDrop: fn(),
    isGeneratingHere: false, isOtherSessionGenerating: false, allQueueCount: 0, totalQueueCount: 0, showStrip: false, invalidMappings: [], textMappings: omitRough ? [textMappings[0]] : textMappings, paramMappings: omitRough ? [paramMappings[0], paramMappings[2]] : paramMappings,
    handleLoadSnapshot: fn(), handleUpdateMapping: fn(), handleOpenModalPreview: fn(), handleGenerateSets: fn(), getIsRoleCollapsed: (role: string) => role === collapsedRole, setRoleCollapsed: (role: string, collapsed: boolean) => setCollapsedRole(collapsed ? role : ''), handleSaveDefaultParams: fn(), handleResetDefaultParams: fn(), setIsSaveModalOpen: fn(), updateWorkflowMutation: { mutate: fn(), isPending: false }, saveDefaultParamsMutation: { isPending: false }, isAnimaMode: false, setIsAnimaMode: fn(), promptTranslation: {},
  }
}

function renderGenerate(options: { textMode?: boolean; collapsedRole?: string; omitRough?: boolean; cacheStages?: boolean; cacheMasters?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  if (options.cacheStages !== false) client.setQueryData(['stage-masters'], stages)
  if (options.cacheMasters !== false) client.setQueryData(['mapping-masters'], masters)
  function Harness() {
    const [paramValues, setParamValues] = useState({ Main_Positive_Prompt: 'A', Rough_Positive_Prompt: 'B', steps_main: '20', steps_rough: '30' })
    const [collapsedRole, setCollapsedRole] = useState(options.collapsedRole ?? '')
    return <DesktopLayout state={makeState(paramValues, setParamValues, collapsedRole, setCollapsedRole, options.omitRough ?? false) as any} />
  }
  useGenerationStore.setState({ roleTextModes: options.textMode === false ? {} : { Main_Positive_Prompt: true, Rough_Positive_Prompt: true } } as any)
  const view = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  return { ...view, client }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => { useGenerationStore.setState({ promptChips: {}, roleTextModes: {} } as any) })

describe('REQ-347 generated prompt and parameter stage groups', () => {
  it('scopes stage headings to independent roots and keeps role edits independent in shared live state', async () => {
    const { container, client } = renderGenerate()
    await screen.findByText('Batch Size')
    const prompts = container.querySelector<HTMLElement>('#desktop-prompt-scroll')!
    const controls = container.querySelector<HTMLElement>('#desktop-controls-scroll')!
    expect(prompts).not.toBe(controls)
    expect(prompts).toHaveAttribute('data-stage-scroll-root', '')
    expect(controls).toHaveAttribute('data-stage-scroll-root', '')
    for (const root of [prompts, controls]) {
      expect(within(root).getAllByRole('heading', { name: 'Main (main)' })).toHaveLength(1)
      expect(within(root).getAllByRole('heading', { name: 'Rough (rough)' })).toHaveLength(1)
    }
    expect(client.getQueryData(['stage-masters'])).toEqual(stages)
    expect(client.getQueryData(['mapping-masters'])).toEqual(masters)

    fireEvent.change(prompts.querySelector('#prompt-Main_Positive_Prompt textarea')!, { target: { value: 'Main A edited' } })
    fireEvent.change(prompts.querySelector('#prompt-Rough_Positive_Prompt textarea')!, { target: { value: 'Rough C' } })
    expect((prompts.querySelector('#prompt-Main_Positive_Prompt textarea') as HTMLTextAreaElement).value).toBe('Main A edited')
    expect((prompts.querySelector('#prompt-Rough_Positive_Prompt textarea') as HTMLTextAreaElement).value).toBe('Rough C')

    fireEvent.change(controls.querySelector('#param-steps_rough')!, { target: { value: '40' } })
    expect((controls.querySelector('#param-steps_main') as HTMLInputElement).value).toBe('20')
    expect((controls.querySelector('#param-steps_rough') as HTMLInputElement).value).toBe('40')
    expect(within(controls).getAllByText('Batch Size')).toHaveLength(1)
    expect(within(controls).getAllByText('Seed')).toHaveLength(1)
    expect(prompts.querySelector('#param-steps_rough')).toBeNull()
    expect(controls.querySelector('#prompt-Rough_Positive_Prompt')).toBeNull()

    act(() => client.setQueryData(['stage-masters'], [
      { ...stages[0], name: 'Main Updated', sort_order: 1 },
      { ...stages[1], name: 'Rough Updated', sort_order: 0 },
    ]))
    await within(prompts).findByRole('heading', { name: 'Main Updated (main)' })
    await within(controls).findByRole('heading', { name: 'Rough Updated (rough)' })
    expect(Array.from(prompts.querySelectorAll('[data-stage-key]')).map((group) => group.getAttribute('data-stage-key'))).toEqual(['rough', 'main'])
    expect((prompts.querySelector('#prompt-Main_Positive_Prompt textarea') as HTMLTextAreaElement).value).toBe('Main A edited')
    expect((prompts.querySelector('#prompt-Rough_Positive_Prompt textarea') as HTMLTextAreaElement).value).toBe('Rough C')
    expect((controls.querySelector('#param-steps_main') as HTMLInputElement).value).toBe('20')
    expect((controls.querySelector('#param-steps_rough') as HTMLInputElement).value).toBe('40')
  })

  it('preserves disabled role chips, supports collapsing one role, and omits an empty stage', async () => {
    useGenerationStore.setState({ promptChips: { Main_Positive_Prompt: [{ id: 'locked-chip', text: 'locked', enabled: false }] } } as any)
    const { container } = renderGenerate({ textMode: false, collapsedRole: 'Rough_Positive_Prompt', omitRough: true })
    const prompts = container.querySelector<HTMLElement>('#desktop-prompt-scroll')!
    const controls = container.querySelector<HTMLElement>('#desktop-controls-scroll')!
    await screen.findByText('Batch Size')
    expect(within(prompts).getAllByRole('heading', { name: 'Main (main)' })).toHaveLength(1)
    expect(within(prompts).queryByRole('heading', { name: 'Rough (rough)' })).toBeNull()
    expect(within(controls).queryByRole('heading', { name: 'Rough (rough)' })).toBeNull()
    expect(prompts.querySelector('[data-ux-tag-chip="true"]')).toHaveClass('line-through')
    expect(prompts.querySelector('#prompt-Rough_Positive_Prompt')).toBeNull()

    fireEvent.click(within(prompts).getByRole('button', { name: 'Main Prompt' }))
    await waitFor(() => expect(prompts.querySelector('#prompt-Main_Positive_Prompt')).toBeNull())
  })

  it('loads the missing shared master metadata and renders both parameter stages alongside cached stages', async () => {
    vi.mocked(mappingMastersApi.list).mockResolvedValue(masters as never)
    const { container } = renderGenerate({ cacheMasters: false })
    const controls = container.querySelector<HTMLElement>('#desktop-controls-scroll')!
    await within(controls).findByRole('heading', { name: 'Rough (rough)' })
    expect(vi.mocked(mappingMastersApi.list)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(stageMastersApi.list)).not.toHaveBeenCalled()
    expect(controls.querySelector('#param-steps_main')).toBeInTheDocument()
    expect(controls.querySelector('#param-steps_rough')).toBeInTheDocument()
  })

  it('recovers after uncached stage metadata fails and refetches, while cached metadata invalidation refetches once', async () => {
    vi.mocked(mappingMastersApi.list).mockResolvedValue(masters as never)
    vi.mocked(stageMastersApi.list).mockRejectedValueOnce(new Error('temporary stage metadata failure')).mockResolvedValue(stages as never)
    const first = renderGenerate({ cacheStages: false, cacheMasters: false })
    const { client } = first
    await waitFor(() => expect(client.getQueryCache().find({ queryKey: ['stage-masters'] })?.state.status).toBe('error'))
    await waitFor(() => expect(client.getQueryCache().find({ queryKey: ['mapping-masters'] })?.state.status).toBe('success'))
    await act(async () => { await client.refetchQueries({ queryKey: ['stage-masters'] }) })
    expect(client.getQueryCache().find({ queryKey: ['stage-masters'] })?.state.status).toBe('success')
    expect(vi.mocked(stageMastersApi.list)).toHaveBeenCalledTimes(2)

    first.unmount()
    vi.mocked(stageMastersApi.list).mockClear().mockResolvedValue(stages as never)
    vi.mocked(mappingMastersApi.list).mockClear()
    const cached = renderGenerate()
    await act(async () => { await cached.client.invalidateQueries({ queryKey: ['stage-masters'] }) })
    expect(vi.mocked(stageMastersApi.list)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(stageMastersApi.list)).toHaveBeenLastCalledWith(true)
    expect(vi.mocked(mappingMastersApi.list)).not.toHaveBeenCalled()
  })
})
