import type { StateCreator } from 'zustand'
import type { GenerationState, SystemStats, SystemStatsState, SystemStatsActions } from '../types'

export type SystemStatsSlice = SystemStatsState & SystemStatsActions

export const createSystemStatsSlice: StateCreator<
  GenerationState,
  [],
  [],
  SystemStatsSlice
> = (set) => ({
  systemStats: null,
  systemWsConnected: false,

  setSystemStats: (stats: SystemStats) => set({ systemStats: stats }),
  setSystemWsConnected: (connected: boolean) => set({ systemWsConnected: connected }),
})
