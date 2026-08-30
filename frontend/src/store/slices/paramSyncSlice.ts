import { StateCreator } from 'zustand'
import { paramSyncGroupsApi } from '../../api/client'
import type { ParamSyncGroup, ParamSyncGroupCreate, ParamSyncGroupUpdate } from '../../api/types'
import type { GenerationState, ParamSyncState, ParamSyncActions } from '../types'

export type ParamSyncSlice = ParamSyncState & ParamSyncActions

export const createParamSyncSlice: StateCreator<GenerationState, [], [], ParamSyncSlice> = (set, get) => ({
  paramSyncGroups: [],
  paramSyncGroupsCache: {},

  fetchParamSyncGroups: async (workflowId: number) => {
    const cached = get().paramSyncGroupsCache[workflowId]
    if (cached) {
      set({ paramSyncGroups: cached })
    }
    try {
      const groups = await paramSyncGroupsApi.list(workflowId)
      set((state) => ({
        paramSyncGroups: groups,
        paramSyncGroupsCache: { ...state.paramSyncGroupsCache, [workflowId]: groups },
      }))
    } catch (e) {
      console.error('Failed to fetch param sync groups:', e)
    }
  },

  createParamSyncGroup: async (workflowId: number, data: ParamSyncGroupCreate) => {
    const newGroup = await paramSyncGroupsApi.create(workflowId, data)
    set((state) => {
      const updated = [...state.paramSyncGroups, newGroup]
      return {
        paramSyncGroups: updated,
        paramSyncGroupsCache: { ...state.paramSyncGroupsCache, [workflowId]: updated },
      }
    })
    return newGroup
  },

  updateParamSyncGroup: async (id: number, data: ParamSyncGroupUpdate) => {
    const updated = await paramSyncGroupsApi.update(id, data)
    set((state) => {
      const nextGroups = state.paramSyncGroups.map((g) => (g.id === id ? updated : g))
      const nextCache: Record<number, ParamSyncGroup[]> = {}
      for (const [wid, list] of Object.entries(state.paramSyncGroupsCache)) {
        nextCache[Number(wid)] = list.map((g) => (g.id === id ? updated : g))
      }
      return {
        paramSyncGroups: nextGroups,
        paramSyncGroupsCache: nextCache,
      }
    })
    return updated
  },

  deleteParamSyncGroup: async (id: number) => {
    await paramSyncGroupsApi.delete(id)
    set((state) => {
      const nextGroups = state.paramSyncGroups.filter((g) => g.id !== id)
      const nextCache: Record<number, ParamSyncGroup[]> = {}
      for (const [wid, list] of Object.entries(state.paramSyncGroupsCache)) {
        nextCache[Number(wid)] = list.filter((g) => g.id !== id)
      }
      return {
        paramSyncGroups: nextGroups,
        paramSyncGroupsCache: nextCache,
      }
    })
  },

  toggleParamSyncGroup: async (id: number, isEnabled: boolean) => {
    const updated = await paramSyncGroupsApi.update(id, { is_enabled: isEnabled })
    set((state) => {
      const nextGroups = state.paramSyncGroups.map((g) => (g.id === id ? updated : g))
      const nextCache: Record<number, ParamSyncGroup[]> = {}
      for (const [wid, list] of Object.entries(state.paramSyncGroupsCache)) {
        nextCache[Number(wid)] = list.map((g) => (g.id === id ? updated : g))
      }
      return {
        paramSyncGroups: nextGroups,
        paramSyncGroupsCache: nextCache,
      }
    })
  },
})
