import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MappingMasterEditModal } from '../components/MappingMasterEditModal'
import { SeedField } from '../components/SeedField'
import type { Workflow, WorkflowMapping } from '../api/types'
import { generationApi, GenerationApiError } from '../api/domains/generation'
import type { BatchRequest } from '../api/domains/generation'
import { useGenerateAction } from '../pages/GeneratePage/hooks/useGenerateAction'
import { useGenerationStore } from '../store/useGenerationStore'
import { createJobQueueSlice } from '../store/slices/jobQueueSlice'
import { PROMPT_RECORD_KEY } from '../utils/generationRecord'
import { SEED_MODES_KEY, setSeedModeForMapping } from '../utils/seedModel'

vi.mock('../hooks/useComfyNodeTypes', () => ({
  useComfyNodeTypes: () => ({ filterClassTypes: () => [], isLoading: false, isError: false }),
}))
vi.mock('../components/WorkflowMappingPreview', () => ({ WorkflowMappingPreview: () => null }))
vi.mock('../api/domains/generation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/domains/generation')>()
  return {
    ...actual,
    generationApi: {
      ...actual.generationApi,
      submitBatch: vi.fn(),
      getRequest: vi.fn(),
    },
  }
})
vi.mock('../store/useGenerationStore', () => {
  const store: any = {
    paramValues: {}, promptChips: {}, activeSetId: null, batchSize: 1,
    seedMode: 'fixed', seed: 999, clientId: 'req350-e2e-session', sets: [],
    appliedAssets: {}, bypassProfiles: [], paramSyncGroups: [], isAnimaMode: false,
    submitGenerationBatch: vi.fn().mockResolvedValue({ batch_id: 'batch-e2e', job_ids: [] }),
    setActiveBatch: vi.fn(), setSubmissionAbortController: vi.fn(), setIsBatchSubmitting: vi.fn(),
    setErrorToast: vi.fn(), setVramWaitStatus: vi.fn(),
    fetchQueue: vi.fn().mockResolvedValue(undefined),
  }
  const hook: any = () => store
  hook.getState = () => store
  hook.subscribe = vi.fn(() => () => undefined)
  return { useGenerationStore: hook }
})

const mainSeed: WorkflowMapping = {
  id: 10, master_id: 2, variant_id: 20, node_id: '3', role: 'Sampler_Seed',
  param_name: 'seed', input_type: 'seed', display_name: 'Main Seed',
}
const roughSeed: WorkflowMapping = {
  id: 11, master_id: 3, variant_id: 21, node_id: '4', role: 'Sampler_Seed_rough',
  param_name: 'seed', input_type: 'seed', display_name: 'Rough Seed',
}
const cfg: WorkflowMapping = {
  id: 12, master_id: 4, variant_id: 22, node_id: '5', role: 'CFG',
  param_name: 'cfg', input_type: 'float', display_name: 'CFG',
}
const workflow: Workflow = {
  id: 1, name: 'REQ-350 Seed workflow', created_at: '',
  json_body: {
    '3': { inputs: { seed: 0 } }, '4': { inputs: { seed: 0 } }, '5': { inputs: { cfg: 7.5 } },
  },
  mappings: [mainSeed, roughSeed, cfg],
}

function makeParamValues() {
  return {
    Sampler_Seed: '100', Sampler_Seed_rough: '200', CFG: '7.5',
    [SEED_MODES_KEY]: JSON.stringify({ version: 1, modes: {} }),
  }
}

