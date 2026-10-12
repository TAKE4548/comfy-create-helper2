import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerateAction } from '../useGenerateAction'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import type { Workflow } from '../../../../api/types'
import { PROMPT_RECORD_KEY } from '../../../../utils/generationRecord'
import { setSeedModeForMapping } from '../../../../utils/seedModel'
import * as seedBatchModule from '../../../../utils/seedBatch'

const realPrepareSeedBatch = seedBatchModule.prepareSeedBatch

vi.mock('../../../../store/useGenerationStore', () => {
  const store: any = {
    paramValues: {}, promptChips: {}, activeSetId: null, batchSize: 1,
    seedMode: 'fixed', seed: 900, clientId: 'seed-session', sets: [],
    appliedAssets: {}, bypassProfiles: [], paramSyncGroups: [], isAnimaMode: false,
    submitGenerationBatch: vi.fn().mockResolvedValue({ batch_id: 'batch', job_ids: [] }),
    setActiveBatch: vi.fn(), setSubmissionAbortController: vi.fn(), setIsBatchSubmitting: vi.fn(),
    setErrorToast: vi.fn(), setVramWaitStatus: vi.fn(),
  }
  const hook: any = () => store
  hook.getState = () => store
  hook.subscribe = vi.fn(() => () => undefined)
  return { useGenerationStore: hook }
})

const seedMapping = {
  id: 1, master_id: 1, variant_id: 2, node_id: '3', role: 'Sampler_Seed',
  param_name: 'seed', input_type: 'seed', display_name: 'Sampler Seed',
}
const workflow: Workflow = {
  id: 1, name: 'Seed workflow', created_at: '',
  json_body: { '3': { inputs: { seed: 0 } } }, mappings: [seedMapping],
}

