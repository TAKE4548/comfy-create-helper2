// 接続定数
export const SYS_BASE_RECONNECT_DELAY_MS = 1000
export const SYS_MAX_RECONNECT_DELAY_MS = 10000
export const SYS_PING_INTERVAL_MS = 25000

type OnMessage = (data: Record<string, unknown>) => void
type OnOpen = () => void
type OnClose = () => void

interface WsCallbacks {
  onMessage: OnMessage
  onOpen?: OnOpen
  onClose?: OnClose
}

export class SystemWsService {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private retryCount = 0
  private suspended = false
  private nextSubscriberId = 0
  private readonly subscribers = new Map<number, WsCallbacks>()

  private buildUrl(): string {
    return window.location.origin.replace(/^http/, 'ws') + '/api/ws'
  }

  public subscribe(
    onMessage: OnMessage,
    onOpen?: OnOpen,
    onClose?: OnClose,
  ): () => void {
    const id = ++this.nextSubscriberId
    this.subscribers.set(id, { onMessage, onOpen, onClose })
    if (!this.suspended) this._openSocket()

    let active = true
    return () => {
      if (!active) return
      active = false
      this.subscribers.delete(id)
      if (this.subscribers.size === 0) this.disconnect()
    }
  }

  private _openSocket(): void {
    if (this.suspended || this.subscribers.size === 0) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return

    this.ws = new WebSocket(this.buildUrl())
    const socket = this.ws

    socket.onopen = () => {
      if (this.ws !== socket) return
      this.retryCount = 0
      this.notify('onOpen')
      this.clearPingTimer()
      this.pingTimer = setInterval(() => {
        if (this.ws !== socket || socket.readyState !== WebSocket.OPEN) return
        try {
          socket.send(JSON.stringify({ type: 'ping' }))
        } catch {
          // The close handler performs normal reconnect handling.
        }
      }, SYS_PING_INTERVAL_MS)
    }

    socket.onmessage = (event: MessageEvent) => {
      if (this.ws !== socket) return
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>
        for (const callback of [...this.subscribers.values()]) {
          try {
            callback.onMessage(data)
          } catch {
            // One consumer must not prevent delivery to the other subscribers.
          }
        }
      } catch {
        // Ignore malformed JSON messages.
      }
    }

    socket.onclose = () => {
      if (this.ws !== socket) return
      this.ws = null
      this.clearPingTimer()
      this.notify('onClose')
      if (!this.suspended && this.subscribers.size > 0) {
        const delay = this.getReconnectDelay()
        this.retryCount++
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this._openSocket()
        }, delay)
      }
    }
  }

  private notify(kind: 'onOpen' | 'onClose'): void {
    for (const callback of [...this.subscribers.values()]) {
      try {
        callback[kind]?.()
      } catch {
        // Keep other subscribers independent when a callback fails.
      }
    }
  }

  private clearPingTimer(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.clearPingTimer()
    if (this.ws) {
      const socket = this.ws
      this.ws = null
      socket.onclose = null
      socket.close()
    }
  }

  public suspend(): void {
    if (this.suspended) return
    this.suspended = true
    const wasConnected = this.ws !== null
    this.disconnect()
    if (wasConnected) this.notify('onClose')
  }

  public resume(): void {
    if (!this.suspended) return
    this.suspended = false
    this._openSocket()
  }

  public resetForTesting(): void {
    this.disconnect()
    this.subscribers.clear()
    this.nextSubscriberId = 0
    this.retryCount = 0
    this.suspended = false
  }

  private getReconnectDelay(): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, capped at 10s.
    return Math.min(
      SYS_BASE_RECONNECT_DELAY_MS * Math.pow(2, this.retryCount),
      SYS_MAX_RECONNECT_DELAY_MS,
    )
  }
}

export const systemWsService = new SystemWsService()
