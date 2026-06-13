/**
 * ComfyUI WebSocket hook
 * Connects to ComfyUI's WebSocket to receive real-time generation progress and preview images.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { configApi } from '../api/client'

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

export function resolveComfyUrl(url: string | null): string {
  if (!url) {
    return typeof window !== 'undefined' ? `${window.location.origin}/comfy` : 'http://127.0.0.1:8188'
  }
  // URLがローカルループバック（localhost/127.0.0.1）を指す場合、Viteプロキシの `/comfy` を使用する
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return typeof window !== 'undefined' ? `${window.location.origin}/comfy` : url.replace('localhost', '127.0.0.1')
  }
  return url
}

export function useComfyWebSocket(clientId?: string): UseComfyWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const [comfyUrl, setComfyUrl] = useState<string | null>(null)
  // comfyUrl を ref でも保持し、handleMessage コールバック内でも最新値を参照できるようにする
  const comfyUrlRef = useRef<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<ComfyProgress | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [currentPromptId, setCurrentPromptId] = useState<string | null>(null)

  // useRef で clientId を固定：再レンダリングごとに新しいIDが生成されるのを防ぐ
  const clientIdRef = useRef<string>(clientId ?? 'prompt-surgeon-' + Math.random().toString(36).slice(2, 9))
  const resolvedClientId = clientIdRef.current

  // Fetch ComfyUI config on mount
  useEffect(() => {
    configApi.get()
      .then((config) => {
        const url = (config && config.comfy_url) ? config.comfy_url : 'http://localhost:8188'
        setComfyUrl(url)
        comfyUrlRef.current = url
      })
      .catch((e) => {
        console.error('Failed to fetch comfy_url, fallback to localhost:', e)
        setComfyUrl('http://localhost:8188')
        comfyUrlRef.current = 'http://localhost:8188'
      })
  }, [])

  // Establish WebSocket connection when comfyUrl is available
  useEffect(() => {
    if (!comfyUrl) return

    const resolvedUrl = resolveComfyUrl(comfyUrl)
    const wsUrl = resolvedUrl.replace(/^http/, 'ws')
    let ws: WebSocket
    try {
      ws = new WebSocket(`${wsUrl}/ws?clientId=${resolvedClientId}`)
      ws.binaryType = 'blob'
      wsRef.current = ws
    } catch (e) {
      console.error('Failed to establish WebSocket connection in useComfyWebSocket:', e)
      setIsConnected(false)
      return
    }

    ws.onopen = () => setIsConnected(true)
    ws.onclose = () => setIsConnected(false)
    ws.onerror = () => setIsConnected(false)

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        // Binary preview image as Blob
        const url = URL.createObjectURL(event.data)
        console.log('Received preview Blob image URL:', url)
        setPreviewImage(url)
        return
      } else if (event.data instanceof ArrayBuffer) {
        // Convert ArrayBuffer to Blob for preview
        const blob = new Blob([event.data])
        const url = URL.createObjectURL(blob)
        console.log('Received preview ArrayBuffer image URL:', url)
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
  }, [comfyUrl]) // resolvedClientId は useRef で固定されているため依存不要

  const handleMessage = useCallback((msg: Record<string, unknown>) => {
    const type = msg.type as string
    const data = msg.data as Record<string, unknown>

    switch (type) {
      case 'progress': {
        setIsGenerating(true)
        const value = data.value as number
        const max = data.max as number
        setProgress({
          value,
          max,
          percentage: max > 0 ? Math.round((value / max) * 100) : 0,
        })
        break
      }

      case 'execution_start':
        setIsGenerating(true)
        setProgress(null)
        setCurrentPromptId(data.prompt_id as string)
        break

      case 'executed': {
        // ComfyUI の最終出力画像は executed イベントの output.images に含まれる
        // バイナリ WebSocket フレームは途中プレビューのみ
        const output = data.output as Record<string, unknown> | undefined
        const images = output?.images as Array<{ filename: string; subfolder: string; type: string }> | undefined
        if (images && images.length > 0) {
          const img = images[0]
          const baseUrl = resolveComfyUrl(comfyUrlRef.current)
          const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${Date.now()}`
          console.log('Fetching final output image:', viewUrl)
          setPreviewImage(viewUrl)
        }
        setIsGenerating(false)
        setProgress({ value: 1, max: 1, percentage: 100 })
        break
      }

      case 'execution_complete':
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
    const activeUrl = resolveComfyUrl(comfyUrl)
    try {
      const res = await fetch(`${activeUrl}/prompt`, {
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
      console.log('Queueing prompt, clearing preview')
      setPreviewImage(null)
      setProgress(null)
      return data.prompt_id ?? null
    } catch (e) {
      console.error('Failed to queue prompt:', e)
      return null
    }
  }, [comfyUrl, resolvedClientId])

  const cancelGeneration = useCallback(async () => {
    const activeUrl = resolveComfyUrl(comfyUrl)
    try {
      await fetch(`${activeUrl}/interrupt`, { method: 'POST' })
      setIsGenerating(false)
    } catch (e) {
      console.error('Failed to cancel:', e)
    }
  }, [comfyUrl])

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
