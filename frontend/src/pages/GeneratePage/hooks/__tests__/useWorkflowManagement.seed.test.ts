import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workflow } from '../../../../api/types'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { useWorkflowManagement } from '../useWorkflowManagement'

const mapping = (id: number, role: string, input_type: string) => ({
  id,
  master_id: id,
  node_id: `node-${id}`,
  variant_id: null,
  role,
  param_name: role,
  input_type,
  display_name: role,
})

const workflow: Workflow = {
  id: 7,
  name: 'Seed workflow',
  target_base_model_id: 1,
  mappings: [
    mapping(1, 'Sampler_Steps', 'number'),
    mapping(2, 'Rough_Sampler_Seed', 'seed'),
    { ...mapping(3, 'Main_Sampler_Seed', 'seed'), variant_id: 33 },
    { ...mapping(4, 'Sampler_Seed', 'number'), variant_id: 44 },
    mapping(5, 'Prompt', 'textarea'),
    { ...mapping(6, 'Unassigned', 'number'), role: null },
  ],
  mapping_slot_states: { 'm:2': false, 'v:44': false },
}
const secondWorkflow: Workflow = { ...workflow, id: 8, name: 'Second workflow' }
const thirdWorkflow: Workflow = { ...workflow, id: 9, name: 'Third workflow' }
const nonAnimaWorkflow: Workflow = { ...secondWorkflow, target_base_model_id: 2 }

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
})

