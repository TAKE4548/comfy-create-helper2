/**
 * Compatibility facade for legacy Comfy WebSocket consumers.
 * The canonical browser connection is owned by SystemWsService at /api/ws.
 */
import { systemWsService } from './systemWsService'

export interface ComfyWebSocketCallbacks {
  onOpen: () => void
  onClose: () => void
  onError: () => void
  onBlobMessage: (blob: Blob) => void
  onJsonMessage: (type: string, data: Record<string, unknown>) => void
}

export const HEARTBEAT_INTERVAL_MS = 25000
export const BASE_RECONNECT_DELAY_MS = 1000
export const MAX_RECONNECT_DELAY_MS = 15000

export class ComfyWebSocketService {
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private retryCount = 0
  private isInitializing = false
  private activeSubmissionPromise: Promise<string | null> | null = null
  private activeFetchHistoryPromise: Promise<void> | null = null
  private comfyUrl: string | null = null
  private unsubscribeSystemWs: (() => void) | null = null

  public getHeartbeatTimer(): ReturnType<typeof setInterval> | null {
    return this.heartbeatTimer
  }

  public getRetryCount(): number {
    return this.retryCount
  }

  public incrementRetryCount(): void {
    this.retryCount++
  }

  public resetRetryCount(): void {
    this.retryCount = 0
  }

  public getReconnectDelay(): number {
    const exponential = BASE_RECONNECT_DELAY_MS * Math.pow(2, this.retryCount)
    const delay = Math.min(exponential, MAX_RECONNECT_DELAY_MS)
    const jitter = Math.floor(Math.random() * 500)
    return delay + jitter
  }

  // Retained for callers that still inspect the old lifecycle. SystemWsService
  // owns its heartbeat; this facade must never send a Comfy protocol ping.
  public startHeartbeat(): void {
    this.stopHeartbeat()
  }

  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  public sendPing(): void {
    // The shared system socket sends its own protocol heartbeat.
  }

  public getWebSocket(): WebSocket | null {
    // Do not expose or claim ownership of the shared socket.
    return null
  }

  public getComfyUrl(): string | null {
    return this.comfyUrl
  }

  public setComfyUrl(url: string | null): void {
    this.comfyUrl = url
  }

  public getIsInitializing(): boolean {
    return this.isInitializing
  }

  public setIsInitializing(val: boolean): void {
    this.isInitializing = val
  }

  public getActiveSubmissionPromise(): Promise<string | null> | null {
    return this.activeSubmissionPromise
  }

  public setActiveSubmissionPromise(promise: Promise<string | null> | null): void {
    this.activeSubmissionPromise = promise
  }

  public getActiveFetchHistoryPromise(): Promise<void> | null {
    return this.activeFetchHistoryPromise
  }

  public setActiveFetchHistoryPromise(promise: Promise<void> | null): void {
    this.activeFetchHistoryPromise = promise
  }

  public clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  public setReconnectTimer(timer: ReturnType<typeof setTimeout> | null): void {
    this.reconnectTimer = timer
  }

  public getReconnectTimer(): ReturnType<typeof setTimeout> | null {
    return this.reconnectTimer
  }

  public connect(_resolvedUrl: string, _clientId: string, callbacks: ComfyWebSocketCallbacks): WebSocket | null {
    this.disconnect()
    try {
      this.unsubscribeSystemWs = systemWsService.subscribe(
        (message: Record<string, unknown>) => {
          const type = message.type
          const data = message.data
          if (typeof type !== 'string' || data === null || typeof data !== 'object' || Array.isArray(data)) return
          try {
            callbacks.onJsonMessage(type, data as Record<string, unknown>)
          } catch (error) {
            console.error('Legacy generation message callback failed:', error)
            this.notifyError(callbacks)
          }
        },
        () => {
          this.resetRetryCount()
          this.notify(callbacks, callbacks.onOpen)
        },
        () => this.notify(callbacks, callbacks.onClose)
      )
    } catch (error) {
      console.error('Failed to subscribe to shared system WebSocket:', error)
      this.unsubscribeSystemWs = null
      this.notifyError(callbacks)
    }
    // Preserve the old TypeScript signature while deliberately exposing no
    // direct or shared browser WebSocket instance.
    return null
  }

  public disconnect(): void {
    this.clearReconnectTimer()
    this.stopHeartbeat()
    const unsubscribe = this.unsubscribeSystemWs
    this.unsubscribeSystemWs = null
    unsubscribe?.()
  }

  public resetForTesting(): void {
    this.disconnect()
    this.stopHeartbeat()
    this.resetRetryCount()
    this.isInitializing = false
    this.activeSubmissionPromise = null
    this.activeFetchHistoryPromise = null
  }

  private notify(callbacks: ComfyWebSocketCallbacks, callback: () => void): void {
    try {
      callback()
    } catch (error) {
      console.error('Legacy generation lifecycle callback failed:', error)
      this.notifyError(callbacks)
    }
  }

  private notifyError(callbacks: ComfyWebSocketCallbacks): void {
    try {
      callbacks.onError()
    } catch (error) {
      console.error('Legacy generation error callback failed:', error)
    }
  }
}

export const comfyWsService = new ComfyWebSocketService()
