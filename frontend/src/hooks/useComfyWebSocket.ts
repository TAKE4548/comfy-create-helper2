/**
 * ComfyUI WebSocket hook
 * Connects to ComfyUI's WebSocket to receive real-time generation progress and preview images.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useConfig } from './useConfig'

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
  if (typeof window === 'undefined') {
    if (!url) return 'http://127.0.0.1:8188'
    return url.replace('localhost', '127.0.0.1')
  }

  const hostname = window.location.hostname
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'

  // 1. モバイル端末や外部端末からのアクセス時 (hostname がローカルループバック以外):
  // url 内の localhost / 127.0.0.1 をアクセス元ホスト名 (window.location.hostname) に動的置換し、
  // ComfyUI の直接待受ポート (8188) の URL を返す。
  // 単一プロセス配信 (Port 8000) で存在しない /comfy への誤ルーティングを確実に防止する。
  if (!isLoopback) {
    let targetUrl = url || 'http://127.0.0.1:8188'
    targetUrl = targetUrl.replace(/\/comfy\/?$/, '')
    if (targetUrl.includes(':8000')) {
      targetUrl = targetUrl.replace(':8000', ':8188')
    }
    return targetUrl.replace('localhost', hostname).replace('127.0.0.1', hostname)
  }

  // 2. ループバックアクセス時かつバンドル配信時 (Port 8000 または本番ビルド):
  // バックエンド (FastAPI) 単一プロセス配信では /comfy プロキシが存在しないため、
  // ComfyUI 直接待受ポート (http://127.0.0.1:8188) を使用する。
  const isBundlePort = window.location.port === '8000'
  const isProdBuild = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD)
  if (isBundlePort || (isProdBuild && window.location.port !== '5173')) {
    let targetUrl = url || 'http://127.0.0.1:8188'
    targetUrl = targetUrl.replace(/\/comfy\/?$/, '')
    if (targetUrl.includes(':8000')) {
      targetUrl = targetUrl.replace(':8000', ':8188')
    }
    return targetUrl.replace('localhost', '127.0.0.1')
  }

  // 3. Vite 開発サーバー稼働時 (Port 5173 / テスト環境):
  // 従来通り Vite プロキシの `/comfy` を使用する
  if (!url) {
    return `${window.location.origin}/comfy`
  }
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return `${window.location.origin}/comfy`
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

  const { data: config } = useConfig()

  // Fetch ComfyUI config via React Query
  useEffect(() => {
    if (config && config.comfy_url) {
      setComfyUrl(config.comfy_url)
      comfyUrlRef.current = config.comfy_url
    } else if (config !== undefined) {
      setComfyUrl('http://localhost:8188')
      comfyUrlRef.current = 'http://localhost:8188'
    }
  }, [config])

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
