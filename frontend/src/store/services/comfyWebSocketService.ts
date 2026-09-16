/**
 * ComfyWebSocketService — Encapsulates WebSocket connection lifecycle,
 * reconnection timers, and pending request promises.
 */

export interface ComfyWebSocketCallbacks {
  onOpen: () => void;
  onClose: () => void;
  onError: () => void;
  onBlobMessage: (blob: Blob) => void;
  onJsonMessage: (type: string, data: Record<string, unknown>) => void;
}

export const HEARTBEAT_INTERVAL_MS = 25000;
export const BASE_RECONNECT_DELAY_MS = 1000;
export const MAX_RECONNECT_DELAY_MS = 15000;

export class ComfyWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private retryCount: number = 0;
  private isInitializing: boolean = false;
  private activeSubmissionPromise: Promise<string | null> | null = null;
  private activeFetchHistoryPromise: Promise<void> | null = null;
  private comfyUrl: string | null = null;

  public getHeartbeatTimer(): ReturnType<typeof setInterval> | null {
    return this.heartbeatTimer;
  }

  public getRetryCount(): number {
    return this.retryCount;
  }

  public incrementRetryCount(): void {
    this.retryCount++;
  }

  public resetRetryCount(): void {
    this.retryCount = 0;
  }

  public getReconnectDelay(): number {
    const exponential = BASE_RECONNECT_DELAY_MS * Math.pow(2, this.retryCount);
    const delay = Math.min(exponential, MAX_RECONNECT_DELAY_MS);
    const jitter = Math.floor(Math.random() * 500);
    return delay + jitter;
  }

  public startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, HEARTBEAT_INTERVAL_MS);
  }

  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  public sendPing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch (e) {
        console.error('Failed to send WebSocket ping:', e);
        this.stopHeartbeat();
      }
    }
  }


  public getWebSocket(): WebSocket | null {
    return this.ws;
  }

  public getComfyUrl(): string | null {
    return this.comfyUrl;
  }

  public setComfyUrl(url: string | null): void {
    this.comfyUrl = url;
  }

  public getIsInitializing(): boolean {
    return this.isInitializing;
  }

  public setIsInitializing(val: boolean): void {
    this.isInitializing = val;
  }

  public getActiveSubmissionPromise(): Promise<string | null> | null {
    return this.activeSubmissionPromise;
  }

  public setActiveSubmissionPromise(promise: Promise<string | null> | null): void {
    this.activeSubmissionPromise = promise;
  }

  public getActiveFetchHistoryPromise(): Promise<void> | null {
    return this.activeFetchHistoryPromise;
  }

  public setActiveFetchHistoryPromise(promise: Promise<void> | null): void {
    this.activeFetchHistoryPromise = promise;
  }

  public clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public setReconnectTimer(timer: ReturnType<typeof setTimeout> | null): void {
    this.reconnectTimer = timer;
  }

  public getReconnectTimer(): ReturnType<typeof setTimeout> | null {
    return this.reconnectTimer;
  }

  public connect(resolvedUrl: string, clientId: string, callbacks: ComfyWebSocketCallbacks): WebSocket | null {
    this.clearReconnectTimer();

    const wsUrl = resolvedUrl.replace(/^http/, 'ws');
    try {
      this.ws = new WebSocket(`${wsUrl}/ws?clientId=${clientId}`);
      this.ws.binaryType = 'blob';
    } catch (e) {
      console.error('Failed to establish WebSocket connection:', e);
      callbacks.onError();
      return null;
    }

    this.ws.onopen = () => {
      this.resetRetryCount();
      this.startHeartbeat();
      callbacks.onOpen();
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.ws = null;
      callbacks.onClose();
    };

    this.ws.onerror = () => {
      this.stopHeartbeat();
      if (this.ws) {
        try {
          this.ws.close();
        } catch {}
        this.ws = null;
      }
      callbacks.onError();
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
        const blob = event.data instanceof Blob ? event.data : new Blob([event.data]);
        callbacks.onBlobMessage(blob);
        return;
      }
      try {
        const msg = JSON.parse(event.data);
        callbacks.onJsonMessage(msg.type as string, msg.data as Record<string, unknown>);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    return this.ws;
  }

  public disconnect(): void {
    this.clearReconnectTimer();
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  public resetForTesting(): void {
    this.disconnect();
    this.stopHeartbeat();
    this.resetRetryCount();
    this.isInitializing = false;
    this.activeSubmissionPromise = null;
    this.activeFetchHistoryPromise = null;
  }

}

export const comfyWsService = new ComfyWebSocketService();
