import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationStore } from '../useGenerationStore'

const SEED_MODES_KEY = '__seed_modes_v1'
const slotKey = 'master:10:variant:20'
const encodeModes = (mode: 'random' | 'fixed') => JSON.stringify({ version: 1, modes: { [slotKey]: mode } })

describe('multiSetSlice seed metadata contract', () => {
  beforeEach(() => {
    localStorage.clear()
    useGenerationStore.setState({
      selectedWorkflowId: 350,
      activeSetId: 'new',
      paramValues: {},
      sets: [
        { id: 'legacy', name: 'Legacy', paramValues: { MainSeed: '12' }, appliedAssets: {}, promptChips: {}, batchSize: 1, seedMode: 'fixed', seed: 12, checked: true },
        { id: 'new', name: 'Seed', paramValues: {}, appliedAssets: {}, promptChips: {}, batchSize: 1, seedMode: 'random', seed: 42, checked: true },
      ],
    })
  })

  it('keeps numeric fixed/base value when toggling fixed to random and back', () => {
    const store = useGenerationStore.getState()
    const fixed = { MainSeed: '4294967295', [SEED_MODES_KEY]: encodeModes('fixed') }
    store.setParamValues(fixed)
    store.setParamValues({ ...fixed, [SEED_MODES_KEY]: encodeModes('random') })
    store.setParamValues({ ...fixed, [SEED_MODES_KEY]: encodeModes('fixed') })

    const active = useGenerationStore.getState().sets.find((set) => set.id === 'new')!
    expect(active.paramValues).toEqual(fixed)
  })

  it('switches between a legacy set and metadata set without cross-contamination', () => {
    const store = useGenerationStore.getState()
    const current = { MainSeed: '99', [SEED_MODES_KEY]: encodeModes('random') }
    store.setParamValues(current)
    store.setActiveSetId('legacy')

    expect(useGenerationStore.getState().paramValues).toEqual({ MainSeed: '12' })
    expect(useGenerationStore.getState().sets.find((set) => set.id === 'new')?.paramValues).toEqual(current)

    store.setActiveSetId('new')
    expect(useGenerationStore.getState().paramValues).toEqual(current)
    expect(useGenerationStore.getState().sets.find((set) => set.id === 'legacy')?.paramValues).toEqual({ MainSeed: '12' })
  })
})
