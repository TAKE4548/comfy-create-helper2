// 接続定数
export const SYS_BASE_RECONNECT_DELAY_MS = 1000
export const SYS_MAX_RECONNECT_DELAY_MS = 10000

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
  private retryCount: number = 0
  private suspended: boolean = false
  // コールバックを保存して再接続時に再利用
  private callbacks: WsCallbacks | null = null

  // バックエンドの ws URL を構築
  // window.location.origin の http → ws 置換
  private buildUrl(): string {
    return window.location.origin.replace(/^http/, 'ws') + '/api/ws'
  }

  public connect(
    onMessage: OnMessage,
    onOpen?: OnOpen,
    onClose?: OnClose,
  ): void {
    this.callbacks = { onMessage, onOpen, onClose }
    this._openSocket()
  }

  private _openSocket(): void {
    if (!this.callbacks) return
    const { onMessage, onOpen, onClose } = this.callbacks

    // 既存ソケットが OPEN/CONNECTING なら再接続不要
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.ws = new WebSocket(this.buildUrl())

    this.ws.onopen = () => {
      this.retryCount = 0
      onOpen?.()
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>
        onMessage(data)
      } catch {
        // JSON パースエラーは無視
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      onClose?.()
      if (!this.suspended) {
        const delay = this.getReconnectDelay()
        this.retryCount++
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this._openSocket()
        }, delay)
      }
    }
  }

  public disconnect(): void {
    // タイマーをクリアして再接続を防ぐ
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      // onclose ハンドラを除去して reconnect ループを防ぐ
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }

  public suspend(): void {
    this.suspended = true
    this.disconnect()
  }

  public resume(callbacks: WsCallbacks): void {
    this.suspended = false
    this.connect(callbacks.onMessage, callbacks.onOpen, callbacks.onClose)
  }

  private getReconnectDelay(): number {
    // 指数バックオフ: 1s, 2s, 4s, 8s, 最大 10s
    return Math.min(
      SYS_BASE_RECONNECT_DELAY_MS * Math.pow(2, this.retryCount),
      SYS_MAX_RECONNECT_DELAY_MS,
    )
  }
}

export const systemWsService = new SystemWsService()
