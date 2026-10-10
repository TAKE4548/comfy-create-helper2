import { useEffect } from 'react'
import { useGenerationStore } from '../store/useGenerationStore'
import { systemWsService } from '../store/services/systemWsService'
import type { SystemStats } from '../store/types'

export function useSystemStats(): void {
  const setSystemStats = useGenerationStore((s) => s.setSystemStats)
  const setSystemWsConnected = useGenerationStore((s) => s.setSystemWsConnected)

  useEffect(() => {
    const onMessage = (data: Record<string, unknown>) => {
      // type === "SYSTEM_STATS" のみ処理
      if (data && (data as { type?: string }).type === 'SYSTEM_STATS') {
        if (typeof setSystemStats === 'function') {
          setSystemStats((data as { type: string; data: SystemStats }).data)
        }
      } else if (data && (data as { type?: string }).type === 'VRAM_RECOVERED') {
        const currentStats = useGenerationStore.getState().systemStats
        if (currentStats && typeof setSystemStats === 'function') {
          setSystemStats({ ...currentStats, vram_safe: true })
        }
      }
    }
    const onOpen = () => {
      if (typeof setSystemWsConnected === 'function') setSystemWsConnected(true)
    }
    const onClose = () => {
      if (typeof setSystemWsConnected === 'function') setSystemWsConnected(false)
    }

    const unsubscribe = systemWsService.subscribe(onMessage, onOpen, onClose)

    // Page Visibility API: タブ非表示時に WS を停止、復帰時に再開
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        systemWsService.suspend()
        if (typeof setSystemWsConnected === 'function') setSystemWsConnected(false)
      } else {
        systemWsService.resume()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
      if (typeof setSystemWsConnected === 'function') setSystemWsConnected(false)
    }
  }, [setSystemStats, setSystemWsConnected])
}