describe('useGenerateAction dedicated seed submission', () => {
  let store: any

  afterEach(() => vi.restoreAllMocks())

  beforeEach(() => {
    store = (useGenerationStore as any)()
    Object.assign(store, {
      paramValues: { Sampler_Seed: '40' }, promptChips: {}, activeSetId: null,
      batchSize: 1, seedMode: 'fixed', seed: 900, sets: [], appliedAssets: {},
      bypassProfiles: [], paramSyncGroups: [], isAnimaMode: false,
    })
    store.submitGenerationBatch.mockReset().mockResolvedValue({ batch_id: 'batch', job_ids: [] })
    store.setActiveBatch.mockClear()
    store.setIsBatchSubmitting.mockClear()
    store.setErrorToast.mockClear()
  })

  it('freezes each generated item with its dedicated seed and records the actual injected value', async () => {
    store.batchSize = 2
    store.paramValues = setSeedModeForMapping(seedMapping, store.paramValues, 'fixed')
    await useGenerateAction(workflow).handleGenerate()
    const request = store.submitGenerationBatch.mock.calls[0][0]
    expect(request.items.map((item: any) => item.graph['3'].inputs.seed)).toEqual([40, 41])
    expect(request.items.map((item: any) => JSON.parse(item.param_values[PROMPT_RECORD_KEY]).parameters[0].value)).toEqual([40, 41])
    expect(request.items[0].param_values.Sampler_Seed).toBe('40')
    expect(request.items[0].graph['3'].inputs.seed).not.toBe(store.seed)
  })

  it('submits three random seeds through a registered fallback and records each actual value', async () => {
    const fallbackMapping = { ...seedMapping, fallback_param_names: ['noise_seed'] }
    const fallbackWorkflow: Workflow = {
      ...workflow,
      json_body: { '3': { inputs: { noise_seed: 40 } } },
      mappings: [fallbackMapping],
    }
    store.paramValues = setSeedModeForMapping(fallbackMapping, { Sampler_Seed: '40' }, 'random')
    store.seedMode = 'random'
    store.batchSize = 3
    const draws = [11, 22, 33]
    vi.spyOn(seedBatchModule, 'prepareSeedBatch').mockImplementation(options =>
      realPrepareSeedBatch({ ...options, randomUint32: () => draws.shift()! })
    )

    await useGenerateAction(fallbackWorkflow).handleGenerate()

    const items = store.submitGenerationBatch.mock.calls[0][0].items
    expect(items.map((item: any) => item.graph['3'].inputs.noise_seed)).toEqual([11, 22, 33])
    expect(items.every((item: any) => !Object.hasOwn(item.graph['3'].inputs, 'seed'))).toBe(true)
    expect(items.map((item: any) => item.param_values.Sampler_Seed)).toEqual(['11', '22', '33'])
    expect(items.map((item: any) => JSON.parse(item.param_values[PROMPT_RECORD_KEY]).parameters[0].value)).toEqual([11, 22, 33])
  })

  it('rejects missing primary and fallback seed inputs before normal submission state changes', async () => {
    const fallbackMapping = { ...seedMapping, fallback_param_names: ['noise_seed'] }
    const missingWorkflow: Workflow = {
      ...workflow,
      json_body: { '3': { inputs: {} } },
      mappings: [fallbackMapping],
    }

    await useGenerateAction(missingWorkflow).handleGenerate()

    expect(store.submitGenerationBatch).not.toHaveBeenCalled()
    expect(store.setIsBatchSubmitting).not.toHaveBeenCalled()
    expect(store.setErrorToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error', message: expect.stringContaining('Sampler Seed'),
    }))
  })

  it('rejects checked sets when the seed target is missing before any submission state changes', async () => {
    const fallbackMapping = { ...seedMapping, fallback_param_names: ['noise_seed'] }
    const missingWorkflow: Workflow = {
      ...workflow,
      json_body: { '3': { inputs: {} } },
      mappings: [fallbackMapping],
    }
    store.sets = [
      { id: 'a', name: 'First set', checked: true, batchSize: 1, paramValues: { Sampler_Seed: '5' } },
    ]

    await useGenerateAction(missingWorkflow).handleGenerateSets()

    expect(store.submitGenerationBatch).not.toHaveBeenCalled()
    expect(store.setActiveBatch).not.toHaveBeenCalled()
    expect(store.setIsBatchSubmitting).not.toHaveBeenCalled()
    expect(store.setErrorToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error', message: expect.stringContaining('First set'),
    }))
  })

  it('rejects all checked sets when a later set has no base seed value', async () => {
    store.sets = [
      { id: 'a', name: 'Valid set', checked: true, batchSize: 1, paramValues: { Sampler_Seed: '5' } },
      { id: 'b', name: 'Missing seed set', checked: true, batchSize: 1, paramValues: {} },
    ]

    await useGenerateAction(workflow).handleGenerateSets()

    expect(store.submitGenerationBatch).not.toHaveBeenCalled()
    expect(store.setActiveBatch).not.toHaveBeenCalled()
    expect(store.setIsBatchSubmitting).not.toHaveBeenCalled()
    expect(store.setErrorToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error', message: expect.stringContaining('Missing seed set'),
    }))
  })

  it('validates every checked set before changing submission state or sending any item', async () => {
    const overflow = setSeedModeForMapping(seedMapping, { Sampler_Seed: '4294967295' }, 'fixed')
    store.sets = [
      { id: 'a', name: 'First', checked: true, batchSize: 1, paramValues: setSeedModeForMapping(seedMapping, { Sampler_Seed: '5' }, 'fixed') },
      { id: 'b', name: 'Overflow set', checked: true, batchSize: 2, paramValues: overflow },
    ]
    await useGenerateAction(workflow).handleGenerateSets()
    expect(store.submitGenerationBatch).not.toHaveBeenCalled()
    expect(store.setActiveBatch).not.toHaveBeenCalled()
    expect(store.setIsBatchSubmitting).not.toHaveBeenCalled()
    expect(store.setErrorToast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Overflow set') }))
  })

  it('rejects corrupt seed metadata before submission', async () => {
    store.paramValues = { Sampler_Seed: '40', __seed_modes_v1: '{bad json' }
    await useGenerateAction(workflow).handleGenerate()
    expect(store.submitGenerationBatch).not.toHaveBeenCalled()
    expect(store.setErrorToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
  })

  it('draws one random value per item for a synchronized seed parent and child despite mixed modes', async () => {
    const child = { ...seedMapping, id: 2, master_id: 2, node_id: '4', role: 'Other_Seed' }
    const syncedWorkflow: Workflow = {
      ...workflow,
      json_body: { ...workflow.json_body, '4': { inputs: { seed: 0 } } },
      mappings: [seedMapping, child],
    }
    store.paramValues = setSeedModeForMapping(
      child,
      setSeedModeForMapping(seedMapping, { Sampler_Seed: '10', Other_Seed: '20' }, 'random'),
      'fixed'
    )
    store.paramSyncGroups = [{
      id: 1, workflow_id: 1, name: 'Seed link', master_role: 'Sampler_Seed',
      slave_roles: ['Other_Seed'], is_enabled: true, created_at: '',
    }]
    store.batchSize = 2
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25)
    await useGenerateAction(syncedWorkflow).handleGenerate()
    expect(random).toHaveBeenCalledTimes(2)
    random.mockRestore()
    const items = store.submitGenerationBatch.mock.calls[0][0].items
    expect(items.map((item: any) => [item.graph['3'].inputs.seed, item.graph['4'].inputs.seed])).toEqual([[1073741824, 1073741824], [1073741824, 1073741824]])
    expect(items[0].param_values.Other_Seed).toBe(items[0].param_values.Sampler_Seed)
  })

  it('rejects a set batch above the eight item limit before setting submission state', async () => {
    store.sets = [{
      id: 'large', name: 'Large set', checked: true, batchSize: 9, seedMode: 'fixed', seed: 10,
      paramValues: setSeedModeForMapping(seedMapping, { Sampler_Seed: '10' }, 'fixed'),
    }]
    await useGenerateAction(workflow).handleGenerateSets()
    expect(store.submitGenerationBatch).not.toHaveBeenCalled()
    expect(store.setIsBatchSubmitting).not.toHaveBeenCalled()
    expect(store.setErrorToast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Large set') }))
  })

  it('uses a frozen request after store values change while submission is pending', async () => {
    let resolveSubmission!: (result: any) => void
    store.submitGenerationBatch.mockImplementation(() => new Promise((resolve) => { resolveSubmission = resolve }))
    store.paramValues = setSeedModeForMapping(seedMapping, { Sampler_Seed: '73' }, 'fixed')
    const pending = useGenerateAction(workflow).handleGenerate()
    const request = store.submitGenerationBatch.mock.calls[0][0]
    store.paramValues.Sampler_Seed = '99'
    expect(request.items[0].graph['3'].inputs.seed).toBe(73)
    expect(request.items[0].param_values.Sampler_Seed).toBe('73')
    resolveSubmission({ batch_id: 'batch', job_ids: [] })
    await pending
  })
})
