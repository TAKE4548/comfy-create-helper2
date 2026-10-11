import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkflowManagement } from '../useWorkflowManagement'

const { workflowsApi, mappingMastersApi, baseModelsApi, paramTypeMastersApi, comfyApi } = vi.hoisted(() => ({
  workflowsApi: { list: vi.fn(), get: vi.fn(), update: vi.fn(), rename: vi.fn(), copy: vi.fn() },
  mappingMastersApi: { list: vi.fn() },
  baseModelsApi: { list: vi.fn() },
  paramTypeMastersApi: { list: vi.fn() },
  comfyApi: { getObjectInfo: vi.fn() },
}))

vi.mock('../../../../api/client', () => ({
  workflowsApi,
  mappingMastersApi,
  baseModelsApi,
  paramTypeMastersApi,
  comfyApi,
}))

vi.mock('../../../../store/useGenerationStore', () => ({
  useGenerationStore: Object.assign((selector: (state: { isConnected: boolean }) => unknown) => selector({ isConnected: false }), {
    getState: () => ({}),
  }),
}))

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

describe('useWorkflowManagement seed mappings', () => {
  afterEach(() => vi.clearAllMocks())

  it('passes ordinary, Rough Seed, dedicated Main Seed, and legacy Main Seed mappings to ParamPanel', async () => {
    workflowsApi.list.mockResolvedValue([])
    workflowsApi.get.mockResolvedValue({
      id: 7,
      name: 'Seed workflow',
      mappings: [
        mapping(1, 'Sampler_Steps', 'number'),
        mapping(2, 'Rough_Sampler_Seed', 'seed'),
        mapping(3, 'Main_Sampler_Seed', 'seed'),
        mapping(4, 'Sampler_Seed', 'number'),
        mapping(5, 'Prompt', 'textarea'),
        { ...mapping(6, 'Unassigned', 'number'), role: null },
      ],
    })
    mappingMastersApi.list.mockResolvedValue([])
    baseModelsApi.list.mockResolvedValue([])
    paramTypeMastersApi.list.mockResolvedValue([])
    comfyApi.getObjectInfo.mockResolvedValue({})

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children)
    const { result } = renderHook(
      () => useWorkflowManagement({ selectedWorkflowId: 7, setSelectedWorkflowId: vi.fn() }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.workflow?.mappings).toHaveLength(6))
    expect(result.current.paramMappings.map((item) => item.id)).toEqual([1, 2, 3, 4])
    expect(result.current.textMappings.map((item) => item.id)).toEqual([5])
    expect(result.current.invalidMappings.map((item) => item.id)).toEqual([6])
    queryClient.clear()
  })
})
