import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMappingStageGroups } from '../useMappingStageGroups'
import type { MappingMasterV2, StageMaster, WorkflowMapping } from '../../utils/mappingStageGroups'

const { listStages, listMasters } = vi.hoisted(() => ({
  listStages: vi.fn(),
  listMasters: vi.fn(),
}))

vi.mock('../../api/domains/stageMasters', () => ({ stageMastersApi: { list: listStages } }))
vi.mock('../../api/client', () => ({ mappingMastersApi: { list: listMasters } }))

const stages: StageMaster[] = [{
  id: 7,
  key: 'prompt',
  name: 'Prompt',
  suffix: '_prompt',
  search_keywords: null,
  previous_suffixes: null,
  is_builtin: true,
  is_active: true,
  sort_order: 1,
}]

const masters: MappingMasterV2[] = [{
  id: 3,
  group_id: null,
  base_key: 'positive',
  name: 'Positive prompt',
  param_name: 'text',
  input_type: 'textarea',
  expected_class_types: null,
  base_title_patterns: null,
  sort_order: 1,
  variants: [{
    id: 9,
    master_id: 3,
    stage_id: 7,
    stage_key: 'prompt',
    stage_name: 'Prompt',
    stage_suffix: '_prompt',
    custom_role_override: null,
    computed_role: 'positive_prompt',
    extra_title_patterns: null,
    is_enabled: true,
  }],
}]

const mappings: WorkflowMapping[] = [{
  id: 11,
  master_id: 3,
  node_id: 'node-1',
  variant_id: 9,
  role: 'positive_prompt',
  param_name: 'text',
  input_type: 'textarea',
  display_name: 'Positive prompt',
}]

function createWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

describe('useMappingStageGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStages.mockResolvedValue(stages)
    listMasters.mockResolvedValue(masters)
  })

  it('fetches both sources with the approved keys and groups mappings by stage', async () => {
    const client = createClient()
    const { result } = renderHook(() => useMappingStageGroups(mappings), { wrapper: createWrapper(client) })

    expect(result.current[0]?.stageName).toBe('Unknown variant 9')
    await waitFor(() => expect(result.current[0]?.stageName).toBe('Prompt'))
    expect(client.getQueryCache().find({ queryKey: ['stage-masters'] })).toBeDefined()
    expect(client.getQueryCache().find({ queryKey: ['mapping-masters'] })).toBeDefined()
    expect(listStages).toHaveBeenCalledWith(true)
    expect(listMasters).toHaveBeenCalledOnce()
    expect(result.current[0].mappings).toEqual(mappings)
    client.clear()
  })

  it('uses supplied masters, including an explicit empty list, without fetching masters', async () => {
    const client = createClient()
    client.setQueryData(['mapping-masters'], [])
    const { result, rerender } = renderHook(
      ({ supplied }: { supplied: typeof masters | [] }) => useMappingStageGroups(mappings, supplied),
      { initialProps: { supplied: masters }, wrapper: createWrapper(client) },
    )
    await waitFor(() => expect(result.current[0]?.stageName).toBe('Prompt'))
    rerender({ supplied: [] })
    expect(listMasters).not.toHaveBeenCalled()
    expect(result.current).toEqual([{ key: 'unknown-variant:9', stageKey: 'unknown', stageName: 'Unknown variant 9', mappings }])
    client.clear()
  })

  it('uses cached source data while a source refetch is pending and keeps the caller mappings', async () => {
    const client = createClient()
    client.setQueryData(['stage-masters'], stages)
    client.setQueryData(['mapping-masters'], masters)
    listStages.mockImplementation(() => new Promise(() => undefined))
    listMasters.mockImplementation(() => new Promise(() => undefined))
    const { result } = renderHook(() => useMappingStageGroups(mappings), { wrapper: createWrapper(client) })

    expect(result.current[0]?.mappings[0]).toBe(mappings[0])
    expect(result.current[0]?.stageName).toBe('Prompt')
    client.clear()
  })

  it('retains cached grouping data when both queries fail', async () => {
    const client = createClient()
    client.setQueryData(['stage-masters'], stages)
    client.setQueryData(['mapping-masters'], masters)
    listStages.mockRejectedValue(new Error('stage request failed'))
    listMasters.mockRejectedValue(new Error('master request failed'))
    const { result } = renderHook(() => useMappingStageGroups(mappings), { wrapper: createWrapper(client) })

    await waitFor(() => {
      expect(client.getQueryCache().find({ queryKey: ['stage-masters'] })?.state.status).toBe('error')
      expect(client.getQueryCache().find({ queryKey: ['mapping-masters'] })?.state.status).toBe('error')
    })
    expect(result.current[0]?.stageName).toBe('Prompt')
    expect(result.current[0]?.mappings[0]).toBe(mappings[0])
    client.clear()
  })

  it('returns an empty result when disabled even with cache, then reuses cache when re-enabled', async () => {
    const client = createClient()
    client.setQueryData(['stage-masters'], stages)
    client.setQueryData(['mapping-masters'], masters)
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useMappingStageGroups(mappings, undefined, enabled),
      { initialProps: { enabled: false }, wrapper: createWrapper(client) },
    )

    expect(result.current).toEqual([])
    expect(listStages).not.toHaveBeenCalled()
    expect(listMasters).not.toHaveBeenCalled()
    rerender({ enabled: true })
    expect(result.current[0]?.stageName).toBe('Prompt')
    client.clear()
  })

  it('deduplicates the stage query across observers and keeps mappings through refetch', async () => {
    const client = createClient()
    const wrapper = createWrapper(client)
    const first = renderHook(() => useMappingStageGroups(mappings, masters), { wrapper })
    const second = renderHook(() => useMappingStageGroups(mappings, masters), { wrapper })
    await waitFor(() => expect(first.result.current[0]?.stageName).toBe('Prompt'))
    expect(listStages).toHaveBeenCalledOnce()
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['stage-masters'] })
    })
    expect(second.result.current[0].mappings[0]).toBe(mappings[0])
    first.unmount()
    second.unmount()
    client.clear()
  })
})
