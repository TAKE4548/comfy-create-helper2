import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DesktopLayout } from '../pages/GeneratePage/components/DesktopLayout'
import { useGenerationStore } from '../store/useGenerationStore'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(), vi.fn()], useLocation: () => ({ pathname: '/' }) }))
vi.mock('../api/client', () => ({ api: { workflows: { get: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) } }, bypassProfilesApi: { list: vi.fn().mockResolvedValue([]) }, mappingMastersApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('../api/domains/workflows', () => ({ bypassProfilesApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('../api/domains/stageMasters', () => ({ stageMastersApi: { list: vi.fn().mockResolvedValue([]) } }))

const stages = [
  { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 0 },
  { id: 2, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 1 },
]
const masters = [{ id: 7, group_id: null, base_key: 'prompt', name: 'Prompt', param_name: 'text', input_type: 'textarea', expected_class_types: null, base_title_patterns: null, sort_order: 0, variants: [
  { id: 71, master_id: 7, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Main_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
  { id: 72, master_id: 7, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'Rough_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
]}, { id: 8, group_id: null, base_key: 'steps', name: 'Steps', param_name: 'steps', input_type: 'int', expected_class_types: null, base_title_patterns: null, sort_order: 1, variants: [
  { id: 81, master_id: 8, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'steps_main', extra_title_patterns: null, is_enabled: true },
  { id: 82, master_id: 8, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'steps_rough', extra_title_patterns: null, is_enabled: true },
]}]
const mappings = [
  { id: 11, master_id: 7, variant_id: 71, node_id: '1', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: '描写' },
  { id: 12, master_id: 7, variant_id: 72, node_id: '2', role: 'Rough_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: '描写' },
  { id: 13, master_id: 7, variant_id: 71, node_id: '3', role: 'Main_Duplicate', param_name: 'duplicate', input_type: 'textarea', display_name: '描写' },
  { id: 14, master_id: 7, variant_id: 71, node_id: '4', role: 'Main_Full_Name', param_name: 'legacy', input_type: 'textarea', display_name: 'Main_Positive_Prompt' },
  { id: 15, master_id: 7, variant_id: 72, node_id: '5', role: 'Rough_Full_Name', param_name: 'legacy', input_type: 'textarea', display_name: 'Rough Prompt' },
  { id: 16, master_id: 7, variant_id: 71, node_id: '6', role: 'Fallback_Param', param_name: 'Param Fallback', input_type: 'textarea', display_name: '   ' },
  { id: 17, master_id: 7, variant_id: 72, node_id: '7', role: 'Fallback_Role', param_name: '   ', input_type: 'textarea', display_name: '' },
  { id: 18, master_id: 7, variant_id: 72, node_id: '8', role: '', param_name: '', input_type: 'textarea', display_name: '' },
]
const fn = () => vi.fn()

function makeState(values: Record<string, string>, setValues: (v: Record<string, string>) => void, collapsed: string, setCollapsed: (v: string) => void) {
  return {
    isConnected: true, isGenerating: false, progress: 0, previewImage: null, activeClientId: 'client', clientId: 'client', selectedWorkflowId: 1,
    setSelectedWorkflowId: fn(), paramValues: values, setParamValues: setValues, batchSize: 1, setBatchSize: fn(), seedMode: 'random', seed: 123,
    setSeed: fn(), setSeedMode: fn(), selectedImg: null, setSelectedImg: fn(), appliedAssets: {}, addAppliedAsset: fn(), toggleAppliedAsset: fn(),
    removeAppliedAsset: fn(), activeBatch: null, sets: [], activeSetId: 'default', removeSet: fn(), toggleSetChecked: fn(), openPresetIds: [],
    undo: fn(), redo: fn(), canUndo: false, canRedo: false, setRescanOpen: fn(), selectedMasters: {}, setSelectedMasters: fn(), openAddAssetRole: null,
    setOpenAddAssetRole: fn(), setIsJobModalOpen: fn(), setIsPresetManagerOpen: fn(), setWorkflowManageMode: fn(), baseModels: [],
    updateWorkflowBaseModelMutation: { mutate: fn() }, workflows: [{ id: 1, name: 'Workflow', target_base_model_id: 'sdxl' }],
    workflow: { id: 1, name: 'Workflow', json_body: '{}', mappings: [] }, mappingMasters: masters, loras: [], paramTypeMasters: [], tagSets: [], presets: [],
    comfyObjectInfo: null, displayImages: [], sortedDisplayImages: [], isMultiSelectMode: false, selectedIds: new Set(), handleItemClick: fn(),
    getLongPressHandlers: () => ({}), isSelected: () => false, exitMultiSelectMode: fn(), selectAll: fn(), clearSelection: fn(), auditOpen: false,
    setAuditOpen: fn(), auditIntent: '', setAuditIntent: fn(), auditTypes: [], setAuditTypes: fn(), auditResult: null, auditStatus: 'idle', runAudit: { mutate: fn() },
    dragOver: false, handleFileSelect: fn(), handleDragOver: fn(), handleDragLeave: fn(), handleDrop: fn(), isGeneratingHere: false,
    isOtherSessionGenerating: false, allQueueCount: 0, totalQueueCount: 0, showStrip: false, invalidMappings: [], textMappings: mappings,
    paramMappings: [
      { id: 21, master_id: 8, variant_id: 81, node_id: '1', role: 'steps_main', param_name: 'steps', input_type: 'int', display_name: 'Steps' },
      { id: 22, master_id: 8, variant_id: 82, node_id: '2', role: 'steps_rough', param_name: 'steps', input_type: 'int', display_name: 'Steps' },
    ],
    handleLoadSnapshot: fn(), handleUpdateMapping: fn(), handleOpenModalPreview: fn(), handleGenerateSets: fn(), getIsRoleCollapsed: (r: string) => r === collapsed,
    setRoleCollapsed: (r: string, on: boolean) => setCollapsed(on ? r : ''), handleSaveDefaultParams: fn(), handleResetDefaultParams: fn(),
    setIsSaveModalOpen: fn(), updateWorkflowMutation: { mutate: fn(), isPending: false }, saveDefaultParamsMutation: { isPending: false }, isAnimaMode: false,
    setIsAnimaMode: fn(), promptTranslation: {},
  }
}

function renderDesktop() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['stage-masters'], stages)
  client.setQueryData(['mapping-masters'], masters)
  function Harness() {
    const [values, setValues] = useState({ Main_Positive_Prompt: 'A', Rough_Positive_Prompt: 'B', Main_Duplicate: 'C' })
    const [collapsed, setCollapsed] = useState('')
    return <DesktopLayout state={makeState(values, setValues, collapsed, setCollapsed) as any} />
  }
  useGenerationStore.setState({ promptChips: {}, roleTextModes: { Main_Positive_Prompt: true, Rough_Positive_Prompt: true } } as any)
  return render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
}

afterEach(() => useGenerationStore.setState({ promptChips: {}, roleTextModes: {} } as any))

describe('REQ-347 desktop visual contract and interactions', () => {
  it('keeps stage headings, prompt names, toolbars, editors, and clipboard actions scoped to original roles', async () => {
    const { container } = renderDesktop()
    const prompts = container.querySelector<HTMLElement>('#desktop-prompt-scroll')!
    const controls = container.querySelector<HTMLElement>('#desktop-controls-scroll')!
    expect(prompts).toHaveAttribute('data-stage-scroll-root', '')
    expect(controls).toHaveAttribute('data-stage-scroll-root', '')
    expect(container.querySelector('[data-stage-scroll-root]:not(#desktop-prompt-scroll):not(#desktop-controls-scroll)')).toBeNull()
    expect(container.querySelector('[data-prompt-scroll-root]')).toBeNull()
    for (const root of [prompts, controls]) {
      expect(within(root).getAllByRole('heading', { name: 'Main (main)' })).toHaveLength(1)
      expect(within(root).getAllByRole('heading', { name: 'Rough (rough)' })).toHaveLength(1)
      expect(Array.from(root.querySelectorAll('h3')).map((heading) => heading.textContent?.trim())).toEqual(['Main', 'Rough'])
      expect(within(root).queryByText('描写 main')).toBeNull()
    }
    const main = within(prompts).getByRole('region', { name: 'Main (main)' })
    const rough = within(prompts).getByRole('region', { name: 'Rough (rough)' })
    const mainMapping = main.querySelector<HTMLElement>('[data-prompt-mapping-id="11"]')!
    const roughMapping = rough.querySelector<HTMLElement>('[data-prompt-mapping-id="12"]')!
    const duplicateMapping = main.querySelector<HTMLElement>('[data-prompt-mapping-id="13"]')!
    expect(mainMapping.querySelector('h4')).toHaveTextContent('描写')
    expect(roughMapping.querySelector('h4')).toHaveTextContent('描写')
    expect(duplicateMapping.querySelector('h4')).toHaveTextContent('描写')
    expect(main.querySelectorAll('[data-prompt-mapping-id="13"]')).toHaveLength(1)
    expect(main.querySelector('[data-prompt-mapping-id="14"] h4')).toHaveTextContent('Main_Positive_Prompt')
    expect(rough.querySelector('[data-prompt-mapping-id="15"] h4')).toHaveTextContent('Rough Prompt')
    expect(main.querySelector('[data-prompt-mapping-id="16"] h4')).toHaveTextContent('Param Fallback')
    expect(rough.querySelector('[data-prompt-mapping-id="17"] h4')).toHaveTextContent('Fallback_Role')
    expect(rough.querySelector('[data-prompt-mapping-id="18"] h4')).toHaveTextContent('プロンプト')
    expect(mainMapping.querySelector('h4')?.previousElementSibling).toHaveAttribute('id', 'prompt-description-11')
    expect(roughMapping.querySelector('h4')?.previousElementSibling).toHaveAttribute('id', 'prompt-description-12')
    expect(within(mainMapping).getByRole('button', { name: '描写' })).toHaveAttribute('aria-describedby', 'prompt-description-11')
    expect(mainMapping.querySelector('#prompt-description-11')).toHaveTextContent('main / Main_Positive_Prompt')
    expect(roughMapping.querySelector('#prompt-description-12')).toHaveTextContent('rough / Rough_Positive_Prompt')
    expect(mainMapping.querySelector('h4')?.textContent).toBe('描写')
    expect(mainMapping.querySelector('#prompt-Main_Positive_Prompt')).toBeInTheDocument()
    expect(roughMapping.querySelector('#prompt-Rough_Positive_Prompt')).toBeInTheDocument()
    expect(mainMapping.querySelectorAll('textarea')).toHaveLength(1)
    expect(roughMapping.querySelectorAll('textarea')).toHaveLength(1)
    expect((mainMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('A')
    expect((roughMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('B')
    fireEvent.click(within(mainMapping).getByRole('button', { name: 'チップモード切替' }))
    act(() => useGenerationStore.setState({ promptChips: { Main_Positive_Prompt: [{ id: 'locked', text: 'locked', enabled: false }] } } as any))
    await waitFor(() => expect(mainMapping.querySelector('[data-ux-tag-chip="true"]')).toHaveClass('line-through'))
    fireEvent.click(within(mainMapping).getByRole('button', { name: 'テキスト入力モード切替' }))
    for (const mapping of [mainMapping, roughMapping]) {
      const toolbar = mapping.querySelector('.relative.flex.w-full')!
      expect(toolbar).toHaveClass('w-full', 'relative')
      expect(toolbar.querySelectorAll('button')).toHaveLength(4)
      expect(within(mapping).getByRole('button', { name: 'Add Asset' })).toBeInTheDocument()
      expect(within(mapping).getByRole('button', { name: '翻訳' })).toBeInTheDocument()
      expect(within(mapping).getByRole('button', { name: 'チップモード切替' })).toBeInTheDocument()
      expect(mapping.querySelector('h4')?.textContent).not.toMatch(/caption|toolbar/i)
      expect(within(mapping).queryByText('Chips Mode')).toBeNull()
      expect(within(mapping).queryByText('Text Mode (Comma separated)')).toBeNull()
    }
    fireEvent.change(mainMapping.querySelector('textarea')!, { target: { value: 'edited A' } })
    expect((mainMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('edited A')
    expect((roughMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('B')
    fireEvent.change(roughMapping.querySelector('textarea')!, { target: { value: 'edited B' } })
    expect((mainMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('edited A')
    expect((roughMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('edited B')
    expect(within(main).getAllByRole('button', { name: '描写' })).toHaveLength(2)
    fireEvent.click(within(mainMapping).getByRole('button', { name: '描写' }))
    expect(main.querySelector('#prompt-Main_Positive_Prompt')).toBeNull()
    expect(mainMapping.querySelector('[data-prompt-clipboard-menu]')).toBeNull()
    expect(rough.querySelector('#prompt-Rough_Positive_Prompt')).toBeInTheDocument()
    fireEvent.click(within(mainMapping).getByRole('button', { name: '描写' }))
    expect((mainMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('edited A')
    const anchor = mainMapping.querySelector('[data-prompt-clipboard-menu]')!
    expect(anchor).toHaveAttribute('data-menu-align', 'start')
    expect(anchor.parentElement).toHaveClass('relative', 'w-full')
    fireEvent.click(within(anchor).getByRole('button', { name: 'クリップボード・履歴メニュー (Main_Positive_Prompt)' }))
    const popup = mainMapping.querySelector('[class*="absolute left-0"]')!
    expect(popup).toHaveClass('max-w-full')
    expect(popup).toHaveTextContent('クリップボードから貼り付け')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: vi.fn().mockResolvedValue('pasted from clipboard'), writeText: vi.fn().mockResolvedValue(undefined) } })
    fireEvent.click(within(popup).getByRole('button', { name: 'クリップボードから貼り付け' }))
    await waitFor(() => expect((mainMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('edited A, pasted from clipboard'))
    expect((roughMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('edited B')
    fireEvent.click(within(anchor).getByRole('button', { name: 'プロンプトをコピー (Main_Positive_Prompt)' }))
    fireEvent.click(within(anchor).getByRole('button', { name: 'クリップボード・履歴メニュー (Main_Positive_Prompt)' }))
    const historyEntry = await within(anchor).findByRole('button', { name: 'edited A, pasted from clipboard' })
    fireEvent.click(historyEntry)
    await waitFor(() => expect((mainMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('edited A, pasted from clipboard, edited A, pasted from clipboard'))
    expect((roughMapping.querySelector('textarea') as HTMLTextAreaElement).value).toBe('edited B')
    fireEvent.click(within(mainMapping).getByRole('button', { name: 'チップモード切替' }))
    act(() => useGenerationStore.setState({ promptChips: { Main_Positive_Prompt: [{ id: 'locked-after-collapse', text: 'locked', enabled: false }] } } as any))
    await waitFor(() => expect(mainMapping.querySelector('[data-ux-tag-chip="true"]')).toHaveClass('line-through'))
    fireEvent.click(within(mainMapping).getByRole('button', { name: '描写' }))
    expect(mainMapping.querySelector('#prompt-Main_Positive_Prompt')).toBeNull()
    expect(mainMapping.querySelector('[data-prompt-clipboard-menu]')).toBeNull()
    expect(roughMapping.querySelector('#prompt-Rough_Positive_Prompt')).toBeInTheDocument()
    fireEvent.click(within(mainMapping).getByRole('button', { name: '描写' }))
    await waitFor(() => expect(mainMapping.querySelector('[data-ux-tag-chip="true"]')).toHaveClass('line-through'))
    expect(useGenerationStore.getState().promptChips?.Main_Positive_Prompt?.[0]).toMatchObject({ id: 'locked-after-collapse', enabled: false })
  })
})
