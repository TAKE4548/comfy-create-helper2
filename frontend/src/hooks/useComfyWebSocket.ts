/** Compatibility adapter for existing consumers of the Comfy generation hook. */
import { useCallback } from 'react'
import { useGenerationStore } from '../store/useGenerationStore'

export interface ComfyProgress {
  value: number
  max: number
  percentage: number
}

export interface UseComfyWebSocketReturn {
  progress: ComfyProgress | null
  previewImage: string | null
  isConnected: boolean
  isGenerating: boolean
  currentPromptId: string | null
  queuePrompt: (workflow: Record<string, unknown>) => Promise<string | null>
  cancelGeneration: () => void
  clearPreview: () => void
}

export function resolveComfyUrl(_url: string | null): string {
  if (typeof window === 'undefined') return '/api/comfy'
  return `${window.location.origin}/api/comfy`
}

export function useComfyWebSocket(_clientId?: string): UseComfyWebSocketReturn {
  const progress = useGenerationStore((state) => state.progress)
  const previewImage = useGenerationStore((state) => state.previewImage)
  const isConnected = useGenerationStore((state) => state.isConnected)
  const isGenerating = useGenerationStore((state) => state.isGenerating)
  const currentPromptId = useGenerationStore((state) => state.currentPromptId)
  const queuePrompt = useGenerationStore((state) => state.queuePrompt)
  const cancel = useGenerationStore((state) => state.cancelGeneration)
  const clearPreview = useGenerationStore((state) => state.clearPreview)
  const cancelGeneration = useCallback(() => {
    void cancel()
  }, [cancel])

  return {
    progress,
    previewImage,
    isConnected,
    isGenerating,
    currentPromptId,
    queuePrompt,
    cancelGeneration,
    clearPreview
  }
}
