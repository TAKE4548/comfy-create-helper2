/**
 * ComfyUI WebSocket hook
 * Connects to ComfyUI's WebSocket to receive real-time generation progress and preview images.
 */

import { useEffect, useRef, useState, useCallback } from 'react'

const COMFY_URL = 'http://localhost:8188'
const COMFY_WS_URL = 'ws://localhost:8188'

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

export function useComfyWebSocket(clientId?: string): UseComfyWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<ComfyProgress | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [currentPromptId, setCurrentPromptId] = useState<string | null>(null)

  const resolvedClientId = clientId ?? 'prompt-surgeon-' + Math.random().toString(36).slice(2, 9)

  useEffect(() => {
    const ws = new WebSocket(`${COMFY_WS_URL}/ws?clientId=${resolvedClientId}`)
    wsRef.current = ws

    ws.onopen = () => setIsConnected(true)
    ws.onclose = () => setIsConnected(false)
    ws.onerror = () => setIsConnected(false)

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        // Binary preview image
        const url = URL.createObjectURL(event.data)
        setPreviewImage(url)
        return
      }
      try {
        const msg = JSON.parse(event.data)
        handleMessage(msg)
      } catch {
        // Non-JSON message, ignore
      }
    }

    return () => {
      ws.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMessage = useCallback((msg: Record<string, unknown>) => {
    const type = msg.type as string
    const data = msg.data as Record<string, unknown>

    switch (type) {
      case 'progress':
        setIsGenerating(true)
        const value = data.value as number
        const max = data.max as number
        setProgress({
          value,
          max,
          percentage: max > 0 ? Math.round((value / max) * 100) : 0,
        })
        break

      case 'execution_start':
        setIsGenerating(true)
        setProgress(null)
        setCurrentPromptId(data.prompt_id as string)
        break

      case 'execution_complete':
      case 'executed':
        setIsGenerating(false)
        setProgress({ value: 1, max: 1, percentage: 100 })
        break

      case 'execution_error':
        setIsGenerating(false)
        setProgress(null)
        console.error('ComfyUI execution error:', data)
        break
    }
  }, [])

  const queuePrompt = useCallback(async (
    workflow: Record<string, unknown>
  ): Promise<string | null> => {
    try {
      const res = await fetch(`${COMFY_URL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: workflow,
          client_id: resolvedClientId,
        }),
      })
      if (!res.ok) throw new Error(`ComfyUI returned ${res.status}`)
      const data = await res.json()
      setIsGenerating(true)
      setPreviewImage(null)
      setProgress(null)
      return data.prompt_id ?? null
    } catch (e) {
      console.error('Failed to queue prompt:', e)
      return null
    }
  }, [resolvedClientId])

  const cancelGeneration = useCallback(async () => {
    try {
      await fetch(`${COMFY_URL}/interrupt`, { method: 'POST' })
      setIsGenerating(false)
    } catch (e) {
      console.error('Failed to cancel:', e)
    }
  }, [])

  const clearPreview = useCallback(() => {
    setPreviewImage(null)
    setProgress(null)
  }, [])

  return {
    progress,
    previewImage,
    isConnected,
    isGenerating,
    currentPromptId,
    queuePrompt,
    cancelGeneration,
    clearPreview,
  }
}