function SeedGenerationHarness({ mobile = false }: { mobile?: boolean }) {
  const store = (useGenerationStore as any)()
  const [currentWorkflow, setCurrentWorkflow] = useState(workflow)
  const [paramValues, setParamValues] = useState(makeParamValues())
  const [editing, setEditing] = useState(true)
  const action = useGenerateAction(currentWorkflow)
  const saveMaster = (payload: any) => {
    setCurrentWorkflow((current) => ({
      ...current,
      mappings: current.mappings.map((mapping) =>
        mapping.master_id === 2
          ? { ...mapping, input_type: payload.input_type, param_name: payload.param_name }
          : mapping
      ),
    }))
    setEditing(false)
  }
  const updateValues = (next: Record<string, string>) => {
    setParamValues(next)
    store.paramValues = next
  }

  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {editing && (
        <MappingMasterEditModal
          isOpen onClose={() => setEditing(false)} master={null} groups={[]} stages={[]}
          paramTypeMasters={[]} onSave={saveMaster}
        />
      )}
      {!editing && currentWorkflow.mappings.filter((mapping) => mapping.input_type === 'seed').map((mapping) => (
        <SeedField key={mapping.id} mapping={mapping} paramValues={paramValues} onChange={updateValues} mobile={mobile} />
      ))}
      {!editing && <button onClick={() => void action.handleGenerate()}>生成</button>}
    </QueryClientProvider>
  )
}

function saveSeedMaster() {
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'seed' } })
  fireEvent.change(screen.getByPlaceholderText('例: Positive Prompt'), { target: { value: 'Main Seed' } })
  fireEvent.change(screen.getByPlaceholderText('例: text, steps, cfg'), { target: { value: 'seed' } })
  fireEvent.click(screen.getByRole('button', { name: 'マスターを保存' }))
}

