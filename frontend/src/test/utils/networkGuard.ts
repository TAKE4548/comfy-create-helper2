import { MockWebSocket } from './wsHelpers';

let networkViolations: string[] = [];
let isGuardActive = false;

let originalFetch: typeof globalThis.fetch | null = null;
let originalWebSocket: typeof globalThis.WebSocket | null = null;
let originalSocketConnect: any = null;

export function recordNetworkViolation(violation: string): void {
  networkViolations.push(violation);
}

export function getNetworkViolations(): string[] {
  return [...networkViolations];
}

export function clearNetworkViolations(): void {
  networkViolations = [];
}

export function assertNoRealNetwork(): void {
  if (networkViolations.length > 0) {
    const details = networkViolations.join('\n');
    clearNetworkViolations();
    throw new Error(`[NetworkGuard] Real network communication detected:\n${details}`);
  }
}

export interface NetworkGuardInstance {
  restore: () => void;
  assertNoViolations: () => void;
}

export function setupNetworkGuard(): NetworkGuardInstance {
  if (isGuardActive) {
    return {
      restore: teardownNetworkGuard,
      assertNoViolations: assertNoRealNetwork,
    };
  }

  isGuardActive = true;
  networkViolations = [];

  // 1. Guard WebSocket
  originalWebSocket = globalThis.WebSocket;
  const BlockedWebSocket = class {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    constructor(url: string | URL) {
      const msg = `Real WebSocket connection blocked: attempt to connect to ${url}`;
      recordNetworkViolation(msg);
      throw new Error(`[NetworkGuard] ${msg}`);
    }
  } as unknown as typeof WebSocket;

  globalThis.WebSocket = BlockedWebSocket;

  // 2. Guard TCP sockets in Node.js
  try {
    const net = typeof require !== 'undefined' ? require('net') : null;
    if (net?.Socket?.prototype?.connect) {
      originalSocketConnect = net.Socket.prototype.connect;
      net.Socket.prototype.connect = function (...args: any[]) {
        const host = args[0]?.host || (typeof args[1] === 'string' ? args[1] : 'unknown');
        const port = args[0]?.port || (typeof args[0] === 'number' ? args[0] : 'unknown');
        const msg = `Real TCP socket connection blocked: attempt to connect to ${host}:${port}`;
        recordNetworkViolation(msg);
        throw new Error(`[NetworkGuard] ${msg}`);
      };
    }
  } catch {
    // Environment does not support net socket patch
  }

  // 3. Guard fetch
  originalFetch = globalThis.fetch;
  globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const isMswActive = (originalFetch as any)?.name === 'fetchProxy' || (globalThis as any).__MSW_ACTIVE__;
    const url = typeof input === 'string' ? input : (input as Request)?.url ?? String(input);

    if (!isMswActive && originalFetch) {
      const msg = `Real network fetch blocked: attempt to fetch ${url}`;
      recordNetworkViolation(msg);
      throw new Error(`[NetworkGuard] ${msg}`);
    }

    if (!originalFetch) {
      const msg = `Real network fetch blocked: fetch is undefined`;
      recordNetworkViolation(msg);
      throw new Error(`[NetworkGuard] ${msg}`);
    }

    return originalFetch.call(globalThis, input, init);
  };

  return {
    restore: teardownNetworkGuard,
    assertNoViolations: assertNoRealNetwork,
  };
}

export function teardownNetworkGuard(): void {
  if (originalWebSocket !== null) {
    globalThis.WebSocket = originalWebSocket;
    originalWebSocket = null;
  }
  if (originalFetch !== null) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
  if (originalSocketConnect !== null) {
    try {
      const net = typeof require !== 'undefined' ? require('net') : null;
      if (net?.Socket?.prototype) {
        net.Socket.prototype.connect = originalSocketConnect;
      }
    } catch {
      // ignore
    }
    originalSocketConnect = null;
  }

  isGuardActive = false;
  clearNetworkViolations();
}
