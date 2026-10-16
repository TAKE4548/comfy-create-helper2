/**
 * Preview-only transport sandbox. Loaded before the real App via dynamic import.
 * All HTTP writes and all WebSocket connections are blocked; no production API is contacted.
 * Fixture coverage intentionally starts with the Generate empty state.
 */
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
})
const snapshot = {
  version: 1, epoch: 'prototype-offline', revision: 1, normal_group_id: null,
  jobs: [], batches: [],
  upstream: { http_ready: false, ws_connected: false, failure_since: null },
}
const fixtures: Record<string, unknown> = {
  '/api/workflows': [],
  '/api/mapping-masters': [],
  '/api/base-models': [],
  '/api/param-type-masters': [],
  '/api/loras': [],
  '/api/tag-sets': [],
  '/api/albums': [],
  '/api/snapshots': [],
  '/api/workflow-presets': [],
  '/api/config': { comfy_url: 'http://offline-prototype.invalid:8188' },
  '/api/generation/snapshot': snapshot,
  '/api/generation/queue': { running: [], pending: [] },
}
export function installOfflineTransport() {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null
    const path = new URL(request?.url ?? String(input), window.location.href).pathname
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      return json({ detail: 'Read-only UI prototype: write actions are disabled.' }, 403)
    }
    if (path in fixtures) return json(fixtures[path])
    if (path.startsWith('/api/')) {
      // Unsupported fixture: explicit failure prevents misleading fake success.
      return json({ detail: 'No offline fixture for ' + path }, 404)
    }
    if (new URL(request?.url ?? String(input), window.location.href).origin !== window.location.origin) {
      return json({ detail: 'External requests disabled in UI prototype' }, 403)
    }
    return originalFetch(input, init)
  }
  class OfflineWebSocket extends EventTarget {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSING = 2
    readonly CLOSED = 3
    readonly readyState = 3
    readonly bufferedAmount = 0
    readonly binaryType = 'blob'
    readonly extensions = ''
    readonly protocol = ''
    readonly url: string
    onopen: ((event: Event) => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    constructor(url: string | URL) {
      super()
      this.url = String(url)
      // Deliberately disconnected; do not simulate successful backend connection.
    }
    send() { throw new Error('Offline prototype: WebSocket disabled') }
    close() {}
  }
  Object.defineProperty(window, 'WebSocket', { value: OfflineWebSocket, configurable: true })
  // XHR is used by some libraries; block it rather than accidentally reaching the backend.
  Object.defineProperty(window, 'XMLHttpRequest', {
    configurable: true,
    value: class {
      open() { throw new Error('Offline prototype: XMLHttpRequest disabled') }
      send() { throw new Error('Offline prototype: XMLHttpRequest disabled') }
      setRequestHeader() {}
      abort() {}
    },
  })
}
