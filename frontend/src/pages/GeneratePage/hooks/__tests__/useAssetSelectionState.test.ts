import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Lora } from '../../../../api/types'
import { useAssetSelectionState } from '../useAssetSelectionState'
const { add, setAssets, getSnapshot, queryData } = vi.hoisted(() => ({ add: vi.fn(), setAssets: vi.fn(), getSnapshot: vi.fn(), queryData: { loras: [] as unknown[], tags: [] as unknown[] } }))
vi.mock('../../../../store/useGenerationStore', () => ({ useGenerationStore: () => ({ addAppliedAsset: add, setAppliedAssets: setAssets }) }))
vi.mock('../../../../api/client', () => ({ lorasApi: { list: vi.fn() }, tagSetsApi: { list: vi.fn() }, snapshotsApi: { get: getSnapshot } }))
vi.mock('@tanstack/react-query', () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === 'loras' ? queryData.loras : queryData.tags }) }))
const lora = () => ({ id: 7, file_path: 'model.safetensors', description: 'model', trigger_word_sets: [{ id: 41, name: 'one', words: ['same'] }, { id: 42, name: 'two', words: ['same'] }] } as Lora)
const setup = () => renderHook(() => useAssetSelectionState({ setRoleCollapsed: vi.fn(), loadSnapshotParams: vi.fn() }))
beforeEach(() => { add.mockReset(); setAssets.mockReset(); getSnapshot.mockReset(); queryData.loras = []; queryData.tags = [] })
it('retains the explicitly selected trigger ID and name and clones words despite equal content', () => {
  const model = lora(); const { result } = setup()
  act(() => result.current.handleAddLoraAsset('character', model, 0.8, 42))
  model.trigger_word_sets![1].words.push('changed')
  expect(add).toHaveBeenCalledWith('character', expect.objectContaining({ triggerSetId: 42, triggerSetName: 'two', tags: ['same'] }))
})
it('records a deliberate default with null provenance and leaves unavailable selections unknown', () => {
  const { result } = setup()
  act(() => result.current.handleAddLoraAsset('negative', lora(), 1, 'default'))
  expect(add.mock.calls[0][1]).toMatchObject({ triggerSetId: null, triggerSetName: null, tags: [] })
  act(() => result.current.handleAddLoraAsset('negative', lora(), 1, 999))
  expect(add.mock.calls[1][1].triggerSetId).toBeUndefined()
})
it('does not invent historical trigger selection when rebuilding a legacy snapshot', async () => {
  queryData.loras = [lora()]; getSnapshot.mockResolvedValue({ params: {}, loras: [{ lora_id: 7, role: 'character', strength: 0.8 }], tag_sets: [] })
  const { result } = setup()
  await act(async () => result.current.handleLoadSnapshot(1))
  expect(setAssets.mock.calls[0][0].character[0].triggerSetId).toBeUndefined()
})
