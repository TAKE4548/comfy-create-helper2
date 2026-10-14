import { vi } from 'vitest';
import { _resetWebSocketForTesting } from '../../store/useGenerationStore';

export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  send = vi.fn();
  close = vi.fn((code = 1000, reason = '') => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: true });
  });

  constructor(public readonly url: string, public readonly protocols?: string | string[]) {
    MockWebSocketController.registerInstance(this);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({ type: 'open' });
  }

  message(data: unknown): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.({ data: payload });
  }

  error(error: any = new Error('WebSocket error')): void {
    this.onerror?.(error);
  }
}

export class MockWebSocketController {
  private static instances: MockWebSocket[] = [];

  static registerInstance(ws: MockWebSocket): void {
    this.instances.push(ws);
  }

  static getInstances(): MockWebSocket[] {
    return [...this.instances];
  }

  static getLastInstance(): MockWebSocket | undefined {
    return this.instances[this.instances.length - 1];
  }

  static clear(): void {
    for (const ws of this.instances) {
      if (ws.readyState !== MockWebSocket.CLOSED) {
        ws.readyState = MockWebSocket.CLOSED;
        ws.onclose?.({ code: 1000, reason: 'test teardown', wasClean: true });
      }
    }
    this.instances = [];
    _resetWebSocketForTesting();
  }

  static install(): typeof MockWebSocket {
    this.clear();
    vi.stubGlobal('WebSocket', MockWebSocket);
    return MockWebSocket;
  }

  static uninstall(): void {
    this.clear();
    vi.unstubAllGlobals();
  }
}
