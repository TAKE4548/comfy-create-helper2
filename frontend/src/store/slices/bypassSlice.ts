import { StateCreator } from 'zustand'
import { bypassProfilesApi } from '../../api/client'
import type { BypassProfile } from '../../api/types'
import type { GenerationState, BypassState, BypassActions } from '../types'

export type BypassSlice = BypassState & BypassActions

export const createBypassSlice: StateCreator<GenerationState, [], [], BypassSlice> = (set, get) => ({
  bypassProfiles: [],
  bypassProfilesCache: {},
  errorToast: null,

  setErrorToast: (toast) => set({ errorToast: toast }),

  fetchBypassProfiles: async (workflowId: number) => {
    const cached = get().bypassProfilesCache[workflowId]
    if (cached) {
      set({ bypassProfiles: cached })
    }
    try {
      const profiles = await bypassProfilesApi.list(workflowId)
      set((state) => ({
        bypassProfiles: profiles,
        bypassProfilesCache: { ...state.bypassProfilesCache, [workflowId]: profiles },
      }))
    } catch (e) {
      console.error('Failed to fetch bypass profiles:', e)
    }
  },

  createBypassProfile: async (workflowId: number, name: string, nodeIds: string[]) => {
    try {
      const newProfile = await bypassProfilesApi.create(workflowId, { name, bypassed_node_ids: nodeIds })
      set((state) => {
        const updated = [...state.bypassProfiles, newProfile]
        return {
          bypassProfiles: updated,
          bypassProfilesCache: { ...state.bypassProfilesCache, [workflowId]: updated },
        }
      })
    } catch (e) {
      console.error('Failed to create bypass profile:', e)
    }
  },

  updateBypassProfile: async (profileId: number, data: { name?: string; bypassed_node_ids?: string[]; is_enabled?: boolean }) => {
    try {
      const updated = await bypassProfilesApi.update(profileId, data)
      set((state) => {
        const nextProfiles = state.bypassProfiles.map((p) => (p.id === profileId ? updated : p))
        const nextCache: Record<number, BypassProfile[]> = {}
        for (const [wid, list] of Object.entries(state.bypassProfilesCache)) {
          nextCache[Number(wid)] = list.map((p) => (p.id === profileId ? updated : p))
        }
        return {
          bypassProfiles: nextProfiles,
          bypassProfilesCache: nextCache,
        }
      })
    } catch (e) {
      console.error('Failed to update bypass profile:', e)
    }
  },

  deleteBypassProfile: async (profileId: number) => {
    try {
      await bypassProfilesApi.delete(profileId)
      set((state) => {
        const nextProfiles = state.bypassProfiles.filter((p) => p.id !== profileId)
        const nextCache: Record<number, BypassProfile[]> = {}
        for (const [wid, list] of Object.entries(state.bypassProfilesCache)) {
          nextCache[Number(wid)] = list.filter((p) => p.id !== profileId)
        }
        return {
          bypassProfiles: nextProfiles,
          bypassProfilesCache: nextCache,
        }
      })
    } catch (e) {
      console.error('Failed to delete bypass profile:', e)
    }
  },
})
