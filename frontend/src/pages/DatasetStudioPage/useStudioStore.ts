import { create } from 'zustand'
import type {
  DatasetProject,
  DatasetItem,
  OutfitMasterPreset,
  LoraTrainingJob,
  TrainingTelemetryMessage,
  StudioSaveStatus,
} from '../../api/types'

export type { StudioSaveStatus }

export interface LossPoint {
  step: number
  loss: number
}

export interface StudioState {
  currentStep: 1 | 2 | 3 | 4
  setCurrentStep: (step: 1 | 2 | 3 | 4) => void

  activeProject: DatasetProject | null
  setActiveProject: (project: DatasetProject | null) => void

  saveStatus: StudioSaveStatus
  setSaveStatus: (status: StudioSaveStatus) => void

  projectsList: DatasetProject[]
  setProjectsList: (projects: DatasetProject[]) => void

  items: DatasetItem[]
  setItems: (items: DatasetItem[]) => void
  updateItemStatus: (id: number, status: 'APPROVED' | 'REJECTED') => void
  updateItemCaption: (id: number, caption: string) => void
  updateItemImage: (slotIndex: number, imagePath: string) => void

  selectedAltOutfits: OutfitMasterPreset[]
  setSelectedAltOutfits: (outfits: OutfitMasterPreset[]) => void

  activeJob: LoraTrainingJob | null
  setActiveJob: (job: LoraTrainingJob | null) => void

  isTrainingActive: boolean
  setIsTrainingActive: (active: boolean) => void

  telemetryLogs: string[]
  addTelemetryLog: (log: string) => void
  clearTelemetryLogs: () => void

  lossHistory: LossPoint[]
  addLossPoint: (point: LossPoint) => void
  clearLossHistory: () => void

  handleTelemetryMessage: (msg: TrainingTelemetryMessage) => void
  resetStudio: () => void
}

export const useStudioStore = create<StudioState>((set) => ({
  currentStep: 1,
  setCurrentStep: (step) => set({ currentStep: step }),

  activeProject: null,
  setActiveProject: (project) => set({ activeProject: project }),

  saveStatus: 'idle',
  setSaveStatus: (saveStatus) => set({ saveStatus }),

  projectsList: [],
  setProjectsList: (projectsList) => set({ projectsList }),

  items: [],
  setItems: (items) => set({ items }),
  updateItemStatus: (id, status) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, status } : item
      ),
    })),
  updateItemCaption: (id, caption_text) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, caption_text } : item
      ),
    })),
  updateItemImage: (slotIndex, image_path) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.slot_index === slotIndex ? { ...item, image_path } : item
      ),
    })),

  selectedAltOutfits: [],
  setSelectedAltOutfits: (selectedAltOutfits) => set({ selectedAltOutfits }),

  activeJob: null,
  setActiveJob: (activeJob) => set({ activeJob }),

  isTrainingActive: false,
  setIsTrainingActive: (isTrainingActive) => set({ isTrainingActive }),

  telemetryLogs: [],
  addTelemetryLog: (log) =>
    set((state) => ({
      telemetryLogs: [...state.telemetryLogs.slice(-499), log],
    })),
  clearTelemetryLogs: () => set({ telemetryLogs: [] }),

  lossHistory: [],
  addLossPoint: (point) =>
    set((state) => ({
      lossHistory: [...state.lossHistory, point],
    })),
  clearLossHistory: () => set({ lossHistory: [] }),

  handleTelemetryMessage: (msg) =>
    set((state) => {
      const updates: Partial<StudioState> = {}
      if (typeof msg.loss === 'number') {
        updates.lossHistory = [...state.lossHistory, { step: msg.step, loss: msg.loss }]
      }
      if (msg.log) {
        updates.telemetryLogs = [...state.telemetryLogs.slice(-499), msg.log]
      }
      if (msg.status === 'COMPLETED' || msg.status === 'FAILED' || msg.status === 'STOPPED') {
        updates.isTrainingActive = false
      } else if (msg.status === 'RUNNING') {
        updates.isTrainingActive = true
      }
      return updates
    }),

  resetStudio: () =>
    set({
      currentStep: 1,
      activeProject: null,
      saveStatus: 'idle',
      items: [],
      selectedAltOutfits: [],
      activeJob: null,
      isTrainingActive: false,
      telemetryLogs: [],
      lossHistory: [],
    }),
}))