describe('REQ-350 dedicated seed integrated acceptance path', () => {
  const store = (useGenerationStore as any)()

  beforeEach(() => {
    Object.assign(store, {
      paramValues: makeParamValues(), promptChips: {}, activeSetId: null, batchSize: 1,
      seedMode: 'fixed', seed: 999, sets: [], appliedAssets: {}, bypassProfiles: [],
      paramSyncGroups: [], isAnimaMode: false,
    })
    store.submitGenerationBatch = vi.fn().mockResolvedValue({ batch_id: 'batch-e2e', job_ids: [] })
    store.setActiveBatch.mockClear()
    store.setErrorToast.mockClear()
    vi.mocked(generationApi.submitBatch).mockReset().mockResolvedValue({
      batch_id: 'batch-e2e', job_ids: ['job-e2e'], epoch: 'epoch-e2e', revision: 1,
    })
    vi.mocked(generationApi.getRequest).mockReset().mockResolvedValue({
      batch_id: 'recovered-batch-e2e', job_ids: ['recovered-job-e2e'],
    })
  })

  it('saves a seed mapping, renders the seed control, and submits fixed 100/101/102 with matching metadata', async () => {
    store.batchSize = 3
    render(<SeedGenerationHarness />)
    saveSeedMaster()

    expect(await screen.findByRole('spinbutton', { name: 'Main Seedの値' })).toHaveValue(100)
    expect(screen.getAllByText('固定')).toHaveLength(2)
    // The rendered seed mappings expose mode toggles alongside their fixed value controls.
    expect(screen.getAllByRole('button', { name: 'ランダムにする' })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '生成' }))

    await waitFor(() => expect(store.submitGenerationBatch).toHaveBeenCalledTimes(1))
    const request = store.submitGenerationBatch.mock.calls[0][0]
    expect(request.items.map((item: any) => item.graph['3'].inputs.seed)).toEqual([100, 101, 102])
    expect(request.items.map((item: any) => item.graph['4'].inputs.seed)).toEqual([200, 201, 202])
    expect(request.items.map((item: any) => item.param_values.Sampler_Seed)).toEqual(['100', '101', '102'])
    expect(request.items.map((item: any) => JSON.parse(item.param_values[PROMPT_RECORD_KEY]).parameters
      .find((parameter: any) => parameter.role === 'Sampler_Seed')?.value)).toEqual([100, 101, 102])
    expect(request.items[0].graph['3'].inputs.seed).not.toBe(store.seed)
  })

  it('uses random mode per item and keeps desktop and mobile seed controls equivalent', async () => {
    store.batchSize = 3
    const random = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(11 / 2 ** 32)
      .mockReturnValueOnce(22 / 2 ** 32)
      .mockReturnValueOnce(33 / 2 ** 32)
    const { rerender } = render(<SeedGenerationHarness />)
    saveSeedMaster()
    fireEvent.click(screen.getAllByRole('button', { name: 'ランダムにする' })[0])
    fireEvent.click(screen.getByRole('button', { name: '生成' }))
    await waitFor(() => expect(store.submitGenerationBatch).toHaveBeenCalledTimes(1))
    const desktop = store.submitGenerationBatch.mock.calls[0][0].items.map((item: any) => item.graph['3'].inputs.seed)
    expect(desktop).toEqual([11, 22, 33])
    expect(random).toHaveBeenCalledTimes(3)

    store.submitGenerationBatch.mockClear()
    rerender(<SeedGenerationHarness mobile />)
    expect(document.getElementById('seed-input-10-mobile')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '固定値にする' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Main Seedの値' }), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: '生成' }))
    await waitFor(() => expect(store.submitGenerationBatch).toHaveBeenCalledTimes(1))
    const mobile = store.submitGenerationBatch.mock.calls[0][0].items.map((item: any) => item.graph['3'].inputs.seed)
    expect(mobile).toEqual([100, 101, 102])
    random.mockRestore()
  })

  it.each([
    ['fixed', 9], ['fixed', 10_000_000], ['random', 9], ['random', 10_000_000],
  ] as const)('rejects %s batches of %i above the eight item limit without drawing seeds or submitting', async (mode, batchSize) => {
    store.batchSize = batchSize
    store.paramValues = mode === 'random'
      ? setSeedModeForMapping(mainSeed, makeParamValues(), 'random')
      : makeParamValues()
    const random = vi.spyOn(Math, 'random')
    await useGenerateAction(workflow).handleGenerate()
    expect(random).not.toHaveBeenCalled()
    expect(store.submitGenerationBatch).not.toHaveBeenCalled()
    expect(store.setActiveBatch).not.toHaveBeenCalled()
    expect(store.setErrorToast).toHaveBeenCalled()
    random.mockRestore()
  })

  it('rejects a two-item fixed batch that would overflow UINT32_MAX without submitting', async () => {
    store.batchSize = 2
    store.paramValues = { ...makeParamValues(), Sampler_Seed: '4294967295' }
    await useGenerateAction(workflow).handleGenerate()
    expect(store.submitGenerationBatch).not.toHaveBeenCalled()
    expect(store.setActiveBatch).not.toHaveBeenCalled()
    expect(store.setErrorToast).toHaveBeenCalled()
  })

  it('rejects corrupt seed metadata before request submission and preserves the active batch', async () => {
    store.paramValues = { ...makeParamValues(), [SEED_MODES_KEY]: '{broken' }
    await useGenerateAction(workflow).handleGenerate()
    expect(store.submitGenerationBatch).not.toHaveBeenCalled()
    expect(store.setActiveBatch).not.toHaveBeenCalled()
    expect(store.setErrorToast).toHaveBeenCalled()
  })

  it('looks up an uncertain submission by the captured request id without changing its graph', async () => {
    const requestError = new GenerationApiError(0, {
      code: 'network_error', message: 'acceptance uncertain', outcome: 'unconfirmed',
      request_id: null, job_id: null,
    })
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(requestError)
    vi.mocked(generationApi.getRequest).mockResolvedValueOnce({
      batch_id: 'recovered-batch-e2e', job_ids: ['recovered-job-e2e'],
    })

    const slice = createJobQueueSlice(
      (partial) => Object.assign(store, partial),
      () => store
    )
    const submitThroughQueue = vi.fn(slice.submitGenerationBatch)
    store.submitGenerationBatch = submitThroughQueue
    await useGenerateAction(workflow).handleGenerate()

    const request = submitThroughQueue.mock.calls[0][0] as BatchRequest
    const [postedRequest] = vi.mocked(generationApi.submitBatch).mock.calls[0]
    expect(postedRequest).toBe(request)
    expect(postedRequest.request_id).toBe(request.request_id)
    expect(postedRequest.items[0].graph).toEqual(request.items[0].graph)
    expect(postedRequest.items[0].graph['3']).toEqual({ inputs: { seed: 100 } })
    expect(generationApi.getRequest).toHaveBeenCalledTimes(1)
    expect(generationApi.getRequest).toHaveBeenCalledWith(request.request_id)
  })
})