function installFetchStub() {
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/workflows/7' && init?.method === 'PUT') return jsonResponse({})
    if (url === '/api/workflows') return jsonResponse([
      { id: 7, name: workflow.name },
      { id: 8, name: nonAnimaWorkflow.name },
      { id: 9, name: thirdWorkflow.name },
    ])
    if (url === '/api/workflows/7') return jsonResponse(workflow)
    if (url === '/api/workflows/8') return jsonResponse(nonAnimaWorkflow)
    if (url === '/api/workflows/9') return jsonResponse(thirdWorkflow)
    if (url === '/api/mapping-masters') return jsonResponse([])
    if (url === '/api/base-models') return jsonResponse([
      { id: 1, name: 'Anima' },
      { id: 2, name: 'SDXL' },
    ])
    if (url === '/api/param-type-masters') return jsonResponse([])
    if (url === '/api/comfy/object_info') return jsonResponse({})
    throw new Error(`Unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  }
}

describe('useWorkflowManagement seed mappings', () => {
  beforeEach(() => {
    useGenerationStore.getState().setIsAnimaMode(false)
  })
  afterEach(() => {
    useGenerationStore.getState().setIsAnimaMode(false)
    vi.unstubAllGlobals()
  })

  it('[REQ-359/AC-1] converges after both queries under whole-store subscription', async () => {
    installFetchStub()
    const { queryClient, wrapper } = createWrapper()
    let renderCount = 0
    const { result } = renderHook(
      () => {
        renderCount += 1
        useGenerationStore()
        return useWorkflowManagement({ selectedWorkflowId: 7, setSelectedWorkflowId: vi.fn() })
      },
      { wrapper },
    )

    await waitFor(() => expect(result.current.rawWorkflow?.mappings).toHaveLength(6))
    await waitFor(() => expect(result.current.isAnimaMode).toBe(true))
    const derivedWorkflow = result.current.workflow
    act(() => useGenerationStore.getState().setIsAnimaMode(true))

    expect(result.current.workflow).toBe(derivedWorkflow)
    expect(renderCount).toBeLessThan(12)
    queryClient.clear()
  })

  it('[REQ-359/AC-2] preserves workflow identity and avoids repeat writes after unrelated store update', async () => {
    installFetchStub()
    const { queryClient, wrapper } = createWrapper()
    let storeNotifications = 0
    const unsubscribe = useGenerationStore.subscribe(() => { storeNotifications += 1 })
    let renderCount = 0
    const { result } = renderHook(
      () => {
        renderCount += 1
        useGenerationStore()
        return useWorkflowManagement({ selectedWorkflowId: 7, setSelectedWorkflowId: vi.fn() })
      },
      { wrapper },
    )

    await waitFor(() => expect(result.current.isAnimaMode).toBe(true))
    expect(useGenerationStore.getState().isAnimaMode).toBe(true)
    expect(storeNotifications).toBe(1)
    const derivedWorkflow = result.current.workflow
    act(() => useGenerationStore.setState({ unrelatedTestField: true } as never))
    expect(result.current.workflow).toBe(derivedWorkflow)
    expect(useGenerationStore.getState().isAnimaMode).toBe(true)
    expect(storeNotifications).toBe(2)
    expect(renderCount).toBeLessThan(12)
    unsubscribe()
    queryClient.clear()
  })

  it('[REQ-359/AC-3] detects Anima and non-Anima workflow switches, including same-model reselection', async () => {
    installFetchStub()
    const { queryClient, wrapper } = createWrapper()
    let storeNotifications = 0
    const unsubscribe = useGenerationStore.subscribe(() => { storeNotifications += 1 })
    const { result, rerender } = renderHook(
      ({ workflowId }) => {
        useGenerationStore()
        return useWorkflowManagement({ selectedWorkflowId: workflowId, setSelectedWorkflowId: vi.fn() })
      },
      { initialProps: { workflowId: 7 }, wrapper },
    )

    await waitFor(() => expect(result.current.rawWorkflow?.id).toBe(7))
    await waitFor(() => expect(result.current.isAnimaMode).toBe(true))
    expect(storeNotifications).toBe(1)

    rerender({ workflowId: 9 })
    await waitFor(() => expect(result.current.rawWorkflow?.id).toBe(9))
    expect(result.current.isAnimaMode).toBe(true)
    expect(storeNotifications).toBe(1)

    act(() => {
      result.current.setIsAnimaMode((previous) => !previous)
      result.current.setIsAnimaMode((previous) => !previous)
    })
    expect(result.current.isAnimaMode).toBe(true)
    expect(storeNotifications).toBe(3)
    act(() => result.current.setIsAnimaMode(false))
    expect(result.current.isAnimaMode).toBe(false)
    expect(storeNotifications).toBe(4)

    // A manual override lasts until selection changes; selecting another Anima workflow re-detects it.
    rerender({ workflowId: 8 })
    await waitFor(() => expect(result.current.rawWorkflow?.id).toBe(8))
    await waitFor(() => expect(result.current.isAnimaMode).toBe(false))
    expect(result.current.rawWorkflow?.target_base_model_id).toBe(2)
    expect(storeNotifications).toBe(4)
    rerender({ workflowId: 7 })
    await waitFor(() => expect(result.current.rawWorkflow?.id).toBe(7))
    await waitFor(() => expect(result.current.isAnimaMode).toBe(true))
    expect(result.current.rawWorkflow?.target_base_model_id).toBe(1)
    expect(storeNotifications).toBe(5)
    unsubscribe()
    queryClient.clear()
  })

  it('[REQ-358/GENERATION] [REQ-358/AC-25] derives generation mappings from slot state while retaining raw workflow for mutation', async () => {
    const fetchStub = installFetchStub()
    const { queryClient, wrapper } = createWrapper()
    const { result } = renderHook(
      () => {
        useGenerationStore()
        return useWorkflowManagement({ selectedWorkflowId: 7, setSelectedWorkflowId: vi.fn() })
      },
      { wrapper },
    )

    await waitFor(() => expect(result.current.rawWorkflow?.mappings).toHaveLength(6))
    expect(result.current.paramMappings.map((item) => item.id)).toEqual([1, 3])
    expect(result.current.textMappings.map((item) => item.id)).toEqual([5])
    expect(result.current.invalidMappings.map((item) => item.id)).toEqual([6])
    expect(result.current.workflow?.mappings.some((item) => item.role === 'Rough_Sampler_Seed')).toBe(false)
    expect(result.current.workflow?.mappings.some((item) => item.role === 'Main_Sampler_Seed')).toBe(true)
    expect(result.current.workflow?.mappings.some((item) => item.role === 'Sampler_Seed')).toBe(false)
    expect(result.current.rawWorkflow?.mappings).toHaveLength(6)
    expect(result.current.rawWorkflow?.mappings.some((item) => item.role === 'Rough_Sampler_Seed')).toBe(true)
    expect(result.current.rawWorkflow?.mappings.some((item) => item.role === 'Sampler_Seed')).toBe(true)

    await act(async () => result.current.handleUpdateMapping(1, 101))
    expect(fetchStub).toHaveBeenCalledWith('/api/workflows/7', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ mappings: [
        { master_id: 101, node_id: 'node-1' },
        { master_id: 2, node_id: 'node-2' },
        { master_id: 3, node_id: 'node-3', variant_id: 33 },
        { master_id: 4, node_id: 'node-4', variant_id: 44 },
        { master_id: 5, node_id: 'node-5' },
        { master_id: 6, node_id: 'node-6' },
      ] }),
    }))
    queryClient.clear()
  })

  it('[REQ-358/AC-25][REQ-359/AC-2] resolves a legacy disabled slot after delayed master loading while preserving raw data and stable references', async () => {
    const fetchStub = installFetchStub()
    const originalFetch = fetchStub.getMockImplementation()!
    const raw = { ...workflow, mapping_slot_states: { 'v:11': false, 'v:22': false, 'v:999': false } }
    let resolveMasters!: (value: Response) => void
    fetchStub.mockImplementation(async (input, init) => {
      if (String(input) === '/api/mapping-masters') return new Promise<Response>((resolve) => { resolveMasters = resolve })
      if (String(input) === '/api/workflows/7') return jsonResponse(raw)
      return originalFetch(input, init)
    })
    const { queryClient, wrapper } = createWrapper()
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount += 1
      useGenerationStore()
      return useWorkflowManagement({ selectedWorkflowId: 7, setSelectedWorkflowId: vi.fn() })
    }, { wrapper })
    await waitFor(() => expect(result.current.rawWorkflow?.id).toBe(7))
    expect(result.current.paramMappings.some((item) => item.id === 1)).toBe(true)
    await act(async () => resolveMasters(jsonResponse([
      { id: 1, variants: [{ id: 11, stage_id: 1, is_enabled: true }] },
      { id: 2, variants: [{ id: 22, stage_id: 1, is_enabled: true }, { id: 23, stage_id: 2, is_enabled: true }] },
    ])))
    await waitFor(() => expect(result.current.paramMappings.some((item) => item.id === 1)).toBe(false))
    expect(result.current.paramMappings.some((item) => item.id === 2)).toBe(true)
    expect(result.current.rawWorkflow?.mappings).toEqual(raw.mappings)
    expect(result.current.rawWorkflow?.mapping_slot_states).toEqual(raw.mapping_slot_states)
    const derived = result.current.workflow
    act(() => useGenerationStore.setState({ unrelatedTestField: true } as never))
    expect(result.current.workflow).toBe(derived)
    act(() => queryClient.setQueryData(['workflow', 7], { ...raw, mapping_slot_states: { ...raw.mapping_slot_states, 'v:11': true } }))
    await waitFor(() => expect(result.current.paramMappings.some((item) => item.id === 1)).toBe(true))
    expect(result.current.rawWorkflow?.mappings).toEqual(raw.mappings)
    expect(renderCount).toBeLessThan(15)
    queryClient.clear()
  })

  it('[REQ-358/AC-25] resolves a multistage legacy seed only by exact persisted role, including inactive variants', async () => {
    const fetchStub = installFetchStub()
    const originalFetch = fetchStub.getMockImplementation()!
    const seed = mapping(4, 'Sampler_Seed', 'number')
    const raw = { ...workflow, mappings: [seed], mapping_slot_states: { 'v:44': false, 'v:45': true, 'v:999': false } }
    fetchStub.mockImplementation(async (input, init) => {
      if (String(input) === '/api/workflows/7') return jsonResponse(raw)
      if (String(input) === '/api/mapping-masters') return jsonResponse([
        { id: 4, variants: [{ id: 44, computed_role: 'Sampler_Seed', is_enabled: false }, { id: 45, computed_role: 'Sampler_Seed_rough', is_enabled: true }] },
      ])
      return originalFetch(input, init)
    })
    const { queryClient, wrapper } = createWrapper()
    const { result } = renderHook(() => useWorkflowManagement({ selectedWorkflowId: 7, setSelectedWorkflowId: vi.fn() }), { wrapper })
    await waitFor(() => expect(result.current.mappingMasters).toHaveLength(1))
    expect(result.current.paramMappings).toEqual([])
    expect(result.current.rawWorkflow?.mappings).toEqual([seed])
    act(() => queryClient.setQueryData(['workflow', 7], { ...raw, mapping_slot_states: { ...raw.mapping_slot_states, 'v:44': true } }))
    await waitFor(() => expect(result.current.paramMappings).toEqual([seed]))
    expect(result.current.rawWorkflow?.mapping_slot_states?.['v:999']).toBe(false)
    queryClient.clear()
  })
})
