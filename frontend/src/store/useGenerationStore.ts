/**
 * Generation store — global state for ComfyUI connection, generation progress,
 * workflow selection, parameters, assets, and session persistence.
 *
 * Slices:
 *   - connectionSlice: WebSocket connection, progress, nodes, preview image
 *   - jobQueueSlice: Queue, history, prompt submission, job cancellation
 *   - multiSetSlice: Multi-sets, presets, params, applied assets
 *   - bypassSlice: Bypass profiles and cache
 *   - paramSyncSlice: Parameter sync groups and cache
 */

import { create } from 'zustand'
import type { GenerationState } from './types'
import { createConnectionSlice } from './slices/connectionSlice'
import { createJobQueueSlice } from './slices/jobQueueSlice'
import { createMultiSetSlice } from './slices/multiSetSlice'
import { createBypassSlice } from './slices/bypassSlice'
import { createParamSyncSlice } from './slices/paramSyncSlice'
import { comfyWsService } from './services/comfyWebSocketService'

// ─── Re-exports for 100% backward compatibility ─────────────────
export * from './types'
export { resolveNodeTitle } from './slices/connectionSlice'
export { addAssetToPrompt, removeAssetFromPrompt } from '../utils/promptUtils'

export const _resetWebSocketForTesting = () => {
  comfyWsService.resetForTesting()
}

// ─── Root Store ──────────────────────────────────────────────────
export const useGenerationStore = create<GenerationState>((set, get, store) => ({
  ...createConnectionSlice(set, get, store),
  ...createJobQueueSlice(set, get, store),
  ...createMultiSetSlice(set, get, store),
  ...createBypassSlice(set, get, store),
  ...createParamSyncSlice(set, get, store),
}))
