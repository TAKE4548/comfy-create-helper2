import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useGenerationStore } from '../../useGenerationStore'
import { bypassProfilesApi } from '../../../api/client'
import type { BypassProfile } from '../../../api/types'

vi.mock('../../../api/client', () => ({
  bypassProfilesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('bypassSlice - CRUD and cache operations', () => {
  const mockProfiles: BypassProfile[] = [
    {
      id: 1,
      workflow_id: 10,
      name: 'Disable Face Detailer',
      bypassed_node_ids: ['12', '14'],
      is_enabled: true,
      created_at: '2026-09-01T00:00:00Z',
    },
    {
      id: 2,
      workflow_id: 10,
      name: 'Disable Upscaler',
      bypassed_node_ids: ['20'],
      is_enabled: false,
      created_at: '2026-09-02T00:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    useGenerationStore.setState({
      bypassProfiles: [],
      bypassProfilesCache: {},
    })
  })

  it('fetchBypassProfiles fetches from API on cache miss and stores in cache', async () => {
    vi.mocked(bypassProfilesApi.list).mockResolvedValueOnce(mockProfiles)

    await useGenerationStore.getState().fetchBypassProfiles(10)

    const state = useGenerationStore.getState()
    expect(bypassProfilesApi.list).toHaveBeenCalledWith(10)
    expect(state.bypassProfiles).toEqual(mockProfiles)
    expect(state.bypassProfilesCache[10]).toEqual(mockProfiles)
  })

  it('fetchBypassProfiles uses cached data immediately on cache hit', async () => {
    vi.mocked(bypassProfilesApi.list).mockResolvedValueOnce(mockProfiles)
    useGenerationStore.setState({
      bypassProfiles: [],
      bypassProfilesCache: { 10: mockProfiles },
    })

    const fetchPromise = useGenerationStore.getState().fetchBypassProfiles(10)
    expect(useGenerationStore.getState().bypassProfiles).toEqual(mockProfiles)

    await fetchPromise
    expect(bypassProfilesApi.list).toHaveBeenCalledWith(10)
    expect(useGenerationStore.getState().bypassProfiles).toEqual(mockProfiles)
  })

  it('fetchBypassProfiles catches error and logs without crashing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(bypassProfilesApi.list).mockRejectedValueOnce(new Error('Network error'))

    await useGenerationStore.getState().fetchBypassProfiles(99)

    expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch bypass profiles:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('createBypassProfile adds new profile to list and cache', async () => {
    const newProfile: BypassProfile = {
      id: 3,
      workflow_id: 10,
      name: 'Skip Background',
      bypassed_node_ids: ['5'],
      is_enabled: true,
      created_at: '2026-09-03T00:00:00Z',
    }
    vi.mocked(bypassProfilesApi.create).mockResolvedValueOnce(newProfile)

    useGenerationStore.setState({
      bypassProfiles: [mockProfiles[0]],
      bypassProfilesCache: { 10: [mockProfiles[0]] },
    })

    await useGenerationStore.getState().createBypassProfile(10, 'Skip Background', ['5'])

    const state = useGenerationStore.getState()
    expect(bypassProfilesApi.create).toHaveBeenCalledWith(10, {
      name: 'Skip Background',
      bypassed_node_ids: ['5'],
    })
    expect(state.bypassProfiles).toHaveLength(2)
    expect(state.bypassProfiles[1]).toEqual(newProfile)
    expect(state.bypassProfilesCache[10]).toEqual(state.bypassProfiles)
  })

  it('updateBypassProfile updates profile and syncs cache', async () => {
    const updated: BypassProfile = {
      ...mockProfiles[0],
      name: 'Updated Name',
      is_enabled: false,
    }
    vi.mocked(bypassProfilesApi.update).mockResolvedValueOnce(updated)

    useGenerationStore.setState({
      bypassProfiles: mockProfiles,
      bypassProfilesCache: { 10: mockProfiles },
    })

    await useGenerationStore.getState().updateBypassProfile(1, { name: 'Updated Name', is_enabled: false })

    const state = useGenerationStore.getState()
    expect(state.bypassProfiles.find((p) => p.id === 1)?.name).toBe('Updated Name')
    expect(state.bypassProfilesCache[10].find((p) => p.id === 1)?.name).toBe('Updated Name')
  })

  it('deleteBypassProfile removes profile from list and cache', async () => {
    vi.mocked(bypassProfilesApi.delete).mockResolvedValueOnce()

    useGenerationStore.setState({
      bypassProfiles: mockProfiles,
      bypassProfilesCache: { 10: mockProfiles },
    })

    await useGenerationStore.getState().deleteBypassProfile(1)

    const state = useGenerationStore.getState()
    expect(state.bypassProfiles).toHaveLength(1)
    expect(state.bypassProfiles[0].id).toBe(2)
    expect(state.bypassProfilesCache[10]).toHaveLength(1)
  })
})
